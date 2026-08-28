// __tests__/audit_logging.test.ts
//
// Comprehensive test suite for P2.2 Observability & Audit Logging
//

const {
  generateExecutionId,
  sanitizeAuditMetadata,
  recordExecutionLog,
  recordSecurityEvent,
} = require('../lib/security/audit');
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
  console.log('=== P2.2 Observability & Audit Logging Tests ===\n');

  // -------------------------------------------------------------
  // 1. Execution ID Uniqueness & Format
  // -------------------------------------------------------------
  console.log('--- 1. Execution ID Generation & Format ---');

  const id1 = generateExecutionId();
  const id2 = generateExecutionId();
  const id3 = generateExecutionId();

  assert('Execution ID starts with EX-', id1.startsWith('EX-') && id2.startsWith('EX-'));
  assert('Execution ID is unique across calls', id1 !== id2 && id2 !== id3 && id1 !== id3);
  assert('Execution ID contains timestamp & random parts', id1.split('-').length >= 3);

  // -------------------------------------------------------------
  // 2. Sensitive Data Policy & Redaction Audit
  // -------------------------------------------------------------
  console.log('\n--- 2. Sensitive Data Policy & Metadata Sanitization ---');

  const unsafeMetadata = {
    method: 'GET',
    adapter: 'github',
    authorization: 'Bearer sk_live_test_secret_12345',
    token: 'ghp_super_secret_github_token_999',
    api_key: 'secret_api_key_abc',
    password: 'my_super_password',
    sql: 'SELECT * FROM users WHERE password = "123"',
    query: 'SELECT secret_token FROM accounts',
    headers: { Authorization: 'Bearer xxx' },
    db_conn: 'postgresql://postgres:secretpassword@ep-db.neon.tech/neondb?sslmode=require',
    safe_info: 'normal public metadata',
    item_count: 42,
    very_long_string: 'a'.repeat(600),
  };

  const sanitized = sanitizeAuditMetadata(unsafeMetadata);

  assert('Sanitizer redacts authorization key', sanitized.authorization === '[REDACTED]');
  assert('Sanitizer redacts token key', sanitized.token === '[REDACTED]');
  assert('Sanitizer redacts api_key', sanitized.api_key === '[REDACTED]');
  assert('Sanitizer redacts password', sanitized.password === '[REDACTED]');
  assert('Sanitizer redacts sql query', sanitized.sql === '[REDACTED]');
  assert('Sanitizer redacts query key', sanitized.query === '[REDACTED]');
  assert('Sanitizer redacts headers object', sanitized.headers === '[REDACTED]');
  assert('Sanitizer redacts postgresql connection strings in text', !sanitized.db_conn.includes('secretpassword') && sanitized.db_conn.includes('[REDACTED_CONNECTION_STRING]'));
  assert('Sanitizer preserves safe non-secret fields', sanitized.safe_info === 'normal public metadata' && sanitized.item_count === 42);
  assert('Sanitizer truncates overly long strings', sanitized.very_long_string.includes('[TRUNCATED]') && sanitized.very_long_string.length <= 520);

  // -------------------------------------------------------------
  // 3. Fail-Safe Execution
  // -------------------------------------------------------------
  console.log('\n--- 3. Fail-Safe Logging (Never Crashes Execution) ---');

  let failSafePassed = true;
  try {
    // Calling with nulls/edge cases should not throw uncaught error
    await recordExecutionLog({
      toolName: 'test_tool',
      status: 'SUCCESS',
      metadata: { circular: null },
    });
  } catch (err) {
    failSafePassed = false;
  }
  assert('recordExecutionLog is fail-safe and never throws', failSafePassed);

  let securityFailSafePassed = true;
  try {
    await recordSecurityEvent({
      eventType: 'AUTH_FAILED',
      route: '/test',
      reason: 'test reason',
    });
  } catch (err) {
    securityFailSafePassed = false;
  }
  assert('recordSecurityEvent is fail-safe and never throws', securityFailSafePassed);

  // -------------------------------------------------------------
  // 4. Tenant Isolation Logic Audit
  // -------------------------------------------------------------
  console.log('\n--- 4. Tenant Isolation Audit ---');

  const logsRouteSrc = fs.readFileSync('app/api/endpoints/logs/route.ts', 'utf-8');
  assert('logs/route.ts: Uses session check', logsRouteSrc.includes('getServerSession(authOptions)'));
  assert('logs/route.ts: Queries only authenticated user_id', logsRouteSrc.includes('user_id: user.id') || logsRouteSrc.includes('endpoint: { user_id: user.id }'));
  assert('logs/route.ts: Bounds limit parameter (max 200)', logsRouteSrc.includes('200'));
  assert('logs/route.ts: Returns sanitized logs DTO', logsRouteSrc.includes('safeLogs'));

  // -------------------------------------------------------------
  // 5. Source Code & Instrumentation Audit
  // -------------------------------------------------------------
  console.log('\n--- 5. Instrumentation Audit ---');

  const httpSrc = fs.readFileSync('pages/api/mcp/[id]/http.ts', 'utf-8');
  assert('http.ts: Has centralized tool execution wrapper', httpSrc.includes('recordExecutionLog') && httpSrc.includes('originalTool'));
  assert('http.ts: Records RATE_LIMITED event on pre-auth rate limit', httpSrc.includes("eventType: 'RATE_LIMITED'"));
  assert('http.ts: Records AUTH_FAILED event on invalid token', httpSrc.includes("eventType: 'AUTH_FAILED'"));

  const playgroundSrc = fs.readFileSync('app/api/playground/execute/route.ts', 'utf-8');
  assert('playground: Records tool execution logs', playgroundSrc.includes('recordExecutionLog'));
  assert('playground: Records RATE_LIMITED security event', playgroundSrc.includes("eventType: 'RATE_LIMITED'"));
  assert('playground: Records SSRF_BLOCKED security event', playgroundSrc.includes("eventType: 'SSRF_BLOCKED'"));

  const prismaSrc = fs.readFileSync('prisma/schema.prisma', 'utf-8');
  assert('schema.prisma: ExecutionLog has execution_id', prismaSrc.includes('execution_id'));
  assert('schema.prisma: ExecutionLog has user_id', prismaSrc.includes('user_id'));
  assert('schema.prisma: ExecutionLog has source', prismaSrc.includes('source'));
  assert('schema.prisma: ExecutionLog has error_category', prismaSrc.includes('error_category'));
  assert('schema.prisma: ExecutionLog has metadata', prismaSrc.includes('metadata'));

  // -------------------------------------------------------------
  // 6. Security Regression Audit (P0.1 - P2.1)
  // -------------------------------------------------------------
  console.log('\n--- 6. Security Regression Audit ---');

  assert('P0.1 MCP Bearer Auth intact', httpSrc.includes('bcrypt.compare') && httpSrc.includes('api_key_hash'));

  const tenantSrc = fs.readFileSync('app/api/integrations/[id]/route.ts', 'utf-8');
  assert('P0.2 Tenant Isolation intact', tenantSrc.includes('user_id: user.id'));

  const postgresSrc = fs.readFileSync('lib/adapters/postgres.ts', 'utf-8');
  assert('P0.3 PostgreSQL Read-Only intact', postgresSrc.includes('BEGIN READ ONLY'));

  const ssrfSrc = fs.readFileSync('lib/security/url.ts', 'utf-8');
  assert('P1.1 SSRF Protection intact', ssrfSrc.includes('safeFetch') && ssrfSrc.includes('validateUrlWithDns'));

  const ratelimitSrc = fs.readFileSync('lib/security/ratelimit.ts', 'utf-8');
  assert('P1.2 Rate Limiting intact', ratelimitSrc.includes('checkRateLimit'));

  const corsSrc = fs.readFileSync('lib/security/cors.ts', 'utf-8');
  assert('P1.3 CORS Hardening intact', corsSrc.includes('isOriginAllowed') && corsSrc.includes('getMcpCorsHeaders'));

  const cryptoSrc = fs.readFileSync('lib/crypto.ts', 'utf-8');
  assert('P1.4 Credential Encryption intact', cryptoSrc.includes('encryptAuthConfig') && cryptoSrc.includes('decryptAuthConfig'));

  const healthSrc = fs.readFileSync('app/api/health/route.ts', 'utf-8');
  assert('P2.1 Health Check intact', healthSrc.includes('checkDatabaseHealth') && healthSrc.includes('SELECT 1'));

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
