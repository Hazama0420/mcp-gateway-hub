// app/api/oauth/authorize/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { redirectUriMatches, createAuthorizationCode } from '@/lib/oauth/store';
import { checkRateLimit, applyRateLimitHeaders, LIMITS } from '@/lib/security/ratelimit';
import { recordSecurityEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

function createRedirectUrl(baseUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(baseUri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const resource = url.searchParams.get('resource');
  const endpointIdParam = url.searchParams.get('endpoint_id');

  if (!clientId) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'Missing client_id' }, { status: 400 });
  }

  const client = await prisma.oAuthClient.findUnique({
    where: { client_id: clientId },
  });

  if (!client) {
    return NextResponse.json({ error: 'invalid_client', error_description: 'Client not found' }, { status: 400 });
  }

  if (!client.is_active) {
    return NextResponse.json(
      { error: 'unauthorized_client', error_description: 'OAuth client has been revoked' },
      { status: 400 }
    );
  }

  if (redirectUri && !client.redirect_uris.some((registered) => redirectUriMatches(redirectUri, registered))) {
    console.warn('[OAuth Authorize GET] Redirect URI mismatch:', {
      client_id: client.client_id,
      requested_redirect_uri: redirectUri,
      registered_redirect_uris: client.redirect_uris,
    });
    return NextResponse.json(
      {
        error: 'invalid_request',
        error_description: 'The OAuth redirect URI is not registered for this client. Please retry the OAuth connection or register the correct redirect URI.',
      },
      { status: 400 }
    );
  }

  // Find target endpoint from resource URL or parameter
  let targetEndpoint: any = null;
  let targetEndpointId: string | undefined = endpointIdParam || undefined;

  if (!targetEndpointId && resource) {
    const match = resource.match(/\/api\/mcp\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      targetEndpointId = match[1];
    }
  }

  if (targetEndpointId) {
    targetEndpoint = await prisma.mcpEndpoint.findUnique({
      where: { id: targetEndpointId },
      select: { id: true, name: true, is_active: true, user_id: true },
    });
  }

  return NextResponse.json({
    client: {
      client_id: client.client_id,
      client_name: client.client_name,
      logo_uri: client.logo_uri,
      client_uri: client.client_uri,
    },
    endpoint: targetEndpoint,
    scope: url.searchParams.get('scope') || client.scope || 'mcp:read mcp:write',
  });
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';

  // 1. Rate Limit
  const rateLimitResult = await checkRateLimit(`oauth_auth:${ip}`, LIMITS.OAUTH_AUTH);
  if (!rateLimitResult.success) {
    recordSecurityEvent({
      eventType: 'RATE_LIMITED',
      route: '/api/oauth/authorize',
      ip,
      reason: 'OAuth authorize rate limit exceeded',
    });
    const res = NextResponse.json(
      { error: 'too_many_requests', error_description: 'Rate limit exceeded for authorization' },
      { status: 429 }
    );
    applyRateLimitHeaders(res, rateLimitResult);
    return res;
  }

  // 2. Check User Session
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized', error_description: 'User not authenticated' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: 'unauthorized', error_description: 'User not found' }, { status: 401 });
  }

  const body = await req.json();
  const {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: responseType,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    scope,
    state,
    resource,
    endpoint_id: endpointIdParam,
    action, // 'allow' | 'deny'
  } = body;

  // 3. Validate client and redirect URI (Pre-redirect errors)
  if (!clientId) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'Missing client_id' }, { status: 400 });
  }

  const client = await prisma.oAuthClient.findUnique({
    where: { client_id: clientId },
  });

  if (!client) {
    return NextResponse.json({ error: 'invalid_client', error_description: 'Client not found' }, { status: 400 });
  }

  if (!client.is_active) {
    return NextResponse.json(
      { error: 'unauthorized_client', error_description: 'OAuth client has been revoked' },
      { status: 400 }
    );
  }

  let finalRedirectUri = redirectUri;
  if (finalRedirectUri) {
    if (!client.redirect_uris.some((registered) => redirectUriMatches(finalRedirectUri, registered))) {
      console.warn('[OAuth Authorize POST] Redirect URI mismatch:', {
        client_id: client.client_id,
        requested_redirect_uri: finalRedirectUri,
        registered_redirect_uris: client.redirect_uris,
      });
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'The OAuth redirect URI is not registered for this client. Please retry the OAuth connection or register the correct redirect URI.',
        },
        { status: 400 }
      );
    }
  } else if (client.redirect_uris.length === 1) {
    finalRedirectUri = client.redirect_uris[0];
  } else {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'redirect_uri must be specified when client has multiple registered URIs' },
      { status: 400 }
    );
  }

  // 4. Handle Deny Action
  if (action === 'deny') {
    recordSecurityEvent({
      eventType: 'OAUTH_AUTHORIZATION_DENIED',
      userId: user.id,
      route: '/api/oauth/authorize',
      ip,
      metadata: { client_id: clientId },
    });

    const redirectUrl = createRedirectUrl(finalRedirectUri, {
      error: 'access_denied',
      error_description: 'The user denied the authorization request',
      state,
    });

    return NextResponse.json({ redirect_url: redirectUrl });
  }

  // 5. Validate OAuth 2.1 parameters
  if (responseType !== 'code') {
    const redirectUrl = createRedirectUrl(finalRedirectUri, {
      error: 'unsupported_response_type',
      error_description: "Only response_type 'code' is supported",
      state,
    });
    return NextResponse.json({ redirect_url: redirectUrl });
  }

  if (!codeChallenge) {
    const redirectUrl = createRedirectUrl(finalRedirectUri, {
      error: 'invalid_request',
      error_description: 'code_challenge is required per OAuth 2.1 PKCE requirements',
      state,
    });
    return NextResponse.json({ redirect_url: redirectUrl });
  }

  if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
    const redirectUrl = createRedirectUrl(finalRedirectUri, {
      error: 'invalid_request',
      error_description: "Only code_challenge_method 'S256' is supported",
      state,
    });
    return NextResponse.json({ redirect_url: redirectUrl });
  }

  // 6. Resolve MCP Endpoint
  let targetEndpointId: string | undefined = endpointIdParam;
  if (!targetEndpointId && resource) {
    const match = resource.match(/\/api\/mcp\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      targetEndpointId = match[1];
    }
  }

  if (!targetEndpointId) {
    // If user has only 1 endpoint, default to it; otherwise require selection
    const userEndpoints = await prisma.mcpEndpoint.findMany({
      where: { user_id: user.id, is_active: true },
      select: { id: true },
    });

    if (userEndpoints.length === 1) {
      targetEndpointId = userEndpoints[0].id;
    } else {
      const redirectUrl = createRedirectUrl(finalRedirectUri, {
        error: 'invalid_target',
        error_description: 'Target MCP endpoint could not be determined or user has multiple endpoints',
        state,
      });
      return NextResponse.json({ redirect_url: redirectUrl });
    }
  }

  // Verify endpoint ownership and active status
  const endpoint = await prisma.mcpEndpoint.findFirst({
    where: {
      id: targetEndpointId,
      user_id: user.id,
    },
  });

  if (!endpoint || !endpoint.is_active) {
    recordSecurityEvent({
      eventType: 'ACCESS_DENIED',
      endpointId: targetEndpointId,
      userId: user.id,
      route: '/api/oauth/authorize',
      ip,
      reason: 'Endpoint not found, inactive, or not owned by user',
    });

    const redirectUrl = createRedirectUrl(finalRedirectUri, {
      error: 'access_denied',
      error_description: 'Selected MCP endpoint is inactive or unauthorized for this user',
      state,
    });
    return NextResponse.json({ redirect_url: redirectUrl });
  }

  // 7. Issue Authorization Code
  const authCode = await createAuthorizationCode({
    clientId,
    userId: user.id,
    endpointId: endpoint.id,
    redirectUri: finalRedirectUri,
    codeChallenge,
    codeChallengeMethod: 'S256',
    scope: scope || client.scope || 'mcp:read mcp:write',
    resource,
  });

  recordSecurityEvent({
    eventType: 'OAUTH_AUTHORIZATION_STARTED',
    endpointId: endpoint.id,
    userId: user.id,
    route: '/api/oauth/authorize',
    ip,
    metadata: {
      client_id: clientId,
      scope: scope || client.scope,
    },
  });

  const redirectUrl = createRedirectUrl(finalRedirectUri, {
    code: authCode,
    state,
  });

  return NextResponse.json({ redirect_url: redirectUrl });
}
