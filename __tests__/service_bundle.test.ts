// __tests__/service_bundle.test.ts
//
// =========================================================================
// Multi-Service Connection Bundle & Dynamic Tool Registry Test Suite
// MCP Gateway Hub (Hazama0420/mcp-gateway-hub)
// =========================================================================

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { encrypt, decrypt } = require('../lib/crypto');
const { BUILTIN_SERVICES, getBuiltinServices, calculateEndpointToolCount } = require('../lib/adapters/registry');
const { registerTools: registerGithub } = require('../lib/adapters/github');
const { registerTools: registerPostgres } = require('../lib/adapters/postgres');
const { registerTools: registerVercel } = require('../lib/adapters/vercel');
const { signMcpAccessToken, verifyMcpAccessToken } = require('../lib/oauth/jwt');
const { checkRateLimit, LIMITS } = require('../lib/security/ratelimit');

function createTestMcpServer(endpoint: any) {
  const server = new McpServer({
    name: 'MCP Gateway Hub',
    version: '1.0.0',
  });

  if (Array.isArray(endpoint.services)) {
    for (const service of endpoint.services) {
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
        console.error('Error registering service in test server:', service.service_type, error);
      }
    }
  }

  return server;
}

async function executeTestTool(endpoint: any, toolName: string, args: Record<string, any>) {
  if (!endpoint.is_active) {
    return {
      success: false,
      status: 400,
      statusText: 'ENDPOINT_INACTIVE',
      error: 'This MCP Endpoint is currently paused/inactive.',
    };
  }

  const server = createTestMcpServer(endpoint);
  const rawTools: Record<string, any> = (server as any)._registeredTools || {};
  const targetTool = rawTools[toolName];

  if (!targetTool) {
    return {
      success: false,
      status: 404,
      statusText: 'NOT_FOUND',
      error: `Tool "${toolName}" is not registered on this endpoint.`,
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

async function runServiceBundleTests() {
  console.log('========================================================================');
  console.log('  MCP GATEWAY HUB — MULTI-SERVICE MCP BUNDLE TEST SUITE');
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
  function buildMockEndpoint(id: string, name: string, userId: string, serviceTypes: Array<{ type: string; config: Record<string, string> }>) {
    const services = serviceTypes.map(s => {
      const { encryptedData, iv, tag } = encrypt(JSON.stringify(s.config));
      return {
        id: `svc_${s.type}_${Math.random().toString(36).substring(7)}`,
        endpoint_id: id,
        service_type: s.type,
        encrypted_config: encryptedData,
        iv,
        tag,
      };
    });

    return {
      id,
      name,
      user_id: userId,
      is_active: true,
      services,
    };
  }

  // 1. Dynamic Tool Count Calculation
  console.log('--- 1. Dynamic Tool Count Calculation ---');
  const countVercel = calculateEndpointToolCount([{ service_type: 'vercel' }]);
  const countGithub = calculateEndpointToolCount([{ service_type: 'github' }]);
  const countPostgres = calculateEndpointToolCount([{ service_type: 'postgres' }]);
  const countDevOps = calculateEndpointToolCount([{ service_type: 'vercel' }, { service_type: 'github' }]);
  const countFullStack = calculateEndpointToolCount([{ service_type: 'vercel' }, { service_type: 'github' }, { service_type: 'postgres' }]);

  assert('Test 1a: Vercel tool count matches registry (4)', countVercel === 4);
  assert('Test 1b: GitHub tool count matches registry (7)', countGithub === 7);
  assert('Test 1c: Postgres tool count matches registry (3)', countPostgres === 3);
  assert('Test 1d: DevOps bundle (Vercel+GitHub) count = 11', countDevOps === 11);
  assert('Test 1e: Full Stack bundle count = 14', countFullStack === 14);

  // 2. Single-Service Connection (Vercel only)
  console.log('\n--- 2. Single-Service Connection (Vercel Only) ---');
  const epVercel = buildMockEndpoint('ep_vercel_only', 'Vercel Node', 'user_1', [
    { type: 'vercel', config: { token: 'mock_v_token', teamId: '' } },
  ]);

  const serverV = createTestMcpServer(epVercel);
  const toolNamesV = Object.keys((serverV as any)._registeredTools || {});

  assert('Test 2a: Vercel connection registers runtime tools', toolNamesV.length >= 4);
  assert('Test 2b: list_projects is present in Vercel bundle', toolNamesV.includes('list_projects'));
  assert('Test 2c: get_deployments is present in Vercel bundle', toolNamesV.includes('get_deployments'));
  assert('Test 2d: GitHub list_repos is NOT present in Vercel bundle', !toolNamesV.includes('list_repos'));
  assert('Test 2e: Postgres run_sql is NOT present in Vercel bundle', !toolNamesV.includes('run_sql_query'));

  // 3. Multi-Service Connection (DevOps: Vercel + GitHub)
  console.log('\n--- 3. Multi-Service Connection (DevOps Bundle) ---');
  const epDevOps = buildMockEndpoint('ep_devops_bundle', 'DevOps Hub', 'user_1', [
    { type: 'vercel', config: { token: 'mock_v_token', teamId: '' } },
    { type: 'github', config: { token: 'mock_gh_token' } },
  ]);

  const serverDO = createTestMcpServer(epDevOps);
  const toolNamesDO = Object.keys((serverDO as any)._registeredTools || {});

  assert('Test 3a: DevOps connection registers both Vercel & GitHub tools', toolNamesDO.length >= 10);
  assert('Test 3b: Vercel list_projects is present', toolNamesDO.includes('list_projects'));
  assert('Test 3c: GitHub list_repos is present', toolNamesDO.includes('list_repos'));
  assert('Test 3d: GitHub create_issue is present', toolNamesDO.includes('create_issue'));
  assert('Test 3e: Postgres run_sql_query is NOT present in DevOps bundle', !toolNamesDO.includes('run_sql_query'));

  // 4. Database Connection (Postgres / Neon only)
  console.log('\n--- 4. Database Connection (Neon Only) ---');
  const epNeon = buildMockEndpoint('ep_neon_only', 'Database Hub', 'user_1', [
    { type: 'postgres', config: { connectionString: 'postgresql://mock:mock@localhost:5432/db' } },
  ]);

  const serverN = createTestMcpServer(epNeon);
  const toolNamesN = Object.keys((serverN as any)._registeredTools || {});

  assert('Test 4a: Neon connection registers exactly 3 tools', toolNamesN.length === 3);
  assert('Test 4b: Postgres run_sql_query is present', toolNamesN.includes('run_sql_query'));
  assert('Test 4c: Postgres list_tables is present', toolNamesN.includes('list_tables'));
  assert('Test 4d: Vercel list_projects is NOT present', !toolNamesN.includes('list_projects'));
  assert('Test 4e: GitHub list_repos is NOT present', !toolNamesN.includes('list_repos'));

  // 5. Full Stack Connection (Vercel + GitHub + Neon)
  console.log('\n--- 5. Full Stack Connection (All 3 Services) ---');
  const epFull = buildMockEndpoint('ep_full_stack', 'Full Stack Hub', 'user_1', [
    { type: 'vercel', config: { token: 'mock_v_token', teamId: '' } },
    { type: 'github', config: { token: 'mock_gh_token' } },
    { type: 'postgres', config: { connectionString: 'postgresql://mock:mock@localhost:5432/db' } },
  ]);

  const serverF = createTestMcpServer(epFull);
  const toolNamesF = Object.keys((serverF as any)._registeredTools || {});

  assert('Test 5a: Full Stack connection registers all 3 service toolsets', toolNamesF.length >= 13);
  assert('Test 5b: Vercel tools present in Full Stack', toolNamesF.includes('list_projects') && toolNamesF.includes('get_deployments'));
  assert('Test 5c: GitHub tools present in Full Stack', toolNamesF.includes('list_repos') && toolNamesF.includes('create_or_update_file'));
  assert('Test 5d: Postgres tools present in Full Stack', toolNamesF.includes('run_sql_query') && toolNamesF.includes('describe_table'));

  // 6. Direct Disabled-Tool Execution Rejection
  console.log('\n--- 6. Direct Disabled-Tool Execution Rejection ---');
  const execMissingTool = await executeTestTool(epDevOps, 'run_sql_query', { sql: 'SELECT 1' });
  assert('Test 6a: Calling unattached tool (run_sql_query on DevOps) returns 404 NOT_FOUND', execMissingTool.status === 404);
  assert('Test 6b: Error message clearly states tool is not registered on this endpoint', execMissingTool.error?.includes('not registered') === true);

  // Inactive endpoint execution
  const epInactive = { ...epDevOps, is_active: false };
  const execInactive = await executeTestTool(epInactive, 'list_projects', {});
  assert('Test 6c: Inactive connection blocks tool execution with 400', execInactive.status === 400);

  // 7. JWT Connection & Tenant Isolation
  console.log('\n--- 7. JWT Connection & Tenant Isolation ---');
  const tokenDevOps = signMcpAccessToken({
    userId: 'user_1',
    endpointId: 'ep_devops_bundle',
    clientId: 'client_gemini_main',
    reqOrigin: 'https://mcp-gateway-hub-beta.vercel.app',
  });

  const tokenNeon = signMcpAccessToken({
    userId: 'user_1',
    endpointId: 'ep_neon_only',
    clientId: 'client_gemini_main',
    reqOrigin: 'https://mcp-gateway-hub-beta.vercel.app',
  });

  // Verify token on own connection
  const v1 = verifyMcpAccessToken(tokenDevOps.token, 'ep_devops_bundle', 'https://mcp-gateway-hub-beta.vercel.app');
  assert('Test 7a: DevOps token verifies on DevOps connection', v1.valid === true);

  // Cross-connection attempt
  const vCross = verifyMcpAccessToken(tokenDevOps.token, 'ep_neon_only', 'https://mcp-gateway-hub-beta.vercel.app');
  assert('Test 7b: DevOps token is strictly REJECTED on Neon connection', vCross.valid === false);
  assert('Test 7c: Error reason indicates token not issued for this endpoint', vCross.valid === false && vCross.error === 'Token not issued for this endpoint');

  // Cross-user token attempt
  const tokenUser2 = signMcpAccessToken({
    userId: 'user_attacker_2',
    endpointId: 'ep_devops_bundle',
    clientId: 'client_attacker',
    reqOrigin: 'https://mcp-gateway-hub-beta.vercel.app',
  });
  assert('Test 7d: User identity bound inside JWT payload sub', tokenUser2.payload.sub === 'user_attacker_2');

  // 8. Credential AES-256-GCM Isolation
  console.log('\n--- 8. Credential AES-256-GCM Isolation ---');
  const svcVercel = epFull.services.find((s: any) => s.service_type === 'vercel')!;
  const svcGithub = epFull.services.find((s: any) => s.service_type === 'github')!;
  const svcPostgres = epFull.services.find((s: any) => s.service_type === 'postgres')!;

  assert('Test 8a: Vercel credentials encrypted with unique IV', svcVercel.iv !== svcGithub.iv);
  assert('Test 8b: GitHub credentials encrypted with unique IV', svcGithub.iv !== svcPostgres.iv);

  const decV = JSON.parse(decrypt(svcVercel.encrypted_config, svcVercel.iv, svcVercel.tag));
  const decG = JSON.parse(decrypt(svcGithub.encrypted_config, svcGithub.iv, svcGithub.tag));
  const decP = JSON.parse(decrypt(svcPostgres.encrypted_config, svcPostgres.iv, svcPostgres.tag));

  assert('Test 8c: Vercel token decrypts accurately', decV.token === 'mock_v_token');
  assert('Test 8d: GitHub token decrypts accurately', decG.token === 'mock_gh_token');
  assert('Test 8e: Postgres connectionString decrypts accurately', decP.connectionString.includes('postgresql://'));

  // 9. Serverless Multi-Service Rehydration
  console.log('\n--- 9. Serverless Multi-Service Rehydration ---');
  const server = createTestMcpServer(epFull);
  const registeredTools = (server as any)._registeredTools || {};
  const toolCount = Object.keys(registeredTools).length;
  assert('Test 9: Serverless cold container instantiates full bundle with >= 13 tools', toolCount >= 13);

  // 10. Rate Limit Preservation
  console.log('\n--- 10. Rate Limit Preservation ---');
  const rlResult = await checkRateLimit('mcp_req:ep_devops_bundle', LIMITS.MCP_REQUEST);
  assert('Test 10: Authenticated bundle request passes rate limit quota check', rlResult.success === true);

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  console.log(`  MULTI-SERVICE BUNDLE SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runServiceBundleTests().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
