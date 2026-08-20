// pages/api/mcp/[id]/messages.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { transports } from '@/lib/transportStore';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const sessionId = req.query.sessionId as string;

  console.log('[Messages] Received request for endpoint:', id, 'sessionId:', sessionId);

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    console.error('[Messages] Session not found in Map. Available sessions:', Array.from(transports.keys()));
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    const body = req.body;
    const message = typeof body === 'string' ? JSON.parse(body) : body;
    console.log('[Messages] Received message:', message.method);

    const startTime = performance.now();
    let toolName = 'unknown';
    let status = 'success';

    if (message.method === 'tools/call' && message.params?.name) {
      toolName = message.params.name;
    }

    // 🔥 Gunakan transport.handleMessage
    await transport.handleMessage(message);

    const duration = Math.round(performance.now() - startTime);

    if (message.method === 'tools/call') {
      await prisma.executionLog.create({
        data: {
          endpoint_id: id as string,
          tool_name: toolName,
          status,
          execution_time_ms: duration,
        },
      });
    }

    res.status(204).end();
  } catch (error: any) {
    console.error('[Messages] Error:', error);
    res.status(500).json({ error: error.message });
  }
}