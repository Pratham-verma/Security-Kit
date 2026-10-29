import { createHash } from 'node:crypto';
import { hash, parseOptions, verify } from '@node-rs/argon2';

/** OWASP Password Storage Cheat Sheet minimum for Argon2id (m=19 MiB, t=2, p=1). Control AUTH-C2. */
export const ARGON2ID_PARAMS = { algorithm: 2 /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** Inputs longer than this are rejected before hashing, to bound CPU and memory per request. */
export const MAX_PASSWORD_LENGTH = 1024;

/** Hash a password with Argon2id. Store the returned PHC string as-is. Control AUTH-C2. */
export async function hashPassword(password: string): Promise<string> {
  if (password.length > MAX_PASSWORD_LENGTH) throw new RangeError('Password too long');
  return hash(password, ARGON2ID_PARAMS);
}

/** Verify a password against a stored hash. Returns false (never throws) for malformed hashes. Control AUTH-C2. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** True if the hash is not Argon2id or uses weaker parameters than ARGON2ID_PARAMS; rehash after a successful login. */
export function needsRehash(stored: string): boolean {
  try {
    const p = parseOptions(stored);
    return (
      p.algorithm !== ARGON2ID_PARAMS.algorithm ||
      p.memoryCost < ARGON2ID_PARAMS.memoryCost ||
      p.timeCost < ARGON2ID_PARAMS.timeCost ||
      p.parallelism < ARGON2ID_PARAMS.parallelism
    );
  } catch {
    return true; // not an Argon2 hash (e.g. legacy bcrypt/sha) -> migrate
  }
}

export interface PasswordPolicyOptions {
  minLength?: number;
  maxLength?: number;
  /** Values the password must not contain, e.g. the user's email, username or the app name. */
  context?: string[];
}

export interface PasswordPolicyResult {
  ok: boolean;
  problems: string[];
}

/**
 * NIST SP 800-63B style policy: length limits and context checks, no composition rules.
 * Pair with isPwnedPassword() for the breached-password check. Control AUTH-C3.
 */
export function checkPasswordPolicy(password: string, opts: PasswordPolicyOptions = {}): PasswordPolicyResult {
  const { minLength = 12, maxLength = 128, context = [] } = opts;
  const length = [...password].length; // count code points, not UTF-16 units
  const problems: string[] = [];
  if (length < minLength) problems.push(`Use at least ${minLength} characters.`);
  if (length > maxLength) problems.push(`Use at most ${maxLength} characters.`);
  const lower = password.toLowerCase();
  for (const value of context) {
    for (const part of value.toLowerCase().split(/[@.\s_-]+/)) {
      if (part.length >= 4 && lower.includes(part)) {
        problems.push('Do not include your name, email or username.');
        return { ok: false, problems };
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

export interface PwnedOptions {
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * Check the Have I Been Pwned range API with k-anonymity: only the first 5 hex characters of the
 * SHA-1 hash leave the server. Throws on network errors so the caller decides whether to fail open
 * or closed. Control AUTH-C3.
 */
export async function isPwnedPassword(password: string, opts: PwnedOptions = {}): Promise<boolean> {
  // SHA-1 is required by the HIBP API; it is only used for this lookup, never to store passwords.
  const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase(); // nosemgrep
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  const res = await (opts.fetch ?? fetch)(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { 'Add-Padding': 'true', 'User-Agent': 'seckit-node' },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
  });
  if (!res.ok) throw new Error(`Pwned Passwords API returned ${res.status}`);
  const body = await res.text();
  for (const line of body.split('\n')) {
    const [hashSuffix, count] = line.trim().split(':');
    if (hashSuffix === suffix && Number(count) > 0) return true;
  }
  return false;
}
