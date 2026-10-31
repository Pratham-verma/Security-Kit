import { deflateRawSync } from 'node:zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import { hostedBackend } from '../src/app/hosted-backend.js';
import { pickZip } from '../src/app/hosted-files.js';
import { isZip, listZip, readZipText, ZipError } from '../src/app/zip.js';

const saved = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => saved.get(k) ?? null,
  setItem: (k: string, v: string) => void saved.set(k, String(v)),
  removeItem: (k: string) => void saved.delete(k),
  clear: () => saved.clear(),
};

interface Entry {
  path: string;
  data?: string | Uint8Array;
  store?: boolean;
  /** Uncompressed size to write in the headers, when it should lie. */
  claimSize?: number;
}

/** A minimal ZIP writer (CRCs are not checked by the reader, so they are left as 0). */
function makeZip(entries: Entry[]): File {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.path);
    const raw = typeof e.data === 'string' ? enc.encode(e.data) : (e.data ?? new Uint8Array());
    const body = e.store ? raw : new Uint8Array(deflateRawSync(raw));
    const size = e.claimSize ?? raw.length;
    const method = e.store ? 0 : 8;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, method, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    locals.push(new Uint8Array(local.buffer), name, body);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(10, method, true);
    central.setUint32(20, body.length, true);
    central.setUint32(24, size, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new File([...locals, ...centrals, new Uint8Array(end.buffer)] as BlobPart[], 'project.zip');
}

const PKG = JSON.stringify({ name: 'shop', dependencies: { express: '^4', pg: '^8', stripe: '^17', bcrypt: '^5' } });

describe('zip reader', () => {
  it('lists entries and inflates text', async () => {
    const zip = makeZip([{ path: 'a.txt', data: 'hello' }, { path: 'b.txt', data: 'stored', store: true }, { path: 'dir/' }]);
    expect(await isZip(zip)).toBe(true);
    const entries = await listZip(zip);
    expect(entries.map((e) => [e.path, e.dir])).toEqual([['a.txt', false], ['b.txt', false], ['dir/', true]]);
    expect(await readZipText(zip, entries[0]!, 1024)).toBe('hello');
    expect(await readZipText(zip, entries[1]!, 1024)).toBe('stored');
  });

  it('checks the content, not the name', async () => {
    const fake = new File(['{"not": "a zip"}'], 'project.zip');
    expect(await isZip(fake)).toBe(false);
    await expect(listZip(fake)).rejects.toThrow(ZipError);
    await expect(listZip(new File([new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])], 'cut.zip'))).rejects.toThrow(/damaged/);
  });

  it('stops inflating at the limit, whatever the headers claim', async () => {
    const zip = makeZip([{ path: 'bomb.json', data: 'x'.repeat(2_000_000), claimSize: 100 }]);
    const [entry] = await listZip(zip);
    expect(entry!.size).toBe(100);
    expect(await readZipText(zip, entry!, 512 * 1024)).toBeNull();
  });
});

describe('pickZip (a dropped .zip)', () => {
  beforeEach(() => localStorage.clear());

  it('reads only what detection needs, relative to the project folder', async () => {
    const zip = makeZip([
      { path: 'shop/' },
      { path: 'shop/package.json', data: PKG },
      { path: 'shop/.env', data: 'STRIPE_SECRET=sk_live_x' },
      { path: 'shop/src/index.js', data: 'console.log(1)' },
      { path: 'shop/node_modules/stripe/package.json', data: '{}' },
      { path: 'shop/../../evil/package.json', data: '{}' },
      { path: '__MACOSX/shop/._package.json', data: 'junk' },
    ]);
    const picked = await pickZip(zip);
    expect(picked).toEqual({ folder: 'shop', read: 1, files: { 'package.json': PKG, '.env': null, 'src/index.js': null } });

    const b = hostedBackend();
    const res = await b.request<{ detection: { name: string; components: { type: string }[] } }>('POST', '/api/detect', { files: picked!.files, folder: picked!.folder });
    expect(res.detection.name).toBe('shop');
    expect(res.detection.components.map((c) => c.type)).toEqual(expect.arrayContaining(['api', 'database', 'payments', 'auth']));
  });

  it('accepts a zip without a top folder', async () => {
    const picked = await pickZip(makeZip([{ path: 'package.json', data: PKG }, { path: 'README.md', data: '# shop' }]));
    expect(picked).toMatchObject({ folder: 'project', read: 1 });
  });
});

describe('hosted backend: describe in your own words', () => {
  beforeEach(() => localStorage.clear());

  it('fills in answers from a description, and they save as a plan', async () => {
    const b = hostedBackend();
    const res = await b.request<{ suggested: { app: Record<string, unknown>; components: { type: string }[] } }>('POST', '/api/detect-text', {
      text: 'A web app for clinics. Patients log in with email and password and pay with Stripe. Postgres database.',
    });
    expect(res.suggested.app).toMatchObject({ platforms: ['web', 'backend'], data_sensitivity: 'high', assurance_level: 3 });
    expect(res.suggested.components.map((c) => c.type)).toEqual(expect.arrayContaining(['auth', 'payments', 'database']));
    await b.request('POST', '/api/manifest', { manifest: { ...res.suggested, app: { ...res.suggested.app, name: 'clinic' } } });
    const { checklist } = await b.request<{ checklist: { total: number } }>('GET', '/api/checklist');
    expect(checklist.total).toBeGreaterThan(20);
  });

  it('asks for a description when there is none', async () => {
    await expect(hostedBackend().request('POST', '/api/detect-text', { text: '  ' })).rejects.toThrow(/Write a few sentences/);
  });
});
