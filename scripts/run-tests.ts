// scripts/run-tests.ts
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface SuiteResult {
  file: string;
  passed: number;
  failed: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

async function main() {
  console.log('========================================================================');
  console.log('            MCP GATEWAY HUB — OFFICIAL SECURITY TEST RUNNER            ');
  console.log('========================================================================\n');

  const testsDir = path.resolve(process.cwd(), '__tests__');
  if (!fs.existsSync(testsDir)) {
    console.error(`Error: Tests directory not found at ${testsDir}`);
    process.exit(1);
  }

  // Get all .test.ts files in __tests__/
  const testFiles = fs
    .readdirSync(testsDir)
    .filter((f) => f.endsWith('.test.ts'))
    .sort();

  console.log(`Found ${testFiles.length} test suite(s):\n`);

  const results: SuiteResult[] = [];
  let totalAssertionsPassed = 0;
  let totalAssertionsFailed = 0;
  const overallStart = Date.now();

  for (const file of testFiles) {
    const filePath = path.join('__tests__', file);
    const start = Date.now();
    let suiteSuccess = false;
    let passedCount = 0;
    let failedCount = 0;
    let errorOutput = '';

    try {
      // Execute test file deterministically with ts-node
      const output = execSync(`ts-node -T ${filePath}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          ENCRYPTION_MASTER_KEY: process.env.ENCRYPTION_MASTER_KEY || 'TEST_MOCK_MASTER_KEY_32_BYTES_01',
        },
      });

      // Parse assertion counts from actual test output
      const summaryMatch = output.match(/(\d+)\s+passed,\s+(\d+)\s+failed/i);
      if (summaryMatch) {
        passedCount = parseInt(summaryMatch[1], 10);
        failedCount = parseInt(summaryMatch[2], 10);
      } else {
        const passMatches = output.match(/\[PASS\]/g);
        const failMatches = output.match(/\[FAIL\]/g);
        passedCount = passMatches ? passMatches.length : 0;
        failedCount = failMatches ? failMatches.length : 0;
      }

      suiteSuccess = failedCount === 0;
      if (!suiteSuccess) {
        errorOutput = output;
      }
    } catch (err: any) {
      suiteSuccess = false;
      const stdout = err.stdout?.toString() || '';
      const stderr = err.stderr?.toString() || err.message || '';
      errorOutput = stdout + '\n' + stderr;

      const summaryMatch = errorOutput.match(/(\d+)\s+passed,\s+(\d+)\s+failed/i);
      if (summaryMatch) {
        passedCount = parseInt(summaryMatch[1], 10);
        failedCount = parseInt(summaryMatch[2], 10);
      } else {
        const passMatches = stdout.match(/\[PASS\]/g);
        const failMatches = stdout.match(/\[FAIL\]/g);
        passedCount = passMatches ? passMatches.length : 0;
        failedCount = failMatches ? failMatches.length : 1;
      }
    }

    const durationMs = Date.now() - start;
    results.push({
      file,
      passed: passedCount,
      failed: failedCount,
      durationMs,
      success: suiteSuccess,
      error: errorOutput,
    });

    totalAssertionsPassed += passedCount;
    totalAssertionsFailed += failedCount;

    const statusBadge = suiteSuccess ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
    console.log(`  ${statusBadge} ${file.padEnd(35)} (${passedCount} passed, ${failedCount} failed, ${durationMs}ms)`);
  }

  const overallDuration = Date.now() - overallStart;

  console.log('\n========================================================================');
  console.log('                          TEST SUMMARY REPORT                           ');
  console.log('========================================================================');
  console.log(`  Total Test Suites   : ${results.length}`);
  console.log(`  Suites Passed       : ${results.filter((r) => r.success).length}`);
  console.log(`  Suites Failed       : ${results.filter((r) => !r.success).length}`);
  console.log(`  Total Assertions    : ${totalAssertionsPassed + totalAssertionsFailed}`);
  console.log(`  Assertions Passed   : \x1b[32m${totalAssertionsPassed}\x1b[0m`);
  console.log(`  Assertions Failed   : ${totalAssertionsFailed > 0 ? `\x1b[31m${totalAssertionsFailed}\x1b[0m` : '0'}`);
  console.log(`  Total Execution Time: ${(overallDuration / 1000).toFixed(2)}s`);
  console.log('========================================================================\n');

  if (totalAssertionsFailed > 0 || results.some((r) => !r.success)) {
    console.error('Failed test details:');
    for (const r of results.filter((r) => !r.success)) {
      console.error(`\n--- FAIL: ${r.file} ---`);
      console.error(r.error);
    }
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal Test Runner Exception:', err);
  process.exit(1);
});
