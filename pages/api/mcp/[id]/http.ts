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

type SessionEntry = {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  endpointId: string;
};

const sessions = new Map<string, SessionEntry>();

export async function createMcpServer(endpoint: any, options?: { source?: 'MCP' | 'PLAYGROUND' }) {
  const source = options?.source || 'MCP';

  const server = new McpServer({
    name: 'MCP Gateway Hub',
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
            endpointId: endpoint.id,
            userId: endpoint.user_id,
            toolName: name,
            source,
            status: isError ? 'FAILED' : 'SUCCESS',
            errorCategory: isError ? 'EXTERNAL_API' : null,
            executionTimeMs,
            resultSize,
            metadata: {
              adapter: name.split('_')[0] || 'mcp',
            },
          });

          return result;
        } catch (err: any) {
          const executionTimeMs = Math.round(performance.now() - startTime);
          recordExecutionLog({
            executionId,
            endpointId: endpoint.id,
            userId: endpoint.user_id,
            toolName: name,
            source,
            status: 'FAILED',
            errorCategory: 'INTERNAL',
            executionTimeMs,
            metadata: {
              error_type: err?.name || 'Error',
            },
          });
          throw err;
        }
      };
    }
    return (originalTool as any)(name, ...rest);
  }) as any;

  if (Array.isArray(endpoint.services)) {
    for (const service of endpoint.services) {
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
        console.error('[HTTP] Error registering service:', service.service_type, error);
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
    return res.status(400).json({ error: 'Invalid endpoint id' });
  }

  const ip = req.socket?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';

  // Rate Limit & Auth Helper: Pre-Auth (Brute force protection on failed/unauthenticated probes)
  const authLimitIdentifier = `mcp_auth:${id}:${ip}`;
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(id as string, origin);

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
        route: '/api/mcp/[id]/http',
        ip: String(ip),
        reason: 'Pre-auth rate limit exceeded',
      });
      return res.status(429).json({ error: 'Too many requests' });
    }

    res.setHeader('WWW-Authenticate', buildWwwAuthHeader(errorCode, errorMsg));
    if (eventType === 'OAUTH_TOKEN_REJECTED') {
      recordSecurityEvent({
        eventType: 'OAUTH_TOKEN_REJECTED',
        endpointId: id as string,
        route: '/api/mcp/[id]/http',
        ip: String(ip),
        reason: reason || errorMsg,
        metadata,
      });
    } else if (eventType === 'TENANT_ACCESS_DENIED') {
      recordSecurityEvent({
        eventType: 'TENANT_ACCESS_DENIED',
        endpointId: id as string,
        route: '/api/mcp/[id]/http',
        ip: String(ip),
        reason: reason || errorMsg,
        metadata,
      });
    } else {
      recordSecurityEvent({
        eventType: 'AUTH_FAILED',
        endpointId: id as string,
        route: '/api/mcp/[id]/http',
        ip: String(ip),
        reason: reason || errorMsg,
        metadata,
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

  // 2. Fetch endpoint
  const endpoint = await prisma.mcpEndpoint.findUnique({
    where: { id: id as string },
    include: { services: true },
  });

  if (!endpoint || !endpoint.is_active) {
    return handleAuthFailure(401, 'Endpoint not found or inactive', 'invalid_token', 'Endpoint not found or inactive');
  }

  // 3. Classify and verify token (OAuth JWT vs Legacy API Key)
  const isOAuth = isJwtToken(token);
  let authType: 'OAUTH' | 'API_KEY' = 'API_KEY';

  if (isOAuth) {
    const verifyResult = verifyMcpAccessToken(token, id as string, origin);
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
    if (verifyResult.payload.sub !== endpoint.user_id) {
      return handleAuthFailure(
        403,
        'Cross-tenant access forbidden',
        'insufficient_scope',
        'Cross-tenant OAuth token reuse attempted',
        'TENANT_ACCESS_DENIED',
        { token_sub: verifyResult.payload.sub, endpoint_owner: endpoint.user_id }
      );
    }

    authType = 'OAUTH';
  } else {
    // Verify Legacy API Key
    if (!endpoint.api_key_hash) {
      return handleAuthFailure(
        401,
        'Endpoint has no configured API key hash',
        'invalid_token',
        'Endpoint has no configured API key hash'
      );
    }

    const isKeyValid = await bcrypt.compare(token, endpoint.api_key_hash);
    if (!isKeyValid) {
      return handleAuthFailure(
        401,
        'Invalid API key credentials',
        'invalid_token',
        'Invalid API key credentials'
      );
    }

    authType = 'API_KEY';
  }

  // Rate Limit: Valid Request (Post-Auth quota)
  const reqLimitIdentifier = `mcp_req:${id}`;
  const reqLimitResult = await checkRateLimit(reqLimitIdentifier, LIMITS.MCP_REQUEST);

  if (!reqLimitResult.success) {
    recordSecurityEvent({
      eventType: 'RATE_LIMITED',
      endpointId: endpoint.id,
      userId: endpoint.user_id,
      route: '/api/mcp/[id]/http',
      ip: String(ip),
      reason: 'Post-auth request quota exceeded',
    });
    applyRateLimitHeaders(res, reqLimitResult);
    return res.status(429).json({ error: 'Too many requests' });
  }

  applyRateLimitHeaders(res, reqLimitResult);

  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId) {
      const existing = sessions.get(sessionId);
      if (!existing || existing.endpointId !== id) {
        return res.status(404).json({ error: 'Session not found or belongs to another endpoint' });
      }
      await existing.transport.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === 'POST' && isInitializeRequest(req.body)) {
      const server = await createMcpServer(endpoint);
      let initializedSessionId: string | undefined;

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId) => {
          initializedSessionId = newSessionId;
          sessions.set(newSessionId, { transport, server, endpointId: id as string });
        },
        onsessionclosed: (closedSessionId) => {
          sessions.delete(closedSessionId);
        },
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    return res.status(400).json({ error: 'Missing MCP session or initialize request' });
  } catch (error: any) {
    console.error('[HTTP] MCP error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }
  }
}

// PERHATIKAN: Kita TIDAK mengekspor config bodyParser di sini,
// sehingga Next.js secara otomatis mem-parsing req.body sebagai JSON object.
