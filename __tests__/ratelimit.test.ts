// __tests__/ratelimit.test.ts
const { checkRateLimit, applyRateLimitHeaders, LIMITS } = require('../lib/security/ratelimit');

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
  console.log('=== P1.2 Rate Limit Tests ===\n');

  // Test 1: Normal flow allows requests within limit
  const id1 = 'test_user_1';
  const limit1 = { limit: 3, windowMs: 10000 };

  const r1 = await checkRateLimit(id1, limit1);
  assert('First request allowed', r1.success === true && r1.remaining === 2);

  const r2 = await checkRateLimit(id1, limit1);
  assert('Second request allowed', r2.success === true && r2.remaining === 1);

  const r3 = await checkRateLimit(id1, limit1);
  assert('Third request allowed', r3.success === true && r3.remaining === 0);

  const r4 = await checkRateLimit(id1, limit1);
  assert('Fourth request blocked (429)', r4.success === false && r4.remaining === 0);

  // Test 2: User Isolation (User A does not block User B)
  const id2 = 'test_user_2';
  const r5 = await checkRateLimit(id2, limit1);
  assert('User B isolated from User A limits', r5.success === true && r5.remaining === 2);

  // Test 3: applyRateLimitHeaders App Router style (NextResponse mock)
  const mockNextResponse = {
    headers: {
      data: new Map<string, string>(),
      set(k: string, v: string) {
        this.data.set(k, v);
      },
      get(k: string) {
        return this.data.get(k);
      },
      has(k: string) {
        return this.data.has(k);
      }
    }
  };

  applyRateLimitHeaders(mockNextResponse as any, r4);
  assert('Headers limit mapped correctly', mockNextResponse.headers.get('X-RateLimit-Limit') === '3');
  assert('Headers remaining mapped correctly', mockNextResponse.headers.get('X-RateLimit-Remaining') === '0');
  assert('Headers Retry-After present for blocked request', mockNextResponse.headers.has('Retry-After'));

  // Test 4: Window Expiry
  const id3 = 'test_expiry';
  const limitQuick = { limit: 1, windowMs: 100 }; // 100ms window

  const r6 = await checkRateLimit(id3, limitQuick);
  assert('Expiry setup: first allowed', r6.success === true);

  const r7 = await checkRateLimit(id3, limitQuick);
  assert('Expiry setup: second blocked', r7.success === false);

  // Wait 150ms to exceed window
  await new Promise(resolve => setTimeout(resolve, 150));

  const r8 = await checkRateLimit(id3, limitQuick);
  assert('Request allowed after window reset', r8.success === true);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
