import { header, type Middleware, normalizeOrigin, reject } from './http.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface OriginCheckOptions {
  /** Your own site's origins, e.g. ["https://app.example.com"]. */
  allowedOrigins: string[];
}

/**
 * Stateless CSRF protection for cookie-authenticated apps: rejects state-changing requests that
 * browsers mark as cross-site (Sec-Fetch-Site) or whose Origin/Referer is not allowed.
 * Requests with neither header come from non-browser clients, which cannot carry out CSRF.
 * Control SESS-C2.
 */
export function originCheck(opts: OriginCheckOptions): Middleware {
  const allowed = new Set(opts.allowedOrigins.map((o) => normalizeOrigin(o)).filter((o): o is string => !!o));
  if (allowed.size === 0) throw new Error('originCheck: allowedOrigins must contain at least one origin');

  return (req, res, next) => {
    if (SAFE_METHODS.has((req.method ?? 'GET').toUpperCase())) return next();

    const site = header(req, 'sec-fetch-site');
    if (site === 'same-origin') return next();

    const origin = header(req, 'origin') ?? header(req, 'referer');
    if (origin !== undefined) {
      return allowed.has(normalizeOrigin(origin) ?? '') ? next() : reject(res, 403, 'Forbidden (cross-site request)');
    }
    // No Origin/Referer: allowed unless the browser told us it is cross-site.
    return site === 'cross-site' || site === 'same-site' ? reject(res, 403, 'Forbidden (cross-site request)') : next();
  };
}
