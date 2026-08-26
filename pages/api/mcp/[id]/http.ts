// pages/api/mcp/[id]/http.ts
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
    where: { id: endpointId },
    include: { services: true },
  });

  if (!endpoint || !endpoint.is_active) {
    throw new Error('Endpoint not found or inactive');
  }

  const server = new McpServer({
    name: 'MCP Gateway Hub',
    version: '1.0.0',
  });

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

  return server;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid endpoint id' });
  }

  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId) {
      const existing = sessions.get(sessionId);
      if (!existing) {
        return res.status(404).json({ error: 'Session not found' });
      }
      await existing.transport.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === 'POST' && isInitializeRequest(req.body)) {
      const server = await createMcpServer(id);
      let initializedSessionId: string | undefined;

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId) => {
          initializedSessionId = newSessionId;
          sessions.set(newSessionId, { transport, server });
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