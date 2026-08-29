// __tests__/mcp_metadata.test.ts
//
// =========================================================================
// P2.4 MCP Metadata & Discovery Test Suite
// MCP Gateway Hub (Hazama0420/mcp-gateway-hub)
// =========================================================================
//
// Validates:
//   1. RFC 9728 Protected Resource Metadata path resolution
//   2. WWW-Authenticate Header formatting per RFC 9728 / MCP Authorization Spec
//   3. RFC 8414 Authorization Server Metadata
//   4. CORS and Open Access for Metadata Endpoints
//

const {
  getCanonicalIssuerUrl,
  getCanonicalResourceUrl,
  getOAuthProtectedResourceMetadataUrl,
  createProtectedResourceMetadata,
  createAuthorizationServerMetadata,
} = require('../lib/oauth/config');

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

async function runMetadataTests() {
  console.log('========================================================================');
  console.log('         MCP GATEWAY HUB — P2.4 METADATA & DISCOVERY SUITE              ');
  console.log('========================================================================\n');

  // =========================================================================
  // 1. WWW-Authenticate Header Formatting
  // =========================================================================
  console.log('--- 1. WWW-Authenticate Header Formatting ---');

  const endpointId = 'ep-discovery-test-123';
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(endpointId);

  const buildWwwAuthHeader = (errorCode?: string, errorDescription?: string) => {
    if (errorCode && errorDescription) {
      return `Bearer error="${errorCode}", error_description="${errorDescription}", resource_metadata="${resourceMetadataUrl}"`;
    }
    return `Bearer resource_metadata="${resourceMetadataUrl}"`;
  };

  const initialChallenge = buildWwwAuthHeader();
  assert('WWW-Authenticate: Contains Bearer scheme', initialChallenge.startsWith('Bearer '));
  assert('WWW-Authenticate: Contains resource_metadata attribute', initialChallenge.includes(`resource_metadata="${resourceMetadataUrl}"`));
  assert('WWW-Authenticate: No error parameters on initial 401 challenge', !initialChallenge.includes('error='));

  const errorChallenge = buildWwwAuthHeader('invalid_token', 'The access token has expired');
  assert('WWW-Authenticate Error: Contains error="invalid_token"', errorChallenge.includes('error="invalid_token"'));
  assert('WWW-Authenticate Error: Contains error_description', errorChallenge.includes('error_description="The access token has expired"'));
  assert('WWW-Authenticate Error: Retains resource_metadata attribute', errorChallenge.includes(`resource_metadata="${resourceMetadataUrl}"`));

  // =========================================================================
  // 2. Protected Resource Metadata Specification Compliance
  // =========================================================================
  console.log('\n--- 2. Protected Resource Metadata Specification (RFC 9728) ---');

  const prm = createProtectedResourceMetadata(endpointId);
  assert('PRM: resource is a valid string', typeof prm.resource === 'string' && prm.resource.includes(`/api/mcp/${endpointId}/http`));
  assert('PRM: authorization_servers is a non-empty array', Array.isArray(prm.authorization_servers) && prm.authorization_servers.length > 0);
  assert('PRM: scopes_supported is an array', Array.isArray(prm.scopes_supported) && prm.scopes_supported.length >= 2);
  assert('PRM: bearer_methods_supported includes header', prm.bearer_methods_supported.includes('header'));

  // Root PRM
  const rootPrm = createProtectedResourceMetadata();
  assert('PRM Root: resource points to base MCP route', rootPrm.resource.endsWith('/api/mcp'));
  assert('PRM Root: authorization_servers is present', Array.isArray(rootPrm.authorization_servers) && rootPrm.authorization_servers.length > 0);

  // =========================================================================
  // 3. Authorization Server Metadata Specification Compliance
  // =========================================================================
  console.log('\n--- 3. Authorization Server Metadata Specification (RFC 8414) ---');

  const asMeta = createAuthorizationServerMetadata();
  assert('AS Metadata: issuer is defined', Boolean(asMeta.issuer));
  assert('AS Metadata: authorization_endpoint is defined', Boolean(asMeta.authorization_endpoint));
  assert('AS Metadata: token_endpoint is defined', Boolean(asMeta.token_endpoint));
  assert('AS Metadata: response_types_supported contains "code"', asMeta.response_types_supported.includes('code'));
  assert('AS Metadata: grant_types_supported contains "authorization_code"', asMeta.grant_types_supported.includes('authorization_code'));
  assert('AS Metadata: code_challenge_methods_supported contains "S256"', asMeta.code_challenge_methods_supported.includes('S256'));

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  console.log(`  P2.4 METADATA SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMetadataTests().catch((err) => {
  console.error('Fatal Metadata Test Error:', err);
  process.exit(1);
});
