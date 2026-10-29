import type { Middleware, Req } from './http.js';
import { reject } from './http.js';

export interface RateLimitHit {
  count: number;
  resetAt: number;
}

/** Shared stores (e.g. Redis) make limits work across several server instances. */
export interface RateLimitStore {
  hit(key: string, windowMs: number): RateLimitHit | Promise<RateLimitHit>;
}

/** In-process fixed-window store. Limits are per instance; use a shared store behind a load balancer. */
export class MemoryStore implements RateLimitStore {
  private readonly windows = new Map<string, RateLimitHit>();
  private hits = 0;

  hit(key: string, windowMs: number): RateLimitHit {
    const now = Date.now();
    if (++this.hits % 1000 === 0) {
      for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k);
    }
    let w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      w = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, w);
    }
    w.count++;
    return { ...w };
  }
}

/**
 * Uses req.ip (Express sets it from X-Forwarded-For only when "trust proxy" is configured)
 * and never parses X-Forwarded-For itself, which clients can spoof.
 */
export function clientIp(req: Req): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  /** Key per client; for login, combine IP and account, e.g. (req) => `${clientIp(req)}:${req.body.email}`. */
  key?: (req: Req) => string;
  store?: RateLimitStore;
}

/** Fixed-window rate limiting with standard RateLimit headers and 429 responses. Controls AUTH-C1, API-C4. */
export function rateLimit(opts: RateLimitOptions = {}): Middleware {
  const { windowMs = 60_000, max = 60, key = clientIp, store = new MemoryStore() } = opts;
  return (req, res, next) => {
    Promise.resolve(store.hit(key(req), windowMs)).then(
      ({ count, resetAt }) => {
        const resetSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
        res.setHeader('RateLimit-Limit', String(max));
        res.setHeader('RateLimit-Remaining', String(Math.max(0, max - count)));
        res.setHeader('RateLimit-Reset', String(resetSeconds));
        if (count > max) {
          res.setHeader('Retry-After', String(resetSeconds));
          return reject(res, 429, 'Too Many Requests');
        }
        next();
      },
      (err: unknown) => next(err),
    );
  };
}
