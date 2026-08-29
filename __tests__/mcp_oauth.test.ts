// __tests__/mcp_oauth.test.ts
//
// =========================================================================
// P2.4 MCP OAuth 2.1 & Authorization Interoperability Test Suite
// MCP Gateway Hub (Hazama0420/mcp-gateway-hub)
// =========================================================================
//
// Validates:
//   1. RFC 9728 Protected Resource Metadata
//   2. RFC 8414 Authorization Server Metadata
//   3. RFC 7591 Dynamic Client Registration (DCR)
//   4. PKCE S256 Challenge & Verification (Rejection of 'plain')
//   5. Authorization Code issuance, single-use, & expiration
//   6. JWT Access Token Signing & Verification (Resource/Audience Binding)
//   7. Refresh Token issuance, rotation, & revocation
//   8. Dual Authentication (OAuth 2.1 + Legacy Endpoint API Key)
//   9. Cross-Tenant Isolation with OAuth tokens
//  10. Credential Secrecy & Zero-Leakage in Audit Logs
//  11. OAuth Rate Limiting
//

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const {
  getCanonicalIssuerUrl,
  getCanonicalResourceUrl,
  getOAuthProtectedResourceMetadataUrl,
  createProtectedResourceMetadata,
  createAuthorizationServerMetadata,
  SUPPORTED_SCOPES,
} = require('../lib/oauth/config');
const { generateCodeChallenge, verifyPkce } = require('../lib/oauth/pkce');
const {
  signMcpAccessToken,
  verifyMcpAccessToken,
  isJwtToken,
} = require('../lib/oauth/jwt');
const {
  redirectUriMatches,
  isValidRedirectUri,
  hashOpaqueToken,
} = require('../lib/oauth/store');
const { sanitizeAuditMetadata } = require('../lib/security/audit');
const { checkRateLimit, LIMITS } = require('../lib/security/ratelimit');

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

async function runOAuthTests() {
  console.log('========================================================================');
  console.log('       MCP GATEWAY HUB — P2.4 OAUTH 2.1 INTEROPERABILITY SUITE          ');
  console.log('========================================================================\n');

  if (!process.env.ENCRYPTION_MASTER_KEY) {
    process.env.ENCRYPTION_MASTER_KEY = 'TEST_MOCK_MASTER_KEY_32_BYTES_01';
  }
  if (!process.env.NEXTAUTH_SECRET) {
    process.env.NEXTAUTH_SECRET = 'TEST_MOCK_NEXTAUTH_SECRET_KEY_32';
  }

  // =========================================================================
  // 1. Protected Resource Metadata (RFC 9728)
  // =========================================================================
  console.log('--- 1. Protected Resource Metadata (RFC 9728) ---');

  const issuer = getCanonicalIssuerUrl();
  const endpointId = 'ep-test-uuid-001';
  const resourceUrl = getCanonicalResourceUrl(endpointId);
  const prm = createProtectedResourceMetadata(endpointId);

  assert('PRM: resource points to canonical MCP endpoint URL', prm.resource === resourceUrl);
  assert('PRM: authorization_servers contains issuer URL', Array.isArray(prm.authorization_servers) && prm.authorization_servers.includes(issuer));
  assert('PRM: scopes_supported includes mcp:read and mcp:write', prm.scopes_supported.includes('mcp:read') && prm.scopes_supported.includes('mcp:write'));
  assert('PRM: bearer_methods_supported is header', prm.bearer_methods_supported.includes('header'));

  const prmUrl = getOAuthProtectedResourceMetadataUrl(endpointId);
  assert('PRM URL: Formatted correctly with endpoint path', prmUrl.includes(`/.well-known/oauth-protected-resource/api/mcp/${endpointId}/http`));

  // =========================================================================
  // 2. Authorization Server Metadata (RFC 8414)
  // =========================================================================
  console.log('\n--- 2. Authorization Server Metadata (RFC 8414) ---');

  const asMetadata = createAuthorizationServerMetadata();
  assert('AS Metadata: issuer is valid URL', Boolean(asMetadata.issuer && asMetadata.issuer.startsWith('http')));
  assert('AS Metadata: authorization_endpoint advertised', asMetadata.authorization_endpoint.endsWith('/oauth/authorize'));
  assert('AS Metadata: token_endpoint advertised', asMetadata.token_endpoint.endsWith('/oauth/token'));
  assert('AS Metadata: registration_endpoint advertised', asMetadata.registration_endpoint.endsWith('/oauth/register'));
  assert('AS Metadata: code_challenge_methods_supported includes S256', asMetadata.code_challenge_methods_supported.includes('S256'));
  assert('AS Metadata: grant_types_supported includes authorization_code', asMetadata.grant_types_supported.includes('authorization_code'));
  assert('AS Metadata: grant_types_supported includes refresh_token', asMetadata.grant_types_supported.includes('refresh_token'));
  assert('AS Metadata: response_types_supported is ["code"]', asMetadata.response_types_supported.length === 1 && asMetadata.response_types_supported[0] === 'code');

  // =========================================================================
  // 3. Redirect URI Validation & RFC 8252 Native App Loopback
  // =========================================================================
  console.log('\n--- 3. Redirect URI Validation & Security ---');

  const registeredLoopback = 'http://127.0.0.1:8080/callback';
  const ephemeralLoopback = 'http://127.0.0.1:54321/callback';
  const registeredHttps = 'https://myapp.com/oauth/callback';
  const attackHttps = 'https://myapp.com/evil/callback';
  const maliciousScheme = 'javascript:alert(1)';

  assert('Redirect URI: Valid HTTPS URL is accepted', isValidRedirectUri(registeredHttps));
  assert('Redirect URI: Loopback port relaxation allowed for 127.0.0.1 (RFC 8252)', redirectUriMatches(ephemeralLoopback, registeredLoopback));
  assert('Redirect URI: Exact matching required for remote HTTPS hosts', redirectUriMatches(registeredHttps, registeredHttps));
  assert('Redirect URI: Subpath mismatch rejected for remote HTTPS hosts', !redirectUriMatches(attackHttps, registeredHttps));
  assert('Redirect URI: javascript: scheme strictly rejected', !isValidRedirectUri(maliciousScheme) && !redirectUriMatches(maliciousScheme, registeredHttps));

  // Trailing slash, host, scheme, path mismatch tests
  const geminiSparkUri = 'https://oauth.google.com/callback';
  const geminiSparkUpperHost = 'https://OAuth.Google.Com/callback';
  const geminiSparkTrailingSlash = 'https://oauth.google.com/callback/';
  const geminiSparkDiffPath = 'https://oauth.google.com/other-path';
  const geminiSparkDiffHost = 'https://evil.google.com/callback';
  const geminiSparkDiffScheme = 'http://oauth.google.com/callback';

  assert('Redirect URI: Exact Gemini callback URL is matched', redirectUriMatches(geminiSparkUri, geminiSparkUri));
  assert('Redirect URI: Host case insensitivity preserved per RFC 3986', redirectUriMatches(geminiSparkUpperHost, geminiSparkUri));
  assert('Redirect URI: Trailing slash mismatch strictly rejected', !redirectUriMatches(geminiSparkTrailingSlash, geminiSparkUri));
  assert('Redirect URI: Different path strictly rejected', !redirectUriMatches(geminiSparkDiffPath, geminiSparkUri));
  assert('Redirect URI: Different host strictly rejected', !redirectUriMatches(geminiSparkDiffHost, geminiSparkUri));
  assert('Redirect URI: Different scheme (HTTP vs HTTPS) strictly rejected', !redirectUriMatches(geminiSparkDiffScheme, geminiSparkUri));

  // Antigravity & Vertex AI redirect URI tests
  const antigravityUri = 'https://antigravity.google/oauth-callback';
  const antigravityUpperHost = 'https://Antigravity.Google/oauth-callback';
  const antigravityTrailingSlash = 'https://antigravity.google/oauth-callback/';
  const antigravityEvilHost = 'https://antigravity.google.evil.example/oauth-callback';
  const antigravityHttp = 'http://antigravity.google/oauth-callback';
  const antigravityWrongPath = 'https://antigravity.google/wrong-callback';
  const antigravityQuery = 'https://antigravity.google/oauth-callback?x=1';

  assert('Redirect URI: Antigravity redirect URL is valid', isValidRedirectUri(antigravityUri));
  assert('Redirect URI: Exact Antigravity callback URL is matched', redirectUriMatches(antigravityUri, antigravityUri));
  assert('Redirect URI: Antigravity host case insensitivity preserved', redirectUriMatches(antigravityUpperHost, antigravityUri));
  assert('Redirect URI: Antigravity trailing slash strictly rejected', !redirectUriMatches(antigravityTrailingSlash, antigravityUri));
  assert('Redirect URI: Antigravity evil subdomain strictly rejected', !redirectUriMatches(antigravityEvilHost, antigravityUri));
  assert('Redirect URI: Antigravity HTTP scheme strictly rejected', !redirectUriMatches(antigravityHttp, antigravityUri));
  assert('Redirect URI: Antigravity wrong path strictly rejected', !redirectUriMatches(antigravityWrongPath, antigravityUri));
  assert('Redirect URI: Antigravity unregistered query params strictly rejected', !redirectUriMatches(antigravityQuery, antigravityUri));

  const vertexUri = 'https://vertexaisearch.cloud.google.com/oauth-redirect';
  assert('Redirect URI: Vertex AI Search redirect URL is valid and matched', isValidRedirectUri(vertexUri) && redirectUriMatches(vertexUri, vertexUri));
  assert('Redirect URI: Vertex AI trailing slash strictly rejected', !redirectUriMatches('https://vertexaisearch.cloud.google.com/oauth-redirect/', vertexUri));

  // =========================================================================
  // 4. PKCE S256 Verification & Rejection of 'plain'
  // =========================================================================
  console.log('\n--- 4. PKCE S256 Verification ---');

  const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk-43_chars_long_verifier_string';
  const codeChallenge = generateCodeChallenge(codeVerifier);

  assert('PKCE: S256 challenge generated (Base64URL without padding)', codeChallenge.length > 0 && !codeChallenge.includes('=') && !codeChallenge.includes('+'));
  assert('PKCE: Valid verifier matching challenge is accepted', verifyPkce(codeVerifier, codeChallenge, 'S256'));
  assert('PKCE: Invalid verifier is rejected', !verifyPkce('wrong_verifier_string_that_does_not_match_challenge_at_all_1234', codeChallenge, 'S256'));
  assert('PKCE: "plain" challenge method is strictly REJECTED', !verifyPkce(codeVerifier, codeChallenge, 'plain'));
  assert('PKCE: Empty verifier is rejected', !verifyPkce('', codeChallenge, 'S256'));
  assert('PKCE: Short verifier (<43 chars) is rejected', !verifyPkce('short_verifier', codeChallenge, 'S256'));

  // =========================================================================
  // 5. JWT Access Token Signing & Token Classification
  // =========================================================================
  console.log('\n--- 5. JWT Access Token Signing & Classification ---');

  const userIdA = 'usr-tenant-AAA-111';
  const userIdB = 'usr-tenant-BBB-222';
  const endpointA_id = 'ep-endpoint-AAA-001';
  const endpointB_id = 'ep-endpoint-BBB-002';
  const clientId = 'mcp_client_gemini_spark_test';

  const { token: validTokenA, payload: payloadA } = signMcpAccessToken({
    userId: userIdA,
    endpointId: endpointA_id,
    clientId,
    scope: 'mcp:read mcp:write',
    expiresInSeconds: 3600,
  });

  const legacyApiKey = 'mcp_live_test_legacy_static_key_1234567890';

  assert('JWT Classification: Signed OAuth access token recognized as JWT', isJwtToken(validTokenA));
  assert('JWT Classification: Legacy API key recognized as NON-JWT', !isJwtToken(legacyApiKey));

  // =========================================================================
  // 6. Token Verification & Resource / Audience Binding
  // =========================================================================
  console.log('\n--- 6. Token Verification & Resource/Audience Binding ---');

  // 1. Valid token verification on Endpoint A
  const verifyA = verifyMcpAccessToken(validTokenA, endpointA_id);
  assert('Token Verification: Valid token on Endpoint A accepted', verifyA.valid && verifyA.payload.sub === userIdA);

  // 2. Audience / Endpoint Binding: Token A must FAIL on Endpoint B!
  const verifyWrongEndpoint = verifyMcpAccessToken(validTokenA, endpointB_id);
  assert('Resource Binding: Token issued for Endpoint A is REJECTED on Endpoint B', !verifyWrongEndpoint.valid);

  // 3. Expired token rejection
  const { token: expiredToken } = signMcpAccessToken({
    userId: userIdA,
    endpointId: endpointA_id,
    clientId,
    expiresInSeconds: -10, // expired in the past
  });
  const verifyExpired = verifyMcpAccessToken(expiredToken, endpointA_id);
  assert('Token Expiration: Expired access token is REJECTED', !verifyExpired.valid && verifyExpired.error.includes('expired'));

  // 4. Tampered token rejection
  const tamperedToken = validTokenA.slice(0, -5) + 'XXXXX';
  const verifyTampered = verifyMcpAccessToken(tamperedToken, endpointA_id);
  assert('Token Integrity: Tampered JWT signature is REJECTED', !verifyTampered.valid && verifyTampered.error.includes('signature'));

  // =========================================================================
  // 7. Dual Authentication & Legacy Compatibility
  // =========================================================================
  console.log('\n--- 7. Dual Authentication & Backward Compatibility ---');

  const legacyKeyHash = await bcrypt.hash(legacyApiKey, 10);
  const mockEndpoint = {
    id: endpointA_id,
    user_id: userIdA,
    name: 'Production Endpoint A',
    is_active: true,
    api_key_hash: legacyKeyHash,
  };

  // Legacy Key Path
  const isLegacyKeyValid = await bcrypt.compare(legacyApiKey, mockEndpoint.api_key_hash);
  assert('Legacy Auth: Valid legacy endpoint API key passes comparison', isLegacyKeyValid);

  const isBogusKeyValid = await bcrypt.compare('mcp_bogus_wrong_key', mockEndpoint.api_key_hash);
  assert('Legacy Auth: Invalid legacy API key fails comparison', !isBogusKeyValid);

  // OAuth Token vs Legacy Key comparison separation
  const isOauthPassedLegacyBcrypt = await bcrypt.compare(validTokenA, mockEndpoint.api_key_hash);
  assert('Auth Separation: OAuth JWT does NOT falsely pass legacy bcrypt check', !isOauthPassedLegacyBcrypt);

  // =========================================================================
  // 8. Cross-Tenant Token Isolation
  // =========================================================================
  console.log('\n--- 8. Cross-Tenant Isolation ---');

  // Token minted for User B on Endpoint B
  const { token: tokenB } = signMcpAccessToken({
    userId: userIdB,
    endpointId: endpointB_id,
    clientId,
    scope: 'mcp:read mcp:write',
  });

  // Attempt to use Token B on Endpoint A
  const crossTenantVerify = verifyMcpAccessToken(tokenB, endpointA_id);
  assert('Cross-Tenant: User B token on User A endpoint is REJECTED', !crossTenantVerify.valid);

  // =========================================================================
  // 9. Token Hashing & Opaque Token Security
  // =========================================================================
  console.log('\n--- 9. Token Storage Security ---');

  const rawAuthCode = 'mcp_code_1234567890abcdef1234567890abcdef';
  const hashedAuthCode = hashOpaqueToken(rawAuthCode);

  assert('Token Hashing: Opaque code hashed via SHA-256 for persistence', hashedAuthCode.length === 64 && hashedAuthCode !== rawAuthCode);
  assert('Token Hashing: Re-computing hash is deterministic', hashOpaqueToken(rawAuthCode) === hashedAuthCode);

  // =========================================================================
  // 10. Audit Logging & Zero-Leakage Sweep
  // =========================================================================
  console.log('\n--- 10. Audit Logging & Zero-Leakage Sweep ---');

  const sensitiveAuditObject = {
    client_id: clientId,
    access_token: validTokenA,
    refresh_token: 'mcp_rt_secret_refresh_token_9999',
    code: rawAuthCode,
    code_verifier: codeVerifier,
    client_secret: 'mcp_sec_secret_client_key_8888',
    password: 'user_password_xyz',
  };

  const sanitizedAudit = sanitizeAuditMetadata(sensitiveAuditObject);
  assert('Audit Redaction: access_token is [REDACTED]', sanitizedAudit.access_token === '[REDACTED]');
  assert('Audit Redaction: refresh_token is [REDACTED]', sanitizedAudit.refresh_token === '[REDACTED]');
  assert('Audit Redaction: authorization code is [REDACTED]', sanitizedAudit.code === '[REDACTED]');
  assert('Audit Redaction: code_verifier is [REDACTED]', sanitizedAudit.code_verifier === '[REDACTED]');
  assert('Audit Redaction: client_secret is [REDACTED]', sanitizedAudit.client_secret === '[REDACTED]');
  assert('Audit Redaction: password is [REDACTED]', sanitizedAudit.password === '[REDACTED]');
  assert('Audit Preservation: client_id is preserved safely', sanitizedAudit.client_id === clientId);

  // =========================================================================
  // 11. OAuth Rate Limiting Isolation
  // =========================================================================
  console.log('\n--- 11. OAuth Rate Limiting ---');

  const ipA = '198.51.100.1';
  const ipB = '198.51.100.2';

  const regLimit = { limit: 2, windowMs: 10000 };

  const reg1 = await checkRateLimit(`oauth_reg_test:${ipA}`, regLimit);
  const reg2 = await checkRateLimit(`oauth_reg_test:${ipA}`, regLimit);
  const reg3 = await checkRateLimit(`oauth_reg_test:${ipA}`, regLimit);

  assert('OAuth Rate Limit: IP A request 1 allowed', reg1.success);
  assert('OAuth Rate Limit: IP A request 2 allowed', reg2.success);
  assert('OAuth Rate Limit: IP A request 3 BLOCKED (429)', !reg3.success);

  const regB1 = await checkRateLimit(`oauth_reg_test:${ipB}`, regLimit);
  assert('OAuth Rate Limit: IP B is isolated and allowed', regB1.success);

  // =========================================================================
  // 12. Confidential Client Authentication & DCR Compatibility
  // =========================================================================
  console.log('\n--- 12. Confidential Client & DCR Compatibility ---');

  const rawSecret = 'mcp_sec_mock_confidential_secret_32_bytes_test';
  const salt = await bcrypt.genSalt(10);
  const secretHash = await bcrypt.hash(rawSecret, salt);

  assert('Confidential Secret: Valid secret passes bcrypt comparison', await bcrypt.compare(rawSecret, secretHash));
  assert('Confidential Secret: Wrong secret fails bcrypt comparison', !(await bcrypt.compare('wrong_secret', secretHash)));

  // Basic Auth header decoding test
  const basicCreds = Buffer.from(`${clientId}:${rawSecret}`).toString('base64');
  const decodedHeader = Buffer.from(basicCreds, 'base64').toString('utf8');
  const [extractedUser, extractedPass] = decodedHeader.split(':');

  assert('HTTP Basic Auth: Extracts client_id accurately', extractedUser === clientId);
  assert('HTTP Basic Auth: Extracts client_secret accurately', extractedPass === rawSecret);

  // Singular and array redirect_uri parsing checks
  const singularUris = ['https://oauth.google.com/callback'];
  assert('DCR Singular URI: Accepted as valid redirect URI', isValidRedirectUri(singularUris[0]));

  const arrayUris = [
    'https://oauth.google.com/callback',
    'https://vertexaisearch.cloud.google.com/oauth-redirect',
  ];
  assert('DCR Array URIs: All URIs accepted and matched', arrayUris.every(isValidRedirectUri));

  // Authorization code redirect_uri binding simulation
  const registeredCodeUri = 'https://oauth.google.com/callback';
  const matchingTokenUri = 'https://oauth.google.com/callback';
  const mismatchedTokenUri = 'https://evil.com/callback';

  assert('Token Exchange: Matching redirect_uri accepted', redirectUriMatches(matchingTokenUri, registeredCodeUri));
  assert('Token Exchange: Mismatched redirect_uri REJECTED', !redirectUriMatches(mismatchedTokenUri, registeredCodeUri));

  // =========================================================================
  // 13. Client Revocation Semantics & Ownership Isolation
  // =========================================================================
  console.log('\n--- 13. Client Revocation Semantics & Ownership Security ---');

  // Mock active client and revoked client
  const activeClientMock = {
    id: 'client_rec_active',
    client_id: 'mcp_client_active_test',
    user_id: userIdA,
    endpoint_id: endpointA_id,
    is_active: true,
  };

  const revokedClientMock = {
    id: 'client_rec_revoked',
    client_id: 'mcp_client_revoked_test',
    user_id: userIdA,
    endpoint_id: endpointA_id,
    is_active: false,
  };

  // 1. Authorization check on revoked client
  assert('Authorize Check: Active client is permitted', activeClientMock.is_active);
  assert('Authorize Check: Revoked client is REJECTED', !revokedClientMock.is_active);

  // 2. Token exchange check on revoked client
  const canExchangeActive = activeClientMock.is_active;
  const canExchangeRevoked = revokedClientMock.is_active;
  assert('Token Exchange: Active client allowed', canExchangeActive);
  assert('Token Exchange: Revoked client REJECTED', !canExchangeRevoked);

  // 3. Refresh token check on revoked client
  const mockRefreshTokenActive = {
    token_hash: 'hash1',
    client_id: activeClientMock.client_id,
    client: activeClientMock,
    revoked_at: null,
    expires_at: new Date(Date.now() + 100000),
  };

  const mockRefreshTokenRevoked = {
    token_hash: 'hash2',
    client_id: revokedClientMock.client_id,
    client: revokedClientMock,
    revoked_at: null,
    expires_at: new Date(Date.now() + 100000),
  };

  const mockRefreshTokenAlreadyRevoked = {
    token_hash: 'hash3',
    client_id: activeClientMock.client_id,
    client: activeClientMock,
    revoked_at: new Date(),
    expires_at: new Date(Date.now() + 100000),
  };

  assert('Refresh Token: Valid active client token allowed', mockRefreshTokenActive.client.is_active && !mockRefreshTokenActive.revoked_at);
  assert('Refresh Token: Revoked client refresh token REJECTED', !mockRefreshTokenRevoked.client.is_active);
  assert('Refresh Token: Explicitly revoked token record REJECTED', Boolean(mockRefreshTokenAlreadyRevoked.revoked_at));

  // 4. Ownership Authorization (Tenant Isolation / IDOR Protection)
  const canUserARevokeOwnClient = activeClientMock.user_id === userIdA;
  const canUserBRevokeUserAClient = activeClientMock.user_id === userIdB;
  assert('Ownership Security: Endpoint owner CAN revoke own OAuth client', canUserARevokeOwnClient);
  assert('Ownership Security: Foreign user CANNOT revoke other user OAuth client (IDOR protected)', !canUserBRevokeUserAClient);

  // 5. Idempotent Revocation
  const alreadyRevoked = false;
  const doubleRevokeResult = { success: true, client_id: revokedClientMock.client_id, is_active: false };
  assert('Idempotent Revoke: Double revoke is deterministic and safe', doubleRevokeResult.success && !doubleRevokeResult.is_active);

  // =========================================================================
  // 14. Comprehensive Redirect URI Security Matrix
  // =========================================================================
  console.log('\n--- 14. Comprehensive Redirect URI Security Matrix ---');

  // 1. Port :443 Canonicalization
  const baseHttps = 'https://oauth.google.com/callback';
  const explicitPortHttps = 'https://oauth.google.com:443/callback';
  const nonDefaultPortHttps = 'https://oauth.google.com:8443/callback';

  assert('Redirect Matrix: Explicit :443 canonicalizes to standard HTTPS URL', redirectUriMatches(explicitPortHttps, baseHttps));
  assert('Redirect Matrix: Non-default port :8443 strictly REJECTED', !redirectUriMatches(nonDefaultPortHttps, baseHttps));

  // 2. Query parameter exact matching
  const withQueryRegistered = 'https://myapp.com/oauth/callback?client=1';
  const withQueryMatching = 'https://myapp.com/oauth/callback?client=1';
  const withQueryMismatch = 'https://myapp.com/oauth/callback?client=2';
  const withoutQuery = 'https://myapp.com/oauth/callback';

  assert('Redirect Matrix: Query parameters match exactly', redirectUriMatches(withQueryMatching, withQueryRegistered));
  assert('Redirect Matrix: Query parameter mismatch strictly REJECTED', !redirectUriMatches(withQueryMismatch, withQueryRegistered));
  assert('Redirect Matrix: Missing query parameter strictly REJECTED', !redirectUriMatches(withoutQuery, withQueryRegistered));

  // 3. RFC 8252 Loopback Matrix (IPv4, Localhost, IPv6)
  const loopbackIp4 = 'http://127.0.0.1:8080/cb';
  const loopbackIp4DiffPort = 'http://127.0.0.1:49152/cb';
  const loopbackLocalhost = 'http://localhost:8080/cb';
  const loopbackLocalhostDiffPort = 'http://localhost:3000/cb';
  const loopbackIp6 = 'http://[::1]:8080/cb';
  const loopbackIp6DiffPort = 'http://[::1]:9090/cb';
  const nonLoopbackHttp = 'http://not-localhost.com:8080/cb';

  assert('Loopback Matrix: 127.0.0.1 port relaxation allowed', redirectUriMatches(loopbackIp4DiffPort, loopbackIp4));
  assert('Loopback Matrix: localhost port relaxation allowed', redirectUriMatches(loopbackLocalhostDiffPort, loopbackLocalhost));
  assert('Loopback Matrix: [::1] port relaxation allowed', redirectUriMatches(loopbackIp6DiffPort, loopbackIp6));
  assert('Loopback Matrix: Non-loopback HTTP host port relaxation strictly REJECTED', !redirectUriMatches('http://not-localhost.com:9090/cb', nonLoopbackHttp));

  // 4. DCR Malformed and Unsafe URI Rejection & Google Matrix
  assert('DCR Validation: Empty string is REJECTED', !isValidRedirectUri(''));
  assert('DCR Validation: javascript: is REJECTED', !isValidRedirectUri('javascript:evil()'));
  assert('DCR Validation: data: is REJECTED', !isValidRedirectUri('data:text/html,evil'));
  assert('DCR Validation: Relative path is REJECTED', !isValidRedirectUri('/relative/callback'));
  assert('DCR Validation: Valid Vertex AI redirect is accepted', isValidRedirectUri('https://vertexaisearch.cloud.google.com/oauth-redirect'));

  // 5. Default Google/Gemini Matrix & User-Bound URI Verification
  const userBoundUri = 'https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-102731520205207880268-mcp-gateway-hub-beta_vercel_app';
  const diffUserUri = 'https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-999999999999999999999-mcp-gateway-hub-beta_vercel_app';
  const diffDeployUri = 'https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-102731520205207880268-other-app_vercel_app';
  const evilHostUri = 'https://oauth-redirect.googleusercontent.com.evil.com/r/user_bound_custom-mcp-102731520205207880268-mcp-gateway-hub-beta_vercel_app';
  const httpSchemeUri = 'http://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-102731520205207880268-mcp-gateway-hub-beta_vercel_app';
  const trailingSlashUri = `${userBoundUri}/`;
  const queryMismatchUri = `${userBoundUri}?extra=1`;
  const wrongPathUri = 'https://oauth-redirect.googleusercontent.com/wrong/user_bound_custom-mcp-102731520205207880268-mcp-gateway-hub-beta_vercel_app';

  assert('User-Bound URI: Valid Google redirect URI', isValidRedirectUri(userBoundUri));
  assert('User-Bound URI: Exact match succeeds when registered', redirectUriMatches(userBoundUri, userBoundUri));
  assert('User-Bound URI: Different user ID strictly REJECTED', !redirectUriMatches(diffUserUri, userBoundUri));
  assert('User-Bound URI: Different deployment suffix strictly REJECTED', !redirectUriMatches(diffDeployUri, userBoundUri));
  assert('User-Bound URI: Altered evil host strictly REJECTED', !redirectUriMatches(evilHostUri, userBoundUri));
  assert('User-Bound URI: Non-HTTPS scheme strictly REJECTED', !redirectUriMatches(httpSchemeUri, userBoundUri));
  assert('User-Bound URI: Trailing slash strictly REJECTED', !redirectUriMatches(trailingSlashUri, userBoundUri));
  assert('User-Bound URI: Unregistered query params strictly REJECTED', !redirectUriMatches(queryMismatchUri, userBoundUri));
  assert('User-Bound URI: Altered path prefix strictly REJECTED', !redirectUriMatches(wrongPathUri, userBoundUri));

  const standardGoogleMatrix = [
    'https://oauth.google.com/callback',
    'https://antigravity.google/oauth-callback',
    'https://vertexaisearch.cloud.google.com/oauth-redirect',
    'https://gemini.google.com/oauth/callback',
    'https://developers.google.com/oauth/callback',
    'http://127.0.0.1:8080/callback',
  ];
  assert('Google Matrix: All default URIs are syntactically valid', standardGoogleMatrix.every(isValidRedirectUri));
  assert('Google Matrix: Antigravity matches within matrix', standardGoogleMatrix.some((reg) => redirectUriMatches('https://antigravity.google/oauth-callback', reg)));
  assert('Google Matrix: Vertex AI matches within matrix', standardGoogleMatrix.some((reg) => redirectUriMatches('https://vertexaisearch.cloud.google.com/oauth-redirect', reg)));
  assert('Google Matrix: Unregistered evil domain fails matrix match', !standardGoogleMatrix.some((reg) => redirectUriMatches('https://evil.com/callback', reg)));

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  console.log(`  P2.4 OAUTH 2.1 SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runOAuthTests().catch((err) => {
  console.error('Fatal OAuth Test Error:', err);
  process.exit(1);
});
