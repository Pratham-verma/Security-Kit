/** Key fragments that mark a value as sensitive (matched case-insensitively, ignoring "-" and "_"). */
export const SENSITIVE_KEY_PARTS = [
  'password', 'passwd', 'secret', 'token', 'apikey', 'authorization', 'cookie', 'privatekey', 'cvv', 'cvc',
  'cardnumber', 'creditcard', 'ssn', 'otp', 'pin', 'sessionid',
];

const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

export interface RedactOptions {
  /** Extra key fragments to treat as sensitive. */
  keys?: string[];
  replacement?: string;
}

/**
 * Deep copy of a value with sensitive fields replaced, for logs and error reports. Also masks
 * JWTs and Bearer/Basic credentials inside strings. Controls LOG-C2, SEC-C6.
 */
export function redact<T>(value: T, opts: RedactOptions = {}): T {
  const parts = [...SENSITIVE_KEY_PARTS, ...(opts.keys ?? [])].map((k) => k.toLowerCase().replace(/[-_]/g, ''));
  const replacement = opts.replacement ?? '[REDACTED]';
  const sensitive = (key: string) => {
    const k = key.toLowerCase().replace(/[-_]/g, '');
    return parts.some((p) => (p.length <= 3 ? k === p : k.includes(p)));
  };
  const seen = new WeakSet<object>();

  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(JWT, replacement).replace(BEARER, `$1 ${replacement}`);
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return '[Circular]';
    seen.add(v);
    if (v instanceof Error) return { name: v.name, message: walk(v.message) };
    if (Array.isArray(v)) return v.map(walk);
    if (v instanceof Date) return v;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = sensitive(k) ? replacement : walk(val);
    return out;
  };
  return walk(value) as T;
}
