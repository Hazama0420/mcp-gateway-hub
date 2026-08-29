// lib/oauth/config.ts

function normalizeOriginSafe(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return null;
  }
}

export const OAUTH_SCOPES = {
  READ: 'mcp:read',
  WRITE: 'mcp:write',
  DEFAULT: ['mcp:read', 'mcp:write'],
};

export const SUPPORTED_SCOPES = ['mcp:read', 'mcp:write'];
export const SUPPORTED_RESPONSE_TYPES = ['code'];
export const SUPPORTED_GRANT_TYPES = ['authorization_code', 'refresh_token'];
export const SUPPORTED_CODE_CHALLENGE_METHODS = ['S256'];
export const SUPPORTED_TOKEN_AUTH_METHODS = ['client_secret_post', 'client_secret_basic', 'none'];

/**
 * Resolves the stable canonical issuer URL for the authorization server.
 * Uses configured environment variables (APP_URL, NEXTAUTH_URL, NEXT_PUBLIC_APP_URL)
 * or VERCEL_URL. In development, defaults to http://localhost:3000.
 */
export function getCanonicalIssuerUrl(reqOrigin?: string | null): string {
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

/**
 * Returns the canonical MCP resource URL for a given endpoint.
 * Format: https://<domain>/api/mcp/<endpoint-id>/http
 */
export function getCanonicalResourceUrl(endpointId: string, reqOrigin?: string | null): string {
  const issuer = getCanonicalIssuerUrl(reqOrigin);
  return `${issuer}/api/mcp/${endpointId}/http`;
}

/**
 * Constructs the RFC 9728 OAuth 2.0 Protected Resource Metadata URL for an endpoint or root.
 * RFC 9728 path-specific: /.well-known/oauth-protected-resource/api/mcp/<endpoint-id>/http
 */
export function getOAuthProtectedResourceMetadataUrl(endpointId?: string, reqOrigin?: string | null): string {
  const issuer = getCanonicalIssuerUrl(reqOrigin);
  if (endpointId) {
    return `${issuer}/.well-known/oauth-protected-resource/api/mcp/${endpointId}/http`;
  }
  return `${issuer}/.well-known/oauth-protected-resource`;
}

/**
 * Generates RFC 9728 Protected Resource Metadata JSON object.
 */
export function createProtectedResourceMetadata(endpointId?: string, reqOrigin?: string | null) {
  const issuer = getCanonicalIssuerUrl(reqOrigin);
  const resource = endpointId
    ? getCanonicalResourceUrl(endpointId, reqOrigin)
    : `${issuer}/api/mcp`;

  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: endpointId ? `MCP Endpoint ${endpointId}` : 'MCP Gateway Hub Protected Resource',
    resource_documentation: `${issuer}/admin/endpoints`,
  };
}

/**
 * Generates RFC 8414 OAuth 2.0 Authorization Server Metadata JSON object.
 */
export function createAuthorizationServerMetadata(reqOrigin?: string | null) {
  const issuer = getCanonicalIssuerUrl(reqOrigin);

  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: SUPPORTED_RESPONSE_TYPES,
    grant_types_supported: SUPPORTED_GRANT_TYPES,
    code_challenge_methods_supported: SUPPORTED_CODE_CHALLENGE_METHODS,
    scopes_supported: SUPPORTED_SCOPES,
    token_endpoint_auth_methods_supported: SUPPORTED_TOKEN_AUTH_METHODS,
    service_documentation: `${issuer}/admin/endpoints`,
  };
}
