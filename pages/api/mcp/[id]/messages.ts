// pages/api/mcp/[id]/messages.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { transports } from '@/lib/transportStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId } = req.query;

  if (Array.isArray(sessionId) || !sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  const transport = transports.get(sessionId);

  if (!transport) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error: any) {
    console.error('[Messages] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
}