// app/api/oauth/authorize/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { redirectUriMatches, createAuthorizationCode } from '@/lib/oauth/store';
import { checkRateLimit, applyRateLimitHeaders, LIMITS } from '@/lib/security/ratelimit';
import { recordSecurityEvent } from '@/lib/security/audit';
import { extractEndpointIdFromResource, extractResourceTarget } from '@/lib/oauth/config';

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
    console.warn('[OAuth Debug GET] Redirect URI mismatch:', {
      client_id: client.client_id,
      requested_redirect_uri: redirectUri,
      registered_redirect_uris: client.redirect_uris,
    });
    recordSecurityEvent({
      eventType: 'AUTH_FAILED',
      route: '/api/oauth/authorize',
      reason: 'OAuth redirect_uri mismatch during GET authorize',
      metadata: {
        client_id: client.client_id,
        requested_redirect_uri: redirectUri,
        registered_redirect_uris: client.redirect_uris,
      },
    });
    return NextResponse.json(
      {
        error: 'invalid_request',
        error_description: 'The OAuth redirect URI is not registered for this client. Please retry the OAuth connection or register the correct redirect URI.',
      },
      { status: 400 }
    );
  }

  // Resolve target endpoint or combo with authoritative priority:
  let targetId: string | undefined = endpointIdParam && endpointIdParam.trim() ? endpointIdParam.trim() : undefined;
  let isComboTarget = false;

  if (resource) {
    const targetInfo = extractResourceTarget(resource);
    if (targetInfo) {
      targetId = targetInfo.id;
      isComboTarget = targetInfo.type === 'combo';
    }
  }

  if (!targetId && client.combo_id) {
    targetId = client.combo_id;
    isComboTarget = true;
  } else if (!targetId && client.endpoint_id) {
    targetId = client.endpoint_id;
    isComboTarget = false;
  }

  const session = await getServerSession(authOptions);
  let user: any = null;
  if (session?.user?.email) {
    user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
  }

  if (!targetId && user) {
    const userEndpoints = await prisma.mcpEndpoint.findMany({
      where: { user_id: user.id, is_active: true },
      select: { id: true },
    });
    if (userEndpoints.length === 1) {
      targetId = userEndpoints[0].id;
    }
  }

  let targetDisplay: any = null;

  if (targetId) {
    if (isComboTarget || client.combo_id) {
      const combo = await prisma.combo.findUnique({
        where: { id: targetId },
        include: {
          endpoints: {
            include: {
              endpoint: {
                include: {
                  services: true,
                },
              },
            },
          },
        },
      });

      if (combo) {
        targetDisplay = {
          id: combo.id,
          name: combo.name,
          is_active: combo.is_active,
          user_id: combo.user_id,
          is_combo: true,
          services: combo.endpoints.flatMap((e) => e.endpoint?.services || []),
        };
      }
    } else {
      const endpoint = await prisma.mcpEndpoint.findUnique({
        where: { id: targetId },
        include: { services: true },
      });

      if (endpoint) {
        targetDisplay = {
          id: endpoint.id,
          name: endpoint.name,
          is_active: endpoint.is_active,
          user_id: endpoint.user_id,
          is_combo: false,
          services: endpoint.services || [],
        };
      }
    }
  }

  // Security Check 1: Target must exist and be active if resolved
  if (targetId && (!targetDisplay || !targetDisplay.is_active)) {
    return NextResponse.json(
      {
        error: 'invalid_target',
        error_description: 'Target MCP resource not found or inactive',
      },
      { status: 400 }
    );
  }

  // Security Check 2: Multi-Endpoint Tenant Isolation Check
  if (client.user_id && targetDisplay && targetDisplay.user_id !== client.user_id) {
    recordSecurityEvent({
      eventType: 'AUTH_FAILED',
      route: '/api/oauth/authorize',
      reason: 'Cross-user resource authorization attempt blocked',
      metadata: {
        client_id: client.client_id,
        client_user_id: client.user_id,
        target_resource_user_id: targetDisplay.user_id,
        target_resource_id: targetDisplay.id,
      },
    });
    return NextResponse.json(
      {
        error: 'access_denied',
        error_description: 'OAuth client is not authorized to access resources belonging to another user',
      },
      { status: 403 }
    );
  }

  return NextResponse.json({
    client: {
      client_id: client.client_id,
      client_name: client.client_name,
      logo_uri: client.logo_uri,
      client_uri: client.client_uri,
    },
    endpoint: targetDisplay,
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
      console.warn('[OAuth Debug POST] Redirect URI mismatch:', {
        client_id: client.client_id,
        requested_redirect_uri: finalRedirectUri,
        registered_redirect_uris: client.redirect_uris,
      });
      recordSecurityEvent({
        eventType: 'AUTH_FAILED',
        route: '/api/oauth/authorize',
        reason: 'OAuth redirect_uri mismatch during POST authorize',
        metadata: {
          client_id: client.client_id,
          requested_redirect_uri: finalRedirectUri,
          registered_redirect_uris: client.redirect_uris,
        },
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
    console.warn('[OAuth Debug POST] Missing redirect_uri with multiple registered URIs:', {
      client_id: client.client_id,
      registered_redirect_uris: client.redirect_uris,
    });
    recordSecurityEvent({
      eventType: 'AUTH_FAILED',
      route: '/api/oauth/authorize',
      reason: 'Missing redirect_uri with multiple registered URIs',
      metadata: {
        client_id: client.client_id,
        registered_redirect_uris: client.redirect_uris,
      },
    });
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

  // 6. Resolve MCP Endpoint or Combo with strict authoritative priority:
  let targetId: string | undefined = endpointIdParam && typeof endpointIdParam === 'string' && endpointIdParam.trim() ? endpointIdParam.trim() : undefined;
  let isComboTarget = false;

  if (resource) {
    const targetInfo = extractResourceTarget(resource);
    if (targetInfo) {
      targetId = targetInfo.id;
      isComboTarget = targetInfo.type === 'combo';
    }
  }

  if (!targetId && client.combo_id) {
    targetId = client.combo_id;
    isComboTarget = true;
  } else if (!targetId && client.endpoint_id) {
    targetId = client.endpoint_id;
    isComboTarget = false;
  }

  // Fallback: Single active endpoint or single active combo
  if (!targetId) {
    const userEndpoints = await prisma.mcpEndpoint.findMany({
      where: { user_id: user.id, is_active: true },
      select: { id: true },
    });
    const userCombos = await prisma.combo.findMany({
      where: { user_id: user.id, is_active: true },
      select: { id: true },
    });

    if (userEndpoints.length === 1 && userCombos.length === 0) {
      targetId = userEndpoints[0].id;
      isComboTarget = false;
    } else if (userCombos.length === 1 && userEndpoints.length === 0) {
      targetId = userCombos[0].id;
      isComboTarget = true;
    } else {
      recordSecurityEvent({
        eventType: 'AUTH_FAILED',
        route: '/api/oauth/authorize',
        userId: user.id,
        reason: 'Target MCP resource could not be determined or user has multiple active resources',
        metadata: { client_id: clientId },
      });
      const redirectUrl = createRedirectUrl(finalRedirectUri, {
        error: 'invalid_target',
        error_description: 'Target MCP resource could not be determined or user has multiple resources',
        state,
      });
      return NextResponse.json({ redirect_url: redirectUrl });
    }
  }

  let targetResource: any = null;

  if (isComboTarget || client.combo_id) {
    targetResource = await prisma.combo.findFirst({
      where: {
        id: targetId,
        user_id: user.id,
      },
      include: {
        endpoints: true,
      },
    });
  } else {
    targetResource = await prisma.mcpEndpoint.findFirst({
      where: {
        id: targetId,
        user_id: user.id,
      },
    });
  }

  if (!targetResource || !targetResource.is_active) {
    recordSecurityEvent({
      eventType: 'ACCESS_DENIED',
      endpointId: targetId,
      userId: user.id,
      route: '/api/oauth/authorize',
      ip,
      reason: 'Resource not found, inactive, or not owned by user',
    });

    const redirectUrl = createRedirectUrl(finalRedirectUri, {
      error: 'access_denied',
      error_description: 'Selected MCP resource is inactive or unauthorized for this user',
      state,
    });
    return NextResponse.json({ redirect_url: redirectUrl });
  }

  // Tenant Isolation Security Check
  if (client.user_id && client.user_id !== user.id) {
    recordSecurityEvent({
      eventType: 'ACCESS_DENIED',
      endpointId: targetResource.id,
      userId: user.id,
      route: '/api/oauth/authorize',
      ip,
      reason: 'Client owner does not match resource owner',
      metadata: {
        client_id: client.client_id,
        client_user_id: client.user_id,
        auth_user_id: user.id,
      },
    });

    const redirectUrl = createRedirectUrl(finalRedirectUri, {
      error: 'access_denied',
      error_description: 'OAuth client is not authorized to access resources belonging to another user',
      state,
    });
    return NextResponse.json({ redirect_url: redirectUrl });
  }

  // 7. Issue Authorization Code
  let endpointIdForDb = targetResource.id;
  if (isComboTarget || client.combo_id) {
    if (targetResource.endpoints && targetResource.endpoints.length > 0) {
      endpointIdForDb = targetResource.endpoints[0].endpoint_id;
    } else {
      const userEp = await prisma.mcpEndpoint.findFirst({
        where: { user_id: user.id, is_active: true },
      });
      if (userEp) {
        endpointIdForDb = userEp.id;
      }
    }
  }

  const canonicalComboOrEpResource = isComboTarget || client.combo_id
    ? `/api/mcp/combo/${targetResource.id}/http`
    : `/api/mcp/${targetResource.id}/http`;

  const authCode = await createAuthorizationCode({
    clientId,
    userId: user.id,
    endpointId: endpointIdForDb,
    redirectUri: finalRedirectUri,
    codeChallenge,
    codeChallengeMethod: 'S256',
    scope: scope || client.scope || 'mcp:read mcp:write',
    resource: resource || canonicalComboOrEpResource,
  });

  recordSecurityEvent({
    eventType: 'OAUTH_AUTHORIZATION_STARTED',
    endpointId: targetResource.id,
    userId: user.id,
    route: '/api/oauth/authorize',
    ip,
    metadata: {
      client_id: clientId,
      scope: scope || client.scope,
      is_combo: isComboTarget,
    },
  });

  const redirectUrl = createRedirectUrl(finalRedirectUri, {
    code: authCode,
    state,
  });

  return NextResponse.json({ redirect_url: redirectUrl });
}

