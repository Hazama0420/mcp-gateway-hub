// pages/api/mcp/[id]/sse.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';
import { transports } from '@/lib/transportStore';
import { registerTools as registerGithub } from '@/lib/adapters/github';
import { registerTools as registerPostgres } from '@/lib/adapters/postgres';
import { registerTools as registerVercel } from '@/lib/adapters/vercel';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Tangani OPTIONS untuk CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    if (!id || Array.isArray(id)) {
      return res.status(400).json({ error: 'Invalid endpoint id' });
    }
    console.log('[SSE] Request for endpoint:', id);

    const endpoint = await prisma.mcpEndpoint.findUnique({
      where: { id },
      include: { services: true },
    });

    if (!endpoint) {
      console.error('[SSE] Endpoint not found:', id);
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    if (!endpoint.is_active) {
      return res.status(403).json({ error: 'Endpoint is inactive' });
    }

    // ============================================================
    // 🔥 NONAKTIFKAN OAuth UNTUK SEMENTARA (Testing)
    // ============================================================
    const server = new McpServer({
      name: 'MCP Gateway Hub',
      version: '1.0.0',
      // Tidak kirim metadata OAuth – client akan konek tanpa auth
    });
    // ============================================================

    // Daftarkan tools
    for (const service of endpoint.services) {
      try {
        console.log('[SSE] Registering service:', service.service_type);
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
          default:
            console.warn('[SSE] Unknown service type:', service.service_type);
        }
      } catch (err) {
        console.error('[SSE] Error registering service:', service.service_type, err);
      }
    }

    // Buat transport SSE
    const messagesPath = `/api/mcp/${id}/messages`;
    const transport = new SSEServerTransport(messagesPath, res);

    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);
    console.log('[SSE] Transport saved with sessionId:', sessionId);

    // Connect server ke transport
    await server.connect(transport);
    console.log('[SSE] Server connected');

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  } catch (error: any) {
    console.error('[SSE] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
}