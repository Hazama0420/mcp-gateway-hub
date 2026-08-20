import { NextApiRequest, NextApiResponse } from 'next';
import { transports } from '@/lib/transportStore';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { id, sessionId } = req.query;

  if (Array.isArray(sessionId) || !sessionId) {
    res.status(400).json({ error: 'Missing sessionId' });
    return;
  }

  console.log('[Messages] endpoint:', id);
  console.log('[Messages] sessionId:', sessionId);

  const transport = transports.get(sessionId);

  if (!transport) {
    console.error(
      '[Messages] Session not found:',
      sessionId
    );

    console.error(
      '[Messages] Available sessions:',
      Array.from(transports.keys())
    );

    res.status(404).json({
      error: 'Session not found',
    });

    return;
  }

  try {
    const body = req.body;

    console.log(
      '[Messages] body:',
      typeof body === 'string'
        ? body
        : JSON.stringify(body)
    );

    await transport.handlePostMessage(
      req,
      res,
      body
    );

    console.log('[Messages] transport handled successfully');
  } catch (error) {
    console.error('[Messages] Transport error:', error);

    if (!res.headersSent) {
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
}