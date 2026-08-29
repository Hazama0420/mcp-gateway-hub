// pages/api/mcp/combo/[id]/http.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';
import bcrypt from 'bcryptjs';
import { checkRateLimit, applyRateLimitHeaders, LIMITS } from '@/lib/security/ratelimit';
import { getMcpCorsHeaders, applyCorsHeaders } from '@/lib/security/cors';
import { recordExecutionLog, recordSecurityEvent, generateExecutionId } from '@/lib/security/audit';
import { isJwtToken, verifyMcpAccessToken } from '@/lib/oauth/jwt';
import { getOAuthProtectedResourceMetadataUrl } from '@/lib/oauth/config';

import { registerTools as registerGithub } from '@/lib/adapters/github';
import { registerTools as registerPostgres } from '@/lib/adapters/postgres';
import { registerTools as registerVercel } from '@/lib/adapters/vercel';

export type ComboSessionEntry = {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  comboId: string;
  userId?: string;
  createdAt: number;
  lastSeenAt: number;
};

// Process-local session cache with TTL for warm Lambda instances
export const comboSessions = new Map<string, ComboSessionEntry>();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export function evictExpiredComboSessions(now: number = Date.now()): number {
  let evicted = 0;
  for (const [sid, entry] of comboSessions.entries()) {
    if (now - entry.lastSeenAt > SESSION_TTL_MS) {
      comboSessions.delete(sid);
      evicted++;
    }
  }
  return evicted;
}

export async function createComboMcpServer(combo: any, options?: { source?: 'COMBO' | 'PLAYGROUND' }) {
  const source = options?.source || 'COMBO';

  const server = new McpServer({
    name: `Combo - ${combo.name}`,
    version: '1.0.0',
  });

  // Centralized Tool Execution Audit Wrapper
  const originalTool = server.tool.bind(server);
  server.tool = ((name: string, ...rest: any[]) => {
    const callback = rest[rest.length - 1];
    if (typeof callback === 'function') {
      rest[rest.length - 1] = async (...args: any[]) => {
        const startTime = performance.now();
        const executionId = generateExecutionId();
        try {
          const result = await callback(...args);
          const executionTimeMs = Math.round(performance.now() - startTime);
          const isError = Boolean(result && typeof result === 'object' && result.isError);

          let resultSize: number | null = null;
          if (result && Array.isArray(result.content)) {
            resultSize = result.content.reduce((acc: number, item: any) => acc + (item.text?.length || 0), 0);
          }

          // Non-blocking asynchronous audit log
          recordExecutionLog({
            executionId,
            endpointId: combo.id,
            userId: combo.user_id,
            toolName: name,
            source,
            status: isError ? 'FAILED' : 'SUCCESS',
            errorCategory: isError ? 'EXTERNAL_API' : null,
            executionTimeMs,
            resultSize,
            metadata: {
              adapter: name.split('_')[0] || 'combo',
              combo_id: combo.id,
              combo_name: combo.name,
            },
          });

          return result;
        } catch (err: any) {
          const executionTimeMs = Math.round(performance.now() - startTime);
          recordExecutionLog({
            executionId,
            endpointId: combo.id,
            userId: combo.user_id,
            toolName: name,
            source,
            status: 'FAILED',
            errorCategory: 'INTERNAL',
            executionTimeMs,
            metadata: {
              error_type: err?.name || 'Error',
              combo_id: combo.id,
            },
          });
          throw err;
        }
      };
    }
    return (originalTool as any)(name, ...rest);
  }) as any;

  // Register tools from all attached adapters in the Combo
  if (Array.isArray(combo.endpoints)) {
    for (const link of combo.endpoints) {
      const ep = link.endpoint;
      if (ep && ep.is_active && Array.isArray(ep.services)) {
        for (const service of ep.services) {
          try {
            const decryptedJson = decrypt(service.encrypted_config, service.iv, service.tag);
            const config = JSON.parse(decryptedJson);

            switch (service.service_type) {
              case 'github':
                registerGithub(server, { token: config.token });
                break;
              case 'supabase':
              case 'postgres':
              case 'postgresql':
                registerPostgres(server, { connectionString: config.connectionString });
                break;
              case 'vercel':
                registerVercel(server, { token: config.token, teamId: config.teamId });
                break;
            }
          } catch (error) {
            console.error('[Combo HTTP] Error registering service in combo:', service.service_type, error);
          }
        }
      }
    }
  }

  return server;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const origin = req.headers.origin as string | undefined;
  const corsHeaders = getMcpCorsHeaders(origin);
  applyCorsHeaders(res, corsHeaders);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid combo id' });
  }

  const ip = req.socket?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  const authLimitIdentifier = `mcp_auth:combo:${id}:${ip}`;

  const preAuthRateLimit = await checkRateLimit(authLimitIdentifier, LIMITS.MCP_AUTH_FAILURE);
  applyRateLimitHeaders(res, preAuthRateLimit);

  if (!preAuthRateLimit.success) {
    recordSecurityEvent({
      eventType: 'RATE_LIMITED',
      endpointId: id as string,
      clientIp: String(ip),
      origin,
      metadata: { reason: 'Pre-auth rate limit exceeded on combo', limitType: 'MCP_AUTH_FAILURE' },
    });
    return res.status(429).json({ error: 'Too Many Requests: Rate limit exceeded. Try again later.' });
  }

  // Retrieve Combo and its attached endpoints
  const combo = await prisma.combo.findUnique({
    where: { id: id as string },
    include: {
      endpoints: {
        include: {
          endpoint: {
            include: {
              services: true,
            },
          },
        },
      },
      user: true,
    },
  });

  if (!combo) {
    return res.status(404).json({ error: 'Combo not found' });
  }

  if (!combo.is_active) {
    return res.status(400).json({ error: 'Combo is inactive/disabled.' });
  }

  // Authentication & Authorization check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(id as string, req.headers.host);
    res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", error_description="Bearer token required", resource_metadata="${resourceMetadataUrl}"`);

    recordSecurityEvent({
      eventType: 'AUTH_FAILED',
      endpointId: id as string,
      userId: combo.user_id,
      clientIp: String(ip),
      origin,
      metadata: { reason: 'Missing or malformed Authorization header on combo' },
    });

    return res.status(401).json({
      error: 'Unauthorized: Bearer token is missing.',
      resource_metadata: resourceMetadataUrl,
    });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  let authSuccess = false;
  let authenticatedUserId = combo.user_id;

  if (isJwtToken(token)) {
    const protocol = req.headers['x-forwarded-proto'] || (req.headers.host?.includes('localhost') ? 'http' : 'https');
    const reqOrigin = `${protocol}://${req.headers.host}`;

    // Verify token: bound to this combo or user
    const jwtResult = verifyMcpAccessToken(token, id as string, reqOrigin);
    if (jwtResult.valid && jwtResult.payload) {
      if (jwtResult.payload.sub === combo.user_id) {
        authSuccess = true;
        authenticatedUserId = jwtResult.payload.sub;
      }
    } else {
      // Also accept tokens signed for user's endpoints if owner matches
      const broadJwt = verifyMcpAccessToken(token, undefined, reqOrigin);
      if (broadJwt.valid && broadJwt.payload && broadJwt.payload.sub === combo.user_id) {
        authSuccess = true;
        authenticatedUserId = broadJwt.payload.sub;
      }
    }
  } else {
    // Check against user's active API keys on any attached endpoint
    for (const link of combo.endpoints) {
      if (link.endpoint?.api_key_hash) {
        const isMatch = await bcrypt.compare(token, link.endpoint.api_key_hash);
        if (isMatch) {
          authSuccess = true;
          break;
        }
      }
    }
  }

  if (!authSuccess) {
    const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(id as string, req.headers.host);
    res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", error_description="Invalid or expired Bearer token", resource_metadata="${resourceMetadataUrl}"`);

    recordSecurityEvent({
      eventType: 'AUTH_FAILED',
      endpointId: id as string,
      userId: combo.user_id,
      clientIp: String(ip),
      origin,
      metadata: { reason: 'Invalid API key or JWT token for combo' },
    });

    return res.status(401).json({
      error: 'Unauthorized: Invalid token or API key.',
      resource_metadata: resourceMetadataUrl,
    });
  }

  // Request Rate Limiting
  const reqLimitIdentifier = `mcp_req:combo:${id}:${authenticatedUserId}`;
  const reqRateLimit = await checkRateLimit(reqLimitIdentifier, LIMITS.MCP_REQUEST);
  applyRateLimitHeaders(res, reqRateLimit);

  if (!reqRateLimit.success) {
    recordSecurityEvent({
      eventType: 'RATE_LIMITED',
      endpointId: id as string,
      userId: authenticatedUserId,
      clientIp: String(ip),
      origin,
      metadata: { reason: 'Request quota exceeded on combo', limitType: 'MCP_REQUEST' },
    });
    return res.status(429).json({ error: 'Too Many Requests: Rate limit quota exceeded.' });
  }

  // Serverless Session Management
  evictExpiredComboSessions();
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && comboSessions.has(sessionId)) {
    const sessionEntry = comboSessions.get(sessionId)!;
    sessionEntry.lastSeenAt = Date.now();
    await sessionEntry.transport.handlePostMessage(req, res, req.body);
    return;
  }

  if (req.method === 'POST') {
    const isInit = isInitializeRequest(req.body);

    if (isInit) {
      const transport = new StreamableHTTPServerTransport({
        endpoint: `/api/mcp/combo/${id}/http`,
      });

      const server = await createComboMcpServer(combo, { source: 'COMBO' });
      await server.connect(transport);
      await transport.handlePostMessage(req, res, req.body);

      const generatedSessionId = transport.sessionId;
      if (generatedSessionId) {
        comboSessions.set(generatedSessionId, {
          transport,
          server,
          comboId: id as string,
          userId: authenticatedUserId,
          createdAt: Date.now(),
          lastSeenAt: Date.now(),
        });
      }
      return;
    }

    // Stateless cold-start fallback recovery
    if (sessionId) {
      const transport = new StreamableHTTPServerTransport({
        endpoint: `/api/mcp/combo/${id}/http`,
      });

      const server = await createComboMcpServer(combo, { source: 'COMBO' });
      await server.connect(transport);

      comboSessions.set(sessionId, {
        transport,
        server,
        comboId: id as string,
        userId: authenticatedUserId,
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      });

      await transport.handlePostMessage(req, res, req.body);
      return;
    }

    return res.status(400).json({ error: 'Bad Request: Initialize request or valid mcp-session-id required.' });
  }

  if (req.method === 'GET' && sessionId) {
    if (comboSessions.has(sessionId)) {
      const sessionEntry = comboSessions.get(sessionId)!;
      sessionEntry.lastSeenAt = Date.now();
      await sessionEntry.transport.handleReceive(req, res);
      return;
    }

    // Recover session for SSE / GET stream
    const transport = new StreamableHTTPServerTransport({
      endpoint: `/api/mcp/combo/${id}/http`,
    });

    const server = await createComboMcpServer(combo, { source: 'COMBO' });
    await server.connect(transport);

    comboSessions.set(sessionId, {
      transport,
      server,
      comboId: id as string,
      userId: authenticatedUserId,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    await transport.handleReceive(req, res);
    return;
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
