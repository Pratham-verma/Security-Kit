// Local HTTP server for the Security Kit UI. It can write files in the project, so it only listens on
// loopback, requires a per-session token on every API call, and checks Host and Origin so other web
// pages (including DNS-rebinding attacks) cannot drive it.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assistants,
  createContext,
  detect,
  discardManifest,
  exportAudit,
  exportChecklist,
  exportManifest,
  getCatalog,
  getChecklist,
  getPrompt,
  getSession,
  getState,
  preview,
  recordAttestation,
  runAudit,
  runGenerate,
  saveManifest,
  savePrompt,
  tickChecklist,
  type UiContext,
  UserError,
  warmUp,
} from './api.js';

export { createContext, type UiContext } from './api.js';

export interface UiServerOptions {
  dir: string;
  /** 0 picks a free port. */
  port?: number;
  /** Semgrep binary, or false to run built-in checks only. Default: $SECKIT_SEMGREP, then PATH. */
  semgrep?: string | false;
  /**
   * Address to listen on. Default 127.0.0.1. Only containers need 0.0.0.0 (the container's own
   * interface); publish the port to the host's loopback only: `-p 127.0.0.1:4777:4777`.
   */
  listen?: string;
  /** Fixed token (tests); default is 32 random bytes. */
  token?: string;
  /** Directory with index.html, styles.css and js/. Default: the built app next to this file. */
  publicDir?: string;
}

export interface UiServer {
  server: Server;
  /** Open this URL; the token travels in the fragment, which browsers never send to servers. */
  url: string;
  origin: string;
  token: string;
  context: UiContext;
  close(): Promise<void>;
}

const MAX_BODY_BYTES = 1_000_000;
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

/** Fingerprint of the browser app being served: changes whenever the app is rebuilt or updated. */
function buildId(publicDir: string): string {
  const hash = createHash('sha256');
  for (const file of ['index.html', 'styles.css', 'js/main.js']) {
    try {
      hash.update(readFileSync(resolve(publicDir, file)));
    } catch {
      hash.update(`missing:${file}`);
    }
  }
  return hash.digest('hex').slice(0, 16);
}

function defaultPublicDir(): string {
  return fileURLToPath(new URL('../public/', import.meta.url));
}

function send(res: ServerResponse, status: number, body: string | Buffer, type: string, extra: Record<string, string> = {}): void {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, ...extra });
  res.end(body);
}

const json = (res: ServerResponse, status: number, data: unknown) => send(res, status, JSON.stringify(data), 'application/json; charset=utf-8');

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new UserError('Request body too large.', [], 413);
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new UserError('Request body is not valid JSON.');
  }
}

function sameToken(given: string | undefined, token: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function serveStatic(res: ServerResponse, publicDir: string, pathname: string): void {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const base = resolve(publicDir);
  const file = resolve(base, normalize(rel));
  if (!file.startsWith(base + sep) || !TYPES[extname(file)] || !existsSync(file) || !statSync(file).isFile()) {
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    return;
  }
  send(res, 200, readFileSync(file), TYPES[extname(file)]!);
}

type Handler = (ctx: UiContext, body: unknown, query: URLSearchParams) => unknown;

const GET: Record<string, Handler> = {
  '/api/state': (ctx) => getState(ctx),
  '/api/session': (ctx) => getSession(ctx),
  '/api/catalog': (ctx) => getCatalog(ctx),
  '/api/detect': (ctx) => detect(ctx),
  '/api/assistants': (ctx) => assistants(ctx),
  '/api/checklist': (ctx) => getChecklist(ctx),
  '/api/prompt': (ctx, _body, query) => getPrompt(ctx, query),
};

const POST: Record<string, Handler> = {
  '/api/preview': (ctx, body) => preview(ctx, (body as { manifest?: unknown }).manifest),
  '/api/manifest': (ctx, body) => saveManifest(ctx, (body as { manifest?: unknown }).manifest),
  '/api/manifest/discard': (ctx) => discardManifest(ctx),
  '/api/generate': (ctx) => runGenerate(ctx),
  '/api/audit': (ctx) => runAudit(ctx),
  '/api/attest': (ctx, body) => recordAttestation(ctx, body as Record<string, unknown>),
  '/api/checklist': (ctx, body) => tickChecklist(ctx, body as Record<string, unknown>),
  '/api/prompt/save': (ctx, body) => savePrompt(ctx, body as Record<string, unknown>),
};

export async function startUiServer(opts: UiServerOptions): Promise<UiServer> {
  const context = createContext(opts.dir, { semgrep: opts.semgrep ?? (process.env.SECKIT_SEMGREP || undefined) });
  // SECKIT_UI_TOKEN gives a stable link across restarts (e.g. a long-running container); otherwise a new key per start.
  const fixed = opts.token ?? process.env.SECKIT_UI_TOKEN;
  if (fixed !== undefined && !/^[\w-]{24,}$/.test(fixed)) throw new Error('SECKIT_UI_TOKEN must be at least 24 letters, digits, "-" or "_".');
  const token = fixed ?? randomBytes(32).toString('base64url');
  const publicDir = opts.publicDir ?? defaultPublicDir();
  context.session = { buildId: buildId(publicDir), startedAt: new Date().toISOString() };
  warmUp(context);
  let allowedHosts = new Set<string>();
  let origin = '';

  const server = createServer(async (req, res) => {
    try {
      // DNS rebinding: a hostile domain resolving to 127.0.0.1 still sends its own name as Host.
      if (!allowedHosts.has(req.headers.host ?? '')) {
        send(res, 421, 'Misdirected request', 'text/plain; charset=utf-8');
        return;
      }
      const url = new URL(req.url ?? '/', origin);
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8');
          return;
        }
        serveStatic(res, publicDir, url.pathname);
        return;
      }

      if (!sameToken(req.headers['x-seckit-token'] as string | undefined, token)) {
        json(res, 401, { error: 'This page has an old or missing access key.', issues: ['expired-token'] });
        return;
      }
      const requestOrigin = req.headers.origin;
      if (requestOrigin !== undefined && !allowedHosts.has(requestOrigin.replace(/^http:\/\//, ''))) {
        json(res, 403, { error: 'Cross-origin request refused.' });
        return;
      }

      if (req.method === 'GET' && GET[url.pathname]) {
        json(res, 200, GET[url.pathname]!(context, undefined, url.searchParams));
        return;
      }
      const exporters: Record<string, () => { body: string; type: string; filename: string }> = {
        '/api/audit/export': () => exportAudit(context, url.searchParams.get('format') ?? 'json'),
        '/api/checklist/export': () => exportChecklist(context),
        '/api/manifest/export': () => exportManifest(context),
      };
      if (req.method === 'GET' && exporters[url.pathname]) {
        const out = exporters[url.pathname]!();
        send(res, 200, out.body, out.type, { 'Content-Disposition': `attachment; filename="${out.filename}"` });
        return;
      }
      if (req.method === 'POST' && POST[url.pathname]) {
        if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
          json(res, 415, { error: 'Send JSON.' });
          return;
        }
        const body = await readJson(req);
        json(res, 200, POST[url.pathname]!(context, body, url.searchParams));
        return;
      }
      json(res, 404, { error: 'Unknown API endpoint.' });
    } catch (e) {
      if (e instanceof UserError) {
        json(res, e.status, { error: e.message, issues: e.issues });
      } else {
        // Message only: stack traces stay in the terminal.
        console.error(e);
        json(res, 500, { error: (e as Error).message.split('\n')[0] ?? 'Unexpected error.' });
      }
    }
  });

  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(opts.port ?? 0, opts.listen ?? '127.0.0.1', () => done());
  });
  const { port } = server.address() as AddressInfo;
  allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  origin = `http://127.0.0.1:${port}`;

  return {
    server,
    url: `${origin}/#token=${token}`,
    origin,
    token,
    context,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

