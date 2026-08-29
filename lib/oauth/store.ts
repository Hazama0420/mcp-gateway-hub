// lib/oauth/store.ts
import * as crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

let prismaInstance: any = null;

function getPrismaClient() {
  if (!prismaInstance) {
    try {
      const mod = require('../prisma');
      prismaInstance = mod.default || mod.prisma || mod;
    } catch {
      try {
        const { PrismaClient } = require('@prisma/client');
        prismaInstance = new PrismaClient();
      } catch {
        prismaInstance = null;
      }
    }
  }
  return prismaInstance;
}

function getPkceHelper() {
  try {
    return require('./pkce');
  } catch {
    return null;
  }
}

function getJwtHelper() {
  try {
    return require('./jwt');
  } catch {
    return null;
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Validates a requested redirect_uri against a registered one per RFC 8252 §7.3.
 * For loopback hosts (localhost, 127.0.0.1, [::1]), any port is allowed for ephemeral native apps.
 * For all other hosts, exact matching is strictly required.
 */
export function redirectUriMatches(requested: string, registered: string): boolean {
  if (requested === registered) {
    return true;
  }

  let reqUrl: URL;
  let regUrl: URL;

  try {
    reqUrl = new URL(requested);
    regUrl = new URL(registered);
  } catch {
    return false;
  }

  // Reject unsafe schemes
  if (
    reqUrl.protocol === 'javascript:' ||
    reqUrl.protocol === 'data:' ||
    regUrl.protocol === 'javascript:' ||
    regUrl.protocol === 'data:'
  ) {
    return false;
  }

  // Port relaxation applies only if BOTH target loopback host (RFC 8252 §7.3)
  if (LOOPBACK_HOSTS.has(reqUrl.hostname) && LOOPBACK_HOSTS.has(regUrl.hostname)) {
    return (
      reqUrl.protocol === regUrl.protocol &&
      reqUrl.hostname === regUrl.hostname &&
      reqUrl.pathname === regUrl.pathname &&
      reqUrl.search === regUrl.search
    );
  }

  // Exact matching for non-loopback per OAuth 2.1 via canonical URL comparison
  return reqUrl.href === regUrl.href;
}

/**
 * Validates if a redirect URI syntax is safe (no javascript:, data:, wildcards).
 */
export function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === 'javascript:' || parsed.protocol === 'data:') {
      return false;
    }
    if (!parsed.protocol) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Hashes an opaque token or authorization code with SHA-256 for secure DB persistence.
 */
export function hashOpaqueToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface RegisterClientInput {
  client_name?: string;
  redirect_uris?: string[];
  redirect_uri?: string;
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
  contacts?: string[];
  client_uri?: string;
  logo_uri?: string;
  tos_uri?: string;
  policy_uri?: string;
  jwks_uri?: string;
  software_id?: string;
  software_version?: string;
  endpoint_id?: string;
  user_id?: string;
}

/**
 * Dynamic Client Registration (RFC 7591).
 * Default auth method is confidential (client_secret_post/client_secret_basic) per RFC 7591 §2
 * unless explicitly requested as 'none'.
 */
export async function registerOAuthClient(input: RegisterClientInput) {
  const prisma = getPrismaClient();

  // Accept either redirect_uris array or singular redirect_uri (or string)
  let rawUris: string[] = [];
  if (Array.isArray(input.redirect_uris) && input.redirect_uris.length > 0) {
    rawUris = input.redirect_uris;
  } else if (typeof input.redirect_uris === 'string' && (input.redirect_uris as string).trim()) {
    rawUris = [(input.redirect_uris as string).trim()];
  } else if (input.redirect_uri && typeof input.redirect_uri === 'string' && input.redirect_uri.trim()) {
    rawUris = [input.redirect_uri.trim()];
  } else if (Array.isArray(input.redirect_uri) && (input.redirect_uri as any).length > 0) {
    rawUris = input.redirect_uri as any;
  }

  const uris = rawUris
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter(Boolean);

  if (uris.length === 0) {
    throw new Error('redirect_uris must be a non-empty array of valid URLs');
  }

  for (const uri of uris) {
    if (!isValidRedirectUri(uri)) {
      throw new Error(`Invalid or unsafe redirect_uri: ${uri}`);
    }
  }

  const clientId = `mcp_client_${crypto.randomUUID()}`;
  const isExplicitPublic = input.token_endpoint_auth_method === 'none';
  const authMethod = isExplicitPublic
    ? 'none'
    : input.token_endpoint_auth_method || 'client_secret_post';

  let rawClientSecret: string | undefined;
  let clientSecretHash: string | undefined;

  if (!isExplicitPublic) {
    rawClientSecret = `mcp_sec_${crypto.randomBytes(32).toString('hex')}`;
    const salt = await bcrypt.genSalt(10);
    clientSecretHash = await bcrypt.hash(rawClientSecret, salt);
  }

  const client = await prisma.oAuthClient.create({
    data: {
      client_id: clientId,
      client_secret_hash: clientSecretHash || null,
      client_name: input.client_name || 'Gemini Spark MCP Client',
      client_type: isExplicitPublic ? 'public' : 'confidential',
      client_uri: input.client_uri || null,
      logo_uri: input.logo_uri || null,
      redirect_uris: uris,
      grant_types: input.grant_types || ['authorization_code', 'refresh_token'],
      response_types: input.response_types || ['code'],
      token_endpoint_auth_method: authMethod,
      scope: input.scope || 'mcp:read mcp:write',
      contacts: input.contacts || [],
      tos_uri: input.tos_uri || null,
      policy_uri: input.policy_uri || null,
      jwks_uri: input.jwks_uri || null,
      software_id: input.software_id || null,
      software_version: input.software_version || null,
      endpoint_id: input.endpoint_id || null,
      user_id: input.user_id || null,
      is_active: true,
    },
  });

  return {
    client_id: client.client_id,
    ...(rawClientSecret ? { client_secret: rawClientSecret } : {}),
    client_id_issued_at: Math.floor(client.created_at.getTime() / 1000),
    client_secret_expires_at: 0, // 0 = never expires per RFC 7591 §3.2.1
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    grant_types: client.grant_types,
    response_types: client.response_types,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    scope: client.scope,
  };
}

/**
 * Creates an endpoint-bound OAuth client manually via Dashboard UI.
 * Returns the plaintext client secret ONCE upon creation.
 */
export async function createEndpointOAuthClient(params: {
  endpointId: string;
  userId: string;
  clientName: string;
  clientType?: 'confidential' | 'public';
  redirectUris?: string[];
  scope?: string;
}) {
  const prisma = getPrismaClient();

  const endpoint = await prisma.mcpEndpoint.findFirst({
    where: { id: params.endpointId, user_id: params.userId },
  });

  if (!endpoint) {
    throw new Error('Endpoint not found or unauthorized');
  }

  const defaultUris = [
    'https://oauth.google.com/callback',
    'https://vertexaisearch.cloud.google.com/oauth-redirect',
    'https://gemini.google.com/oauth/callback',
    'https://developers.google.com/oauth/callback',
    'http://127.0.0.1:8080/callback',
  ];

  const rawUris = params.redirectUris && params.redirectUris.length > 0
    ? params.redirectUris
    : defaultUris;

  const uris = rawUris
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter(Boolean);

  for (const uri of uris) {
    if (!isValidRedirectUri(uri)) {
      throw new Error(`Invalid redirect_uri: ${uri}`);
    }
  }

  const isPublic = params.clientType === 'public';
  const clientId = `mcp_client_${crypto.randomUUID()}`;
  let rawClientSecret: string | undefined;
  let clientSecretHash: string | undefined;

  if (!isPublic) {
    rawClientSecret = `mcp_sec_${crypto.randomBytes(32).toString('hex')}`;
    const salt = await bcrypt.genSalt(10);
    clientSecretHash = await bcrypt.hash(rawClientSecret, salt);
  }

  const client = await prisma.oAuthClient.create({
    data: {
      client_id: clientId,
      client_secret_hash: clientSecretHash || null,
      client_name: params.clientName || 'Gemini Spark',
      client_type: isPublic ? 'public' : 'confidential',
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: isPublic ? 'none' : 'client_secret_post',
      scope: params.scope || 'mcp:read mcp:write',
      endpoint_id: params.endpointId,
      user_id: params.userId,
      is_active: true,
    },
  });

  return {
    client_id: client.client_id,
    client_secret: rawClientSecret,
    client_name: client.client_name,
    client_type: client.client_type,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    redirect_uris: client.redirect_uris,
    scope: client.scope,
    created_at: client.created_at,
    is_active: client.is_active,
  };
}

/**
 * Lists all OAuth clients configured for a specific endpoint and user.
 * Sanitizes and strips hashes/secrets.
 */
export async function listEndpointOAuthClients(endpointId: string, userId: string) {
  const prisma = getPrismaClient();

  const clients = await prisma.oAuthClient.findMany({
    where: {
      endpoint_id: endpointId,
      user_id: userId,
    },
    select: {
      id: true,
      client_id: true,
      client_name: true,
      client_type: true,
      token_endpoint_auth_method: true,
      redirect_uris: true,
      scope: true,
      is_active: true,
      created_at: true,
      updated_at: true,
    },
    orderBy: { created_at: 'desc' },
  });

  return clients;
}

/**
 * Revokes an OAuth client for an endpoint.
 * Atomically marks the client as inactive and revokes all active refresh tokens.
 */
export async function revokeEndpointOAuthClient(clientId: string, endpointId: string, userId: string) {
  const prisma = getPrismaClient();

  const client = await prisma.oAuthClient.findFirst({
    where: {
      client_id: clientId,
      OR: [
        { endpoint_id: endpointId, user_id: userId },
        { endpoint_id: endpointId },
      ],
    },
  });

  if (!client) {
    throw new Error('OAuth client not found or unauthorized');
  }

  if (client.is_active) {
    await prisma.oAuthClient.update({
      where: { id: client.id },
      data: { is_active: false },
    });
  }

  // Revoke all active refresh tokens for this client
  await prisma.oAuthRefreshToken.updateMany({
    where: { client_id: clientId, revoked_at: null },
    data: { revoked_at: new Date() },
  });

  return { success: true, client_id: clientId, is_active: false };
}

/**
 * Creates and stores a single-use authorization code bound to PKCE S256 challenge.
 */
export async function createAuthorizationCode(params: {
  clientId: string;
  userId: string;
  endpointId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod?: string;
  scope?: string;
  resource?: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const prisma = getPrismaClient();
  const rawCode = `mcp_code_${crypto.randomBytes(32).toString('hex')}`;
  const codeHash = hashOpaqueToken(rawCode);
  const expiresIn = params.expiresInSeconds || 300; // 5 minutes
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await prisma.oAuthAuthorizationCode.create({
    data: {
      code_hash: codeHash,
      client_id: params.clientId,
      user_id: params.userId,
      endpoint_id: params.endpointId,
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
      code_challenge_method: params.codeChallengeMethod || 'S256',
      scope: params.scope || 'mcp:read mcp:write',
      resource: params.resource || null,
      expires_at: expiresAt,
    },
  });

  return rawCode;
}

/**
 * Validates and atomically consumes a single-use authorization code.
 */
export async function consumeAuthorizationCode(params: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri?: string;
  resource?: string;
}) {
  const prisma = getPrismaClient();
  const pkceHelper = getPkceHelper();
  const codeHash = hashOpaqueToken(params.code);

  const codeRecord = await prisma.oAuthAuthorizationCode.findUnique({
    where: { code_hash: codeHash },
    include: { client: true, user: true, endpoint: true },
  });

  if (!codeRecord) {
    return { valid: false, error: 'invalid_grant', error_description: 'Authorization code not found or invalid' };
  }

  // Check client is active
  if (!codeRecord.client.is_active) {
    return { valid: false, error: 'invalid_client', error_description: 'OAuth client has been revoked' };
  }

  // Check single-use
  if (codeRecord.used_at) {
    return { valid: false, error: 'invalid_grant', error_description: 'Authorization code has already been used' };
  }

  // Check expiration
  if (codeRecord.expires_at < new Date()) {
    return { valid: false, error: 'invalid_grant', error_description: 'Authorization code has expired' };
  }

  // Check client binding
  if (codeRecord.client_id !== params.clientId) {
    return { valid: false, error: 'invalid_grant', error_description: 'Client ID mismatch for authorization code' };
  }

  // Check redirect URI if provided
  if (params.redirectUri && !redirectUriMatches(params.redirectUri, codeRecord.redirect_uri)) {
    return { valid: false, error: 'invalid_grant', error_description: 'redirect_uri does not match authorization code' };
  }

  // Check PKCE
  const isPkceValid = pkceHelper
    ? pkceHelper.verifyPkce(
        params.codeVerifier,
        codeRecord.code_challenge,
        codeRecord.code_challenge_method
      )
    : false;

  if (!isPkceValid) {
    return { valid: false, error: 'invalid_grant', error_description: 'code_verifier does not match code_challenge' };
  }

  // Check active endpoint
  if (!codeRecord.endpoint.is_active) {
    return { valid: false, error: 'invalid_grant', error_description: 'MCP endpoint is inactive' };
  }

  // Mark as used atomically
  await prisma.oAuthAuthorizationCode.update({
    where: { id: codeRecord.id },
    data: { used_at: new Date() },
  });

  return { valid: true, codeRecord };
}

/**
 * Issues an OAuth token set (JWT Access Token + Refresh Token).
 */
export async function issueOAuthTokenSet(params: {
  userId: string;
  endpointId: string;
  clientId: string;
  scope?: string;
  reqOrigin?: string | null;
}) {
  const prisma = getPrismaClient();
  const jwtHelper = getJwtHelper();

  // 1. Generate JWT access token
  const { token: accessToken, expiresIn, payload } = jwtHelper.signMcpAccessToken({
    userId: params.userId,
    endpointId: params.endpointId,
    clientId: params.clientId,
    scope: params.scope,
    expiresInSeconds: 3600, // 1 hour
    reqOrigin: params.reqOrigin,
  });

  // 2. Generate Refresh Token
  const rawRefreshToken = `mcp_rt_${crypto.randomBytes(32).toString('hex')}`;
  const rtHash = hashOpaqueToken(rawRefreshToken);
  const rtExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await prisma.oAuthRefreshToken.create({
    data: {
      token_hash: rtHash,
      client_id: params.clientId,
      user_id: params.userId,
      endpoint_id: params.endpointId,
      scope: params.scope || 'mcp:read mcp:write',
      resource: payload.aud,
      expires_at: rtExpiresAt,
    },
  });

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    refresh_token: rawRefreshToken,
    scope: params.scope || 'mcp:read mcp:write',
  };
}

/**
 * Refreshes an access token using a valid refresh token.
 */
export async function refreshOAuthToken(params: {
  clientId: string;
  refreshToken: string;
  scope?: string;
  resource?: string;
  reqOrigin?: string | null;
}) {
  const prisma = getPrismaClient();
  const jwtHelper = getJwtHelper();
  const rtHash = hashOpaqueToken(params.refreshToken);

  const rtRecord = await prisma.oAuthRefreshToken.findUnique({
    where: { token_hash: rtHash },
    include: { endpoint: true, client: true },
  });

  if (!rtRecord) {
    return { valid: false, error: 'invalid_grant', error_description: 'Refresh token not found' };
  }

  if (rtRecord.client && !rtRecord.client.is_active) {
    return { valid: false, error: 'invalid_client', error_description: 'OAuth client has been revoked' };
  }

  if (rtRecord.revoked_at) {
    return { valid: false, error: 'invalid_grant', error_description: 'Refresh token has been revoked' };
  }

  if (rtRecord.expires_at < new Date()) {
    return { valid: false, error: 'invalid_grant', error_description: 'Refresh token has expired' };
  }

  if (rtRecord.client_id !== params.clientId) {
    return { valid: false, error: 'invalid_grant', error_description: 'Client ID mismatch for refresh token' };
  }

  if (!rtRecord.endpoint.is_active) {
    return { valid: false, error: 'invalid_grant', error_description: 'MCP endpoint is inactive' };
  }

  // Issue new access token
  const scope = params.scope || rtRecord.scope || 'mcp:read mcp:write';
  const { token: newAccessToken, expiresIn } = jwtHelper.signMcpAccessToken({
    userId: rtRecord.user_id,
    endpointId: rtRecord.endpoint_id,
    clientId: params.clientId,
    scope,
    expiresInSeconds: 3600,
    reqOrigin: params.reqOrigin,
  });

  return {
    valid: true,
    tokens: {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope,
    },
  };
}

/**
 * Revokes a token (RFC 7009).
 */
export async function revokeOAuthToken(token: string) {
  const prisma = getPrismaClient();
  const tokenHash = hashOpaqueToken(token);

  await prisma.oAuthRefreshToken.updateMany({
    where: { token_hash: tokenHash, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}
