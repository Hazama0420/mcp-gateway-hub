// __tests__/cors.test.ts
//
// Comprehensive test suite for P1.3 CORS Hardening
//

const {
  normalizeOrigin,
  getAllowedOrigins,
  isOriginAllowed,
  getBrowserCorsHeaders,
  getMcpCorsHeaders,
  applyCorsHeaders,
} = require('../lib/security/cors');

const fs = require('fs');

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${name}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== P1.3 CORS Hardening Tests ===\n');

  // Save original environment
  const originalEnv = { ...process.env };

  try {
    // -------------------------------------------------------------
    // 1. normalizeOrigin Tests
    // -------------------------------------------------------------
    console.log('--- 1. Origin Normalization ---');

    assert('Normalizes standard https URL', normalizeOrigin('https://app.example.com') === 'https://app.example.com');
    assert('Normalizes URL with trailing slash', normalizeOrigin('https://app.example.com/') === 'https://app.example.com');
    assert('Normalizes URL with path to just origin', normalizeOrigin('https://app.example.com/some/path?q=1') === 'https://app.example.com');
    assert('Normalizes URL with port', normalizeOrigin('http://localhost:3000/') === 'http://localhost:3000');
    assert('Converts to lowercase', normalizeOrigin('HTTPS://APP.EXAMPLE.COM') === 'https://app.example.com');
    assert('Rejects invalid URL string', normalizeOrigin('not-a-valid-url') === null);
    assert('Rejects empty string', normalizeOrigin('') === null);
    assert('Rejects null/undefined', normalizeOrigin(null as any) === null && normalizeOrigin(undefined as any) === null);
    assert('Rejects non-http(s) protocols (javascript:)', normalizeOrigin('javascript:alert(1)') === null);
    assert('Rejects file:// protocol', normalizeOrigin('file:///etc/passwd') === null);

    // -------------------------------------------------------------
    // 2. Origin Allowlist Configuration & Matching
    // -------------------------------------------------------------
    console.log('\n--- 2. Origin Allowlist & Exact Matching ---');

    process.env.NEXT_PUBLIC_APP_URL = 'https://mcp-gateway.example.com';
    process.env.NEXTAUTH_URL = 'https://auth.example.com';
    process.env.APP_URL = 'https://app.example.com';
    process.env.ALLOWED_ORIGINS = 'https://extra1.example.com, https://extra2.example.com:8443';
    process.env.NODE_ENV = 'production';

    const origins = getAllowedOrigins();
    assert('Includes NEXT_PUBLIC_APP_URL', origins.has('https://mcp-gateway.example.com'));
    assert('Includes NEXTAUTH_URL', origins.has('https://auth.example.com'));
    assert('Includes APP_URL', origins.has('https://app.example.com'));
    assert('Includes ALLOWED_ORIGINS items', origins.has('https://extra1.example.com') && origins.has('https://extra2.example.com:8443'));

    assert('Allowed origin is recognized', isOriginAllowed('https://mcp-gateway.example.com') === true);
    assert('Allowed origin with trailing slash is recognized', isOriginAllowed('https://mcp-gateway.example.com/') === true);
    assert('Allowed origin with port is recognized', isOriginAllowed('https://extra2.example.com:8443') === true);

    // -------------------------------------------------------------
    // 3. Substring & Bypass Attack Prevention
    // -------------------------------------------------------------
    console.log('\n--- 3. Substring & Bypass Prevention ---');

    assert('Subdomain suffix attack blocked', isOriginAllowed('https://mcp-gateway.example.com.attacker.com') === false);
    assert('Prefix attack blocked', isOriginAllowed('https://attacker-mcp-gateway.example.com') === false);
    assert('Different TLD blocked', isOriginAllowed('https://mcp-gateway.example.org') === false);
    assert('Protocol mismatch blocked (http vs https)', isOriginAllowed('http://mcp-gateway.example.com') === false);
    assert('Port mismatch blocked', isOriginAllowed('https://mcp-gateway.example.com:8080') === false);
    assert('Arbitrary evil domain blocked', isOriginAllowed('https://evil.com') === false);
    assert('Null origin blocked', isOriginAllowed('null') === false);
    assert('Empty origin blocked', isOriginAllowed('') === false);
    assert('Undefined origin blocked', isOriginAllowed(undefined) === false);

    // -------------------------------------------------------------
    // 4. Browser Control Plane CORS Policy
    // -------------------------------------------------------------
    console.log('\n--- 4. Browser Control Plane CORS Policy ---');

    const allowedBrowserCors = getBrowserCorsHeaders('https://mcp-gateway.example.com');
    assert('Browser: Access-Control-Allow-Origin is exact match', allowedBrowserCors['Access-Control-Allow-Origin'] === 'https://mcp-gateway.example.com');
    assert('Browser: Access-Control-Allow-Credentials is true', allowedBrowserCors['Access-Control-Allow-Credentials'] === 'true');
    assert('Browser: Access-Control-Allow-Methods configured', allowedBrowserCors['Access-Control-Allow-Methods'].includes('GET, POST, PUT, DELETE, OPTIONS'));
    assert('Browser: Access-Control-Allow-Headers configured', allowedBrowserCors['Access-Control-Allow-Headers'].includes('Content-Type, Authorization, Accept'));
    assert('Browser: Vary: Origin is present', allowedBrowserCors['Vary'] === 'Origin');
    assert('Browser: Access-Control-Max-Age is present', allowedBrowserCors['Access-Control-Max-Age'] === '86400');
    assert('Browser: NO wildcard * in allow-origin', allowedBrowserCors['Access-Control-Allow-Origin'] !== '*');

    const disallowedBrowserCors = getBrowserCorsHeaders('https://evil.com');
    assert('Browser disallowed: Returns no CORS headers', Object.keys(disallowedBrowserCors).length === 0);
    assert('Browser disallowed: No Access-Control-Allow-Origin', !disallowedBrowserCors['Access-Control-Allow-Origin']);

    const absentBrowserCors = getBrowserCorsHeaders(undefined);
    assert('Browser absent origin: Returns no CORS headers', Object.keys(absentBrowserCors).length === 0);

    // -------------------------------------------------------------
    // 5. MCP Data Plane CORS Policy
    // -------------------------------------------------------------
    console.log('\n--- 5. MCP Data Plane CORS Policy ---');

    // Case A: Native MCP client (Origin absent)
    const mcpNoOriginCors = getMcpCorsHeaders(undefined);
    assert('MCP (no origin): Has standard MCP allowed methods', mcpNoOriginCors['Access-Control-Allow-Methods'].includes('GET, POST, DELETE, OPTIONS'));
    assert('MCP (no origin): Has MCP-Protocol-Version header', mcpNoOriginCors['Access-Control-Allow-Headers'].includes('MCP-Protocol-Version'));
    assert('MCP (no origin): Has Mcp-Session-Id header', mcpNoOriginCors['Access-Control-Allow-Headers'].includes('Mcp-Session-Id'));
    assert('MCP (no origin): Has Last-Event-ID header', mcpNoOriginCors['Access-Control-Allow-Headers'].includes('Last-Event-ID'));
    assert('MCP (no origin): Has Authorization header', mcpNoOriginCors['Access-Control-Allow-Headers'].includes('Authorization'));
    assert('MCP (no origin): Exposes Mcp-Session-Id & WWW-Authenticate & RateLimits', mcpNoOriginCors['Access-Control-Expose-Headers'].includes('Mcp-Session-Id') && mcpNoOriginCors['Access-Control-Expose-Headers'].includes('WWW-Authenticate') && mcpNoOriginCors['Access-Control-Expose-Headers'].includes('X-RateLimit-Limit'));
    assert('MCP (no origin): Does NOT set Access-Control-Allow-Origin', mcpNoOriginCors['Access-Control-Allow-Origin'] === undefined);
    assert('MCP (no origin): Does NOT set Access-Control-Allow-Credentials (uses Bearer)', mcpNoOriginCors['Access-Control-Allow-Credentials'] === undefined);
    assert('MCP (no origin): NO wildcard *', mcpNoOriginCors['Access-Control-Allow-Origin'] !== '*');

    // Case B: Web-based MCP client with Allowed Origin
    const mcpAllowedOriginCors = getMcpCorsHeaders('https://app.example.com');
    assert('MCP (allowed origin): Sets exact matching Access-Control-Allow-Origin', mcpAllowedOriginCors['Access-Control-Allow-Origin'] === 'https://app.example.com');
    assert('MCP (allowed origin): Does NOT set Access-Control-Allow-Credentials', mcpAllowedOriginCors['Access-Control-Allow-Credentials'] === undefined);
    assert('MCP (allowed origin): NO wildcard *', mcpAllowedOriginCors['Access-Control-Allow-Origin'] !== '*');

    // Case C: Disallowed Origin
    const mcpDisallowedOriginCors = getMcpCorsHeaders('https://evil.com');
    assert('MCP (disallowed origin): Does NOT set Access-Control-Allow-Origin', mcpDisallowedOriginCors['Access-Control-Allow-Origin'] === undefined);

    // -------------------------------------------------------------
    // 6. applyCorsHeaders Helper Verification
    // -------------------------------------------------------------
    console.log('\n--- 6. applyCorsHeaders Verification ---');

    // App Router / Fetch API mock
    const mockNextRes = {
      headers: {
        map: new Map<string, string>(),
        set(k: string, v: string) { this.map.set(k, v); },
        get(k: string) { return this.map.get(k); }
      }
    };
    applyCorsHeaders(mockNextRes, allowedBrowserCors);
    assert('App Router: Applies headers via headers.set', mockNextRes.headers.get('Access-Control-Allow-Origin') === 'https://mcp-gateway.example.com');
    assert('App Router: Applies credentials', mockNextRes.headers.get('Access-Control-Allow-Credentials') === 'true');

    // Pages Router mock
    const mockPagesRes = {
      headerMap: new Map<string, string>(),
      setHeader(k: string, v: string) { this.headerMap.set(k, v); },
      getHeader(k: string) { return this.headerMap.get(k); }
    };
    applyCorsHeaders(mockPagesRes, mcpAllowedOriginCors);
    assert('Pages Router: Applies headers via setHeader', mockPagesRes.getHeader('Access-Control-Allow-Origin') === 'https://app.example.com');
    assert('Pages Router: Has MCP headers', mockPagesRes.getHeader('Access-Control-Allow-Headers')?.includes('MCP-Protocol-Version'));

    // -------------------------------------------------------------
    // 7. Source Code Verification
    // -------------------------------------------------------------
    console.log('\n--- 7. Source Code Verification ---');

    const middlewareSrc = fs.readFileSync('middleware.ts', 'utf-8');
    assert('middleware.ts: NO wildcard * in Access-Control-Allow-Origin', !middlewareSrc.includes("Access-Control-Allow-Origin', '*'"));
    assert('middleware.ts: Uses isOriginAllowed', middlewareSrc.includes('isOriginAllowed'));
    assert('middleware.ts: Uses getBrowserCorsHeaders', middlewareSrc.includes('getBrowserCorsHeaders'));
    assert('middleware.ts: Uses getMcpCorsHeaders', middlewareSrc.includes('getMcpCorsHeaders'));
    assert('middleware.ts: Differentiates OPTIONS for MCP vs Browser routes', middlewareSrc.includes('isMcpRoute'));

    const httpSrc = fs.readFileSync('pages/api/mcp/[id]/http.ts', 'utf-8');
    assert('http.ts: NO wildcard * in Access-Control-Allow-Origin', !httpSrc.includes("Access-Control-Allow-Origin', '*'"));
    assert('http.ts: Uses getMcpCorsHeaders', httpSrc.includes('getMcpCorsHeaders'));
    assert('http.ts: P0.1 Bearer Auth logic intact', httpSrc.includes('bcrypt.compare') && httpSrc.includes('api_key_hash'));
    assert('http.ts: P1.2 Rate limiting intact', httpSrc.includes('checkRateLimit') && httpSrc.includes('LIMITS.MCP_AUTH'));

    const sseSrc = fs.readFileSync('pages/api/mcp/[id]/sse.ts', 'utf-8');
    assert('sse.ts: NO wildcard * in Access-Control-Allow-Origin', !sseSrc.includes("Access-Control-Allow-Origin', '*'"));
    assert('sse.ts: Uses getMcpCorsHeaders', sseSrc.includes('getMcpCorsHeaders'));

    const messagesSrc = fs.readFileSync('pages/api/mcp/[id]/messages.ts', 'utf-8');
    assert('messages.ts: NO wildcard * in Access-Control-Allow-Origin', !messagesSrc.includes("Access-Control-Allow-Origin', '*'"));
    assert('messages.ts: Uses getMcpCorsHeaders', messagesSrc.includes('getMcpCorsHeaders'));

    // Verify Previous Hardening Intact
    const pgSrc = fs.readFileSync('lib/adapters/postgres.ts', 'utf-8');
    assert('P0.3 Postgres READ ONLY intact', pgSrc.includes('BEGIN READ ONLY'));

    const tenantSrc = fs.readFileSync('app/api/integrations/[id]/route.ts', 'utf-8');
    assert('P0.2 Tenant Isolation intact', tenantSrc.includes('user_id: user.id'));

    const ssrfSrc = fs.readFileSync('lib/security/url.ts', 'utf-8');
    assert('P1.1 SSRF Safe Fetch intact', ssrfSrc.includes('safeFetch') && ssrfSrc.includes('validateUrlWithDns'));

  } finally {
    process.env = originalEnv;
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
