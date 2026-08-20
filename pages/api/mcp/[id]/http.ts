import type { NextApiRequest, NextApiResponse } from 'next';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';

import { registerTools as registerGithub } from '@/lib/adapters/github';
import { registerTools as registerPostgres } from '@/lib/adapters/postgres';
import { registerTools as registerVercel } from '@/lib/adapters/vercel';

type SessionEntry = {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
};

const sessions = new Map<string, SessionEntry>();

async function createMcpServer(endpointId: string) {
  const endpoint = await prisma.mcpEndpoint.findUnique({
    where: {
      id: endpointId,
    },
    include: {
      services: true,
    },
  });

  if (!endpoint) {
    throw new Error('Endpoint not found');
  }

  if (!endpoint.is_active) {
    throw new Error('Endpoint is inactive');
  }

  const server = new McpServer({
    name: 'MCP Gateway Hub',
    version: '1.0.0',
  });

  for (const service of endpoint.services) {
    try {
      console.log(
        '[HTTP] Registering service:',
        service.service_type
      );

      const decryptedJson = decrypt(
        service.encrypted_config,
        service.iv,
        service.tag
      );

      const config = JSON.parse(decryptedJson);

      switch (service.service_type) {
        case 'github':
          registerGithub(server, {
            token: config.token,
          });
          break;

        case 'supabase':
        case 'postgres':
          registerPostgres(server, {
            connectionString: config.connectionString,
          });
          break;

        case 'vercel':
          registerVercel(server, {
            token: config.token,
            teamId: config.teamId,
          });
          break;

        default:
          console.warn(
            '[HTTP] Unknown service type:',
            service.service_type
          );
      }
    } catch (error) {
      console.error(
        '[HTTP] Error registering service:',
        service.service_type,
        error
      );
    }
  }

  return server;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('[HTTP] Request:', {
    method: req.method,
    url: req.url,
    sessionId: req.headers['mcp-session-id'],
  });

  // CORS
  res.setHeader(
    'Access-Control-Allow-Origin',
    '*'
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, DELETE, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    [
      'Content-Type',
      'Accept',
      'Authorization',
      'MCP-Protocol-Version',
      'Mcp-Session-Id',
      'Last-Event-ID',
    ].join(', ')
  );

  res.setHeader(
    'Access-Control-Expose-Headers',
    'Mcp-Session-Id, WWW-Authenticate'
  );

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({
      error: 'Invalid endpoint id',
    });
  }

  try {
    const sessionId =
      req.headers['mcp-session-id'] as
        | string
        | undefined;

    /*
     * Existing Streamable HTTP session
     */
    if (sessionId) {
      const existing =
        sessions.get(sessionId);

      if (!existing) {
        return res.status(404).json({
          error: 'Session not found',
        });
      }

      await existing.transport.handleRequest(
        req,
        res,
        req.body
      );

      return;
    }

    /*
     * New session must start with initialize
     */
    if (
      req.method === 'POST' &&
      isInitializeRequest(req.body)
    ) {
      console.log(
        '[HTTP] New MCP initialize request'
      );

      const server =
        await createMcpServer(id);

      let initializedSessionId:
        | string
        | undefined;

      const transport =
        new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),

          onsessioninitialized: (
            newSessionId
          ) => {
            initializedSessionId =
              newSessionId;

            sessions.set(
              newSessionId,
              {
                transport,
                server,
              }
            );

            console.log(
              '[HTTP] Session created:',
              newSessionId
            );
          },

          onsessionclosed: (
            closedSessionId
          ) => {
            sessions.delete(
              closedSessionId
            );

            console.log(
              '[HTTP] Session closed:',
              closedSessionId
            );
          },
        });

      await server.connect(transport);

      await transport.handleRequest(
        req,
        res,
        req.body
      );

      return;
    }

    /*
     * No session and not initialize
     */
    return res.status(400).json({
      error:
        'Missing MCP session. First request must be initialize.',
    });
  } catch (error) {
    console.error(
      '[HTTP] MCP error:',
      error
    );

    if (!res.headersSent) {
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
}