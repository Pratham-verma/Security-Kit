/**
 * The __Host- prefix makes browsers require Secure, Path=/ and no Domain attribute,
 * so subdomains cannot overwrite the cookie. Control SESS-C1.
 */
export const SESSION_COOKIE_NAME = '__Host-session';

export interface SessionCookieOptions {
  maxAgeMs?: number;
  sameSite?: 'lax' | 'strict';
}

/** Options for res.cookie() / express-session `cookie`: Secure, HttpOnly, SameSite, Path=/. Control SESS-C1. */
export function sessionCookieOptions(opts: SessionCookieOptions = {}) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: opts.sameSite ?? 'lax',
    path: '/',
    ...(opts.maxAgeMs !== undefined ? { maxAge: opts.maxAgeMs } : {}),
  } as const;
}
