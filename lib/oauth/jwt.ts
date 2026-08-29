// lib/oauth/jwt.ts
import * as crypto from 'node:crypto';

export interface McpTokenPayload {
  iss: string;
  aud: string; // Target canonical MCP resource URL
  sub: string; // User ID
  endpoint_id: string; // Endpoint ID
  client_id: string; // Client ID
  scope: string; // Space-separated scopes
  iat: number; // Issued at (seconds)
  exp: number; // Expires at (seconds)
  nbf?: number; // Not before (seconds)
  jti: string; // Unique token ID
}

function getJwtSecret(): Buffer {
  const secret =
    process.env.NEXTAUTH_SECRET ||
    process.env.ENCRYPTION_MASTER_KEY ||
    'MCP_GATEWAY_HUB_OAUTH_SIGNING_SECRET_KEY_32_BYTES';
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function normalizeOriginSafe(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function resolveIssuer(reqOrigin?: string | null): string {
  const envUrl =
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (envUrl) {
    const normalized = normalizeOriginSafe(envUrl);
    if (normalized) return normalized;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (reqOrigin) {
    const normalized = normalizeOriginSafe(reqOrigin);
    if (normalized) return normalized;
  }

  return process.env.NODE_ENV === 'production'
    ? 'https://mcp-gateway-hub-beta.vercel.app'
    : 'http://localhost:3000';
}

function resolveResourceUrl(endpointId: string, reqOrigin?: string | null): string {
  const issuer = resolveIssuer(reqOrigin);
  if (endpointId.startsWith('combo_')) {
    const rawId = endpointId.replace(/^combo_/, '');
    return `${issuer}/api/mcp/combo/${rawId}/http`;
  }
  return `${issuer}/api/mcp/${endpointId}/http`;
}

/**
 * Base64URL encode without padding.
 */
export function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64URL decode helper.
 */
export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Signs an MCP access token JWT with HMAC-SHA256.
 */
export function signMcpAccessToken(params: {
  userId: string;
  endpointId?: string;
  comboId?: string;
  clientId: string;
  scope?: string;
  expiresInSeconds?: number;
  reqOrigin?: string | null;
}): { token: string; expiresIn: number; payload: McpTokenPayload } {
  const issuer = resolveIssuer(params.reqOrigin);
  const isCombo = Boolean(params.comboId || (params.endpointId && params.endpointId.startsWith('combo_')));
  const rawTargetId = params.comboId || (params.endpointId ? params.endpointId.replace(/^combo_/, '') : '');

  const resourceUrl = isCombo
    ? `${issuer}/api/mcp/combo/${rawTargetId}/http`
    : `${issuer}/api/mcp/${rawTargetId}/http`;

  const expiresIn = params.expiresInSeconds !== undefined ? params.expiresInSeconds : 3600; // 1 hour default
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload: McpTokenPayload = {
    iss: issuer,
    aud: resourceUrl,
    sub: params.userId,
    endpoint_id: isCombo ? `combo_${rawTargetId}` : rawTargetId,
    client_id: params.clientId,
    scope: params.scope || 'mcp:read mcp:write',
    iat: now,
    exp: now + expiresIn,
    nbf: now,
    jti: crypto.randomUUID(),
  };

  const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify(header), 'utf8'));
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(signingInput)
    .digest();
  const encodedSignature = base64UrlEncode(signature);

  const token = `${signingInput}.${encodedSignature}`;

  return { token, expiresIn, payload };
}

/**
 * Verifies if a token format matches a JWT (3 dot-separated base64url segments).
 */
export function isJwtToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  try {
    const headerStr = base64UrlDecode(parts[0]);
    const header = JSON.parse(headerStr);
    return header && typeof header === 'object' && header.typ === 'JWT' && header.alg === 'HS256';
  } catch {
    return false;
  }
}

export type TokenVerificationResult =
  | { valid: true; payload: McpTokenPayload }
  | { valid: false; error: string; statusCode?: number };

/**
 * Strictly verifies an MCP OAuth access token JWT:
 * - Signature verification with constant-time equality
 * - Expiration and Not-Before check
 * - Resource/Audience binding (token's aud must match canonical resource URL or endpoint/combo ID)
 * - Target ID binding
 */
export function verifyMcpAccessToken(
  token: string,
  endpointId?: string,
  reqOrigin?: string | null,
  options?: { isCombo?: boolean }
): TokenVerificationResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Missing token' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed JWT structure' };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // 1. Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(signingInput)
    .digest();
  const expectedEncodedSig = base64UrlEncode(expectedSignature);

  const actualSigBuf = Buffer.from(encodedSignature, 'utf8');
  const expectedSigBuf = Buffer.from(expectedEncodedSig, 'utf8');

  if (actualSigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(actualSigBuf, expectedSigBuf)) {
    return { valid: false, error: 'Invalid token signature' };
  }

  // 2. Decode and parse payload
  let payload: McpTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return { valid: false, error: 'Invalid token payload' };
  }

  const now = Math.floor(Date.now() / 1000);

  // 3. Expiration checks
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    return { valid: false, error: 'Token has expired' };
  }

  if (payload.nbf && typeof payload.nbf === 'number' && payload.nbf > now) {
    return { valid: false, error: 'Token not active yet' };
  }

  // If no specific endpointId provided for check, return valid payload
  if (!endpointId) {
    return { valid: true, payload };
  }

  // 4. Endpoint/Combo binding check
  const matchesTargetId =
    payload.endpoint_id === endpointId ||
    payload.endpoint_id === `combo_${endpointId}` ||
    (endpointId.startsWith('combo_') && payload.endpoint_id === endpointId.replace(/^combo_/, '')) ||
    (payload.endpoint_id.startsWith('combo_') && payload.endpoint_id.replace(/^combo_/, '') === endpointId);

  if (!matchesTargetId) {
    return { valid: false, error: 'Token not issued for this endpoint' };
  }

  // 5. Audience / Resource check
  const issuer = resolveIssuer(reqOrigin);
  const canonicalEndpointResource = `${issuer}/api/mcp/${endpointId}/http`;
  const canonicalComboResource = `${issuer}/api/mcp/combo/${endpointId}/http`;
  const strippedId = endpointId.startsWith('combo_') ? endpointId.replace(/^combo_/, '') : '';
  const canonicalStrippedComboResource = strippedId ? `${issuer}/api/mcp/combo/${strippedId}/http` : '';

  const resourceMatches =
    payload.aud === canonicalEndpointResource ||
    payload.aud === canonicalComboResource ||
    (Boolean(canonicalStrippedComboResource) && payload.aud === canonicalStrippedComboResource) ||
    payload.aud.endsWith(`/api/mcp/combo/${endpointId}/http`) ||
    payload.aud.endsWith(`/api/mcp/${endpointId}/http`) ||
    (Boolean(strippedId) && payload.aud.endsWith(`/api/mcp/combo/${strippedId}/http`)) ||
    payload.aud === endpointId;

  if (!resourceMatches) {
    return { valid: false, error: 'Token audience does not match target resource' };
  }

  return { valid: true, payload };
}
