// Minimal request/response shapes so the middleware works with Express, Connect and plain
// node:http without depending on any framework's types.
import type { IncomingHttpHeaders } from 'node:http';

export interface Req {
  method?: string;
  headers: IncomingHttpHeaders;
  ip?: string;
  socket?: { remoteAddress?: string };
}

export interface Res {
  statusCode: number;
  setHeader(name: string, value: string | number | readonly string[]): unknown;
  getHeader?(name: string): unknown;
  removeHeader(name: string): unknown;
  end(body?: string): unknown;
  locals?: Record<string, unknown>;
}

export type Next = (err?: unknown) => void;
export type Middleware = (req: Req, res: Res, next: Next) => void;

export function header(req: Req, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

export function reject(res: Res, status: number, message: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(message);
}

/** Normalize an origin for comparison: lowercase scheme and host, no trailing slash, default ports dropped. */
export function normalizeOrigin(origin: string): string | undefined {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.origin;
  } catch {
    return undefined;
  }
}
