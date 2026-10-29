import { randomBytes } from 'node:crypto';
import type { Middleware, Res } from './http.js';

export type CspDirectives = Record<string, string[]>;

export interface SecurityHeadersOptions {
  /** CSP directives merged over the defaults. "{nonce}" is replaced with the per-request nonce. false disables CSP. */
  csp?: false | { directives?: CspDirectives; reportOnly?: boolean };
  /** Enforce Trusted Types: the browser rejects HTML/script strings not created by an allowed policy (see @seckit/web). */
  trustedTypes?: boolean | { policies: string[] };
  hsts?: false | { maxAge?: number; includeSubDomains?: boolean; preload?: boolean };
  frameOptions?: 'DENY' | 'SAMEORIGIN';
  referrerPolicy?: string;
  crossOriginOpenerPolicy?: string | false;
  permissionsPolicy?: string | false;
}

export const DEFAULT_CSP: CspDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'nonce-{nonce}'"],
  'style-src': ["'self'", "'nonce-{nonce}'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
};

/** Build the security headers for one response. Controls WEB-C2, WEB-C3. */
export function buildSecurityHeaders(opts: SecurityHeadersOptions = {}, nonce?: string): Record<string, string> {
  const h: Record<string, string> = {};

  if (opts.csp !== false) {
    const directives: CspDirectives = { ...DEFAULT_CSP, ...opts.csp?.directives };
    if (opts.trustedTypes) {
      const policies = opts.trustedTypes === true ? ['seckit', 'dompurify'] : opts.trustedTypes.policies;
      directives['require-trusted-types-for'] = ["'script'"];
      directives['trusted-types'] = policies;
    }
    const value = Object.entries(directives)
      .map(([name, values]) => [name, ...values.map((v) => (nonce ? v.replace('{nonce}', nonce) : v))].join(' '))
      .filter((d) => !d.includes('{nonce}'))
      .join('; ');
    h[opts.csp?.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'] = value;
  }
  if (opts.hsts !== false) {
    const { maxAge = 31_536_000, includeSubDomains = true, preload = false } = opts.hsts ?? {};
    h['Strict-Transport-Security'] = `max-age=${maxAge}${includeSubDomains ? '; includeSubDomains' : ''}${preload ? '; preload' : ''}`;
  }
  h['X-Content-Type-Options'] = 'nosniff';
  h['X-Frame-Options'] = opts.frameOptions ?? 'DENY';
  h['Referrer-Policy'] = opts.referrerPolicy ?? 'strict-origin-when-cross-origin';
  if (opts.crossOriginOpenerPolicy !== false) h['Cross-Origin-Opener-Policy'] = opts.crossOriginOpenerPolicy ?? 'same-origin';
  if (opts.permissionsPolicy !== false) {
    h['Permissions-Policy'] = opts.permissionsPolicy ?? 'camera=(), microphone=(), geolocation=(), payment=()';
  }
  return h;
}

/**
 * Middleware that sets security headers, a per-request CSP nonce (res.locals.cspNonce) and removes
 * X-Powered-By. Controls WEB-C2, WEB-C3, API-C8.
 */
export function securityHeaders(opts: SecurityHeadersOptions = {}): Middleware {
  return (_req, res, next) => {
    const nonce = randomBytes(16).toString('base64');
    for (const [name, value] of Object.entries(buildSecurityHeaders(opts, nonce))) res.setHeader(name, value);
    res.removeHeader('X-Powered-By');
    if (res.locals) res.locals.cspNonce = nonce;
    next();
  };
}

/** Mark a response as uncacheable (pages or APIs with personal data). Control WEB-C8. */
export function noStore(res: Res): void {
  res.setHeader('Cache-Control', 'no-store');
}
