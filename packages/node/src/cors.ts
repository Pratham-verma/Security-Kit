import { header, type Middleware, normalizeOrigin } from './http.js';

export interface StrictCorsOptions {
  /** Exact origins allowed, e.g. ["https://app.example.com"]. Wildcards are not supported on purpose. */
  origins: string[];
  credentials?: boolean;
  methods?: string[];
  allowedHeaders?: string[];
  maxAgeSeconds?: number;
}

/** CORS with an exact allow-list: never reflects unknown origins, never allows "null". Control API-C6. */
export function strictCors(opts: StrictCorsOptions): Middleware {
  const allowed = new Set<string>();
  for (const o of opts.origins) {
    const n = normalizeOrigin(o);
    if (!n || o.includes('*')) throw new Error(`strictCors: invalid origin "${o}" (use exact https:// origins)`);
    allowed.add(n);
  }
  const methods = (opts.methods ?? ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']).join(', ');
  const headers = (opts.allowedHeaders ?? ['Content-Type', 'Authorization']).join(', ');

  return (req, res, next) => {
    res.setHeader('Vary', 'Origin');
    const origin = header(req, 'origin');
    const ok = origin !== undefined && allowed.has(normalizeOrigin(origin) ?? '');
    if (ok) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      if (opts.credentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS' && header(req, 'access-control-request-method')) {
      if (ok) {
        res.setHeader('Access-Control-Allow-Methods', methods);
        res.setHeader('Access-Control-Allow-Headers', headers);
        res.setHeader('Access-Control-Max-Age', String(opts.maxAgeSeconds ?? 600));
      }
      res.statusCode = 204;
      res.end();
      return;
    }
    next();
  };
}
