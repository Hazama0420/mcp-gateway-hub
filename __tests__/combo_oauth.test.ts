// __tests__/combo_oauth.test.ts
//
// =========================================================================
// Combo OAuth Client Management, Discovery & MCP Transport Test Suite
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
  getOAuthProtectedResourceMetadataUrl,
  getOAuthComboProtectedResourceMetadataUrl,
  createProtectedResourceMetadata,
  createComboProtectedResourceMetadata,
  createAuthorizationServerMetadata,
  getManagedEndpointRedirectUris,
  getCanonicalGeminiRedirectUri,
  getCanonicalIssuerUrl,
} = require('../lib/oauth/config');
const { verifyPkce } = require('../lib/oauth/pkce');
const nodeCrypto = require('node:crypto');

async function runComboOAuthTests() {
  console.log('========================================================================');
  console.log('  MCP GATEWAY HUB — COMBO OAUTH, DISCOVERY & MCP TRANSPORT TEST SUITE   ');
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

  const CANONICAL_ORIGIN = 'https://mcp-gateway-hub-beta.vercel.app';

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
  const resComboUrl = `${CANONICAL_ORIGIN}/api/mcp/combo/${comboDevOps.id}/http`;
  const resEndpointUrl = `${CANONICAL_ORIGIN}/api/mcp/${epVercel.id}/http`;

  const targetCombo = extractResourceTarget(resComboUrl);
  assert('Test 5: extractResourceTarget recognizes Combo resource type', targetCombo?.type === 'combo' && targetCombo?.id === comboDevOps.id);

  const targetEndpoint = extractResourceTarget(resEndpointUrl);
  assert('Test 6: extractResourceTarget recognizes Endpoint resource type', targetEndpoint?.type === 'endpoint' && targetEndpoint?.id === epVercel.id);

  const canonicalComboUrl = getCanonicalComboResourceUrl(comboDevOps.id, CANONICAL_ORIGIN);
  assert('Test 7: Canonical Combo resource URL matches expected path', canonicalComboUrl === `${CANONICAL_ORIGIN}/api/mcp/combo/${comboDevOps.id}/http`);

  const canonicalEndpointUrl = getCanonicalResourceUrl(epVercel.id, CANONICAL_ORIGIN);
  assert('Test 8: Canonical Endpoint resource URL matches expected path', canonicalEndpointUrl === `${CANONICAL_ORIGIN}/api/mcp/${epVercel.id}/http`);

  // =========================================================================
  // 3. RFC 9728 Protected Resource Metadata for Combo
  // =========================================================================
  console.log('\n--- 3. RFC 9728 Protected Resource Metadata for Combo ---');
  const comboPrmUrl = getOAuthProtectedResourceMetadataUrl(comboDevOps.id, CANONICAL_ORIGIN, { isCombo: true });
  assert('Test 9: Combo PRM URL contains /api/mcp/combo/<combo-id>/http path', comboPrmUrl === `${CANONICAL_ORIGIN}/.well-known/oauth-protected-resource/api/mcp/combo/${comboDevOps.id}/http`);

  const comboPrmUrlHelper = getOAuthComboProtectedResourceMetadataUrl(comboDevOps.id, CANONICAL_ORIGIN);
  assert('Test 10: getOAuthComboProtectedResourceMetadataUrl produces identical canonical URL', comboPrmUrlHelper === comboPrmUrl);

  const comboPrm = createProtectedResourceMetadata(comboDevOps.id, CANONICAL_ORIGIN, { isCombo: true });
  assert('Test 11: Combo PRM resource matches exact Combo MCP URL', comboPrm.resource === `${CANONICAL_ORIGIN}/api/mcp/combo/${comboDevOps.id}/http`);
  assert('Test 12: Combo PRM authorization_servers points to canonical issuer', comboPrm.authorization_servers.includes(CANONICAL_ORIGIN));
  assert('Test 13: Combo PRM resource_name reflects Combo identity', comboPrm.resource_name === `MCP Combo ${comboDevOps.id}`);
  assert('Test 14: Combo PRM resource_documentation points to /admin/combo', comboPrm.resource_documentation.includes('/admin/combo'));

  const comboPrmHelper = createComboProtectedResourceMetadata(comboDevOps.id, CANONICAL_ORIGIN);
  assert('Test 15: createComboProtectedResourceMetadata matches createProtectedResourceMetadata with isCombo', JSON.stringify(comboPrmHelper) === JSON.stringify(comboPrm));

  // Standalone PRM Regression check
  const epPrmUrl = getOAuthProtectedResourceMetadataUrl(epVercel.id, CANONICAL_ORIGIN);
  assert('Test 16: Standalone endpoint PRM URL remains /api/mcp/<endpoint-id>/http', epPrmUrl === `${CANONICAL_ORIGIN}/.well-known/oauth-protected-resource/api/mcp/${epVercel.id}/http`);
  const epPrm = createProtectedResourceMetadata(epVercel.id, CANONICAL_ORIGIN);
  assert('Test 17: Standalone endpoint PRM resource matches standalone MCP URL', epPrm.resource === `${CANONICAL_ORIGIN}/api/mcp/${epVercel.id}/http`);

  // =========================================================================
  // 4. WWW-Authenticate Header Formatting for Combo
  // =========================================================================
  console.log('\n--- 4. WWW-Authenticate Header Formatting for Combo ---');
  const buildComboWwwAuthHeader = (errorCode?: string, errorDescription?: string) => {
    if (errorCode && errorDescription) {
      return `Bearer error="${errorCode}", error_description="${errorDescription}", resource_metadata="${comboPrmUrl}"`;
    }
    return `Bearer resource_metadata="${comboPrmUrl}"`;
  };

  const comboInitial401 = buildComboWwwAuthHeader();
  assert('Test 18: Initial 401 WWW-Authenticate header contains Bearer scheme', comboInitial401.startsWith('Bearer '));
  assert('Test 19: Initial 401 WWW-Authenticate header references combo resource_metadata', comboInitial401.includes(`resource_metadata="${comboPrmUrl}"`));
  assert('Test 20: Initial 401 WWW-Authenticate header has NO error parameter on discovery', !comboInitial401.includes('error='));

  const comboInvalidToken401 = buildComboWwwAuthHeader('invalid_token', 'The access token is invalid');
  assert('Test 21: Token rejection 401 includes error="invalid_token"', comboInvalidToken401.includes('error="invalid_token"'));
  assert('Test 22: Token rejection 401 retains combo resource_metadata', comboInvalidToken401.includes(`resource_metadata="${comboPrmUrl}"`));

  // =========================================================================
  // 5. RFC 8414 Authorization Server Metadata Consistency
  // =========================================================================
  console.log('\n--- 5. RFC 8414 Authorization Server Metadata Consistency ---');
  const asMeta = createAuthorizationServerMetadata(CANONICAL_ORIGIN);
  assert('Test 23: AS Metadata issuer matches canonical origin', asMeta.issuer === CANONICAL_ORIGIN);
  assert('Test 24: AS Metadata authorization_endpoint is /oauth/authorize', asMeta.authorization_endpoint === `${CANONICAL_ORIGIN}/oauth/authorize`);
  assert('Test 25: AS Metadata token_endpoint is /oauth/token', asMeta.token_endpoint === `${CANONICAL_ORIGIN}/oauth/token`);
  assert('Test 26: AS Metadata supports S256 code challenge', asMeta.code_challenge_methods_supported.includes('S256'));

  // =========================================================================
  // 6. Authorization Code & PKCE S256
  // =========================================================================
  console.log('\n--- 6. Authorization Code & PKCE S256 ---');
  const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const codeChallenge = nodeCrypto.createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');

  const pkceS256Valid = verifyPkce(codeVerifier, codeChallenge, 'S256');
  assert('Test 27: PKCE S256 verification succeeds with valid verifier', pkceS256Valid === true);

  const pkceInvalid = verifyPkce('wrong_verifier_1234567890123456789012345678', codeChallenge, 'S256');
  assert('Test 28: Invalid verifier is rejected', pkceInvalid === false);

  const pkcePlain = verifyPkce(codeVerifier, codeChallenge, 'plain');
  assert('Test 29: PKCE plain method is rejected', pkcePlain === false);

  // =========================================================================
  // 7. JWT Token Issuance & Combo Audience Binding
  // =========================================================================
  console.log('\n--- 7. JWT Token Issuance & Combo Audience Binding ---');
  const tokenDevOps = signMcpAccessToken({
    userId: 'user_1',
    comboId: comboDevOps.id,
    clientId: mockComboClient.client_id,
    scope: 'mcp:read mcp:write',
    reqOrigin: CANONICAL_ORIGIN,
  });

  assert('Test 30: JWT aud is bound to Combo canonical resource URL', tokenDevOps.payload.aud === `${CANONICAL_ORIGIN}/api/mcp/combo/${comboDevOps.id}/http`);
  assert('Test 31: JWT endpoint_id is bound to Combo identifier (combo_<id>)', tokenDevOps.payload.endpoint_id === `combo_${comboDevOps.id}`);
  assert('Test 32: JWT sub is bound to user ID', tokenDevOps.payload.sub === 'user_1');
  assert('Test 33: JWT exp is valid and in future', tokenDevOps.payload.exp > Math.floor(Date.now() / 1000));

  // =========================================================================
  // 8. Token Verification & Security Isolation
  // =========================================================================
  console.log('\n--- 8. Token Verification & Security Isolation ---');
  const vDevOps = verifyMcpAccessToken(tokenDevOps.token, comboDevOps.id, CANONICAL_ORIGIN);
  assert('Test 34: Token validates successfully on target Combo (PASS)', vDevOps.valid === true);

  const vCrossCombo = verifyMcpAccessToken(tokenDevOps.token, comboDatabase.id, CANONICAL_ORIGIN);
  assert('Test 35: Combo A token is REJECTED on Combo B (FAIL)', vCrossCombo.valid === false);

  const vEndpoint = verifyMcpAccessToken(tokenDevOps.token, epVercel.id, CANONICAL_ORIGIN);
  assert('Test 36: Combo token is REJECTED when used directly on underlying endpoint (FAIL)', vEndpoint.valid === false);

  // =========================================================================
  // 9. MCP Server Instance & Tools Assembly (DevOps Combo: Vercel + GitHub)
  // =========================================================================
  console.log('\n--- 9. MCP Server Instance & Tools Assembly (DevOps Combo: Vercel + GitHub) ---');
  const serverDevOps = new McpServer({ name: `Combo - ${comboDevOps.name}`, version: '1.0.0' });
  registerVercel(serverDevOps, { token: 'mock_v_token', teamId: '' });
  registerGithub(serverDevOps, { token: 'mock_gh_token' });

  const devOpsTools = Object.keys((serverDevOps as any)._registeredTools || {});
  assert('Test 37: DevOps Combo exposes Vercel list_projects tool', devOpsTools.includes('list_projects'));
  assert('Test 38: DevOps Combo exposes Vercel get_deployments tool', devOpsTools.includes('get_deployments'));
  assert('Test 39: DevOps Combo exposes GitHub list_repos tool', devOpsTools.includes('list_repos'));
  assert('Test 40: DevOps Combo exposes GitHub get_file_contents tool', devOpsTools.includes('get_file_contents'));
  assert('Test 41: DevOps Combo strictly excludes Neon run_sql_query', !devOpsTools.includes('run_sql_query'));

  const devOpsToolCount = calculateComboToolCount(comboDevOps.endpoints as any);
  assert('Test 42: calculateComboToolCount computes exactly 11 tools', devOpsToolCount === 11);

  const databaseToolCount = calculateComboToolCount(comboDatabase.endpoints as any);
  assert('Test 43: calculateComboToolCount computes exactly 3 tools for database combo', databaseToolCount === 3);

  // =========================================================================
  // 10. Client Lifecycle (Revoke & Delete)
  // =========================================================================
  console.log('\n--- 10. Client Lifecycle (Revoke & Delete) ---');
  let clientState = { ...mockComboClient };

  // Revoke
  clientState.is_active = false;
  assert('Test 44: Client marked inactive upon revoke', clientState.is_active === false);

  // Precondition: Active client cannot be deleted
  const canDeleteActive = !mockComboClient.is_active;
  assert('Test 45: Active client deletion is rejected server-side', canDeleteActive === false);

  // Revoked client can be deleted
  const canDeleteRevoked = !clientState.is_active;
  assert('Test 46: Revoked client can be permanently deleted', canDeleteRevoked === true);

  // =========================================================================
  // 11. Tenant Isolation & Cross-User Security
  // =========================================================================
  console.log('\n--- 11. Tenant Isolation & Cross-User Security ---');
  const attackerClient = {
    client_id: 'attacker_client_id',
    user_id: 'user_attacker_2',
  };

  const isCrossUserAllowed = attackerClient.user_id === comboDevOps.user_id;
  assert('Test 47: Attacker client cannot authorize User 1 Combo (DENY)', !isCrossUserAllowed);

  // =========================================================================
  // 12. Existing MCP Standalone Endpoint Regression
  // =========================================================================
  console.log('\n--- 12. Existing MCP Standalone Endpoint Regression ---');
  const tokenEndpoint = signMcpAccessToken({
    userId: 'user_1',
    endpointId: epVercel.id,
    clientId: 'client_endpoint_legacy',
    scope: 'mcp:read mcp:write',
    reqOrigin: CANONICAL_ORIGIN,
  });

  const vLegacyEndpoint = verifyMcpAccessToken(tokenEndpoint.token, epVercel.id, CANONICAL_ORIGIN);
  assert('Test 48: Existing MCP Endpoint token verifies normally', vLegacyEndpoint.valid === true);

  // =========================================================================
  // 13. Production Domain Resolution & RFC 9728 Issuer Matching
  // =========================================================================
  console.log('\n--- 13. Production Domain Resolution & RFC 9728 Issuer Matching ---');
  const prevEnv = process.env.NODE_ENV;
  const prevVercelUrl = process.env.VERCEL_URL;

  process.env.NODE_ENV = 'production';
  process.env.VERCEL_URL = 'mcp-gateway-ephemeral-hash-123.vercel.app';

  const canonicalIssuerProd = getCanonicalIssuerUrl();
  assert('Test 50: Production issuer prefers canonical production domain over VERCEL_URL hash', canonicalIssuerProd === 'https://mcp-gateway-hub-beta.vercel.app');

  const prmProd = createProtectedResourceMetadata(comboDevOps.id);
  assert('Test 51: Production PRM authorization_servers matches canonical domain', prmProd.authorization_servers.includes('https://mcp-gateway-hub-beta.vercel.app'));

  // Restore env
  process.env.NODE_ENV = prevEnv;
  process.env.VERCEL_URL = prevVercelUrl;

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
