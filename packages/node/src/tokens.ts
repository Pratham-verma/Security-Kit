import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Unguessable token from the CSPRNG (default 256 bits), base64url-encoded. Controls SESS-C6, AUTH-C7. */
export function randomToken(bytes = 32): string {
  if (bytes < 16) throw new RangeError('Use at least 16 bytes (128 bits)');
  return randomBytes(bytes).toString('base64url');
}

/** Numeric one-time code from the CSPRNG, zero-padded. Control AUTH-C7. */
export function generateOtp(digits = 6): string {
  if (digits < 6 || digits > 10) throw new RangeError('Use 6 to 10 digits');
  return String(randomInt(0, 10 ** digits)).padStart(digits, '0');
}

/**
 * Constant-time comparison for secrets of any length (OTP codes, API keys, tokens).
 * Both values are hashed first so neither length nor content leaks through timing.
 */
export function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
