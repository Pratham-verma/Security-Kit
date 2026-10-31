// Hosted mode: the whole engine runs in this browser. Answers live in localStorage; project files the user
// picks are read here and never uploaded. Anything that needs the user's code (scan, sign-offs, writing
// files) is answered with a pointer to the CLI.
import {
  automatedRulesByControl,
  buildChecklist,
  detect,
  detectFromText,
  type Detection,
  type FileSource,
  loadBundledKnowledgeBase,
  type Manifest,
  manifestFromDetection,
  parseManifest,
  RULE_CONTROLS,
  renderChecklistMarkdown,
  renderManifestYaml,
  resolveControls,
  unansweredOptions,
  ValidationError,
  validateManifest,
} from '@seckit/core/browser';
import { catalogView, checklistView, checkManifest, inPlan, planView, previewView, type Progress, projectNameFrom, promptView, UserError } from '../shared/model.js';
import { VERSION } from '../shared/version.js';
import { ApiError, type Backend } from './backend.js';

const KEYS = { manifest: 'seckit:v1:manifest', checklist: 'seckit:v1:checklist' };

/** localStorage when available (private windows and blocked storage fall back to memory for this tab). */
function storage() {
  const memory = new Map<string, string>();
  return {
    get(key: string): string | null {
      try {
        return localStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    set(key: string, value: string | null): void {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        if (value === null) memory.delete(key);
        else memory.set(key, value);
      }
    },
  };
}

/** Picked project files: path -> text, or null for files listed but not read (e.g. .env). */
export type PickedFiles = Record<string, string | null>;

export function memoryFileSource(files: PickedFiles): FileSource {
  return {
    read: (p) => files[p] ?? undefined,
    list: (dir) => {
      const prefix = dir ? `${dir}/` : '';
      const names = new Set<string>();
      for (const p of Object.keys(files)) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        names.add(rest.includes('/') ? `${rest.split('/')[0]}/` : rest);
      }
      return [...names];
    },
  };
}

const LOCAL_ONLY =
  'This needs your code, so it runs on your computer, not on this website. See “Run it on your code” for the command.';

export function hostedBackend(): Backend {
  const kb = loadBundledKnowledgeBase();
  const store = storage();
  const automated = automatedRulesByControl();
  let detection: { detection: Detection; suggested: Manifest | null } | null = null;

  const manifest = (): { manifest?: Manifest; error?: string; issues?: string[] } => {
    const raw = store.get(KEYS.manifest);
    if (!raw) return {};
    try {
      return { manifest: validateManifest(JSON.parse(raw), kb) };
    } catch (e) {
      return { error: (e as Error).message.split('\n')[0], issues: e instanceof ValidationError ? e.issues : [] };
    }
  };
  const requirePlan = () => {
    const m = manifest().manifest;
    if (!m) throw new UserError('Describe your app first.');
    return { manifest: m, plan: resolveControls(m, kb) };
  };
  const progress = (): Progress => {
    try {
      return (JSON.parse(store.get(KEYS.checklist) ?? '{}') as Progress) ?? {};
    } catch {
      return {};
    }
  };
  const save = (m: Manifest) => store.set(KEYS.manifest, JSON.stringify(m));

  const routes: Record<string, (body: unknown, query: URLSearchParams) => unknown> = {
    'GET /api/state': () => {
      const { manifest: m, error, issues } = manifest();
      const done = Object.values(progress()).filter((t) => t.done).length;
      return {
        version: VERSION,
        mode: 'hosted',
        project: { dir: '', name: m?.app.name ?? detection?.detection.name ?? 'your app' },
        manifest: m ?? null,
        manifestError: error ? { message: error, issues: issues ?? [] } : null,
        plan: m ? planView(resolveControls(m, kb), automated) : null,
        unanswered: m ? unansweredOptions(m, kb) : [],
        staleFiles: [],
        attestations: { items: [] },
        signer: '',
        semgrep: { available: false },
        rules: { semgrep: Object.keys(RULE_CONTROLS).length, builtin: 0 },
        checklistDone: m ? done : 0,
        lastAudit: null,
        auditRunning: false,
      };
    },
    'GET /api/catalog': () => catalogView(kb),
    'GET /api/detect': () =>
      detection ?? { detection: { name: undefined, platforms: [], platformEvidence: {}, components: [] }, suggested: null },
    'POST /api/detect': (body) => {
      const { files, folder } = body as { files: PickedFiles; folder?: string };
      const src = memoryFileSource(files);
      const found = detect(src, folder || 'app');
      found.name = projectNameFrom((f) => src.read(f), folder || 'app');
      let suggested: Manifest | null = null;
      try {
        suggested = manifestFromDetection(found);
      } catch {
        // nothing recognised
      }
      detection = { detection: found, suggested };
      return detection;
    },
    'POST /api/detect-text': (body) => {
      const text = String((body as { text?: unknown }).text ?? '').trim();
      if (!text) throw new UserError('Write a few sentences about your app first.');
      const read = detectFromText(text);
      let suggested: Manifest | null = null;
      try {
        const m = manifestFromDetection({ ...read.detection, name: read.detection.name ?? '' });
        suggested = { ...m, app: { ...m.app, data_sensitivity: read.data_sensitivity, assurance_level: read.assurance_level } };
      } catch {
        // nothing recognised
      }
      detection = { detection: read.detection, suggested };
      return detection;
    },
    'POST /api/preview': (body) => previewView(kb, (body as { manifest?: unknown }).manifest),
    'POST /api/manifest': (body) => {
      save(checkManifest(kb, (body as { manifest?: unknown }).manifest));
      return { saved: 'browser' };
    },
    'POST /api/manifest/import': (body) => {
      const text = String((body as { text?: unknown }).text ?? '');
      try {
        const m = parseManifest(text, kb);
        save(m);
        return { manifest: m };
      } catch (e) {
        if (e instanceof ValidationError) throw new UserError('That seckit.yaml has problems.', e.issues);
        throw new UserError('That file is not a valid seckit.yaml.');
      }
    },
    'GET /api/manifest/export': () => renderManifestYaml(requirePlan().manifest),
    'GET /api/checklist': () => checklistView(requirePlan().plan, progress(), {}, 'this browser'),
    'POST /api/checklist': (body) => {
      const { plan } = requirePlan();
      const { id, done } = body as { id?: unknown; done?: unknown };
      if (typeof id !== 'string' || !inPlan(plan, id)) throw new UserError(`${String(id || 'That item')} is not in this app's checklist.`);
      const p = progress();
      if (done === true) p[id] = { done: true, date: new Date().toISOString().slice(0, 10) };
      else delete p[id];
      store.set(KEYS.checklist, JSON.stringify(p));
      return { progress: p };
    },
    'GET /api/checklist/export': () => {
      const { plan } = requirePlan();
      const p = progress();
      return renderChecklistMarkdown(buildChecklist(plan), VERSION, new Set(Object.keys(p).filter((id) => p[id]!.done)));
    },
    'GET /api/prompt': (_body, q) => {
      const { manifest: m, plan } = requirePlan();
      return promptView(plan, m, { mode: q.get('mode'), min: q.get('min') });
    },
    'POST /api/manifest/discard': () => {
      const had = store.get(KEYS.manifest) !== null;
      store.set(KEYS.manifest, null);
      store.set(KEYS.checklist, null);
      detection = null;
      return { removed: had ? ['your answers in this browser'] : [] };
    },
    'POST /api/reset': () => {
      store.set(KEYS.manifest, null);
      store.set(KEYS.checklist, null);
      detection = null;
      return { reset: true };
    },
  };

  return {
    mode: 'hosted',
    ready: () => true,
    adoptFromUrl: () => false,
    async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
      if (method === 'GET' && path === '/api/session') {
        // build.json is written next to the app at build time; a new deployment changes it.
        let res: Response;
        try {
          res = await fetch('./build.json', { cache: 'no-store' });
        } catch {
          throw new ApiError('offline');
        }
        if (!res.ok) return { buildId: VERSION } as T;
        return (await res.json()) as T;
      }
      const [pathname, query] = path.split('?');
      const handler = routes[`${method} ${pathname}`];
      if (!handler) throw new ApiError(LOCAL_ONLY, [], 501);
      try {
        return structuredClone(handler(body ?? {}, new URLSearchParams(query ?? ''))) as T;
      } catch (e) {
        if (e instanceof UserError) throw new ApiError(e.message, e.issues, e.status);
        throw new ApiError((e as Error).message ?? String(e));
      }
    },
  };
}
