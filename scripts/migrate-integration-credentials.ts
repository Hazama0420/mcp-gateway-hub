// scripts/migrate-integration-credentials.ts
const { PrismaClient } = require('@prisma/client');
const { encryptAuthConfig, decryptAuthConfig } = require('../lib/crypto');
require('dotenv').config();

const prisma = new PrismaClient();

async function migrateIntegrationCredentials() {
  console.log('=== Starting Integration Credential Migration ===');

  const integrations = await prisma.integration.findMany({
    where: {
      auth_config: { not: null },
      encrypted_auth_config: null,
    },
  });

  console.log(`Found ${integrations.length} integration(s) requiring migration.`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const integration of integrations) {
    const { id, name, auth_type, auth_config } = integration;

    if (auth_type === 'none' || !auth_config) {
      // Clear legacy field for unauthenticated integrations
      await prisma.integration.update({
        where: { id },
        data: {
          auth_config: null,
          encrypted_auth_config: null,
          auth_config_iv: null,
          auth_config_tag: null,
        },
      });
      skippedCount++;
      continue;
    }

    // Encrypt the legacy auth_config
    const encrypted = encryptAuthConfig(auth_config);

    if (!encrypted) {
      console.warn(`[WARN] Could not encrypt auth_config for integration ID ${id}`);
      skippedCount++;
      continue;
    }

    // Verify round-trip decryption before persisting
    const decrypted = decryptAuthConfig(
      encrypted.encryptedData,
      encrypted.iv,
      encrypted.tag
    );

    if (!decrypted) {
      throw new Error(`[FAIL-SAFE] Integrity check failed during migration of integration ID ${id}`);
    }

    // Update database with encrypted fields and nullify legacy plaintext
    await prisma.integration.update({
      where: { id },
      data: {
        encrypted_auth_config: encrypted.encryptedData,
        auth_config_iv: encrypted.iv,
        auth_config_tag: encrypted.tag,
        auth_config: null, // Wipe legacy plaintext
      },
    });

    migratedCount++;
    console.log(`[MIGRATED] Integration "${name}" (ID: ${id}) credentials securely encrypted.`);
  }

  console.log(`=== Migration Completed: ${migratedCount} migrated, ${skippedCount} skipped ===\n`);
  return { migratedCount, skippedCount };
}

if (require.main === module) {
  migrateIntegrationCredentials()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

module.exports = { migrateIntegrationCredentials };
