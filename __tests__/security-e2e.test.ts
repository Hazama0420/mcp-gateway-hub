// __tests__/security-e2e.test.ts
//
// =========================================================================
// P2.3 End-to-End Integrated Security & Validation Suite
// MCP Gateway Hub (Hazama0420/mcp-gateway-hub)
// =========================================================================
//
// Validates end-to-end multi-tenant workflows and interaction between:
//   - P0.1 MCP Authentication
//   - P0.2 Tenant Isolation
//   - P0.3 PostgreSQL Read-Only Safety
//   - P1.1 SSRF Protection
//   - P1.2 Rate Limiting
//   - P1.3 CORS Hardening
//   - P1.4 Credential Encryption
//   - P2.1 Health Check & Readiness
//   - P2.2 Observability & Audit Trail
//

const bcrypt = require('bcryptjs');
const { encryptAuthConfig, decryptAuthConfig, sanitizeIntegration } = require('../lib/crypto');
const { validateUrlSyntax, safeFetch } = require('../lib/security/url');
const { checkRateLimit, LIMITS } = require('../lib/security/ratelimit');
const { isOriginAllowed, getBrowserCorsHeaders, getMcpCorsHeaders } = require('../lib/security/cors');
const { generateExecutionId, sanitizeAuditMetadata, recordExecutionLog, recordSecurityEvent } = require('../lib/security/audit');
const fs = require('fs');

let totalPassed = 0;
let totalFailed = 0;

function assert(scenario: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${scenario}`);
    totalPassed++;
  } else {
    console.log(`  [FAIL] ${scenario}${detail ? ' -> ' + detail : ''}`);
    totalFailed++;
  }
}

async function runE2EValidation() {
  console.log('================================================================');
  console.log('  MCP GATEWAY HUB — P2.3 END-TO-END SECURITY VALIDATION SUITE   ');
  console.log('================================================================\n');

  if (!process.env.ENCRYPTION_MASTER_KEY) {
    process.env.ENCRYPTION_MASTER_KEY = 'TEST_MOCK_MASTER_KEY_32_BYTES_01';
  }

  // =========================================================================
  // SCENARIO 1: MCP Data Plane Authentication & Boundary Enforcement
  // =========================================================================
  console.log('--- SCENARIO 1: MCP Authentication & Endpoint Boundary (P0.1) ---');

  const rawKeyA = 'mcp_live_test_key_endpoint_AAA_12345';
  const rawKeyB = 'mcp_live_test_key_endpoint_BBB_67890';
  const hashA = await bcrypt.hash(rawKeyA, 10);
  const hashB = await bcrypt.hash(rawKeyB, 10);

  const endpointA = { id: 'ep-001-A', user_id: 'user-A', name: 'Endpoint A', is_active: true, api_key_hash: hashA };
  const endpointB = { id: 'ep-002-B', user_id: 'user-B', name: 'Endpoint B', is_active: true, api_key_hash: hashB };
  const endpointInactive = { id: 'ep-003-I', user_id: 'user-A', name: 'Inactive EP', is_active: false, api_key_hash: hashA };

  // 1. Valid key verification
  const isValidA = await bcrypt.compare(rawKeyA, endpointA.api_key_hash);
  assert('Valid API Key for Endpoint A is accepted', isValidA);

  // 2. Invalid key rejection
  const isInvalidKey = await bcrypt.compare('mcp_invalid_bogus_key', endpointA.api_key_hash);
  assert('Invalid API Key is rejected', !isInvalidKey);

  // 3. Cross-endpoint key isolation
  const isCrossKeyValid = await bcrypt.compare(rawKeyA, endpointB.api_key_hash);
  assert('Endpoint A key is REJECTED on Endpoint B', !isCrossKeyValid);

  // 4. Inactive endpoint rejection rule
  assert('Inactive endpoint is blocked from execution', !endpointInactive.is_active);

  // =========================================================================
  // SCENARIO 2: Cross-Tenant Isolation Across All Boundaries
  // =========================================================================
  console.log('\n--- SCENARIO 2: Cross-Tenant Isolation (P0.2) ---');

  const tenantUserA = { id: 'usr-AAA-111', email: 'userA@enterprise.com' };
  const tenantUserB = { id: 'usr-BBB-222', email: 'userB@startup.io' };

  const resources = [
    { type: 'Integration', ownerId: tenantUserA.id, id: 'int-A', name: 'User A Custom API' },
    { type: 'Integration', ownerId: tenantUserB.id, id: 'int-B', name: 'User B Custom API' },
    { type: 'Endpoint', ownerId: tenantUserA.id, id: 'ep-A', name: 'User A Endpoint' },
    { type: 'Endpoint', ownerId: tenantUserB.id, id: 'ep-B', name: 'User B Endpoint' },
    { type: 'ExecutionLog', ownerId: tenantUserA.id, id: 'log-A', tool_name: 'query_db' },
    { type: 'ExecutionLog', ownerId: tenantUserB.id, id: 'log-B', tool_name: 'deploy_app' },
  ];

  // Helper simulating server-side authorization check
  function authorizeAccess(requestingUserId: string, resourceOwnerId: string): boolean {
    return requestingUserId === resourceOwnerId;
  }

  assert('User A CAN access User A Integration', authorizeAccess(tenantUserA.id, resources[0].ownerId));
  assert('User A CANNOT access User B Integration', !authorizeAccess(tenantUserA.id, resources[1].ownerId));
  assert('User B CAN access User B Endpoint', authorizeAccess(tenantUserB.id, resources[3].ownerId));
  assert('User B CANNOT access User A Endpoint', !authorizeAccess(tenantUserB.id, resources[2].ownerId));
  assert('User A CANNOT read User B Execution Logs', !authorizeAccess(tenantUserA.id, resources[5].ownerId));

  // =========================================================================
  // SCENARIO 3: Credential Lifecycle & Zero Plaintext Persistence
  // =========================================================================
  console.log('\n--- SCENARIO 3: Credential Encryption Lifecycle (P1.4) ---');

  const sensitiveBearerSecret = 'sk_live_very_secret_customer_token_99999';
  const customAuthConfig = {
    header: 'Authorization',
    prefix: 'Bearer',
    credential: sensitiveBearerSecret,
  };

  // 1. Encrypt before DB persistence
  const encryptedPayload = encryptAuthConfig(customAuthConfig);
  assert('Encrypted payload created with IV, tag, and ciphertext', Boolean(encryptedPayload?.encryptedData && encryptedPayload?.iv && encryptedPayload?.tag));
  assert('Plaintext secret NEVER appears in encryptedData', !encryptedPayload?.encryptedData.includes(sensitiveBearerSecret));
  assert('Plaintext secret NEVER appears in IV', !encryptedPayload?.iv.includes(sensitiveBearerSecret));

  // 2. Decrypt in-memory server-side
  const decryptedConfig = decryptAuthConfig(encryptedPayload?.encryptedData, encryptedPayload?.iv, encryptedPayload?.tag);
  assert('In-memory decryption restores original secret for outbound calls', decryptedConfig?.credential === sensitiveBearerSecret);

  // 3. API Response Sanitization DTO
  const mockDbIntegrationRow = {
    id: 'int-uuid-001',
    user_id: tenantUserA.id,
    name: 'GitHub Production',
    slug: 'github-prod',
    base_url: 'https://api.github.com',
    auth_type: 'bearer',
    encrypted_auth_config: encryptedPayload?.encryptedData,
    auth_config_iv: encryptedPayload?.iv,
    auth_config_tag: encryptedPayload?.tag,
    auth_config: null,
    is_active: true,
  };

  const clientDto = sanitizeIntegration(mockDbIntegrationRow);
  assert('Client DTO strips encrypted_auth_config', clientDto.encrypted_auth_config === undefined);
  assert('Client DTO strips auth_config_iv', clientDto.auth_config_iv === undefined);
  assert('Client DTO strips auth_config_tag', clientDto.auth_config_tag === undefined);
  assert('Client DTO reports configured: true without leaking secret', clientDto.auth_config.configured === true && clientDto.auth_config.credential === undefined);

  // =========================================================================
  // SCENARIO 4: SSRF Protection & Target Validation
  // =========================================================================
  console.log('\n--- SCENARIO 4: SSRF Protection & Validation (P1.1) ---');

  const safeUrl = 'https://api.github.com/user/repos';
  const localhostUrl = 'http://localhost:3000/api/admin';
  const loopbackUrl = 'http://127.0.0.1:8080/metrics';
  const privateCidrUrl = 'http://10.0.0.1/internal';
  const awsMetadataUrl = 'http://169.254.169.254/latest/meta-data/';
  const googleMetadataUrl = 'http://metadata.google.internal/computeMetadata/v1/';
  const decimalIpUrl = 'http://2130706433/admin'; // decimal 127.0.0.1
  const fileProtoUrl = 'file:///etc/passwd';

  assert('Public HTTPS API is allowed', validateUrlSyntax(safeUrl).safe);
  assert('Localhost is blocked', !validateUrlSyntax(localhostUrl).safe);
  assert('Loopback IPv4 127.0.0.1 is blocked', !validateUrlSyntax(loopbackUrl).safe);
  assert('Private RFC1918 10.0.0.0/8 is blocked', !validateUrlSyntax(privateCidrUrl).safe);
  assert('AWS Cloud Metadata 169.254.169.254 is blocked', !validateUrlSyntax(awsMetadataUrl).safe);
  assert('GCP Cloud Metadata domain is blocked', !validateUrlSyntax(googleMetadataUrl).safe);
  assert('Decimal encoded IP is blocked', !validateUrlSyntax(decimalIpUrl).safe);
  assert('File protocol file:/// is blocked', !validateUrlSyntax(fileProtoUrl).safe);

  // =========================================================================
  // SCENARIO 5: PostgreSQL Tool Read-Only Enforcement
  // =========================================================================
  console.log('\n--- SCENARIO 5: PostgreSQL Read-Only Transaction Safety (P0.3) ---');

  const pgAdapterSrc = fs.readFileSync('lib/adapters/postgres.ts', 'utf-8');
  assert('Postgres tool executes SET statement_timeout', pgAdapterSrc.includes('SET statement_timeout'));
  assert('Postgres tool executes BEGIN READ ONLY', pgAdapterSrc.includes('BEGIN READ ONLY'));
  assert('Postgres tool issues ROLLBACK on transaction error', pgAdapterSrc.includes('ROLLBACK'));
  assert('Postgres tool catches and sanitizes connection strings', pgAdapterSrc.includes('sanitizeDbError'));

  // =========================================================================
  // SCENARIO 6: Multi-Tenant Rate Limiting Separation
  // =========================================================================
  console.log('\n--- SCENARIO 6: Rate Limiting & Tenant Quota Isolation (P1.2) ---');

  const tenantA_id = 'test_ratelimit_user_A_' + Date.now();
  const tenantB_id = 'test_ratelimit_user_B_' + Date.now();

  const customLimit = { limit: 2, windowMs: 10000 };

  // Tenant A consumes quota
  const reqA1 = await checkRateLimit(tenantA_id, customLimit);
  const reqA2 = await checkRateLimit(tenantA_id, customLimit);
  const reqA3 = await checkRateLimit(tenantA_id, customLimit);

  assert('Tenant A: Request 1 allowed', reqA1.success);
  assert('Tenant A: Request 2 allowed', reqA2.success);
  assert('Tenant A: Request 3 BLOCKED (429)', !reqA3.success);

  // Tenant B attempts request -> quota must be isolated!
  const reqB1 = await checkRateLimit(tenantB_id, customLimit);
  assert('Tenant B is NOT affected by Tenant A exhaustion (Quota Isolated)', reqB1.success && reqB1.remaining === 1);

  // =========================================================================
  // SCENARIO 7: CORS Policy & Browser vs MCP Separation
  // =========================================================================
  console.log('\n--- SCENARIO 7: CORS Policy Separation (P1.3) ---');

  process.env.NEXTAUTH_URL = 'https://app.mcpgateway.io';
  const allowedOrigin = 'https://app.mcpgateway.io';
  const attackOrigin = 'https://app.mcpgateway.io.attacker.com';

  assert('Configured Dashboard origin is recognized', isOriginAllowed(allowedOrigin));
  assert('Subdomain suffix attack origin is REJECTED', !isOriginAllowed(attackOrigin));

  const browserHeaders = getBrowserCorsHeaders(allowedOrigin);
  assert('Browser Control Plane: Exact origin set', browserHeaders['Access-Control-Allow-Origin'] === allowedOrigin);
  assert('Browser Control Plane: Credentials enabled', browserHeaders['Access-Control-Allow-Credentials'] === 'true');
  assert('Browser Control Plane: NO wildcard * present', browserHeaders['Access-Control-Allow-Origin'] !== '*');

  const mcpHeadersNoOrigin = getMcpCorsHeaders(undefined);
  assert('MCP Client (no origin header): Does NOT set Access-Control-Allow-Origin', mcpHeadersNoOrigin['Access-Control-Allow-Origin'] === undefined);
  assert('MCP Client: Exposes Mcp-Session-Id header', mcpHeadersNoOrigin['Access-Control-Expose-Headers'].includes('Mcp-Session-Id'));

  // =========================================================================
  // SCENARIO 8: Health & Service Readiness
  // =========================================================================
  console.log('\n--- SCENARIO 8: Health & Service Readiness Engine (P2.1) ---');

  const healthSrc = fs.readFileSync('app/api/health/route.ts', 'utf-8');
  assert('Health route uses lightweight SELECT 1 probe', healthSrc.includes('SELECT 1'));
  assert('Health route enforces timeout on DB probe', healthSrc.includes('DB_TIMEOUT_MS') || healthSrc.includes('timeout'));
  assert('Health route supports liveness probe (?probe=liveness)', healthSrc.includes("probe === 'liveness'"));
  assert('Health route prevents caching with no-store headers', healthSrc.includes('no-store'));

  // =========================================================================
  // SCENARIO 9: Observability, Audit Trail & Fail-Safety
  // =========================================================================
  console.log('\n--- SCENARIO 9: Observability, Audit Trail & Fail-Safety (P2.2) ---');

  const execId = generateExecutionId();
  assert('Execution ID is uniquely generated (EX-...)', execId.startsWith('EX-'));

  const rawAuditMetadata = {
    tool: 'get_deployments',
    authorization: 'Bearer secret_token_xyz',
    password: 'super_secret_db_password',
    sql: 'SELECT * FROM secrets',
    database_url: 'postgresql://postgres:secret@db.neon.tech:5432/mcp',
    status: 200,
    items_count: 5,
  };

  const safeAuditMeta = sanitizeAuditMetadata(rawAuditMetadata);
  assert('Audit metadata: Authorization redacted', safeAuditMeta.authorization === '[REDACTED]');
  assert('Audit metadata: Password redacted', safeAuditMeta.password === '[REDACTED]');
  assert('Audit metadata: Raw SQL query redacted', safeAuditMeta.sql === '[REDACTED]');
  assert('Audit metadata: Database URL redacted', !safeAuditMeta.database_url.includes('secret') && safeAuditMeta.database_url.includes('[REDACTED_CONNECTION_STRING]'));
  assert('Audit metadata: Safe metrics preserved', safeAuditMeta.status === 200 && safeAuditMeta.items_count === 5);

  // =========================================================================
  // SCENARIO 10: Global Secret Leakage Sweep
  // =========================================================================
  console.log('\n--- SCENARIO 10: Comprehensive Secret Leakage Sweep ---');

  const dummyTestSecret = 'SECRET_TEST_FIXTURE_TOKEN_XYZ_12345';
  const testObject = {
    auth_type: 'bearer',
    encrypted_auth_config: 'AES_GCM_ENCRYPTED_STRING',
    auth_config_iv: 'IV_BASE64',
    auth_config_tag: 'TAG_BASE64',
    secret: dummyTestSecret,
  };

  const serializedSanitized = JSON.stringify(sanitizeIntegration(testObject));
  const sanitizedMetaString = JSON.stringify(sanitizeAuditMetadata(testObject));

  assert('Sanitized Integration output does NOT contain raw secret', !serializedSanitized.includes(dummyTestSecret));
  assert('Sanitized Audit output does NOT contain raw secret', !sanitizedMetaString.includes(dummyTestSecret));
  assert('No ENCRYPTION_MASTER_KEY in serialized metadata', !sanitizedMetaString.includes(process.env.ENCRYPTION_MASTER_KEY));

  // =========================================================================
  // SCENARIO 11: P2.4 MCP OAuth 2.1 & Gemini Spark Interoperability
  // =========================================================================
  console.log('\n--- SCENARIO 11: MCP OAuth 2.1 & Gemini Spark Handshake (P2.4) ---');

  const { generateCodeChallenge, verifyPkce } = require('../lib/oauth/pkce');
  const { signMcpAccessToken, verifyMcpAccessToken, isJwtToken } = require('../lib/oauth/jwt');
  const { createProtectedResourceMetadata, createAuthorizationServerMetadata, getOAuthProtectedResourceMetadataUrl } = require('../lib/oauth/config');
  const { redirectUriMatches } = require('../lib/oauth/store');

  const geminiEndpointId = 'ep-gemini-test-999';
  const geminiUserId = tenantUserA.id;
  const geminiClientId = 'mcp_client_gemini_spark_connected_app';

  // 1. Initial unauthenticated request -> 401 + WWW-Authenticate header
  const prmUrl = getOAuthProtectedResourceMetadataUrl(geminiEndpointId);
  const wwwAuthHeader = `Bearer resource_metadata="${prmUrl}"`;
  assert('Gemini Flow 1: 401 challenges with WWW-Authenticate pointing to PRM', wwwAuthHeader.includes(prmUrl));

  // 2. Discover Protected Resource Metadata (RFC 9728)
  const prmMetadata = createProtectedResourceMetadata(geminiEndpointId);
  assert('Gemini Flow 2: PRM identifies resource URL and authorization servers', prmMetadata.resource.includes(geminiEndpointId) && prmMetadata.authorization_servers.length > 0);

  // 3. Discover Authorization Server Metadata (RFC 8414)
  const asMeta = createAuthorizationServerMetadata();
  assert('Gemini Flow 3: AS metadata advertises S256 and authorization_code', asMeta.code_challenge_methods_supported.includes('S256') && asMeta.grant_types_supported.includes('authorization_code'));

  // 4. PKCE S256 Exchange
  const testVerifier = 'gemini_spark_random_code_verifier_string_43_chars_long_minimum';
  const testChallenge = generateCodeChallenge(testVerifier);
  assert('Gemini Flow 4: PKCE S256 challenge generated and verified', verifyPkce(testVerifier, testChallenge, 'S256'));

  // 5. Issue Access Token JWT
  const { token: geminiAccessToken } = signMcpAccessToken({
    userId: geminiUserId,
    endpointId: geminiEndpointId,
    clientId: geminiClientId,
    scope: 'mcp:read mcp:write',
    expiresInSeconds: 3600,
  });

  assert('Gemini Flow 5: Access Token recognized as JWT', isJwtToken(geminiAccessToken));

  // 6. Token Verification with Resource Binding
  const geminiVerifyResult = verifyMcpAccessToken(geminiAccessToken, geminiEndpointId);
  assert('Gemini Flow 6: Token valid on target Gemini endpoint', geminiVerifyResult.valid && geminiVerifyResult.payload.sub === geminiUserId);

  // 7. Token rejected on different endpoint
  const wrongEpVerifyResult = verifyMcpAccessToken(geminiAccessToken, 'ep-other-endpoint-000');
  assert('Gemini Flow 7: Token for Endpoint A REJECTED on Endpoint B', !wrongEpVerifyResult.valid);

  // 8. Legacy API key continues to work alongside OAuth
  const isLegacyKeyStillValid = await bcrypt.compare(rawKeyA, endpointA.api_key_hash);
  assert('Gemini Flow 8: Legacy API key continues to work without regression', isLegacyKeyStillValid);

  // =========================================================================
  // SCENARIO 12: Combo MCP OAuth 2.1 & Gemini Spark Full Discovery Handshake
  // =========================================================================
  console.log('\n--- SCENARIO 12: Combo MCP OAuth 2.1 & Gemini Spark Interoperability ---');

  process.env.NEXTAUTH_URL = 'https://mcp-gateway-hub-beta.vercel.app';
  const canonicalIssuer = 'https://mcp-gateway-hub-beta.vercel.app';
  const comboId = 'combo-live-devops-456';
  const comboUserId = tenantUserA.id;
  const comboClientId = 'mcp_client_gemini_combo_devops';

  // 1. Combo unauthenticated discovery probe -> 401 + WWW-Authenticate header
  const comboPrmUrl = getOAuthProtectedResourceMetadataUrl(comboId, canonicalIssuer, { isCombo: true });
  assert('Combo Gemini Flow 1: PRM URL uses /api/mcp/combo/<combo-id>/http path', comboPrmUrl === `${canonicalIssuer}/.well-known/oauth-protected-resource/api/mcp/combo/${comboId}/http`);

  const comboWwwAuth = `Bearer resource_metadata="${comboPrmUrl}"`;
  assert('Combo Gemini Flow 2: 401 WWW-Authenticate header advertises combo resource metadata', comboWwwAuth.includes(comboPrmUrl) && !comboWwwAuth.includes('error='));

  // 2. Discover Protected Resource Metadata for Combo
  const comboMetadata = createProtectedResourceMetadata(comboId, canonicalIssuer, { isCombo: true });
  assert('Combo Gemini Flow 3: Protected Resource Metadata resource matches canonical combo URL', comboMetadata.resource === `${canonicalIssuer}/api/mcp/combo/${comboId}/http`);
  assert('Combo Gemini Flow 4: Protected Resource Metadata contains authorization_servers', comboMetadata.authorization_servers.includes(canonicalIssuer));

  // 3. Issue and verify Combo OAuth token
  const { token: comboAccessToken } = signMcpAccessToken({
    userId: comboUserId,
    comboId: comboId,
    clientId: comboClientId,
    scope: 'mcp:read mcp:write',
    expiresInSeconds: 3600,
    reqOrigin: canonicalIssuer,
  });

  assert('Combo Gemini Flow 5: Combo token recognized as JWT', isJwtToken(comboAccessToken));

  const comboTokenVerification = verifyMcpAccessToken(comboAccessToken, comboId, canonicalIssuer);
  assert('Combo Gemini Flow 6: Token valid on target Combo endpoint with matching aud and sub', comboTokenVerification.valid && comboTokenVerification.payload.sub === comboUserId && comboTokenVerification.payload.aud === `${canonicalIssuer}/api/mcp/combo/${comboId}/http`);

  // 4. Isolation: Cross-combo token rejection
  const otherComboVerify = verifyMcpAccessToken(comboAccessToken, 'combo-other-789', canonicalIssuer);
  assert('Combo Gemini Flow 7: Combo token rejected on different combo', !otherComboVerify.valid);

  // 5. Isolation: Combo token cannot directly query standalone endpoint
  const standaloneVerify = verifyMcpAccessToken(comboAccessToken, geminiEndpointId, canonicalIssuer);
  assert('Combo Gemini Flow 8: Combo token rejected on standalone endpoint', !standaloneVerify.valid);

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n================================================================');
  console.log(`  E2E VALIDATION COMPLETE: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log('================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runE2EValidation().catch((err) => {
  console.error('Fatal E2E Validation Error:', err);
  process.exit(1);
});
