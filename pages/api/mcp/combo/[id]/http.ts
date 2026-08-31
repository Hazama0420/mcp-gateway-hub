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
import { hashOpaqueToken } from '@/lib/oauth/store';

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

  // Rate Limit & Auth Helper: Pre-Auth (Brute force protection on failed/unauthenticated probes)
  const authLimitIdentifier = `mcp_auth:combo:${id}:${ip}`;
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(id as string, origin, { isCombo: true });

  const buildWwwAuthHeader = (errorCode?: string, errorDescription?: string) => {
    if (errorCode && errorDescription) {
      return `Bearer error="${errorCode}", error_description="${errorDescription}", resource_metadata="${resourceMetadataUrl}"`;
    }
    return `Bearer resource_metadata="${resourceMetadataUrl}"`;
  };

  const handleAuthFailure = async (
    status: number,
    errorMsg: string,
    errorCode?: string,
    reason?: string,
    eventType: string = 'AUTH_FAILED',
    metadata?: Record<string, any>
  ) => {
    const authLimitResult = await checkRateLimit(authLimitIdentifier, LIMITS.MCP_AUTH);
    applyRateLimitHeaders(res, authLimitResult);

    if (!authLimitResult.success) {
      recordSecurityEvent({
        eventType: 'RATE_LIMITED',
        endpointId: id as string,
        route: '/api/mcp/combo/[id]/http',
        ip: String(ip),
        reason: 'Pre-auth rate limit exceeded on combo',
      });
      return res.status(429).json({ error: 'Too many requests' });
    }

    res.setHeader('WWW-Authenticate', buildWwwAuthHeader(errorCode, errorMsg));
    if (eventType === 'OAUTH_TOKEN_REJECTED') {
      recordSecurityEvent({
        eventType: 'OAUTH_TOKEN_REJECTED',
        endpointId: id as string,
        route: '/api/mcp/combo/[id]/http',
        ip: String(ip),
        reason: reason || errorMsg,
        metadata: { ...metadata, combo_id: id as string },
      });
    } else if (eventType === 'TENANT_ACCESS_DENIED') {
      recordSecurityEvent({
        eventType: 'TENANT_ACCESS_DENIED',
        endpointId: id as string,
        route: '/api/mcp/combo/[id]/http',
        ip: String(ip),
        reason: reason || errorMsg,
        metadata: { ...metadata, combo_id: id as string },
      });
    } else {
      recordSecurityEvent({
        eventType: 'AUTH_FAILED',
        endpointId: id as string,
        route: '/api/mcp/combo/[id]/http',
        ip: String(ip),
        reason: reason || errorMsg,
        metadata: { ...metadata, combo_id: id as string },
      });
    }
    return res.status(status).json({
      error: status === 403 ? 'Forbidden' : 'Unauthorized',
      message: errorMsg,
    });
  };

  // 1. Extract Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return handleAuthFailure(
      401,
      'Bearer token required. Discover OAuth metadata via WWW-Authenticate header.',
      undefined,
      'Missing or malformed Bearer header'
    );
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return handleAuthFailure(401, 'Empty Bearer token', 'invalid_token', 'Empty Bearer token');
  }

  // 2. Fetch Combo and its attached endpoints
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

  if (!combo || !combo.is_active) {
    return handleAuthFailure(401, 'Combo not found or inactive', 'invalid_token', 'Combo not found or inactive');
  }

  // 3. Classify and verify token (OAuth JWT vs Legacy API Key)
  const isOAuth = isJwtToken(token);
  let authenticatedUserId = combo.user_id;

  if (isOAuth) {
    const verifyResult = verifyMcpAccessToken(token, id as string, origin, { isCombo: true });
    if (!verifyResult.valid || !verifyResult.payload) {
      return handleAuthFailure(
        401,
        verifyResult.error || 'Invalid OAuth access token',
        'invalid_token',
        verifyResult.error,
        'OAUTH_TOKEN_REJECTED'
      );
    }

    // Enforce Tenant Isolation
    if (verifyResult.payload.sub !== combo.user_id) {
      return handleAuthFailure(
        403,
        'Cross-tenant access forbidden',
        'insufficient_scope',
        'Cross-tenant OAuth token reuse attempted',
        'TENANT_ACCESS_DENIED',
        { token_sub: verifyResult.payload.sub, combo_owner: combo.user_id }
      );
    }

    authenticatedUserId = verifyResult.payload.sub;
  } else {
    // Check against active API keys on any attached endpoint
    let isApiKeyValid = false;
    for (const link of combo.endpoints) {
      if (link.endpoint?.api_key_hash) {
        const isMatch = await bcrypt.compare(token, link.endpoint.api_key_hash);
        if (isMatch) {
          isApiKeyValid = true;
          break;
        }
      }
    }

    if (!isApiKeyValid) {
      return handleAuthFailure(
        401,
        'Invalid API key credentials for combo',
        'invalid_token',
        'Invalid API key credentials for combo'
      );
    }
  }

  // Rate Limit: Valid Request (Post-Auth quota)
  const reqLimitIdentifier = `mcp_req:combo:${id}:${authenticatedUserId}`;
  const reqLimitResult = await checkRateLimit(reqLimitIdentifier, LIMITS.MCP_REQUEST);

  if (!reqLimitResult.success) {
    recordSecurityEvent({
      eventType: 'RATE_LIMITED',
      endpointId: combo.id,
      userId: authenticatedUserId,
      route: '/api/mcp/combo/[id]/http',
      ip: String(ip),
      reason: 'Post-auth request quota exceeded on combo',
    });
    applyRateLimitHeaders(res, reqLimitResult);
    return res.status(429).json({ error: 'Too many requests' });
  }

  applyRateLimitHeaders(res, reqLimitResult);

  try {
    evictExpiredComboSessions();
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // 1. Explicit Session Deletion / Close
    if (req.method === 'DELETE') {
      if (sessionId && comboSessions.has(sessionId)) {
        const existing = comboSessions.get(sessionId);
        if (existing && existing.comboId === id) {
          comboSessions.delete(sessionId);
          recordSecurityEvent({
            eventType: 'SESSION_CLOSED',
            endpointId: id as string,
            userId: authenticatedUserId,
            route: '/api/mcp/combo/[id]/http',
            ip: String(ip),
            metadata: {
              session_id_hash: hashOpaqueToken(sessionId).substring(0, 16),
              combo_id: id as string,
            },
          });
        }
      }
      return res.status(200).json({ status: 'session_closed' });
    }

    // 2. Initialize Request: Establish MCP Session and generate Session ID
    if (req.method === 'POST' && isInitializeRequest(req.body)) {
      const server = await createComboMcpServer(combo, { source: 'COMBO' });
      const generatedSessionId = crypto.randomUUID();

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => generatedSessionId,
        onsessioninitialized: (newSessionId) => {
          comboSessions.set(newSessionId, {
            transport,
            server,
            comboId: id as string,
            userId: authenticatedUserId,
            createdAt: Date.now(),
            lastSeenAt: Date.now(),
          });
          recordSecurityEvent({
            eventType: 'SESSION_CREATED',
            endpointId: id as string,
            userId: authenticatedUserId,
            route: '/api/mcp/combo/[id]/http',
            ip: String(ip),
            metadata: {
              session_id_hash: hashOpaqueToken(newSessionId).substring(0, 16),
              combo_id: id as string,
            },
          });
        },
        onsessionclosed: (closedSessionId) => {
          comboSessions.delete(closedSessionId);
        },
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // 3. Warm Container Session Hit: If session exists in this Lambda instance's memory
    if (sessionId) {
      const existing = comboSessions.get(sessionId);
      if (existing) {
        // Enforce strict combo isolation
        if (existing.comboId !== id) {
          recordSecurityEvent({
            eventType: 'ACCESS_DENIED',
            endpointId: id as string,
            userId: authenticatedUserId,
            route: '/api/mcp/combo/[id]/http',
            ip: String(ip),
            reason: 'Session belongs to another combo',
            metadata: {
              session_combo_id: existing.comboId,
              request_combo_id: id as string,
            },
          });
          return res.status(403).json({ error: 'Session belongs to another combo' });
        }

        existing.lastSeenAt = Date.now();
        await existing.transport.handleRequest(req, res, req.body);
        return;
      }
    }

    // 4. Resilient Multi-Instance Serverless Handling for Subsequent Requests:
    // When a request arrives at a fresh Lambda instance where local session memory is empty,
    // or when operating in stateless mode with valid Bearer auth:
    // Instantiate server + stateless transport to seamlessly process tools/list, tools/call, etc.
    const server = await createComboMcpServer(combo, { source: 'COMBO' });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    if (sessionId) {
      recordSecurityEvent({
        eventType: 'SESSION_REHYDRATED',
        endpointId: id as string,
        userId: authenticatedUserId,
        route: '/api/mcp/combo/[id]/http',
        ip: String(ip),
        metadata: {
          session_id_hash: hashOpaqueToken(sessionId).substring(0, 16),
          combo_id: id as string,
        },
      });
    }

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  } catch (error: any) {
    console.error('[Combo HTTP] MCP error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }
  }
}
