// lib/security/cors.ts

/**
 * Normalizes an origin string into standard `scheme://hostname[:port]` format.
 * Returns null if the URL or origin is invalid or not using http/https.
 */
export function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Retrieves the set of all allowed origins from environment variables.
 * Checks:
 * - NEXT_PUBLIC_APP_URL
 * - NEXTAUTH_URL
 * - APP_URL
 * - ALLOWED_ORIGINS (comma-separated list)
 * In development or when no origins are configured, includes localhost defaults.
 */
export function getAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();

  const primaryEnvVars = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.APP_URL,
  ];

  for (const val of primaryEnvVars) {
    if (val) {
      const normalized = normalizeOrigin(val);
      if (normalized) {
        allowed.add(normalized);
      }
    }
  }

  if (process.env.ALLOWED_ORIGINS) {
    const parts = process.env.ALLOWED_ORIGINS.split(',');
    for (const part of parts) {
      const normalized = normalizeOrigin(part);
      if (normalized) {
        allowed.add(normalized);
      }
    }
  }

  // Fallback for local development or if no origin has been configured
  if (process.env.NODE_ENV === 'development' || allowed.size === 0) {
    const localDev = normalizeOrigin('http://localhost:3000');
    const localIp = normalizeOrigin('http://127.0.0.1:3000');
    if (localDev) allowed.add(localDev);
    if (localIp) allowed.add(localIp);
  }

  return allowed;
}

/**
 * Validates if an origin strictly matches the configured allowlist.
 * Uses exact match (no substring or wildcard matching).
 */
export function isOriginAllowed(origin: string | null | undefined): boolean {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  const allowed = getAllowedOrigins();
  return allowed.has(normalized);
}

/**
 * Generates CORS headers for Browser Control Plane endpoints.
 * Only returns CORS headers if the request origin is strictly in the allowlist.
 */
export function getBrowserCorsHeaders(origin: string | null | undefined): Record<string, string> {
  if (!origin) return {};

  const normalized = normalizeOrigin(origin);
  if (!normalized || !isOriginAllowed(normalized)) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': normalized,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

/**
 * Generates CORS headers for MCP Data Plane endpoints (/api/mcp/[id]/*).
 * - NEVER uses wildcard '*'.
 * - Sets Access-Control-Allow-Origin ONLY if origin is provided and strictly allowed.
 * - Does NOT set Access-Control-Allow-Credentials (MCP authenticates via Bearer API Key).
 * - Exposes required MCP and rate-limiting headers.
 */
export function getMcpCorsHeaders(origin?: string | null | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  if (origin) {
    const normalized = normalizeOrigin(origin);
    if (normalized && isOriginAllowed(normalized)) {
      headers['Access-Control-Allow-Origin'] = normalized;
    }
  }

  return headers;
}

/**
 * Applies a dictionary of CORS headers to a Response object (NextResponse, Fetch Response, or NextApiResponse).
 */
export function applyCorsHeaders(res: any, headers: Record<string, string>): void {
  if (!res || !headers) return;

  if (res.headers && typeof res.headers.set === 'function') {
    for (const [key, value] of Object.entries(headers)) {
      res.headers.set(key, value);
    }
  } else if (typeof res.setHeader === 'function') {
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
  }
}
