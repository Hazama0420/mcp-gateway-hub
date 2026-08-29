// app/oauth/register/route.ts
import { NextResponse } from 'next/server';
import { registerOAuthClient } from '@/lib/oauth/store';
import { checkRateLimit, applyRateLimitHeaders, LIMITS } from '@/lib/security/ratelimit';
import { recordSecurityEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';

  // 1. Rate limiting (10 req/min/IP)
  const rateLimitResult = await checkRateLimit(`oauth_reg:${ip}`, LIMITS.OAUTH_REGISTER);
  if (!rateLimitResult.success) {
    recordSecurityEvent({
      eventType: 'RATE_LIMITED',
      route: '/oauth/register',
      ip,
      reason: 'OAuth client registration rate limit exceeded',
    });
    const res = NextResponse.json(
      { error: 'too_many_requests', error_description: 'Rate limit exceeded for client registration' },
      { status: 429 }
    );
    applyRateLimitHeaders(res, rateLimitResult);
    return res;
  }

  try {
    const body = await req.json();
    const clientInfo = await registerOAuthClient(body);

    recordSecurityEvent({
      eventType: 'OAUTH_CLIENT_REGISTERED',
      route: '/oauth/register',
      ip,
      metadata: {
        client_id: clientInfo.client_id,
        client_name: clientInfo.client_name,
        token_endpoint_auth_method: clientInfo.token_endpoint_auth_method,
      },
    });

    const res = NextResponse.json(clientInfo, {
      status: 201,
      headers: {
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });
    applyRateLimitHeaders(res, rateLimitResult);
    return res;
  } catch (error: any) {
    const res = NextResponse.json(
      { error: 'invalid_client_metadata', error_description: error.message || 'Invalid client metadata' },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
    applyRateLimitHeaders(res, rateLimitResult);
    return res;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
