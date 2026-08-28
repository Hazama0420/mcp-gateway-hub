import type { NextApiRequest, NextApiResponse } from 'next';
import { transports } from '@/lib/transportStore';
import { checkRateLimit, applyRateLimitHeaders, LIMITS } from '@/lib/security/ratelimit';
import { getMcpCorsHeaders, applyCorsHeaders } from '@/lib/security/cors';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS Headers
  const origin = req.headers.origin as string | undefined;
  const corsHeaders = getMcpCorsHeaders(origin);
  applyCorsHeaders(res, corsHeaders);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Ambil sessionId dari query parameter (dikirim otomatis oleh SSEServerTransport di URL ?sessionId=...)
  const { id, sessionId } = req.query;

  if (Array.isArray(sessionId) || !sessionId) {
    return res.status(400).json({ error: 'Missing or invalid sessionId' });
  }

  // Session-based limit
  const reqLimitIdentifier = `mcp_req:${id}`;
  const reqLimitResult = await checkRateLimit(reqLimitIdentifier, LIMITS.MCP_REQUEST);

  if (!reqLimitResult.success) {
    applyRateLimitHeaders(res, reqLimitResult);
    return res.status(429).json({ error: 'Too many requests' });
  }
  applyRateLimitHeaders(res, reqLimitResult);

  const transport = transports.get(sessionId as string);

  if (!transport || transport.endpointId !== id) {
    return res.status(404).json({ error: 'Session not found in memory' });
  }

  try {
    await transport.transport.handlePostMessage(req, res, req.body);
  } catch (error: any) {
    console.error('[Messages] Error handling post message:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }
  }
}