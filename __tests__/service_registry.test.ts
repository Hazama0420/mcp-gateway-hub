// __tests__/service_registry.test.ts
//
// =========================================================================
// Service Registry & Adapter Expansion Test Suite
// MCP Gateway Hub (Hazama0420/mcp-gateway-hub)
// =========================================================================

const {
  BUILTIN_SERVICES,
  getBuiltinServices,
  getServiceById,
  formatUserIntegrationAsService,
} = require('../lib/adapters/registry');
const { validateUrlWithDns } = require('../lib/security/url');

let passed = 0;
let failed = 0;

function assert(scenario: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${scenario}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${scenario}${detail ? ' -> ' + detail : ''}`);
    failed++;
  }
}

async function runServiceRegistryTests() {
  console.log('========================================================================');
  console.log('       MCP GATEWAY HUB — SERVICE REGISTRY & ADAPTER TEST SUITE          ');
  console.log('========================================================================\n');

  // =========================================================================
  // 1. Built-in Service Registry Matrix
  // =========================================================================
  console.log('--- 1. Built-in Service Registry Matrix ---');

  const services = getBuiltinServices();
  assert('Registry: Exactly 4 verified built-in services exposed', services.length === 4);

  const github = getServiceById('github');
  assert('GitHub: Service found by ID', Boolean(github));
  assert('GitHub: Exactly 7 tools registered', github?.toolsCount === 7 && github?.tools.length === 7);
  assert('GitHub: Contains list_repos and create_issue', github?.tools.some((t: any) => t.name === 'list_repos') && github?.tools.some((t: any) => t.name === 'create_issue'));
  assert('GitHub: Requires personal access token', github?.credentialFields.some((f: any) => f.key === 'token' && f.required));
  assert('GitHub: Marked as testable', github?.testable === true);

  const postgres = getServiceById('postgres');
  assert('PostgreSQL: Service found by ID', Boolean(postgres));
  assert('PostgreSQL: Exactly 3 tools registered', postgres?.toolsCount === 3 && postgres?.tools.length === 3);
  assert('PostgreSQL: Contains run_sql, list_tables, describe_table', postgres?.tools.some((t: any) => t.name === 'run_sql') && postgres?.tools.some((t: any) => t.name === 'list_tables') && postgres?.tools.some((t: any) => t.name === 'describe_table'));
  assert('PostgreSQL: Supports read-only isolation', postgres?.supportsReadOnly === true);

  const supabase = getServiceById('supabase');
  assert('Supabase: Service found by ID', Boolean(supabase));
  assert('Supabase: Exactly 3 tools registered', supabase?.toolsCount === 3);
  assert('Supabase: Requires connection string', supabase?.credentialFields.some((f: any) => f.key === 'connectionString'));

  const vercel = getServiceById('vercel');
  assert('Vercel: Service found by ID', Boolean(vercel));
  assert('Vercel: Exactly 4 tools registered', vercel?.toolsCount === 4 && vercel?.tools.length === 4);
  assert('Vercel: Contains list_projects and list_deployments', vercel?.tools.some((t: any) => t.name === 'list_projects') && vercel?.tools.some((t: any) => t.name === 'list_deployments'));
  assert('Vercel: Requires API token with optional teamId', vercel?.credentialFields.some((f: any) => f.key === 'token' && f.required) && vercel?.credentialFields.some((f: any) => f.key === 'teamId' && !f.required));

  // =========================================================================
  // 2. Custom User Integrations Transformation
  // =========================================================================
  console.log('\n--- 2. Custom User Integration Transformation ---');

  const mockCustomIntegration = {
    id: 'intg-custom-uuid-123',
    name: 'Stripe Payments API',
    description: 'Custom integration for Stripe charge inspection',
    base_url: 'https://api.stripe.com',
    tools: [
      { name: 'list_charges', description: 'List customer charges', method: 'GET', path: '/v1/charges', permission: 'read' },
      { name: 'get_balance', description: 'Get account balance', method: 'GET', path: '/v1/balance', permission: 'read' },
    ],
  };

  const formatted = formatUserIntegrationAsService(mockCustomIntegration);
  assert('Custom Integration: Formatted as ServiceDefinition', formatted.id === 'custom_intg-custom-uuid-123');
  assert('Custom Integration: Category is Custom', formatted.category === 'Custom');
  assert('Custom Integration: Tool count matches', formatted.toolsCount === 2);
  assert('Custom Integration: IsCustom flag set', formatted.isCustom === true);

  // =========================================================================
  // 3. SSRF & URL Validation for Service Testing
  // =========================================================================
  console.log('\n--- 3. SSRF & Connection Testing Protections ---');

  const loopbackDns = await validateUrlWithDns('http://127.0.0.1:5432');
  assert('SSRF Protection: Rejects loopback database host', !loopbackDns.safe);

  const localHostDns = await validateUrlWithDns('http://localhost:5432');
  assert('SSRF Protection: Rejects localhost database host', !localHostDns.safe);

  const privateIpDns = await validateUrlWithDns('http://192.168.1.100:5432');
  assert('SSRF Protection: Rejects RFC 1918 private IP', !privateIpDns.safe);

  const cloudHostDns = await validateUrlWithDns('https://api.github.com');
  assert('SSRF Protection: Allows public API domain', cloudHostDns.safe);

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  console.log(`  SERVICE REGISTRY SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runServiceRegistryTests().catch((err) => {
  console.error('Fatal Service Registry Test Error:', err);
  process.exit(1);
});
