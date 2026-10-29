import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { projectName } from '../src/server/api.js';
import { startUiServer, type UiServer } from '../src/server/server.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const TOKEN = 'test-token-0123456789abcdef';

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'seckit-ui-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  json: () => any;
}

/** Raw HTTP so tests can set Host/Origin freely (fetch forbids it). */
function call(ui: UiServer, method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; token?: string | null } = {}): Promise<Res> {
  const port = Number(new URL(ui.origin).port);
  const headers: Record<string, string> = { Host: `127.0.0.1:${port}`, ...opts.headers };
  if (opts.token !== null) headers['X-Seckit-Token'] = opts.token ?? TOKEN;
  const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  if (payload !== undefined) headers['Content-Type'] ??= 'application/json';
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => done({ status: res.statusCode!, headers: res.headers, body, json: () => JSON.parse(body) }));
    });
    req.on('error', fail);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

describe('seckit-ui server security', () => {
  let ui: UiServer;
  beforeAll(async () => {
    ui = await startUiServer({ dir: project({ 'package.json': '{"name":"x","dependencies":{"express":"^4"}}' }), token: TOKEN, publicDir: PUBLIC, semgrep: false });
  });
  afterAll(() => ui.close());

  it('rejects weak fixed tokens (SECKIT_UI_TOKEN)', async () => {
    await expect(startUiServer({ dir: tmpdir(), token: 'short', publicDir: PUBLIC, semgrep: false })).rejects.toThrow(/at least 24/);
  });

  it('listens on loopback and puts the token in the URL fragment only', () => {
    expect(ui.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(ui.url).toBe(`${ui.origin}/#token=${TOKEN}`);
  });

  it('serves the app with a strict CSP and no token needed for static files', async () => {
    const res = await call(ui, 'GET', '/', { token: null });
    expect(res.status).toBe(200);
    expect(res.body).toContain('<script type="module" src="/js/main.js">');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('refuses API calls without the right token', async () => {
    expect((await call(ui, 'GET', '/api/state', { token: null })).status).toBe(401);
    expect((await call(ui, 'GET', '/api/state', { token: 'wrong-token-0123456789abcde' })).status).toBe(401);
    expect((await call(ui, 'GET', '/api/state')).status).toBe(200);
  });

  it('blocks DNS rebinding (foreign Host) and cross-origin requests', async () => {
    expect((await call(ui, 'GET', '/api/state', { headers: { Host: 'evil.example:80' } })).status).toBe(421);
    expect((await call(ui, 'GET', '/', { headers: { Host: 'evil.example' }, token: null })).status).toBe(421);
    const cross = await call(ui, 'POST', '/api/generate', { body: {}, headers: { Origin: 'http://evil.example' } });
    expect(cross.status).toBe(403);
  });

  it('only accepts JSON bodies for writes, and never serves files outside the app', async () => {
    expect((await call(ui, 'POST', '/api/generate', { body: {}, headers: { 'Content-Type': 'text/plain' } })).status).toBe(415);
    expect((await call(ui, 'GET', '/../../package.json', { token: null })).status).toBe(404);
    expect((await call(ui, 'GET', '/%2e%2e/%2e%2e/package.json', { token: null })).status).toBe(404);
    expect((await call(ui, 'DELETE', '/', { token: null })).status).toBe(405);
  });
});

describe('seckit-ui API flow', () => {
  let ui: UiServer;
  let dir: string;
  beforeAll(async () => {
    dir = project({
      'package.json': JSON.stringify({ name: 'shop', dependencies: { express: '^4', pg: '^8', bcrypt: '^5' } }),
      'src/config.js': 'module.exports = { key: "AKIAIOSFODNN7EXAMPLE" };\n',
    });
    ui = await startUiServer({ dir, token: TOKEN, publicDir: PUBLIC, semgrep: false });
  });
  afterAll(() => ui.close());

  it('starts without a manifest and suggests one from detection', async () => {
    const state = (await call(ui, 'GET', '/api/state')).json();
    expect(state.manifest).toBeNull();
    expect(state.plan).toBeNull();
    const det = (await call(ui, 'GET', '/api/detect')).json();
    expect(det.suggested.components.map((c: { type: string }) => c.type)).toEqual(expect.arrayContaining(['auth', 'api', 'database']));
    const catalog = (await call(ui, 'GET', '/api/catalog')).json();
    expect(catalog.components.length).toBeGreaterThanOrEqual(12);
    expect(catalog.choices.platforms.map((c: { value: string }) => c.value)).toEqual(['web', 'backend', 'android', 'ios', 'cloud']);
  });

  it('previews and validates a draft without writing anything', async () => {
    const det = (await call(ui, 'GET', '/api/detect')).json();
    const ok = (await call(ui, 'POST', '/api/preview', { body: { manifest: det.suggested } })).json();
    expect(ok.valid).toBe(true);
    expect(ok.controls).toBeGreaterThan(10);
    const bad = (await call(ui, 'POST', '/api/preview', { body: { manifest: { version: 1, app: { name: 'x', platforms: [] }, components: [] } } })).json();
    expect(bad.valid).toBe(false);
    expect(bad.issues.length).toBeGreaterThan(0);
    expect((await call(ui, 'GET', '/api/state')).json().manifest).toBeNull();
  });

  it('saves the manifest, writes the plan, runs checks and records sign-offs', async () => {
    const det = (await call(ui, 'GET', '/api/detect')).json();
    const saved = await call(ui, 'POST', '/api/manifest', { body: { manifest: det.suggested } });
    expect(saved.status).toBe(200);
    expect(readFileSync(join(dir, 'seckit.yaml'), 'utf8')).toContain('name: shop');

    let state = (await call(ui, 'GET', '/api/state')).json();
    expect(state.plan.components.length).toBeGreaterThan(2);
    expect(state.staleFiles).toContain('.seckit/SECURITY-PLAN.md');

    const gen = (await call(ui, 'POST', '/api/generate', { body: {} })).json();
    expect(gen.files).toEqual(expect.arrayContaining([{ path: '.seckit/SECURITY-PLAN.md', change: 'created' }]));
    state = (await call(ui, 'GET', '/api/state')).json();
    expect(state.staleFiles).toEqual([]);

    const audit = (await call(ui, 'POST', '/api/audit', { body: {} })).json();
    const sec = audit.controls.find((c: { id: string }) => c.id === 'SEC-C1');
    expect(sec.status).toBe('fail');
    expect(JSON.stringify(audit)).not.toContain('AKIAIOSFODNN7EXAMPLE');
    const sarif = await call(ui, 'GET', '/api/audit/export?format=sarif');
    expect(JSON.parse(sarif.body).version).toBe('2.1.0');
    expect(sarif.headers['content-disposition']).toContain('seckit.sarif');

    const manual = audit.controls.find((c: { status: string }) => c.status === 'manual');
    const incomplete = await call(ui, 'POST', '/api/attest', { body: { id: manual.id, status: 'done' } });
    expect(incomplete.status).toBe(400);
    expect(incomplete.json().issues.join()).toMatch(/evidence/);
    const done = await call(ui, 'POST', '/api/attest', { body: { id: manual.id, status: 'done', evidence: 'Reviewed in PR 7', by: 'Reviewer' } });
    expect(done.status).toBe(200);
    state = (await call(ui, 'GET', '/api/state')).json();
    expect(state.attestations.items).toEqual([expect.objectContaining({ control: manual.id, status: 'done', by: 'Reviewer' })]);
    expect(state.lastAudit).toBeNull(); // statuses changed: the old result is dropped

    await call(ui, 'POST', '/api/attest', { body: { id: manual.id, remove: true } });
    expect((await call(ui, 'GET', '/api/state')).json().attestations.items).toEqual([]);
  });

  it('rejects invalid manifests with readable issues and keeps the old file', async () => {
    const res = await call(ui, 'POST', '/api/manifest', { body: { manifest: { version: 1, app: { name: 'shop', platforms: ['web'] }, components: [{ type: 'database', engine: 'nope' }] } } });
    expect(res.status).toBe(400);
    expect(res.json().issues.length).toBeGreaterThan(0);
    expect(readFileSync(join(dir, 'seckit.yaml'), 'utf8')).toContain('name: shop');
  });

  it('describes AI assistant files', async () => {
    const info = (await call(ui, 'GET', '/api/assistants')).json();
    expect(info.files.find((f: { id: string }) => f.id === 'agents_md')).toMatchObject({ configured: true, exists: true, path: 'AGENTS.md' });
  });
});

describe('projectName', () => {
  it('reads the name from project metadata, not the folder (which is "project" in Docker)', () => {
    expect(projectName(project({ 'package.json': '{"name":"@acme/shop"}' }))).toBe('shop');
    expect(projectName(project({ 'pyproject.toml': '[project]\nname = "billing-api"\nversion = "1"\n' }))).toBe('billing-api');
    expect(projectName(project({ 'pubspec.yaml': 'name: wallet_app\n' }))).toBe('wallet_app');
    expect(projectName(project({ 'pom.xml': '<project><parent><artifactId>spring-boot-starter-parent</artifactId></parent><artifactId>orders</artifactId></project>' }))).toBe('orders');
    expect(projectName(project({ 'settings.gradle.kts': 'rootProject.name = "payments"\n' }))).toBe('payments');
    const bare = project({ 'README.md': 'x' });
    expect(projectName(bare)).toBe(bare.split('/').pop());
  });
});

describe('seckit-ui checklist and AI prompt', () => {
  let ui: UiServer;
  let dir: string;
  beforeAll(async () => {
    dir = project({ 'package.json': JSON.stringify({ name: 'shop', dependencies: { express: '^4', pg: '^8', bcrypt: '^5' } }) });
    ui = await startUiServer({ dir, token: TOKEN, publicDir: PUBLIC, semgrep: false });
  });
  afterAll(() => ui.close());

  it('asks to describe the app first', async () => {
    const res = await call(ui, 'GET', '/api/checklist');
    expect(res.status).toBe(400);
    expect(res.json().error).toMatch(/Describe your app first/);
  });

  it('builds the checklist, saves ticks and exports Markdown', async () => {
    const det = (await call(ui, 'GET', '/api/detect')).json();
    await call(ui, 'POST', '/api/manifest', { body: { manifest: det.suggested } });
    const data = (await call(ui, 'GET', '/api/checklist')).json();
    const first = data.checklist.sections[0].items[0];
    expect(data.checklist.total).toBeGreaterThan(10);
    expect(first.check.length).toBeGreaterThan(0);
    expect(data.progress).toEqual({});

    const ticked = (await call(ui, 'POST', '/api/checklist', { body: { id: first.id, done: true } })).json();
    expect(ticked.progress[first.id]).toMatchObject({ done: true });
    expect(readFileSync(join(dir, '.seckit/checklist.yaml'), 'utf8')).toContain(`${first.id}:`);
    expect((await call(ui, 'GET', '/api/state')).json().checklistDone).toBe(1);

    const md = await call(ui, 'GET', '/api/checklist/export');
    expect(md.headers['content-disposition']).toContain('SECURITY-CHECKLIST.md');
    expect(md.body).toContain(`- [x] **${first.id}`);

    expect((await call(ui, 'POST', '/api/checklist', { body: { id: 'NOPE-C1', done: true } })).status).toBe(400);
    await call(ui, 'POST', '/api/checklist', { body: { id: first.id, done: false } });
    expect((await call(ui, 'GET', '/api/checklist')).json().progress).toEqual({});
  });

  it('returns the AI prompt in both modes and scopes, and saves it to the project', async () => {
    const full = (await call(ui, 'GET', '/api/prompt')).json();
    expect(full.mode).toBe('audit');
    expect(full.text).toMatch(/^# Security review and hardening — shop/);
    expect(full.items).toBe(full.counts.low);
    const build = (await call(ui, 'GET', '/api/prompt?mode=build&min=high')).json();
    expect(build.text).toMatch(/^# Security rules for building shop/);
    expect(build.items).toBe(full.counts.high);
    expect(build.items).toBeLessThan(full.items);
    const saved = (await call(ui, 'POST', '/api/prompt/save', { body: { mode: 'audit', min: 'critical' } })).json();
    expect(saved.saved).toBe('.seckit/AI-PROMPT.md');
    expect(readFileSync(join(dir, '.seckit/AI-PROMPT.md'), 'utf8')).toContain('(critical only)');
  });
});

describe('seckit-ui session (restart and update detection)', () => {
  it('reports a build ID that is stable across restarts and changes when the app changes', async () => {
    const pub = mkdtempSync(join(tmpdir(), 'seckit-pub-'));
    for (const f of ['index.html', 'styles.css']) writeFileSync(join(pub, f), readFileSync(join(PUBLIC, f)));
    mkdirSync(join(pub, 'js'));
    writeFileSync(join(pub, 'js/main.js'), 'console.log("v1")');
    const dir = project({ 'package.json': '{"name":"x"}' });
    const id = async () => {
      const ui = await startUiServer({ dir, token: TOKEN, publicDir: pub, semgrep: false });
      const s = (await call(ui, 'GET', '/api/session')).json();
      await ui.close();
      return s as { buildId: string; version: string; startedAt: string };
    };
    const first = await id();
    expect(first.buildId).toMatch(/^[0-9a-f]{16}$/);
    expect((await id()).buildId).toBe(first.buildId); // restart, same app
    writeFileSync(join(pub, 'js/main.js'), 'console.log("v2")');
    expect((await id()).buildId).not.toBe(first.buildId); // updated app
  });

  it('reports a data version that changes when seckit.yaml or .seckit/ files change', async () => {
    const dir = project({ 'package.json': '{"name":"x"}', 'seckit.yaml': 'version: 1\napp: { name: a, platforms: [backend] }\ncomponents:\n  - type: api\n' });
    const ui = await startUiServer({ dir, token: TOKEN, publicDir: PUBLIC, semgrep: false });
    const data = async () => (await call(ui, 'GET', '/api/session')).json().dataVersion as string;
    const v1 = await data();
    expect(await data()).toBe(v1);
    writeFileSync(join(dir, 'seckit.yaml'), 'version: 1\napp: { name: b, platforms: [backend] }\ncomponents:\n  - type: api\n');
    const v2 = await data();
    expect(v2).not.toBe(v1);
    await call(ui, 'POST', '/api/checklist', { body: { id: 'API-C1', done: true } });
    expect(await data()).not.toBe(v2);
    await ui.close();
  });
});

describe('seckit-ui discard (start over)', () => {
  it('removes seckit.yaml and checklist ticks, keeps sign-offs and generated files', async () => {
    const dir = project({
      'seckit.yaml': 'version: 1\napp: { name: Plate, platforms: [backend] }\ncomponents:\n  - type: api\n',
      '.seckit/checklist.yaml': 'version: 1\nitems:\n  API-C1: { done: true }\n',
      '.seckit/attestations.yaml': 'version: 1\nattestations: []\n',
      'AGENTS.md': '# rules\n',
    });
    const ui = await startUiServer({ dir, token: TOKEN, publicDir: PUBLIC, semgrep: false });
    const res = (await call(ui, 'POST', '/api/manifest/discard', { body: {} })).json();
    expect(res.removed).toEqual(['seckit.yaml', '.seckit/checklist.yaml']);
    expect(existsSync(join(dir, 'seckit.yaml'))).toBe(false);
    expect(existsSync(join(dir, '.seckit/attestations.yaml'))).toBe(true);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    expect((await call(ui, 'GET', '/api/state')).json().manifest).toBeNull();
    expect((await call(ui, 'POST', '/api/manifest/discard', { body: {} })).json().removed).toEqual([]);
    await ui.close();
  });
});
