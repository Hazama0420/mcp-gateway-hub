// __tests__/ssrf_protection.test.ts
//
// Tests for P1.1 SSRF Protection
// Tests validateUrlSyntax (synchronous checks) from lib/security/url.ts

const { validateUrlSyntax, validateBaseUrl } = require('../lib/security/url');

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

console.log('=== P1.1 SSRF Protection Tests ===\n');

// ---- ALLOWED URLs ----
console.log('--- Allowed URLs ---');

assert(
  'https://api.github.com allowed',
  validateUrlSyntax('https://api.github.com').safe === true
);

assert(
  'https://example.com allowed',
  validateUrlSyntax('https://example.com').safe === true
);

assert(
  'https://api.vercel.com/v9/projects allowed',
  validateUrlSyntax('https://api.vercel.com/v9/projects').safe === true
);

assert(
  'http://example.com allowed (HTTP)',
  validateUrlSyntax('http://example.com').safe === true
);

assert(
  'https://petstore.swagger.io/v2/swagger.json allowed',
  validateUrlSyntax('https://petstore.swagger.io/v2/swagger.json').safe === true
);

// ---- BLOCKED: localhost variants ----
console.log('\n--- Blocked: localhost ---');

assert(
  'http://localhost blocked',
  validateUrlSyntax('http://localhost').safe === false
);

assert(
  'http://localhost:3000 blocked',
  validateUrlSyntax('http://localhost:3000').safe === false
);

assert(
  'https://localhost blocked',
  validateUrlSyntax('https://localhost').safe === false
);

assert(
  'http://localhost.localdomain blocked',
  validateUrlSyntax('http://localhost.localdomain').safe === false
);

// ---- BLOCKED: Private IPv4 ----
console.log('\n--- Blocked: Private IPv4 ---');

assert(
  'http://127.0.0.1 blocked',
  validateUrlSyntax('http://127.0.0.1').safe === false
);

assert(
  'http://127.0.0.1:8080 blocked',
  validateUrlSyntax('http://127.0.0.1:8080').safe === false
);

assert(
  'http://10.0.0.1 blocked',
  validateUrlSyntax('http://10.0.0.1').safe === false
);

assert(
  'http://10.255.255.255 blocked',
  validateUrlSyntax('http://10.255.255.255').safe === false
);

assert(
  'http://172.16.0.1 blocked',
  validateUrlSyntax('http://172.16.0.1').safe === false
);

assert(
  'http://172.31.255.255 blocked',
  validateUrlSyntax('http://172.31.255.255').safe === false
);

assert(
  'http://192.168.1.1 blocked',
  validateUrlSyntax('http://192.168.1.1').safe === false
);

assert(
  'http://192.168.0.1 blocked',
  validateUrlSyntax('http://192.168.0.1').safe === false
);

assert(
  'http://0.0.0.0 blocked',
  validateUrlSyntax('http://0.0.0.0').safe === false
);

// ---- BLOCKED: Link-local / Metadata ----
console.log('\n--- Blocked: Link-local / Metadata ---');

assert(
  'http://169.254.169.254 blocked (AWS metadata)',
  validateUrlSyntax('http://169.254.169.254').safe === false
);

assert(
  'http://169.254.169.254/latest/meta-data/ blocked',
  validateUrlSyntax('http://169.254.169.254/latest/meta-data/').safe === false
);

assert(
  'http://metadata.google.internal blocked',
  validateUrlSyntax('http://metadata.google.internal').safe === false
);

assert(
  'http://100.64.0.1 blocked (CGNAT)',
  validateUrlSyntax('http://100.64.0.1').safe === false
);

// ---- BLOCKED: IPv6 ----
console.log('\n--- Blocked: IPv6 ---');

assert(
  'http://[::1] blocked',
  validateUrlSyntax('http://[::1]').safe === false
);

assert(
  'http://[::1]:8080 blocked',
  validateUrlSyntax('http://[::1]:8080').safe === false
);

// ---- BLOCKED: Numeric IP representations ----
console.log('\n--- Blocked: Numeric IP variants ---');

assert(
  'http://2130706433 blocked (decimal 127.0.0.1)',
  validateUrlSyntax('http://2130706433').safe === false
);

assert(
  'http://0x7f000001 blocked (hex 127.0.0.1)',
  validateUrlSyntax('http://0x7f000001').safe === false
);

assert(
  'http://0177.0.0.1 blocked (octal 127.0.0.1)',
  validateUrlSyntax('http://0177.0.0.1').safe === false
);

// ---- BLOCKED: Credentials in URL ----
console.log('\n--- Blocked: Credentials in URL ---');

assert(
  'http://user:pass@127.0.0.1 blocked',
  validateUrlSyntax('http://user:pass@127.0.0.1').safe === false
);

assert(
  'http://user:pass@example.com blocked (creds in URL)',
  validateUrlSyntax('http://user:pass@example.com').safe === false
);

// ---- BLOCKED: Unsafe protocols ----
console.log('\n--- Blocked: Unsafe protocols ---');

assert(
  'file:///etc/passwd blocked',
  validateUrlSyntax('file:///etc/passwd').safe === false
);

assert(
  'ftp://example.com blocked',
  validateUrlSyntax('ftp://example.com').safe === false
);

assert(
  'gopher://example.com blocked',
  validateUrlSyntax('gopher://example.com').safe === false
);

assert(
  'data:text/html,<h1>test</h1> blocked',
  validateUrlSyntax('data:text/html,<h1>test</h1>').safe === false
);

// ---- BLOCKED: Invalid URLs ----
console.log('\n--- Blocked: Invalid URLs ---');

assert(
  'empty string blocked',
  validateUrlSyntax('').safe === false
);

assert(
  'random text blocked',
  validateUrlSyntax('not a url at all').safe === false
);

// ---- validateBaseUrl ----
console.log('\n--- validateBaseUrl ---');

assert(
  'Public base URL allowed',
  validateBaseUrl('https://api.petstore.io/v2').safe === true
);

assert(
  'Private base URL blocked',
  validateBaseUrl('http://192.168.1.1:3000').safe === false
);

assert(
  'localhost base URL blocked',
  validateBaseUrl('http://localhost:8080').safe === false
);

// ---- Edge: safe hostnames that look dangerous ----
console.log('\n--- Edge: similar but different hostnames ---');

assert(
  'http://172.15.0.1 allowed (not in 172.16-31 range)',
  validateUrlSyntax('http://172.15.0.1').safe === true
);

assert(
  'http://172.32.0.1 allowed (not in 172.16-31 range)',
  validateUrlSyntax('http://172.32.0.1').safe === true
);

// ---- Source code verification ----
console.log('\n--- Source code verification ---');

const fs = require('fs');

const importOpenapi = fs.readFileSync('app/api/integrations/import-openapi/route.ts', 'utf-8');
assert(
  'OpenAPI import uses safeFetch',
  importOpenapi.includes('safeFetch')
);
assert(
  'OpenAPI import validates baseUrl from spec',
  importOpenapi.includes('validateBaseUrl')
);
assert(
  'OpenAPI import checks response size',
  importOpenapi.includes('MAX_RESPONSE_BYTES')
);

const playground = fs.readFileSync('app/api/playground/execute/route.ts', 'utf-8');
assert(
  'Playground uses safeFetch',
  playground.includes('safeFetch')
);
assert(
  'Playground uses validateUrlSyntax before fetch',
  playground.includes('validateUrlSyntax')
);
assert(
  'Playground checks response size',
  playground.includes('MAX_RESPONSE_BYTES')
);

const urlModule = fs.readFileSync('lib/security/url.ts', 'utf-8');
assert(
  'safeFetch uses redirect: manual',
  urlModule.includes("redirect: 'manual'")
);
assert(
  'safeFetch validates each redirect destination',
  urlModule.includes('validateUrlWithDns(currentUrl)')
);
assert(
  'safeFetch has max redirects limit',
  urlModule.includes('MAX_REDIRECTS')
);
assert(
  'safeFetch has timeout via AbortController',
  urlModule.includes('AbortController')
);
assert(
  'Error messages are generic (no internal details)',
  urlModule.includes("'URL destination is not allowed'")
);

// Verify previous P0 protections untouched
const httpTs = fs.readFileSync('pages/api/mcp/[id]/http.ts', 'utf-8');
assert(
  'P0.1 MCP Bearer Auth still present',
  httpTs.includes('bcrypt.compare') && httpTs.includes('api_key_hash')
);

const integrationIdRoute = fs.readFileSync('app/api/integrations/[id]/route.ts', 'utf-8');
assert(
  'P0.2 Tenant isolation still present (user_id in query)',
  integrationIdRoute.includes('user_id: user.id')
);

const postgresAdapter = fs.readFileSync('lib/adapters/postgres.ts', 'utf-8');
assert(
  'P0.3 READ ONLY transaction still present',
  postgresAdapter.includes('BEGIN READ ONLY')
);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  process.exit(1);
}
