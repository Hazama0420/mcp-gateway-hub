// lib/security/url.ts
import { lookup } from 'dns/promises';

const ALLOWED_PROTOCOLS = new Set(['https:', 'http:']);

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 127) return true;                          // 127.0.0.0/8
  if (a === 10) return true;                           // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16 (link-local)
  if (a === 0) return true;                            // 0.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true;   // 100.64.0.0/10 (CGNAT)
  if (a >= 224) return true;                           // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::1') return true;
  if (normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;  // fc00::/7
  if (normalized.startsWith('fe80')) return true;                               // fe80::/10
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.substring(7);
    if (ipv4Part.includes('.')) return isPrivateIPv4(ipv4Part);
  }
  return false;
}

function parseNumericIPv4(hostname: string): string | null {
  // Decimal: 2130706433 => 127.0.0.1
  if (/^\d+$/.test(hostname)) {
    const num = parseInt(hostname, 10);
    if (num >= 0 && num <= 0xFFFFFFFF) {
      return [
        (num >>> 24) & 0xFF,
        (num >>> 16) & 0xFF,
        (num >>> 8) & 0xFF,
        num & 0xFF,
      ].join('.');
    }
  }
  // Hex: 0x7f000001 => 127.0.0.1
  if (/^0x[0-9a-fA-F]+$/.test(hostname)) {
    const num = parseInt(hostname, 16);
    if (num >= 0 && num <= 0xFFFFFFFF) {
      return [
        (num >>> 24) & 0xFF,
        (num >>> 16) & 0xFF,
        (num >>> 8) & 0xFF,
        num & 0xFF,
      ].join('.');
    }
  }
  // Octal dotted: 0177.0.0.1 => 127.0.0.1
  if (/^0\d+(\.\d+){3}$/.test(hostname)) {
    const parts = hostname.split('.').map(p => parseInt(p, 8));
    if (parts.every(p => p >= 0 && p <= 255)) {
      return parts.join('.');
    }
  }
  return null;
}

function isHostnameBlocked(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  const numericIp = parseNumericIPv4(lower);
  if (numericIp && isPrivateIPv4(numericIp)) return true;
  if (isPrivateIPv4(lower)) return true;
  if (isPrivateIPv6(lower)) return true;
  return false;
}

export type UrlValidationResult =
  | { safe: true; url: string }
  | { safe: false; reason: string };

export function validateUrlSyntax(rawUrl: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { safe: false, reason: 'URL destination is not allowed' };
  }

  if (parsed.username || parsed.password) {
    return { safe: false, reason: 'URL destination is not allowed' };
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    return { safe: false, reason: 'URL destination is not allowed' };
  }

  if (isHostnameBlocked(hostname)) {
    return { safe: false, reason: 'URL destination is not allowed' };
  }

  return { safe: true, url: parsed.toString() };
}

export async function validateUrlWithDns(rawUrl: string): Promise<UrlValidationResult> {
  const syntaxResult = validateUrlSyntax(rawUrl);
  if (!syntaxResult.safe) return syntaxResult;

  const parsed = new URL(syntaxResult.url);
  const hostname = parsed.hostname;

  // Skip DNS check for IP literals — already checked in syntax validation
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return syntaxResult;
  }
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return syntaxResult;
  }

  try {
    // Resolve A records
    try {
      const ipv4Result = await lookup(hostname, { family: 4 });
      if (isPrivateIPv4(ipv4Result.address)) {
        return { safe: false, reason: 'URL destination is not allowed' };
      }
    } catch {
      // No A record, try AAAA
    }

    try {
      const ipv6Result = await lookup(hostname, { family: 6 });
      if (isPrivateIPv6(ipv6Result.address)) {
        return { safe: false, reason: 'URL destination is not allowed' };
      }
    } catch {
      // No AAAA record either — that's fine, fetch will fail naturally
    }
  } catch {
    // DNS resolution failed entirely — allow fetch to fail naturally
  }

  return syntaxResult;
}

export async function safeFetch(
  url: string,
  options: RequestInit & { maxResponseBytes?: number } = {}
): Promise<Response> {
  const { maxResponseBytes = MAX_RESPONSE_BYTES, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let currentUrl = url;
    let redirectCount = 0;

    while (true) {
      const validation = await validateUrlWithDns(currentUrl);
      if (!validation.safe) {
        throw new Error(validation.reason);
      }

      const res = await fetch(currentUrl, {
        ...fetchOptions,
        signal: controller.signal,
        redirect: 'manual',
      });

      if (res.status >= 300 && res.status < 400) {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          throw new Error('Too many redirects');
        }

        const location = res.headers.get('location');
        if (!location) {
          throw new Error('Redirect without Location header');
        }

        try {
          currentUrl = new URL(location, currentUrl).toString();
        } catch {
          throw new Error('URL destination is not allowed');
        }

        continue;
      }

      return res;
    }
  } finally {
    clearTimeout(timeout);
  }
}

export function validateBaseUrl(baseUrl: string): UrlValidationResult {
  return validateUrlSyntax(baseUrl);
}

export { MAX_RESPONSE_BYTES, FETCH_TIMEOUT_MS };
