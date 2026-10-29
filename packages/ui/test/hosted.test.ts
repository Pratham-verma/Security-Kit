import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { hostedBackend, memoryFileSource } from '../src/app/hosted-backend.js';
import { VERSION } from '../src/shared/version.js';
import { createContext, getPrompt } from '../src/server/api.js';

const EXAMPLE = readFileSync(new URL('../../../examples/shop-app/seckit.yaml', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

// The engine needs no DOM; only localStorage, which persists across "page loads" (new backends) here.
const saved = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => saved.get(k) ?? null,
  setItem: (k: string, v: string) => void saved.set(k, String(v)),
  removeItem: (k: string) => void saved.delete(k),
  clear: () => saved.clear(),
};

describe('hosted backend (engine in the browser)', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty and refuses work that needs the user’s code', async () => {
    const b = hostedBackend();
    const state = await b.request<{ mode: string; manifest: unknown; plan: unknown }>('GET', '/api/state');
    expect(state).toMatchObject({ mode: 'hosted', manifest: null, plan: null });
    await expect(b.request('POST', '/api/audit')).rejects.toMatchObject({ status: 501 });
    await expect(b.request('POST', '/api/attest', { id: 'AUTH-C2' })).rejects.toMatchObject({ status: 501 });
    await expect(b.request('GET', '/api/checklist')).rejects.toThrow(/Describe your app first/);
  });

  it('detects the stack from picked files without reading .env', async () => {
    const b = hostedBackend();
    const res = await b.request<{ detection: { name: string; platforms: string[] }; suggested: { components: { type: string }[] } }>('POST', '/api/detect', {
      folder: 'shop',
      files: { 'package.json': JSON.stringify({ name: 'shop', dependencies: { express: '^4', pg: '^8', stripe: '^17' } }), '.env': null, 'src/index.js': null },
    });
    expect(res.detection.name).toBe('shop');
    expect(res.detection.platforms).toEqual(['backend']);
    expect(res.suggested.components.map((c) => c.type)).toEqual(expect.arrayContaining(['api', 'database', 'payments', 'secrets']));
    expect(memoryFileSource({ 'a/b.txt': 'x', 'a/c/d.txt': null }).list('a').sort()).toEqual(['b.txt', 'c/']);
  });

  it('imports seckit.yaml, keeps it across reloads, and exports it again', async () => {
    await hostedBackend().request('POST', '/api/manifest/import', { text: EXAMPLE });
    const b = hostedBackend(); // a new page load
    const state = await b.request<{ manifest: { app: { name: string } }; plan: { components: unknown[] } }>('GET', '/api/state');
    expect(state.manifest.app.name).toBe('shop-app');
    expect(state.plan.components.length).toBe(12);
    expect(await b.request<string>('GET', '/api/manifest/export')).toContain('name: shop-app');
    await expect(b.request('POST', '/api/manifest/import', { text: 'version: 1\napp: {}\n' })).rejects.toMatchObject({ issues: expect.any(Array) });
  });

  it('gives the same AI prompt as the local server for the same answers', async () => {
    const b = hostedBackend();
    await b.request('POST', '/api/manifest/import', { text: EXAMPLE });
    const hosted = await b.request<{ text: string; items: number }>('GET', '/api/prompt?mode=build&min=high');
    const dir = mkdtempSync(join(tmpdir(), 'seckit-hosted-'));
    writeFileSync(join(dir, 'seckit.yaml'), EXAMPLE);
    const local = getPrompt(createContext(dir, { semgrep: false }), new URLSearchParams('mode=build&min=high'));
    expect(hosted.text).toBe(local.text);
    expect(hosted.items).toBe(local.items);
  });

  it('ticks checklist items, rejects unknown ones, and clears everything on reset', async () => {
    const b = hostedBackend();
    await b.request('POST', '/api/manifest/import', { text: EXAMPLE });
    const { progress } = await b.request<{ progress: Record<string, { done: boolean }> }>('POST', '/api/checklist', { id: 'AUTH-C2', done: true });
    expect(progress['AUTH-C2']?.done).toBe(true);
    expect(await b.request<string>('GET', '/api/checklist/export')).toContain('- [x] **AUTH-C2');
    await expect(b.request('POST', '/api/checklist', { id: 'NOPE-C9', done: true })).rejects.toThrow(/not in this app/);
    expect((await hostedBackend().request<{ checklistDone: number }>('GET', '/api/state')).checklistDone).toBe(1);
    await b.request('POST', '/api/manifest/discard');
    expect((await b.request<{ manifest: unknown; checklistDone: number }>('GET', '/api/state')).checklistDone).toBe(0);
    await b.request('POST', '/api/reset');
    expect((await b.request<{ manifest: unknown }>('GET', '/api/state')).manifest).toBeNull();
  });

  it('shows the package version', () => {
    expect(VERSION).toBe(pkg.version);
  });
});
