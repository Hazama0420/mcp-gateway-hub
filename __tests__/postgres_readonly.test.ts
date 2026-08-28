// __tests__/postgres_readonly.test.ts
//
// Unit tests for P0.3 PostgreSQL Tool Safety
// Tests the sanitizeDbError function and verifies the read-only design.

// Extract and test sanitizeDbError logic
function sanitizeDbError(error: any): string {
  const msg = error?.message || 'Unknown database error';
  const sanitized = msg
    .replace(/postgresql:\/\/[^\s]+/gi, '[REDACTED_CONNECTION_STRING]')
    .replace(/password=[^\s&]+/gi, 'password=[REDACTED]')
    .replace(/host=[^\s&]+/gi, 'host=[REDACTED]');
  return sanitized;
}

// ---- sanitizeDbError tests ----

console.log('=== P0.3 PostgreSQL Tool Safety Tests ===\n');

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

// Test: sanitizeDbError strips connection strings
assert(
  'sanitizeDbError strips postgresql:// URLs',
  sanitizeDbError({ message: 'connection to postgresql://user:pass@host:5432/db failed' })
    .includes('[REDACTED_CONNECTION_STRING]')
);

assert(
  'sanitizeDbError strips password param',
  !sanitizeDbError({ message: 'password=mysecret123 failed' }).includes('mysecret123')
);

assert(
  'sanitizeDbError strips host param',
  !sanitizeDbError({ message: 'host=internal.db.server failed' }).includes('internal.db.server')
);

assert(
  'sanitizeDbError handles null error',
  sanitizeDbError(null) === 'Unknown database error'
);

assert(
  'sanitizeDbError handles missing message',
  sanitizeDbError({}) === 'Unknown database error'
);

// Test: READ ONLY transaction design verification
// We verify the source code structure rather than live DB

const fs = require('fs');
const source = fs.readFileSync('lib/adapters/postgres.ts', 'utf-8');

assert(
  'run_sql_query uses BEGIN READ ONLY',
  source.includes("BEGIN READ ONLY")
);

assert(
  'run_sql_query uses COMMIT after query',
  source.includes("await client.query('COMMIT')")
);

assert(
  'run_sql_query uses ROLLBACK on error',
  source.includes("await client.query('ROLLBACK')")
);

assert(
  'run_sql_query sets statement_timeout',
  source.includes('SET statement_timeout')
);

assert(
  'run_sql_query resets statement_timeout in finally',
  source.includes('RESET statement_timeout')
);

assert(
  'run_sql_query handles PG error code 25006 (read_only_sql_transaction)',
  source.includes("queryError.code === '25006'")
);

assert(
  'run_sql_query handles PG error code 57014 (query_cancelled / timeout)',
  source.includes("queryError.code === '57014'")
);

assert(
  'Tool description says READ-ONLY',
  source.includes('READ-ONLY')
);

assert(
  'Tool description does NOT say supports INSERT/UPDATE/DELETE',
  !source.includes('supports SELECT, INSERT, UPDATE, DELETE')
);

assert(
  'client.release() is always called in finally block',
  source.includes('client.release()')
);

assert(
  'MAX_ROWS constant is defined',
  source.includes('MAX_ROWS = 150')
);

assert(
  'QUERY_TIMEOUT_MS constant is defined',
  source.includes('QUERY_TIMEOUT_MS = 30_000')
);

// Verify no credential leaks in error responses
assert(
  'Error responses use sanitizeDbError',
  (source.match(/sanitizeDbError/g) || []).length >= 4
);

assert(
  'No raw error.message returned without sanitization in run_sql_query',
  !source.includes("text: `Database Error: ${error.message}`")
);

// Verify connection string never logged directly
assert(
  'Connection string not logged directly',
  !source.includes('console.log(connectionString') &&
  !source.includes('console.error(connectionString')
);

// Verify pool error handler does not leak connection string
const poolErrorLine = source.match(/pool\.on\('error'.*?\n.*?\n/s)?.[0] || '';
assert(
  'Pool error handler logs only err.message, not connection string',
  poolErrorLine.includes('err.message') && !poolErrorLine.includes('connectionString')
);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  process.exit(1);
}
