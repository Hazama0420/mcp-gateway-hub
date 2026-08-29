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
 * Resolves the canonical Google / Gemini Spark custom app redirect URI.
 * Reads from process.env.GEMINI_OAUTH_REDIRECT_URI or process.env.GOOGLE_CUSTOM_MCP_REDIRECT_URI,
 * falling back to the canonical deployment user-bound redirect URI.
 */
export function getCanonicalGeminiRedirectUri(): string {
  if (process.env.GEMINI_OAUTH_REDIRECT_URI) {
    return process.env.GEMINI_OAUTH_REDIRECT_URI.trim();
  }
  if (process.env.GOOGLE_CUSTOM_MCP_REDIRECT_URI) {
    return process.env.GOOGLE_CUSTOM_MCP_REDIRECT_URI.trim();
  }
  return 'https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-102731520205207880268-mcp-gateway-hub-beta_vercel_app';
}

/**
 * Returns the list of canonical managed redirect URIs for Gemini/Google MCP integration.
 * The primary canonical URI is always the user-bound custom MCP redirect URI.
 * Generic 'https://oauth.google.com/callback' is intentionally excluded.
 */
export function getManagedEndpointRedirectUris(): string[] {
  const primary = getCanonicalGeminiRedirectUri();
  const list = [primary];
  const additional = [
    'https://antigravity.google/oauth-callback',
    'https://vertexaisearch.cloud.google.com/oauth-redirect',
    'https://gemini.google.com/oauth/callback',
    'https://developers.google.com/oauth/callback',
    'http://127.0.0.1:8080/callback',
  ];
  for (const uri of additional) {
    if (!list.includes(uri)) {
      list.push(uri);
    }
  }
  return list;
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
 * Safely extracts the canonical endpoint ID from an RFC 8707 resource indicator URL or path.
 * Accepts canonical forms:
 * - https://<domain>/api/mcp/<endpoint-id>/http
 * - https://<domain>/api/mcp/<endpoint-id>
 * - /api/mcp/<endpoint-id>/http
 * - /api/mcp/<endpoint-id>
 * Validates endpoint ID format ([a-zA-Z0-9_-]{1,64}) to prevent path traversal and injection.
 */
export function extractEndpointIdFromResource(resource: string | null | undefined): string | null {
  if (!resource || typeof resource !== 'string') return null;
  const trimmed = resource.trim();
  if (!trimmed) return null;

  try {
    let path = trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      path = parsed.pathname;
    }

    const match = path.match(/^\/?api\/mcp\/([a-zA-Z0-9_-]{1,64})(?:\/.*)?$/);
    if (match && match[1]) {
      return match[1];
    }
  } catch {
    return null;
  }
  return null;
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
