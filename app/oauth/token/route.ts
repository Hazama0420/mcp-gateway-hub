// app/oauth/token/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { consumeAuthorizationCode, issueOAuthTokenSet, refreshOAuthToken } from '@/lib/oauth/store';
import { checkRateLimit, applyRateLimitHeaders, LIMITS } from '@/lib/security/ratelimit';
import { recordSecurityEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

async function parseRequestBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const result: Record<string, string> = {};
    params.forEach((v, k) => {
      result[k] = v;
    });
    return result;
  }

  try {
    return await req.json();
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const origin = req.headers.get('origin') || req.headers.get('host');

  // 1. Rate Limit
  const rateLimitResult = await checkRateLimit(`oauth_token:${ip}`, LIMITS.OAUTH_TOKEN);
  if (!rateLimitResult.success) {
    recordSecurityEvent({
      eventType: 'RATE_LIMITED',
      route: '/oauth/token',
      ip,
      reason: 'OAuth token endpoint rate limit exceeded',
    });
    const res = NextResponse.json(
      { error: 'too_many_requests', error_description: 'Rate limit exceeded for token endpoint' },
      { status: 429 }
    );
    applyRateLimitHeaders(res, rateLimitResult);
    return res;
  }

  // 2. Parse request body
  const body = await parseRequestBody(req);
  let clientId = body.client_id;
  let clientSecret = body.client_secret;

  // Check HTTP Basic Authorization header if client_id not in body
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.substring(6), 'base64').toString('utf8');
      const [u, p] = decoded.split(':');
      if (u) clientId = u;
      if (p) clientSecret = p;
    } catch {
      // ignore malformed basic auth
    }
  }

  if (!clientId) {
    const res = NextResponse.json(
      { error: 'invalid_client', error_description: 'Missing client_id' },
      { status: 400, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Access-Control-Allow-Origin': '*' } }
    );
    applyRateLimitHeaders(res, rateLimitResult);
    return res;
  }

  // 3. Look up OAuth client
  const client = await prisma.oAuthClient.findUnique({
    where: { client_id: clientId },
  });

  if (!client) {
    recordSecurityEvent({
      eventType: 'AUTH_FAILED',
      route: '/oauth/token',
      ip,
      reason: 'Client not found during token exchange',
      metadata: { client_id: clientId },
    });
    const res = NextResponse.json(
      { error: 'invalid_client', error_description: 'Client not found' },
      { status: 401, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Access-Control-Allow-Origin': '*' } }
    );
    applyRateLimitHeaders(res, rateLimitResult);
    return res;
  }

  // If confidential client, verify client_secret
  if (client.token_endpoint_auth_method === 'client_secret_post') {
    if (!clientSecret || !client.client_secret_hash) {
      const res = NextResponse.json(
        { error: 'invalid_client', error_description: 'Client secret is required for confidential clients' },
        { status: 401, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Access-Control-Allow-Origin': '*' } }
      );
      applyRateLimitHeaders(res, rateLimitResult);
      return res;
    }

    const isSecretValid = await bcrypt.compare(clientSecret, client.client_secret_hash);
    if (!isSecretValid) {
      recordSecurityEvent({
        eventType: 'AUTH_FAILED',
        route: '/oauth/token',
        ip,
        reason: 'Invalid client secret',
        metadata: { client_id: clientId },
      });
      const res = NextResponse.json(
        { error: 'invalid_client', error_description: 'Invalid client credentials' },
        { status: 401, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Access-Control-Allow-Origin': '*' } }
      );
      applyRateLimitHeaders(res, rateLimitResult);
      return res;
    }
  }

  const grantType = body.grant_type;

  // 4. Handle grant types
  if (grantType === 'authorization_code') {
    const code = body.code;
    const codeVerifier = body.code_verifier;
    const redirectUri = body.redirect_uri;
    const resource = body.resource;

    if (!code) {
      const res = NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing authorization code' },
        { status: 400, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Access-Control-Allow-Origin': '*' } }
      );
      applyRateLimitHeaders(res, rateLimitResult);
      return res;
    }

    if (!codeVerifier) {
      const res = NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing PKCE code_verifier' },
        { status: 400, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Access-Control-Allow-Origin': '*' } }
      );
      applyRateLimitHeaders(res, rateLimitResult);
      return res;
    }

    const consumeResult = await consumeAuthorizationCode({
      clientId,
      code,
      codeVerifier,
      redirectUri,
      resource,
    });

    if (!consumeResult.valid || !consumeResult.codeRecord) {
      recordSecurityEvent({
        eventType: 'OAUTH_TOKEN_REJECTED',
        route: '/oauth/token',
        ip,
        reason: consumeResult.error_description || 'Authorization code validation failed',
        metadata: { client_id: clientId },
      });
      const res = NextResponse.json(
        { error: consumeResult.error || 'invalid_grant', error_description: consumeResult.error_description },
        { status: 400, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Access-Control-Allow-Origin': '*' } }
      );
      applyRateLimitHeaders(res, rateLimitResult);
      return res;
    }

    const { codeRecord } = consumeResult;

    // Issue Token Set
    const tokenSet = await issueOAuthTokenSet({
      userId: codeRecord.user_id,
      endpointId: codeRecord.endpoint_id,
      clientId,
      scope: codeRecord.scope || undefined,
      reqOrigin: origin,
    });

    recordSecurityEvent({
      eventType: 'OAUTH_TOKEN_ISSUED',
      endpointId: codeRecord.endpoint_id,
      userId: codeRecord.user_id,
      route: '/oauth/token',
      ip,
      metadata: {
        client_id: clientId,
        scope: codeRecord.scope,
      },
    });

    const res = NextResponse.json(tokenSet, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });
    applyRateLimitHeaders(res, rateLimitResult);
    return res;
  } else if (grantType === 'refresh_token') {
    const refreshToken = body.refresh_token;
    const scope = body.scope;
    const resource = body.resource;

    if (!refreshToken) {
      const res = NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing refresh_token' },
        { status: 400, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Access-Control-Allow-Origin': '*' } }
      );
      applyRateLimitHeaders(res, rateLimitResult);
      return res;
    }

    const refreshResult = await refreshOAuthToken({
      clientId,
      refreshToken,
      scope,
      resource,
      reqOrigin: origin,
    });

    if (!refreshResult.valid || !refreshResult.tokens) {
      recordSecurityEvent({
        eventType: 'OAUTH_TOKEN_REJECTED',
        route: '/oauth/token',
        ip,
        reason: refreshResult.error_description || 'Refresh token validation failed',
        metadata: { client_id: clientId },
      });
      const res = NextResponse.json(
        { error: refreshResult.error || 'invalid_grant', error_description: refreshResult.error_description },
        { status: 400, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Access-Control-Allow-Origin': '*' } }
      );
      applyRateLimitHeaders(res, rateLimitResult);
      return res;
    }

    recordSecurityEvent({
      eventType: 'OAUTH_TOKEN_REFRESHED',
      route: '/oauth/token',
      ip,
      metadata: { client_id: clientId },
    });

    const res = NextResponse.json(refreshResult.tokens, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });
    applyRateLimitHeaders(res, rateLimitResult);
    return res;
  }

  const res = NextResponse.json(
    { error: 'unsupported_grant_type', error_description: `Grant type '${grantType}' is not supported` },
    { status: 400, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Access-Control-Allow-Origin': '*' } }
  );
  applyRateLimitHeaders(res, rateLimitResult);
  return res;
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
