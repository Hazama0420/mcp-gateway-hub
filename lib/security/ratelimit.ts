// lib/security/ratelimit.ts

export interface RateLimitConfig {
  limit: number;
  windowMs: number; // in milliseconds
}

// Global default limits if not specified via ENV
export const LIMITS = {
  MCP_AUTH: { limit: 10, windowMs: 60 * 1000 }, // 10 attempts per minute per IP
  MCP_REQUEST: { limit: 100, windowMs: 60 * 1000 }, // 100 requests per minute per endpoint
  PLAYGROUND: { limit: 30, windowMs: 60 * 1000 }, // 30 executions per minute per user/IP
  OPENAPI_IMPORT: { limit: 5, windowMs: 60 * 1000 }, // 5 imports per minute per user/IP
};

interface RateLimitInfo {
  count: number;
  resetAt: number;
}

// Temporary in-memory store.
// In a distributed deployment, this should be replaced with a Redis-backed implementation.
const store = new Map<string, RateLimitInfo>();

// Simple cleanup mechanism for expired entries to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, info] of store.entries()) {
    if (now > info.resetAt) {
      store.delete(key);
    }
  }
}, 60 * 1000).unref(); // Run every minute, don't block Node exit

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Validates whether the given key has exceeded its rate limit.
 *
 * @param identifier - A unique identifier for the request (e.g. "mcp_auth:192.168.1.1")
 * @param config - The limit and window configuration
 * @returns RateLimitResult indicating success and header information
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  let info = store.get(identifier);

  // If entry doesn't exist or has expired, create a new one
  if (!info || now > info.resetAt) {
    info = {
      count: 0,
      resetAt: now + config.windowMs,
    };
  }

  // Increment the counter
  info.count += 1;
  store.set(identifier, info);

  const remaining = Math.max(0, config.limit - info.count);
  const success = info.count <= config.limit;

  return {
    success,
    limit: config.limit,
    remaining,
    resetAt: info.resetAt,
  };
}

/**
 * Standard utility to apply rate limit headers to a Next.js Response object
 */
export function applyRateLimitHeaders(res: Response | any, result: RateLimitResult) {
  // If it's a standard Fetch API Response / NextResponse
  if (res.headers && typeof res.headers.set === 'function') {
    res.headers.set('X-RateLimit-Limit', result.limit.toString());
    res.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    res.headers.set('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000).toString());

    if (!result.success) {
      const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
      res.headers.set('Retry-After', Math.max(1, retryAfterSeconds).toString());
    }
  }
  // If it's a NextApiRequest/NextApiResponse from Pages router
  else if (res.setHeader && typeof res.setHeader === 'function') {
    res.setHeader('X-RateLimit-Limit', result.limit.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000).toString());

    if (!result.success) {
      const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
      res.setHeader('Retry-After', Math.max(1, retryAfterSeconds).toString());
    }
  }
}
