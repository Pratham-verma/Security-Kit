import type { Req, Res } from '../src/http.js';

export function fakeReq(init: Partial<Req> & { headers?: Req['headers'] } = {}): Req {
  return { method: 'GET', ip: '203.0.113.7', ...init, headers: init.headers ?? {} };
}

export function fakeRes() {
  const headers = new Map<string, unknown>();
  const res: Res & { headers: Map<string, unknown>; body?: string; ended: boolean } = {
    statusCode: 200,
    headers,
    ended: false,
    locals: {},
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader: (name) => headers.get(name.toLowerCase()),
    removeHeader(name) {
      headers.delete(name.toLowerCase());
    },
    end(body) {
      res.body = body;
      res.ended = true;
    },
  };
  return res;
}

/** Run one middleware; resolves with whether next() was called. */
export function run(mw: (req: Req, res: Res, next: (e?: unknown) => void) => void, req: Req, res: Res) {
  return new Promise<{ next: boolean; err?: unknown }>((resolve) => {
    mw(req, res, (err) => resolve({ next: true, err }));
    setImmediate(() => resolve({ next: false }));
  });
}
