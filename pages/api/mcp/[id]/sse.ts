// pages/api/mcp/[id]/messages.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { transports } from '@/lib/transportStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Ambil sessionId dari query parameter (dikirim otomatis oleh SSEServerTransport di URL ?sessionId=...)
  const { sessionId } = req.query;

  if (Array.isArray(sessionId) || !sessionId) {
    return res.status(400).json({ error: 'Missing or invalid sessionId' });
  }

  const transport = transports.get(sessionId);

  if (!transport) {
    return res.status(404).json({ error: 'Session not found in memory' });
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error: any) {
    console.error('[Messages] Error handling post message:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }
  }
}