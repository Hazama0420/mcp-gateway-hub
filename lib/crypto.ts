// lib/crypto.ts

import * as crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // bytes (recommended for GCM)
const TAG_LENGTH = 16; // bytes (authentication tag)

/**
 * Retrieves the master key from environment variables.
 * Ensures ENCRYPTION_MASTER_KEY is a 32-character string (256-bit).
 */
function getMasterKey(): Buffer {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_MASTER_KEY is not defined in environment variables');
  }
  const keyBuffer = Buffer.from(key, 'utf-8');
  if (keyBuffer.length !== 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must be exactly 32 characters (256-bit)');
  }
  return keyBuffer;
}

/**
 * Encrypts text using AES-256-GCM.
 * @param plainText - Text to encrypt (e.g. JSON string).
 * @returns Object containing IV, tag, and encrypted data (all base64).
 */
export function encrypt(plainText: string): { iv: string; tag: string; encryptedData: string } {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf-8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    encryptedData: encrypted.toString('base64'),
  };
}

/**
 * Decrypts AES-256-GCM encrypted data.
 * @param encryptedData - Encrypted data in base64.
 * @param iv - Initialization Vector in base64.
 * @param tag - Authentication Tag in base64.
 * @returns Plaintext string.
 */
export function decrypt(encryptedData: string, iv: string, tag: string): string {
  try {
    const key = getMasterKey();
    const ivBuffer = Buffer.from(iv, 'base64');
    const tagBuffer = Buffer.from(tag, 'base64');
    const encryptedBuffer = Buffer.from(encryptedData, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tagBuffer);

    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final(),
    ]);

    return decrypted.toString('utf-8');
  } catch (error) {
    // Fail safely without leaking crypto internals or stack traces
    throw new Error('Unable to process integration credentials');
  }
}

/**
 * Safely encrypts an auth config object into AES-256-GCM encrypted fields.
 */
export function encryptAuthConfig(config: Record<string, any> | string | null | undefined): {
  encryptedData: string;
  iv: string;
  tag: string;
} | null {
  if (!config) return null;

  let configObj: Record<string, any>;
  if (typeof config === 'string') {
    try {
      configObj = JSON.parse(config);
    } catch {
      configObj = { credential: config };
    }
  } else {
    configObj = config;
  }

  if (Object.keys(configObj).length === 0) {
    return null;
  }

  const plainText = JSON.stringify(configObj);
  return encrypt(plainText);
}

/**
 * Safely decrypts an auth config from encrypted fields.
 */
export function decryptAuthConfig(
  encryptedData: string | null | undefined,
  iv: string | null | undefined,
  tag: string | null | undefined
): Record<string, any> | null {
  if (!encryptedData || !iv || !tag) {
    return null;
  }

  const decryptedJson = decrypt(encryptedData, iv, tag);
  try {
    return JSON.parse(decryptedJson);
  } catch {
    return { credential: decryptedJson };
  }
}

/**
 * Sanitizes an integration object for browser/client API responses.
 * Strictly strips all ciphertext, IV, tag, and plaintext secrets.
 * Exposes only safe metadata: auth_type, configured status, and non-secret headers/prefixes.
 */
export function sanitizeIntegration(integration: any): any {
  if (!integration) return null;

  const {
    encrypted_auth_config,
    auth_config_iv,
    auth_config_tag,
    auth_config: legacyAuthConfig,
    secret,
    credential,
    token,
    password,
    key,
    apiKey,
    connectionString,
    ...safe
  } = integration;

  const hasEncryptedCredential = Boolean(
    encrypted_auth_config && auth_config_iv && auth_config_tag
  );
  const hasLegacyCredential = Boolean(
    legacyAuthConfig &&
    (typeof legacyAuthConfig === 'object' ? Object.keys(legacyAuthConfig).length > 0 : Boolean(legacyAuthConfig))
  );

  const isConfigured = hasEncryptedCredential || hasLegacyCredential;

  let safeAuthConfig: Record<string, any> | null = null;

  if (safe.auth_type && safe.auth_type !== 'none') {
    safeAuthConfig = {
      configured: isConfigured,
    };

    // If legacy auth_config has non-secret metadata (header, prefix), expose only those non-secret keys
    if (legacyAuthConfig && typeof legacyAuthConfig === 'object') {
      if (typeof legacyAuthConfig.header === 'string') safeAuthConfig.header = legacyAuthConfig.header;
      if (typeof legacyAuthConfig.prefix === 'string') safeAuthConfig.prefix = legacyAuthConfig.prefix;
      if (typeof legacyAuthConfig.headerName === 'string') safeAuthConfig.headerName = legacyAuthConfig.headerName;
    }
  }

  return {
    ...safe,
    auth_config: safeAuthConfig,
  };
}