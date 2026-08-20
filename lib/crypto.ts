// lib/crypto.ts

import * as crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // bytes (direkomendasikan untuk GCM)
const TAG_LENGTH = 16; // bytes (authentication tag)

/**
 * Mendapatkan master key dari environment variable.
 * Pastikan ENCRYPTION_MASTER_KEY adalah string 32 karakter (256-bit).
 */
function getMasterKey(): Buffer {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_MASTER_KEY is not defined in environment variables');
  }
  // Key harus 32 bytes (256 bit)
  const keyBuffer = Buffer.from(key, 'utf-8');
  if (keyBuffer.length !== 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must be exactly 32 characters (256-bit)');
  }
  return keyBuffer;
}

/**
 * Enkripsi teks menggunakan AES-256-GCM.
 * @param plainText - Teks yang akan dienkripsi (biasanya JSON string).
 * @returns Objek berisi IV, tag, dan encrypted data (semua dalam base64).
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
 * Dekripsi data terenkripsi dengan AES-256-GCM.
 * @param encryptedData - Data terenkripsi dalam base64.
 * @param iv - Initialization Vector dalam base64.
 * @param tag - Authentication Tag dalam base64.
 * @returns Teks plaintext asli (string).
 */
export function decrypt(encryptedData: string, iv: string, tag: string): string {
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
}