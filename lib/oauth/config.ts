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

  if (reqOrigin) {
    const normalized = normalizeOriginSafe(reqOrigin);
    if (normalized) return normalized;
  }

  if (process.env.NODE_ENV === 'production') {
    return 'https://mcp-gateway-hub-beta.vercel.app';
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return 'http://localhost:3000';
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
 * Returns the canonical MCP resource URL for a given Combo.
 * Format: https://<domain>/api/mcp/combo/<combo-id>/http
 */
export function getCanonicalComboResourceUrl(comboId: string, reqOrigin?: string | null): string {
  const issuer = getCanonicalIssuerUrl(reqOrigin);
  return `${issuer}/api/mcp/combo/${comboId}/http`;
}

/**
 * Extracts target resource identity and type (combo or endpoint) from RFC 8707 resource indicator.
 */
export function extractResourceTarget(resource: string | null | undefined): { type: 'combo' | 'endpoint'; id: string } | null {
  if (!resource || typeof resource !== 'string') return null;
  const trimmed = resource.trim();
  if (!trimmed) return null;

  try {
    let path = trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      path = parsed.pathname;
    }

    const comboMatch = path.match(/^\/?api\/mcp\/combo\/([a-zA-Z0-9_-]{1,64})(?:\/.*)?$/);
    if (comboMatch && comboMatch[1]) {
      return { type: 'combo', id: comboMatch[1] };
    }

    const match = path.match(/^\/?api\/mcp\/([a-zA-Z0-9_-]{1,64})(?:\/.*)?$/);
    if (match && match[1] && match[1] !== 'combo') {
      return { type: 'endpoint', id: match[1] };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Safely extracts the canonical endpoint or combo ID from an RFC 8707 resource indicator URL or path.
 */
export function extractEndpointIdFromResource(resource: string | null | undefined): string | null {
  const target = extractResourceTarget(resource);
  return target ? target.id : null;
}

/**
 * Constructs the RFC 9728 OAuth 2.0 Protected Resource Metadata URL for an endpoint, combo, or root.
 * RFC 9728 path-specific:
 * - Standalone: /.well-known/oauth-protected-resource/api/mcp/<endpoint-id>/http
 * - Combo:      /.well-known/oauth-protected-resource/api/mcp/combo/<combo-id>/http
 */
export function getOAuthProtectedResourceMetadataUrl(
  endpointOrComboId?: string,
  reqOrigin?: string | null,
  options?: { isCombo?: boolean }
): string {
  const issuer = getCanonicalIssuerUrl(reqOrigin);
  if (endpointOrComboId) {
    const isPrefixed = endpointOrComboId.startsWith('combo_');
    const isCombo = Boolean(options?.isCombo || isPrefixed);
    const rawId = options?.isCombo
      ? endpointOrComboId
      : (isPrefixed ? endpointOrComboId.replace(/^combo_/, '') : endpointOrComboId);
    if (isCombo) {
      return `${issuer}/.well-known/oauth-protected-resource/api/mcp/combo/${rawId}/http`;
    }
    return `${issuer}/.well-known/oauth-protected-resource/api/mcp/${rawId}/http`;
  }
  return `${issuer}/.well-known/oauth-protected-resource`;
}

/**
 * Convenience helper to construct the RFC 9728 OAuth 2.0 Protected Resource Metadata URL for a Combo.
 */
export function getOAuthComboProtectedResourceMetadataUrl(comboId: string, reqOrigin?: string | null): string {
  return getOAuthProtectedResourceMetadataUrl(comboId, reqOrigin, { isCombo: true });
}

/**
 * Generates RFC 9728 Protected Resource Metadata JSON object for endpoints, combos, or root.
 */
export function createProtectedResourceMetadata(
  endpointOrComboId?: string,
  reqOrigin?: string | null,
  options?: { isCombo?: boolean }
) {
  const issuer = getCanonicalIssuerUrl(reqOrigin);
  const isPrefixed = Boolean(endpointOrComboId && endpointOrComboId.startsWith('combo_'));
  const isCombo = Boolean(options?.isCombo || isPrefixed);
  const rawId = endpointOrComboId
    ? (options?.isCombo ? endpointOrComboId : (isPrefixed ? endpointOrComboId.replace(/^combo_/, '') : endpointOrComboId))
    : undefined;

  let resource = `${issuer}/api/mcp`;
  let resourceName = 'MCP Gateway Hub Protected Resource';
  let resourceDoc = `${issuer}/admin/endpoints`;

  if (rawId) {
    if (isCombo) {
      resource = getCanonicalComboResourceUrl(rawId, reqOrigin);
      resourceName = `MCP Combo ${rawId}`;
      resourceDoc = `${issuer}/admin/combo`;
    } else {
      resource = getCanonicalResourceUrl(rawId, reqOrigin);
      resourceName = `MCP Endpoint ${rawId}`;
      resourceDoc = `${issuer}/admin/endpoints`;
    }
  }

  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: resourceName,
    resource_documentation: resourceDoc,
  };
}

/**
 * Convenience helper to generate RFC 9728 Protected Resource Metadata JSON object for a Combo.
 */
export function createComboProtectedResourceMetadata(comboId: string, reqOrigin?: string | null) {
  return createProtectedResourceMetadata(comboId, reqOrigin, { isCombo: true });
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
