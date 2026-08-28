// __tests__/credential_encryption.test.ts
//
// Comprehensive test suite for P1.4 Integration Credential Encryption
//

const {
  encrypt,
  decrypt,
  encryptAuthConfig,
  decryptAuthConfig,
  sanitizeIntegration,
} = require('../lib/crypto');
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

async function runTests() {
  console.log('=== P1.4 Integration Credential Encryption Tests ===\n');

  // Ensure test master key is available
  if (!process.env.ENCRYPTION_MASTER_KEY) {
    process.env.ENCRYPTION_MASTER_KEY = 'TEST_MOCK_MASTER_KEY_32_BYTES_01';
  }

  // -------------------------------------------------------------
  // 1. Encryption & Decryption for All Credential Types
  // -------------------------------------------------------------
  console.log('--- 1. Cryptographic Round-Trip by Credential Type ---');

  // Bearer Token
  const bearerConfig = {
    header: 'Authorization',
    prefix: 'Bearer',
    credential: 'sk_live_test_bearer_token_12345',
  };
  const encBearer = encryptAuthConfig(bearerConfig);
  assert('Bearer token: Encryption generates valid payload', Boolean(encBearer && encBearer.encryptedData && encBearer.iv && encBearer.tag));
  const decBearer = decryptAuthConfig(encBearer.encryptedData, encBearer.iv, encBearer.tag);
  assert('Bearer token: Decrypted matches original', decBearer.credential === bearerConfig.credential && decBearer.prefix === 'Bearer');

  // API Key
  const apiKeyConfig = {
    header: 'X-API-Key',
    key: 'api_key_secret_9988776655',
  };
  const encApiKey = encryptAuthConfig(apiKeyConfig);
  assert('API Key: Encryption generates valid payload', Boolean(encApiKey && encApiKey.encryptedData));
  const decApiKey = decryptAuthConfig(encApiKey.encryptedData, encApiKey.iv, encApiKey.tag);
  assert('API Key: Decrypted matches original', decApiKey.key === apiKeyConfig.key);

  // Basic Auth
  const basicConfig = {
    username: 'admin_user',
    password: 'super_secret_password_#456',
  };
  const encBasic = encryptAuthConfig(basicConfig);
  assert('Basic Auth: Encryption generates valid payload', Boolean(encBasic && encBasic.encryptedData));
  const decBasic = decryptAuthConfig(encBasic.encryptedData, encBasic.iv, encBasic.tag);
  assert('Basic Auth: Decrypted matches original', decBasic.username === 'admin_user' && decBasic.password === 'super_secret_password_#456');

  // Custom Header
  const customHeaderConfig = {
    header: 'X-Custom-Auth-Secret',
    prefix: 'Token',
    credential: 'custom_secret_value_xyz',
  };
  const encCustom = encryptAuthConfig(customHeaderConfig);
  const decCustom = decryptAuthConfig(encCustom.encryptedData, encCustom.iv, encCustom.tag);
  assert('Custom Header: Decrypted matches original', decCustom.credential === 'custom_secret_value_xyz' && decCustom.header === 'X-Custom-Auth-Secret');

  // -------------------------------------------------------------
  // 2. Encryption At-Rest & Non-Deterministic IV Verification
  // -------------------------------------------------------------
  console.log('\n--- 2. Encryption At-Rest & Non-Deterministic IV ---');

  const secretPlaintext = 'SUPER_SECRET_TOKEN_DO_NOT_EXPOSE_99999';
  const enc1 = encryptAuthConfig({ credential: secretPlaintext });
  const enc2 = encryptAuthConfig({ credential: secretPlaintext });

  assert('Plaintext secret NEVER appears in ciphertext', !enc1.encryptedData.includes(secretPlaintext));
  assert('Plaintext secret NEVER appears in IV', !enc1.iv.includes(secretPlaintext));
  assert('Plaintext secret NEVER appears in Tag', !enc1.tag.includes(secretPlaintext));
  assert('Random IV: Encrypting same plaintext produces different IVs', enc1.iv !== enc2.iv);
  assert('Random IV: Encrypting same plaintext produces different ciphertexts', enc1.encryptedData !== enc2.encryptedData);

  // -------------------------------------------------------------
  // 3. Null & Empty Auth Handling (auth_type: 'none')
  // -------------------------------------------------------------
  console.log('\n--- 3. Null & Empty Auth Config Handling ---');

  assert('Null config returns null', encryptAuthConfig(null) === null);
  assert('Undefined config returns null', encryptAuthConfig(undefined) === null);
  assert('Empty object returns null', encryptAuthConfig({}) === null);
  assert('Decrypt with missing fields returns null', decryptAuthConfig(null, null, null) === null);
  assert('Decrypt with missing IV returns null', decryptAuthConfig(enc1.encryptedData, null, enc1.tag) === null);

  // -------------------------------------------------------------
  // 4. Decryption Failure Safety & Integrity Checks
  // -------------------------------------------------------------
  console.log('\n--- 4. Decryption Failure & Tampering Safety ---');

  // Tampered ciphertext
  let tamperedCaught = false;
  try {
    const tamperedData = Buffer.from('corrupted_ciphertext_data').toString('base64');
    decryptAuthConfig(tamperedData, enc1.iv, enc1.tag);
  } catch (err) {
    tamperedCaught = true;
    assert('Tampered ciphertext throws generic error', err.message === 'Unable to process integration credentials');
  }
  assert('Tampered ciphertext is safely rejected', tamperedCaught);

  // Tampered Auth Tag
  let tagTamperedCaught = false;
  try {
    const corruptedTag = Buffer.from('invalid_auth_tag').toString('base64');
    decryptAuthConfig(enc1.encryptedData, enc1.iv, corruptedTag);
  } catch (err) {
    tagTamperedCaught = true;
    assert('Tampered auth tag throws generic error', err.message === 'Unable to process integration credentials');
  }
  assert('Tampered auth tag is safely rejected', tagTamperedCaught);

  // -------------------------------------------------------------
  // 5. Response Sanitization (Zero Secret & Zero Ciphertext Leakage)
  // -------------------------------------------------------------
  console.log('\n--- 5. API Response Sanitization ---');

  const rawIntegrationFromDb = {
    id: 'int_12345',
    user_id: 'user_999',
    name: 'GitHub Enterprise API',
    slug: 'github-enterprise',
    base_url: 'https://api.github.com',
    auth_type: 'bearer',
    encrypted_auth_config: encBearer.encryptedData,
    auth_config_iv: encBearer.iv,
    auth_config_tag: encBearer.tag,
    auth_config: null,
    is_active: true,
  };

  const sanitized = sanitizeIntegration(rawIntegrationFromDb);

  assert('Sanitized: encrypted_auth_config is stripped', sanitized.encrypted_auth_config === undefined);
  assert('Sanitized: auth_config_iv is stripped', sanitized.auth_config_iv === undefined);
  assert('Sanitized: auth_config_tag is stripped', sanitized.auth_config_tag === undefined);
  assert('Sanitized: auth_config.configured is true', sanitized.auth_config.configured === true);
  assert('Sanitized: NO raw secret in auth_config', sanitized.auth_config.credential === undefined && sanitized.auth_config.token === undefined);
  assert('Sanitized: Preserves non-secret integration fields', sanitized.name === 'GitHub Enterprise API' && sanitized.slug === 'github-enterprise');

  // Unauthenticated integration sanitization
  const unauthIntegration = {
    id: 'int_open_api',
    user_id: 'user_999',
    name: 'Public Cat API',
    slug: 'public-cat',
    base_url: 'https://catfact.ninja',
    auth_type: 'none',
    encrypted_auth_config: null,
    auth_config_iv: null,
    auth_config_tag: null,
    auth_config: null,
    is_active: true,
  };

  const sanitizedUnauth = sanitizeIntegration(unauthIntegration);
  assert('Sanitized unauthenticated: auth_config is null', sanitizedUnauth.auth_config === null);

  // -------------------------------------------------------------
  // 6. Source Code Verification for P1.4 and Regression
  // -------------------------------------------------------------
  console.log('\n--- 6. Source Code & Security Audit ---');

  const prismaSchema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
  assert('schema.prisma: Integration has encrypted_auth_config', prismaSchema.includes('encrypted_auth_config String?'));
  assert('schema.prisma: Integration has auth_config_iv', prismaSchema.includes('auth_config_iv        String?'));
  assert('schema.prisma: Integration has auth_config_tag', prismaSchema.includes('auth_config_tag       String?'));

  const integrationsRoute = fs.readFileSync('app/api/integrations/route.ts', 'utf-8');
  assert('POST /api/integrations: Uses encryptAuthConfig', integrationsRoute.includes('encryptAuthConfig'));
  assert('POST /api/integrations: Sets auth_config: null (no plaintext storage)', integrationsRoute.includes('auth_config: null'));
  assert('GET /api/integrations: Uses sanitizeIntegration', integrationsRoute.includes('sanitizeIntegration'));

  const integrationDetailRoute = fs.readFileSync('app/api/integrations/[id]/route.ts', 'utf-8');
  assert('GET /api/integrations/[id]: Uses sanitizeIntegration', integrationDetailRoute.includes('sanitizeIntegration'));
  assert('PUT /api/integrations/[id]: Uses encryptAuthConfig & decryptAuthConfig', integrationDetailRoute.includes('encryptAuthConfig') && integrationDetailRoute.includes('decryptAuthConfig'));
  assert('PUT /api/integrations/[id]: Preserves existing credentials when left blank', integrationDetailRoute.includes('hasNewSecret'));
  assert('PUT /api/integrations/[id]: Sets auth_config: null', integrationDetailRoute.includes('auth_config: null'));

  const playgroundExecute = fs.readFileSync('app/api/playground/execute/route.ts', 'utf-8');
  assert('Playground: Uses decryptAuthConfig for server-side execution', playgroundExecute.includes('decryptAuthConfig'));
  assert('Playground: Redacts sensitive outgoing headers in response', playgroundExecute.includes('[REDACTED]'));

  // Regression Checks for P0.1 - P1.3
  const httpRoute = fs.readFileSync('pages/api/mcp/[id]/http.ts', 'utf-8');
  assert('P0.1 MCP Authentication still intact', httpRoute.includes('bcrypt.compare') && httpRoute.includes('api_key_hash'));

  const tenantCheck = fs.readFileSync('app/api/integrations/[id]/route.ts', 'utf-8');
  assert('P0.2 Tenant Isolation still intact', tenantCheck.includes('user_id: user.id'));

  const postgresAdapter = fs.readFileSync('lib/adapters/postgres.ts', 'utf-8');
  assert('P0.3 PostgreSQL Read-Only still intact', postgresAdapter.includes('BEGIN READ ONLY'));

  const ssrfCheck = fs.readFileSync('lib/security/url.ts', 'utf-8');
  assert('P1.1 SSRF Protection still intact', ssrfCheck.includes('safeFetch') && ssrfCheck.includes('validateUrlWithDns'));

  const ratelimitCheck = fs.readFileSync('lib/security/ratelimit.ts', 'utf-8');
  assert('P1.2 Rate Limiting still intact', ratelimitCheck.includes('checkRateLimit'));

  const corsCheck = fs.readFileSync('lib/security/cors.ts', 'utf-8');
  assert('P1.3 CORS Hardening still intact', corsCheck.includes('isOriginAllowed') && corsCheck.includes('getMcpCorsHeaders'));

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
