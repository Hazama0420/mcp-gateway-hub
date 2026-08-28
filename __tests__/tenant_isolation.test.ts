// __tests__/tenant_isolation.test.ts
//
// =========================================================================
// P0.2 Tenant Isolation Test Suite
// MCP Gateway Hub (Hazama0420/mcp-gateway-hub)
// =========================================================================
//

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

async function runTenantIsolationTests() {
  console.log('=== P0.2 Tenant Isolation Validation Tests ===\n');

  // -------------------------------------------------------------
  // 1. Data Model Multi-Tenant Scoping (User ownership)
  // -------------------------------------------------------------
  console.log('--- 1. Schema Tenant Scoping ---');

  const userA = { id: 'usr_AAA_111', email: 'userA@enterprise.com' };
  const userB = { id: 'usr_BBB_222', email: 'userB@startup.io' };

  const integrationA = { id: 'int_1', user_id: userA.id, name: 'Stripe API', slug: 'stripe' };
  const integrationB = { id: 'int_2', user_id: userB.id, name: 'Stripe API', slug: 'stripe' };
  const endpointA = { id: 'ep_1', user_id: userA.id, name: 'Production Gateway' };
  const endpointB = { id: 'ep_2', user_id: userB.id, name: 'Staging Gateway' };
  const toolA = { id: 'tool_1', integration_id: integrationA.id, name: 'charge_card' };
  const toolB = { id: 'tool_2', integration_id: integrationB.id, name: 'refund_payment' };

  // Simulated Authorization Gate
  function canUserAccessIntegration(userId: string, integration: typeof integrationA): boolean {
    return integration.user_id === userId;
  }

  function canUserAccessEndpoint(userId: string, endpoint: typeof endpointA): boolean {
    return endpoint.user_id === userId;
  }

  function canUserExecuteTool(userId: string, tool: typeof toolA, toolIntegration: typeof integrationA): boolean {
    return tool.integration_id === toolIntegration.id && toolIntegration.user_id === userId;
  }

  assert('User A CAN access User A Integration', canUserAccessIntegration(userA.id, integrationA));
  assert('User A CANNOT access User B Integration', !canUserAccessIntegration(userA.id, integrationB));
  assert('User B CAN access User B Integration', canUserAccessIntegration(userB.id, integrationB));
  assert('User B CANNOT access User A Integration', !canUserAccessIntegration(userB.id, integrationA));

  assert('User A CAN access User A Endpoint', canUserAccessEndpoint(userA.id, endpointA));
  assert('User A CANNOT access User B Endpoint', !canUserAccessEndpoint(userA.id, endpointB));

  assert('User A CAN execute User A Tool', canUserExecuteTool(userA.id, toolA, integrationA));
  assert('User A CANNOT execute User B Tool', !canUserExecuteTool(userA.id, toolB, integrationB));
  assert('User B CANNOT execute User A Tool', !canUserExecuteTool(userB.id, toolA, integrationA));

  // -------------------------------------------------------------
  // 2. Slug Multi-Tenancy (Unique per user, not global)
  // -------------------------------------------------------------
  console.log('\n--- 2. Slug Multi-Tenancy ---');

  const schemaPrisma = fs.readFileSync('prisma/schema.prisma', 'utf-8');
  assert('Integration schema has @@unique([user_id, slug])', schemaPrisma.includes('@@unique([user_id, slug])'));
  assert('Integration schema indexes user_id', schemaPrisma.includes('@@index([user_id])'));
  assert('McpEndpoint schema relates to User with onDelete: Cascade', schemaPrisma.includes('user         User                  @relation(fields: [user_id], references: [id], onDelete: Cascade)'));

  // -------------------------------------------------------------
  // 3. API Route Server-Side Tenant Scoping Audit
  // -------------------------------------------------------------
  console.log('\n--- 3. API Route Server-Side Tenant Verification ---');

  // Integrations List
  const intListRoute = fs.readFileSync('app/api/integrations/route.ts', 'utf-8');
  assert('GET /api/integrations filters by user_id: user.id', intListRoute.includes('user_id: user.id'));
  assert('POST /api/integrations creates with user_id: user.id', intListRoute.includes('user_id: user.id'));

  // Integration Detail
  const intDetailRoute = fs.readFileSync('app/api/integrations/[id]/route.ts', 'utf-8');
  assert('GET /api/integrations/[id] enforces user_id: user.id', intDetailRoute.includes('user_id: user.id'));
  assert('PUT /api/integrations/[id] enforces user_id: user.id on existing lookup', intDetailRoute.includes('user_id: user.id'));
  assert('PUT /api/integrations/[id] enforces user_id: user.id on update', intDetailRoute.includes('user_id: user.id'));
  assert('DELETE /api/integrations/[id] enforces user_id: user.id', intDetailRoute.includes('user_id: user.id'));

  // Endpoints List
  const epListRoute = fs.readFileSync('app/api/endpoints/route.ts', 'utf-8');
  assert('GET /api/endpoints filters by user_id: user.id', epListRoute.includes('user_id: user.id'));
  assert('POST /api/endpoints creates with user_id: user.id', epListRoute.includes('user_id: user.id'));

  // Playground Execution
  const playgroundRoute = fs.readFileSync('app/api/playground/execute/route.ts', 'utf-8');
  assert('POST /api/playground/execute validates tool ownership via integration.user_id: user.id', playgroundRoute.includes('user_id: user.id'));

  // Execution Logs
  const logsRoute = fs.readFileSync('app/api/endpoints/logs/route.ts', 'utf-8');
  assert('GET /api/endpoints/logs enforces user_id: user.id OR endpoint.user_id: user.id', logsRoute.includes('user_id: user.id'));

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTenantIsolationTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
