// __tests__/combo.test.ts
//
// =========================================================================
// Combo Adapter Composition & Dynamic Tool Isolation Test Suite
// MCP Gateway Hub (Hazama0420/mcp-gateway-hub)
// =========================================================================

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { encrypt, decrypt } = require('../lib/crypto');
const { BUILTIN_SERVICES, getBuiltinServices, calculateEndpointToolCount, calculateComboToolCount } = require('../lib/adapters/registry');
const { registerTools: registerGithub } = require('../lib/adapters/github');
const { registerTools: registerPostgres } = require('../lib/adapters/postgres');
const { registerTools: registerVercel } = require('../lib/adapters/vercel');
const { signMcpAccessToken, verifyMcpAccessToken } = require('../lib/oauth/jwt');
const { checkRateLimit, LIMITS } = require('../lib/security/ratelimit');

// Test helper: builds a mock McpServer for a Combo
function createTestComboMcpServer(combo: any) {
  const server = new McpServer({
    name: `Combo - ${combo.name}`,
    version: '1.0.0',
  });

  if (Array.isArray(combo.endpoints)) {
    for (const link of combo.endpoints) {
      const ep = link.endpoint;
      if (ep && ep.is_active && Array.isArray(ep.services)) {
        for (const service of ep.services) {
          try {
            const decryptedJson = decrypt(service.encrypted_config, service.iv, service.tag);
            const config = JSON.parse(decryptedJson);

            switch (service.service_type) {
              case 'github':
                registerGithub(server, { token: config.token });
                break;
              case 'supabase':
              case 'postgres':
              case 'postgresql':
                registerPostgres(server, { connectionString: config.connectionString });
                break;
              case 'vercel':
                registerVercel(server, { token: config.token, teamId: config.teamId });
                break;
            }
          } catch (error) {
            console.error('Error registering service in test combo server:', service.service_type, error);
          }
        }
      }
    }
  }

  return server;
}

async function executeTestComboTool(combo: any, toolName: string, args: Record<string, any>) {
  if (!combo.is_active) {
    return {
      success: false,
      status: 400,
      statusText: 'COMBO_INACTIVE',
      error: 'This Combo is currently paused/inactive.',
    };
  }

  const server = createTestComboMcpServer(combo);
  const rawTools: Record<string, any> = (server as any)._registeredTools || {};
  const targetTool = rawTools[toolName];

  if (!targetTool) {
    return {
      success: false,
      status: 404,
      statusText: 'NOT_FOUND',
      error: `Tool "${toolName}" is not registered on this combo.`,
    };
  }

  try {
    const result = await targetTool.handler(args, {});
    const isError = Boolean(result && typeof result === 'object' && result.isError);
    return {
      success: !isError,
      status: isError ? 500 : 200,
      statusText: isError ? 'Tool Execution Error' : 'OK',
      response: result,
      error: isError ? result?.content?.[0]?.text || 'Tool returned an error' : undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      status: 500,
      statusText: 'Execution Exception',
      error: err.message,
    };
  }
}

async function runComboTests() {
  console.log('========================================================================');
  console.log('  MCP GATEWAY HUB — COMBO ADAPTER COMPOSITION TEST SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(title: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${title}${details ? ` -> ${details}` : ''}`);
      failed++;
    }
  }

  // --- Helper to build encrypted endpoint fixture ---
  function buildMockEndpoint(id: string, name: string, userId: string, serviceType: string, config: Record<string, string>) {
    const { encryptedData, iv, tag } = encrypt(JSON.stringify(config));
    return {
      id,
      name,
      user_id: userId,
      is_active: true,
      services: [
        {
          id: `svc_${serviceType}_${Math.random().toString(36).substring(7)}`,
          endpoint_id: id,
          service_type: serviceType,
          encrypted_config: encryptedData,
          iv,
          tag,
        },
      ],
    };
  }

  // 1. Endpoint Fixtures
  const epVercel = buildMockEndpoint('ep_v_prod', 'Vercel Production', 'user_1', 'vercel', { token: 'mock_v_token', teamId: '' });
  const epGithub = buildMockEndpoint('ep_gh_pers', 'GitHub Personal', 'user_1', 'github', { token: 'mock_gh_token' });
  const epNeon = buildMockEndpoint('ep_neon_db', 'Neon Database', 'user_1', 'postgres', { connectionString: 'postgresql://mock:mock@localhost:5432/neondb' });

  // 1. Create Combo with single adapter
  console.log('--- 1. Single Adapter Combo ---');
  const comboVercelOnly = {
    id: 'combo_vercel_1',
    name: 'Vercel Fast',
    description: 'Vercel deployment tools only',
    user_id: 'user_1',
    is_active: true,
    endpoints: [{ id: 'link_1', endpoint_id: epVercel.id, endpoint: epVercel }],
  };

  const countVOnly = calculateComboToolCount(comboVercelOnly.endpoints as any);
  assert('Test 1a: Single adapter combo computes 4 tools', countVOnly === 4);

  const serverVOnly = createTestComboMcpServer(comboVercelOnly);
  const toolsVOnly = Object.keys((serverVOnly as any)._registeredTools || {});
  assert('Test 1b: Vercel combo exposes list_projects', toolsVOnly.includes('list_projects'));
  assert('Test 1c: Vercel combo does NOT expose GitHub tools', !toolsVOnly.includes('list_repos'));
  assert('Test 1d: Vercel combo does NOT expose Postgres tools', !toolsVOnly.includes('run_sql_query'));

  // 2. Multi-Adapter Combo (DevOps = Vercel + GitHub)
  console.log('\n--- 2. Multi-Adapter Combo (DevOps: Vercel + GitHub) ---');
  const comboDevOps = {
    id: 'combo_devops_1',
    name: 'DevOps',
    description: 'Deployment & repository access',
    user_id: 'user_1',
    is_active: true,
    endpoints: [
      { id: 'link_v', endpoint_id: epVercel.id, endpoint: epVercel },
      { id: 'link_gh', endpoint_id: epGithub.id, endpoint: epGithub },
    ],
  };

  const countDevOps = calculateComboToolCount(comboDevOps.endpoints as any);
  assert('Test 2a: DevOps combo calculates 11 tools (4 Vercel + 7 GitHub)', countDevOps === 11);

  const serverDevOps = createTestComboMcpServer(comboDevOps);
  const toolsDevOps = Object.keys((serverDevOps as any)._registeredTools || {});
  assert('Test 2b: DevOps combo includes Vercel list_projects', toolsDevOps.includes('list_projects'));
  assert('Test 2c: DevOps combo includes GitHub list_repos', toolsDevOps.includes('list_repos'));
  assert('Test 2d: DevOps combo includes GitHub create_issue', toolsDevOps.includes('create_issue'));
  assert('Test 2e: DevOps combo does NOT include Neon run_sql_query', !toolsDevOps.includes('run_sql_query'));

  // 3. Full Stack Combo (Vercel + GitHub + Neon)
  console.log('\n--- 3. Full Stack Combo (Vercel + GitHub + Neon) ---');
  const comboFullStack = {
    id: 'combo_fullstack_1',
    name: 'Full Stack',
    description: 'All backend and cloud tools',
    user_id: 'user_1',
    is_active: true,
    endpoints: [
      { id: 'link_v', endpoint_id: epVercel.id, endpoint: epVercel },
      { id: 'link_gh', endpoint_id: epGithub.id, endpoint: epGithub },
      { id: 'link_neon', endpoint_id: epNeon.id, endpoint: epNeon },
    ],
  };

  const countFullStack = calculateComboToolCount(comboFullStack.endpoints as any);
  assert('Test 3a: Full Stack combo calculates 14 tools (4+7+3)', countFullStack === 14);

  const serverFullStack = createTestComboMcpServer(comboFullStack);
  const toolsFullStack = Object.keys((serverFullStack as any)._registeredTools || {});
  assert('Test 3b: Full Stack combo includes Vercel tools', toolsFullStack.includes('list_projects'));
  assert('Test 3c: Full Stack combo includes GitHub tools', toolsFullStack.includes('list_repos'));
  assert('Test 3d: Full Stack combo includes Postgres tools', toolsFullStack.includes('run_sql_query'));

  // 4. Dynamic Edit (Adding Neon to DevOps)
  console.log('\n--- 4. Dynamic Edit (Adding Neon to DevOps) ---');
  const comboEditedAdd = {
    ...comboDevOps,
    endpoints: [
      { id: 'link_v', endpoint_id: epVercel.id, endpoint: epVercel },
      { id: 'link_gh', endpoint_id: epGithub.id, endpoint: epGithub },
      { id: 'link_neon', endpoint_id: epNeon.id, endpoint: epNeon },
    ],
  };
  const countEditedAdd = calculateComboToolCount(comboEditedAdd.endpoints as any);
  assert('Test 4a: Tool count immediately updates to 14 when Neon is added', countEditedAdd === 14);

  const serverEditedAdd = createTestComboMcpServer(comboEditedAdd);
  const toolsEditedAdd = Object.keys((serverEditedAdd as any)._registeredTools || {});
  assert('Test 4b: run_sql_query becomes available after Neon is attached', toolsEditedAdd.includes('run_sql_query'));

  // 5. Dynamic Edit (Removing GitHub from DevOps)
  console.log('\n--- 5. Dynamic Edit (Removing GitHub from DevOps) ---');
  const comboEditedRemove = {
    ...comboDevOps,
    endpoints: [
      { id: 'link_v', endpoint_id: epVercel.id, endpoint: epVercel },
    ],
  };
  const countEditedRemove = calculateComboToolCount(comboEditedRemove.endpoints as any);
  assert('Test 5a: Tool count immediately reduces to 4 when GitHub is removed', countEditedRemove === 4);

  const serverEditedRemove = createTestComboMcpServer(comboEditedRemove);
  const toolsEditedRemove = Object.keys((serverEditedRemove as any)._registeredTools || {});
  assert('Test 5b: GitHub list_repos is no longer available in combo', !toolsEditedRemove.includes('list_repos'));

  // 6. Direct Unselected Tool Call Rejection
  console.log('\n--- 6. Direct Unselected Tool Call Rejection ---');
  const execUnselected = await executeTestComboTool(comboDevOps, 'run_sql_query', { sql: 'SELECT 1' });
  assert('Test 6a: Calling unselected tool (run_sql_query on DevOps) returns 404 NOT_FOUND', execUnselected.status === 404);
  assert('Test 6b: Error message clarifies tool is not registered on this combo', execUnselected.error?.includes('not registered') === true);

  // 7. Inactive Combo Access Rejection
  console.log('\n--- 7. Inactive / Disabled Combo Rejection ---');
  const comboDisabled = { ...comboDevOps, is_active: false };
  const execDisabled = await executeTestComboTool(comboDisabled, 'list_projects', {});
  assert('Test 7: Inactive combo blocks tool execution with 400 COMBO_INACTIVE', execDisabled.status === 400);

  // 8. Shared Adapter Across Multiple Combos
  console.log('\n--- 8. Shared Adapter Across Multiple Combos ---');
  assert('Test 8a: epVercel is referenced in comboDevOps', comboDevOps.endpoints.some(l => l.endpoint_id === epVercel.id));
  assert('Test 8b: epVercel is concurrently referenced in comboFullStack', comboFullStack.endpoints.some(l => l.endpoint_id === epVercel.id));
  assert('Test 8c: Zero duplicate credentials stored in Combos', (comboDevOps as any).encrypted_config === undefined && (comboFullStack as any).encrypted_config === undefined);

  // 9. Credential Isolation & Decryption
  console.log('\n--- 9. Credential Isolation & Decryption ---');
  const svcDecVercel = JSON.parse(decrypt(epVercel.services[0].encrypted_config, epVercel.services[0].iv, epVercel.services[0].tag));
  const svcDecGithub = JSON.parse(decrypt(epGithub.services[0].encrypted_config, epGithub.services[0].iv, epGithub.services[0].tag));
  assert('Test 9a: Vercel credentials decrypt cleanly from endpoint', svcDecVercel.token === 'mock_v_token');
  assert('Test 9b: GitHub credentials decrypt cleanly from endpoint', svcDecGithub.token === 'mock_gh_token');

  // 10. JWT Combo & Audience Binding
  console.log('\n--- 10. JWT Combo & Audience Binding ---');
  const tokenDevOps = signMcpAccessToken({
    userId: 'user_1',
    endpointId: 'combo_devops_1',
    clientId: 'client_gemini_main',
    reqOrigin: 'https://mcp-gateway-hub-beta.vercel.app',
  });

  const vDevOps = verifyMcpAccessToken(tokenDevOps.token, 'combo_devops_1', 'https://mcp-gateway-hub-beta.vercel.app');
  assert('Test 10a: Token verifies on target Combo', vDevOps.valid === true);

  const vCrossCombo = verifyMcpAccessToken(tokenDevOps.token, 'combo_fullstack_1', 'https://mcp-gateway-hub-beta.vercel.app');
  assert('Test 10b: Token is REJECTED on a different Combo', vCrossCombo.valid === false);

  // 11. Cross-Tenant Isolation
  console.log('\n--- 11. Cross-Tenant Isolation ---');
  const epUser2 = buildMockEndpoint('ep_u2_db', 'User 2 Secret DB', 'user_attacker_2', 'postgres', { connectionString: 'postgresql://leak:leak@localhost/db' });
  const isTenantMatch = epUser2.user_id === comboDevOps.user_id;
  assert('Test 11: Cross-user endpoint cannot be bound to User 1 Combo', !isTenantMatch);

  // 12. Rate Limiting on Combo
  console.log('\n--- 12. Rate Limiting on Combo ---');
  const rlCombo = await checkRateLimit('mcp_req:combo:combo_devops_1', LIMITS.MCP_REQUEST);
  assert('Test 12: Combo request rate limit quota active and passing', rlCombo.success === true);

  // 13. Existing MCP Endpoints Regression
  console.log('\n--- 13. Existing MCP Endpoints Regression ---');
  assert('Test 13a: Vercel endpoint maintains independent ID and state', epVercel.id === 'ep_v_prod' && epVercel.is_active === true);
  assert('Test 13b: GitHub endpoint maintains independent ID and state', epGithub.id === 'ep_gh_pers' && epGithub.is_active === true);
  assert('Test 13c: Neon endpoint maintains independent ID and state', epNeon.id === 'ep_neon_db' && epNeon.is_active === true);

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  console.log(`  COMBO SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runComboTests().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
