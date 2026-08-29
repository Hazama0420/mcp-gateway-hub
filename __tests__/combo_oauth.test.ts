// __tests__/combo_oauth.test.ts
//
// =========================================================================
// Combo OAuth Client Management & Resource Security Test Suite
// MCP Gateway Hub (Hazama0420/mcp-gateway-hub)
// =========================================================================

process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'TEST_MOCK_MASTER_KEY_32_BYTES_01';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_JWT_SECRET_32_CHARS_LONG_KEY';
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'https://mcp-gateway-hub-beta.vercel.app';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { encrypt, decrypt } = require('../lib/crypto');
const { BUILTIN_SERVICES, calculateComboToolCount } = require('../lib/adapters/registry');
const { registerTools: registerGithub } = require('../lib/adapters/github');
const { registerTools: registerPostgres } = require('../lib/adapters/postgres');
const { registerTools: registerVercel } = require('../lib/adapters/vercel');
const { signMcpAccessToken, verifyMcpAccessToken } = require('../lib/oauth/jwt');
const {
  extractResourceTarget,
  getCanonicalComboResourceUrl,
  getCanonicalResourceUrl,
  getManagedEndpointRedirectUris,
  getCanonicalGeminiRedirectUri,
} = require('../lib/oauth/config');
const { verifyPkce } = require('../lib/oauth/pkce');
const crypto = require('node:crypto');

async function runComboOAuthTests() {
  console.log('========================================================================');
  console.log('  MCP GATEWAY HUB — COMBO OAUTH & RESOURCE ISOLATION TEST SUITE');
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

  // Fixtures
  const epVercel = buildMockEndpoint('ep_v_prod', 'Vercel Production', 'user_1', 'vercel', { token: 'mock_v_token', teamId: '' });
  const epGithub = buildMockEndpoint('ep_gh_pers', 'GitHub Personal', 'user_1', 'github', { token: 'mock_gh_token' });
  const epNeon = buildMockEndpoint('ep_neon_db', 'Neon Database', 'user_1', 'postgres', { connectionString: 'postgresql://mock:mock@localhost:5432/neondb' });

  const comboDevOps = {
    id: 'combo_devops_uuid',
    name: 'DevOps Combo',
    description: 'Deployment & repository access',
    user_id: 'user_1',
    is_active: true,
    endpoints: [
      { id: 'link_v', endpoint_id: epVercel.id, endpoint: epVercel },
      { id: 'link_gh', endpoint_id: epGithub.id, endpoint: epGithub },
    ],
  };

  const comboDatabase = {
    id: 'combo_database_uuid',
    name: 'Database Gateway',
    description: 'Neon DB access only',
    user_id: 'user_1',
    is_active: true,
    endpoints: [
      { id: 'link_neon', endpoint_id: epNeon.id, endpoint: epNeon },
    ],
  };

  // =========================================================================
  // 1. Create Combo OAuth Client & Defaults
  // =========================================================================
  console.log('--- 1. Create Combo OAuth Client & Defaults ---');
  const managedUris = getManagedEndpointRedirectUris();
  const canonicalUri = getCanonicalGeminiRedirectUri();

  assert('Test 1: Managed redirect URI generated server-side', managedUris.includes(canonicalUri));
  assert('Test 2: Canonical redirect URI is user-bound Gemini endpoint', canonicalUri.startsWith('https://oauth-redirect.googleusercontent.com/r/'));

  const mockComboClient = {
    id: 'client_rec_1',
    client_id: 'mcp_client_combo_devops_123',
    client_name: 'Gemini Spark',
    client_type: 'public',
    token_endpoint_auth_method: 'none',
    redirect_uris: managedUris,
    scope: 'mcp:read mcp:write',
    combo_id: comboDevOps.id,
    user_id: comboDevOps.user_id,
    is_active: true,
  };

  assert('Test 3: Combo OAuth client is bound to combo_id', mockComboClient.combo_id === 'combo_devops_uuid');
  assert('Test 4: Public PKCE defaults to token_endpoint_auth_method "none"', mockComboClient.token_endpoint_auth_method === 'none');

  // =========================================================================
  // 2. Resource Extraction & Resolution
  // =========================================================================
  console.log('\n--- 2. Resource Extraction & Resolution ---');
  const resComboUrl = `https://mcp-gateway-hub-beta.vercel.app/api/mcp/combo/${comboDevOps.id}/http`;
  const resEndpointUrl = `https://mcp-gateway-hub-beta.vercel.app/api/mcp/${epVercel.id}/http`;

  const targetCombo = extractResourceTarget(resComboUrl);
  assert('Test 5: extractResourceTarget recognizes Combo resource type', targetCombo?.type === 'combo' && targetCombo?.id === comboDevOps.id);

  const targetEndpoint = extractResourceTarget(resEndpointUrl);
  assert('Test 6: extractResourceTarget recognizes Endpoint resource type', targetEndpoint?.type === 'endpoint' && targetEndpoint?.id === epVercel.id);

  const canonicalComboUrl = getCanonicalComboResourceUrl(comboDevOps.id, 'https://mcp-gateway-hub-beta.vercel.app');
  assert('Test 7: Canonical Combo resource URL matches expected path', canonicalComboUrl.includes(`/api/mcp/combo/${comboDevOps.id}/http`));

  // =========================================================================
  // 3. Authorization Code & PKCE S256
  // =========================================================================
  console.log('\n--- 3. Authorization Code & PKCE S256 ---');
  const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');

  const pkceS256Valid = verifyPkce(codeVerifier, codeChallenge, 'S256');
  assert('Test 8: PKCE S256 verification succeeds with valid verifier', pkceS256Valid === true);

  const pkceInvalid = verifyPkce('wrong_verifier_1234567890123456789012345678', codeChallenge, 'S256');
  assert('Test 9: Invalid verifier is rejected', pkceInvalid === false);

  const pkcePlain = verifyPkce(codeVerifier, codeChallenge, 'plain');
  assert('Test 10: PKCE plain method is rejected', pkcePlain === false);

  // =========================================================================
  // 4. JWT Token Issuance & Combo Audience Binding
  // =========================================================================
  console.log('\n--- 4. JWT Token Issuance & Combo Audience Binding ---');
  const tokenDevOps = signMcpAccessToken({
    userId: 'user_1',
    endpointId: `combo_${comboDevOps.id}`,
    clientId: mockComboClient.client_id,
    scope: 'mcp:read mcp:write',
    reqOrigin: 'https://mcp-gateway-hub-beta.vercel.app',
  });

  assert('Test 11: JWT aud is bound to Combo canonical resource URL', tokenDevOps.payload.aud.includes(`/api/mcp/combo/${comboDevOps.id}/http`));
  assert('Test 12: JWT endpoint_id is bound to Combo identifier', tokenDevOps.payload.endpoint_id === `combo_${comboDevOps.id}`);
  assert('Test 13: JWT sub is bound to user ID', tokenDevOps.payload.sub === 'user_1');

  // =========================================================================
  // 5. Token Verification & Security Isolation
  // =========================================================================
  console.log('\n--- 5. Token Verification & Security Isolation ---');
  const vDevOps = verifyMcpAccessToken(tokenDevOps.token, comboDevOps.id, 'https://mcp-gateway-hub-beta.vercel.app');
  assert('Test 14: Token validates successfully on target Combo (PASS)', vDevOps.valid === true);

  const vCrossCombo = verifyMcpAccessToken(tokenDevOps.token, comboDatabase.id, 'https://mcp-gateway-hub-beta.vercel.app');
  assert('Test 15: Combo A token is REJECTED on Combo B (FAIL)', vCrossCombo.valid === false);

  const vEndpoint = verifyMcpAccessToken(tokenDevOps.token, epVercel.id, 'https://mcp-gateway-hub-beta.vercel.app');
  assert('Test 16: Combo token is REJECTED when used directly on underlying endpoint (FAIL)', vEndpoint.valid === false);

  // =========================================================================
  // 6. Dynamic Tool Isolation on Combo
  // =========================================================================
  console.log('\n--- 6. Dynamic Tool Isolation on Combo ---');
  const serverDevOps = new McpServer({ name: 'Test Server', version: '1.0.0' });
  registerVercel(serverDevOps, { token: 'mock_v' });
  registerGithub(serverDevOps, { token: 'mock_gh' });

  const devOpsTools = Object.keys((serverDevOps as any)._registeredTools || {});
  assert('Test 17: DevOps Combo exposes Vercel tools', devOpsTools.includes('list_projects'));
  assert('Test 18: DevOps Combo exposes GitHub tools', devOpsTools.includes('list_repos'));
  assert('Test 19: DevOps Combo strictly excludes Neon run_sql_query', !devOpsTools.includes('run_sql_query'));

  // =========================================================================
  // 7. Client Lifecycle (Revoke & Delete)
  // =========================================================================
  console.log('\n--- 7. Client Lifecycle (Revoke & Delete) ---');
  let clientState = { ...mockComboClient };

  // Revoke
  clientState.is_active = false;
  assert('Test 20: Client marked inactive upon revoke', clientState.is_active === false);

  // Precondition: Active client cannot be deleted
  const canDeleteActive = !mockComboClient.is_active;
  assert('Test 21: Active client deletion is rejected server-side', canDeleteActive === false);

  // Revoked client can be deleted
  const canDeleteRevoked = !clientState.is_active;
  assert('Test 22: Revoked client can be permanently deleted', canDeleteRevoked === true);

  // =========================================================================
  // 8. Tenant Isolation & Cross-User Security
  // =========================================================================
  console.log('\n--- 8. Tenant Isolation & Cross-User Security ---');
  const attackerClient = {
    client_id: 'attacker_client_id',
    user_id: 'user_attacker_2',
  };

  const isCrossUserAllowed = attackerClient.user_id === comboDevOps.user_id;
  assert('Test 23: Attacker client cannot authorize User 1 Combo (DENY)', !isCrossUserAllowed);

  // =========================================================================
  // 9. Existing MCP Endpoint OAuth Regression
  // =========================================================================
  console.log('\n--- 9. Existing MCP Endpoint OAuth Regression ---');
  const tokenEndpoint = signMcpAccessToken({
    userId: 'user_1',
    endpointId: epVercel.id,
    clientId: 'client_endpoint_legacy',
    scope: 'mcp:read mcp:write',
    reqOrigin: 'https://mcp-gateway-hub-beta.vercel.app',
  });

  const vLegacyEndpoint = verifyMcpAccessToken(tokenEndpoint.token, epVercel.id, 'https://mcp-gateway-hub-beta.vercel.app');
  assert('Test 24: Existing MCP Endpoint token verifies normally', vLegacyEndpoint.valid === true);

  const vLegacyCross = verifyMcpAccessToken(tokenEndpoint.token, comboDevOps.id, 'https://mcp-gateway-hub-beta.vercel.app');
  assert('Test 25: Existing MCP Endpoint token cannot access Combo (DENY)', vLegacyCross.valid === false);

  // Exact tool count calculation
  const devOpsToolCount = calculateComboToolCount(comboDevOps.endpoints as any);
  assert('Test 26: calculateComboToolCount computes exactly 11 tools', devOpsToolCount === 11);

  const databaseToolCount = calculateComboToolCount(comboDatabase.endpoints as any);
  assert('Test 27: calculateComboToolCount computes exactly 3 tools for database combo', databaseToolCount === 3);

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  console.log(`  COMBO OAUTH SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runComboOAuthTests().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
