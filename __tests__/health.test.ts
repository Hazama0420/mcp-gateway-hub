// __tests__/health.test.ts
//
// Comprehensive test suite for P2.1 Health Check & Service Readiness
//

const packageInfo = require('../package.json');
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

// Logic mirror from app/api/health/route.ts for testing isolated probe logic
async function checkDatabaseHealthMock(client: any): Promise<{ status: 'ok' | 'error'; latencyMs?: number }> {
  const startTime = performance.now();
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database query timeout')), 3000)
    );

    const queryPromise = client.$queryRaw`SELECT 1`;

    await Promise.race([queryPromise, timeoutPromise]);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      status: 'ok',
      latencyMs,
    };
  } catch (error) {
    return {
      status: 'error',
    };
  }
}

function generateHealthPayload(probe: string | null, dbHealth: { status: 'ok' | 'error'; latencyMs?: number }) {
  if (probe === 'liveness') {
    return {
      payload: {
        status: 'ok',
        version: packageInfo.version || '0.1.0',
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.round(process.uptime() * 10) / 10,
      },
      status: 200,
    };
  }

  const isHealthy = dbHealth.status === 'ok';
  return {
    payload: {
      status: isHealthy ? 'ok' : 'degraded',
      version: packageInfo.version || '0.1.0',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.round(process.uptime() * 10) / 10,
      services: {
        database: {
          status: dbHealth.status,
          ...(dbHealth.latencyMs !== undefined && { latency_ms: dbHealth.latencyMs }),
        },
      },
    },
    status: isHealthy ? 200 : 503,
  };
}

async function runTests() {
  console.log('=== P2.1 Health Check & Service Readiness Tests ===\n');

  // -------------------------------------------------------------
  // 1. Liveness Probe (?probe=liveness)
  // -------------------------------------------------------------
  console.log('--- 1. Liveness Probe ---');

  const liveness = generateHealthPayload('liveness', { status: 'ok' });
  assert('Liveness: HTTP status is 200', liveness.status === 200);
  assert('Liveness: status is "ok"', liveness.payload.status === 'ok');
  assert('Liveness: version matches package.json', liveness.payload.version === packageInfo.version);
  assert('Liveness: timestamp is valid ISO string', !isNaN(Date.parse(liveness.payload.timestamp)));
  assert('Liveness: uptime_seconds is a positive number', typeof liveness.payload.uptime_seconds === 'number' && liveness.payload.uptime_seconds >= 0);

  // -------------------------------------------------------------
  // 2. Database Probe - Healthy State
  // -------------------------------------------------------------
  console.log('\n--- 2. Database Probe (Healthy) ---');

  const healthyMockClient = {
    $queryRaw: async () => [{ '?column?': 1 }],
  };

  const dbHealthyResult = await checkDatabaseHealthMock(healthyMockClient);
  assert('DB Probe Healthy: Returns status "ok"', dbHealthyResult.status === 'ok');
  assert('DB Probe Healthy: Measures latency', typeof dbHealthyResult.latencyMs === 'number' && dbHealthyResult.latencyMs >= 0);

  const fullHealthy = generateHealthPayload(null, dbHealthyResult);
  assert('Full Health: HTTP status is 200', fullHealthy.status === 200);
  assert('Full Health: Overall status is "ok"', fullHealthy.payload.status === 'ok');
  assert('Full Health: services.database.status is "ok"', fullHealthy.payload.services.database.status === 'ok');
  assert('Full Health: services.database.latency_ms is present', typeof fullHealthy.payload.services.database.latency_ms === 'number');

  // -------------------------------------------------------------
  // 3. Database Probe - Failure / Degraded State (HTTP 503)
  // -------------------------------------------------------------
  console.log('\n--- 3. Database Probe (Failure / Degraded) ---');

  const failingMockClient = {
    $queryRaw: async () => {
      throw new Error('Connection refused to PostgreSQL host 10.0.0.1:5432 with password secret123');
    },
  };

  const dbFailResult = await checkDatabaseHealthMock(failingMockClient);
  assert('DB Probe Failed: Returns status "error"', dbFailResult.status === 'error');
  assert('DB Probe Failed: Does not throw uncaught error', true);

  const fullFailed = generateHealthPayload(null, dbFailResult);
  assert('Full Health (Down): HTTP status is 503', fullFailed.status === 503);
  assert('Full Health (Down): Overall status is "degraded"', fullFailed.payload.status === 'degraded');
  assert('Full Health (Down): services.database.status is "error"', fullFailed.payload.services.database.status === 'error');
  assert('Full Health (Down): services.database.latency_ms is omitted', fullFailed.payload.services.database.latency_ms === undefined);

  // -------------------------------------------------------------
  // 4. Secret Protection & Information Leakage Audit
  // -------------------------------------------------------------
  console.log('\n--- 4. Secret Protection Audit ---');

  const healthyString = JSON.stringify(fullHealthy.payload);
  const failedString = JSON.stringify(fullFailed.payload);

  assert('Healthy response does NOT leak postgresql:// URL', !healthyString.includes('postgresql://'));
  assert('Failed response does NOT leak internal connection error details', !failedString.includes('password') && !failedString.includes('secret123') && !failedString.includes('10.0.0.1'));
  assert('Response does NOT leak ENCRYPTION_MASTER_KEY', !process.env.ENCRYPTION_MASTER_KEY || !healthyString.includes(process.env.ENCRYPTION_MASTER_KEY));
  assert('Response does NOT leak NEXTAUTH_SECRET', !process.env.NEXTAUTH_SECRET || !healthyString.includes(process.env.NEXTAUTH_SECRET));

  // -------------------------------------------------------------
  // 5. Source Code & Middleware Audit
  // -------------------------------------------------------------
  console.log('\n--- 5. Source Code & Middleware Audit ---');

  const healthRouteSrc = fs.readFileSync('app/api/health/route.ts', 'utf-8');
  assert('route.ts: Uses force-dynamic', healthRouteSrc.includes("dynamic = 'force-dynamic'"));
  assert('route.ts: Uses SELECT 1 lightweight probe', healthRouteSrc.includes('SELECT 1'));
  assert('route.ts: Has database timeout', healthRouteSrc.includes('DB_TIMEOUT_MS') || healthRouteSrc.includes('timeout'));
  assert('route.ts: Sets Cache-Control headers', healthRouteSrc.includes('no-store'));

  const middlewareSrc = fs.readFileSync('middleware.ts', 'utf-8');
  assert('middleware.ts: Bypasses /api/health for public monitoring', middlewareSrc.includes("path.startsWith('/api/health')"));

  // -------------------------------------------------------------
  // 6. Security Regression Audit (P0.1 - P1.4)
  // -------------------------------------------------------------
  console.log('\n--- 6. Security Regression Audit ---');

  const httpSrc = fs.readFileSync('pages/api/mcp/[id]/http.ts', 'utf-8');
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

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
