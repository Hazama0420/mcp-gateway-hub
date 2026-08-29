// lib/oauth/pkce.ts
import * as crypto from 'node:crypto';

/**
 * Base64URL encode without padding per RFC 7636.
 */
export function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generates an RFC 7636 S256 code challenge from a code verifier.
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier, 'utf8').digest();
  return base64UrlEncode(hash);
}

/**
 * Verifies a code verifier against an S256 challenge.
 * Strictly rejects 'plain' challenge method in OAuth 2.1 mode.
 */
export function verifyPkce(
  verifier: string | undefined | null,
  challenge: string | undefined | null,
  method: string = 'S256'
): boolean {
  if (!verifier || !challenge) {
    return false;
  }

  // OAuth 2.1 strictly requires S256; reject 'plain' or unknown methods
  if (method !== 'S256') {
    return false;
  }

  // Code verifier minimum length is 43 and maximum is 128 characters (RFC 7636)
  if (verifier.length < 43 || verifier.length > 128) {
    return false;
  }

  const expectedChallenge = generateCodeChallenge(verifier);

  const actualBuf = Buffer.from(challenge, 'utf8');
  const expectedBuf = Buffer.from(expectedChallenge, 'utf8');

  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}
