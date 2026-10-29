// What the browser app can ask for. Everything runs against one project directory chosen at startup,
// through the same engine as the CLI, so the UI and `seckit` always agree.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  type KnowledgeBase,
  loadAttestations,
  loadDefaultKnowledgeBase,
  loadManifest,
  loadRulePack,
  type Manifest,
  renderManifestYaml,
  resolveControls,
  ValidationError,
} from '@seckit/core';
import {
  AI_CHOICES,
  AI_FILES,
  attest,
  audit,
  type AuditReport,
  BUILTIN_CHECKS,
  buildChecklist,
  CHECKLIST_FILE,
  detectProject,
  findSemgrep,
  generate,
  loadChecklistProgress,
  manifestFromDetection,
  renderChecklistMarkdown,
  renderJson,
  renderSarif,
  safeOutputPath,
  type SemgrepInfo,
  setChecklistItem,
  unansweredOptions,
  VERSION,
  writeText,
} from '@seckit/cli/lib';
import { catalogView, checklistView, checkManifest, inPlan, planView, previewView, projectNameFrom, promptView, UserError } from '../shared/model.js';

export { UserError } from '../shared/model.js';

export interface UiContext {
  root: string;
  kb: KnowledgeBase;
  /** Semgrep binary; undefined = look it up (once), false = never use it. */
  semgrep?: string | false;
  lastAudit?: { report: AuditReport; finishedAt: string; durationMs: number };
  auditRunning?: boolean;
  /** Identifies this server run and app build, so open pages can tell a restart or an update. */
  session?: { buildId: string; startedAt: string };
}

/** Files whose changes (from an editor, the CLI or another tab) should refresh open pages. */
const DATA_FILES = ['seckit.yaml', '.seckit/checklist.yaml', '.seckit/attestations.yaml'];

/** Fingerprint of the project's Security Kit data; changes when any of DATA_FILES changes. */
function dataVersion(root: string): string {
  const hash = createHash('sha256');
  for (const file of DATA_FILES) {
    try {
      hash.update(file).update(readFileSync(join(root, file)));
    } catch {
      hash.update(`${file}:missing`);
    }
  }
  return hash.digest('hex').slice(0, 16);
}

/** What an open page needs to notice a restart, an update, or changed project data. */
export function getSession(ctx: UiContext) {
  return {
    version: VERSION,
    buildId: ctx.session?.buildId ?? VERSION,
    startedAt: ctx.session?.startedAt ?? '',
    dataVersion: dataVersion(ctx.root),
  };
}

export function createContext(root: string, opts: { semgrep?: string | false } = {}): UiContext {
  const dir = resolve(root);
  if (!existsSync(dir)) throw new Error(`Project directory not found: ${dir}`);
  return { root: realpathSync(dir), kb: loadDefaultKnowledgeBase(), semgrep: opts.semgrep };
}

const MANIFEST = 'seckit.yaml';
// Terminal colour codes from CLI log lines.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const plain = (s: string) => s.replace(ANSI, '');

// `semgrep --version` can take seconds (Python start-up), and it blocks the server while it runs: look each
// binary up once per server run instead of on every request.
const semgrepCache = new Map<string, SemgrepInfo | undefined>();
function semgrepInfo(ctx: UiContext): SemgrepInfo | undefined {
  if (ctx.semgrep === false) return undefined;
  const key = typeof ctx.semgrep === 'string' ? ctx.semgrep : '';
  if (!semgrepCache.has(key)) semgrepCache.set(key, findSemgrep(key || undefined));
  return semgrepCache.get(key);
}

let ruleCount: number | undefined;
/** Number of code rules in the rule pack (read from disk once). */
function semgrepRuleCount(kb: KnowledgeBase): number {
  ruleCount ??= loadRulePack(kb).length;
  return ruleCount;
}

/** Do the slow one-time work (Semgrep start-up, reading the rule pack) before the server takes requests. */
export function warmUp(ctx: UiContext): void {
  semgrepInfo(ctx);
  semgrepRuleCount(ctx.kb);
  automatedChecks(ctx.kb);
}

let checksCache: Map<string, string[]> | undefined;
/** Automated check IDs per control (built-in checks + Semgrep rules). */
function automatedChecks(kb: KnowledgeBase): Map<string, string[]> {
  if (checksCache) return checksCache;
  const map = new Map<string, string[]>();
  const add = (controls: string[], id: string) => controls.forEach((c) => map.set(c, [...(map.get(c) ?? []), id]));
  for (const c of BUILTIN_CHECKS) add(c.controls, c.id);
  for (const r of loadRulePack(kb)) add(r.metadata['seckit-controls'], r.id);
  checksCache = map;
  return map;
}

function signer(root: string): string {
  const r = spawnSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' });
  return (r.status === 0 && r.stdout.trim()) || process.env.USER || process.env.USERNAME || '';
}

function readManifest(ctx: UiContext): { manifest?: Manifest; error?: string; issues?: string[] } {
  const path = join(ctx.root, MANIFEST);
  if (!existsSync(path)) return {};
  try {
    return { manifest: loadManifest(path, ctx.kb) };
  } catch (e) {
    return { error: (e as Error).message.split('\n')[0], issues: e instanceof ValidationError ? e.issues : [] };
  }
}

function auditView(ctx: UiContext) {
  const last = ctx.lastAudit;
  if (!last) return undefined;
  const { report } = last;
  return {
    finishedAt: last.finishedAt,
    durationMs: last.durationMs,
    semgrep: report.semgrep ?? null,
    semgrepMissing: !!report.semgrepMissing,
    incomplete: !!report.semgrepFailed,
    controls: report.controls.map(({ control: _control, ...rest }) => rest),
    errors: report.errors,
    warnings: report.warnings,
  };
}

/** Files `seckit generate` would create or change right now. */
function staleOutputs(ctx: UiContext): string[] {
  const lines: string[] = [];
  generate({ dir: ctx.root, check: true, log: (l = '') => lines.push(plain(l)) });
  const stale = lines.find((l) => l.startsWith('Out of date: '));
  return stale ? stale.slice('Out of date: '.length).split(', ') : [];
}

/** App name from the project's metadata; the folder name only as a last resort (in Docker it is "project"). */
export function projectName(root: string): string {
  return projectNameFrom((file) => {
    try {
      return readFileSync(join(root, file), 'utf8');
    } catch {
      return undefined;
    }
  }, root.split(/[\\/]/).pop() ?? 'app');
}

export function getState(ctx: UiContext) {
  const { manifest, error, issues } = readManifest(ctx);
  let plan: ReturnType<typeof planView> | undefined;
  let stale: string[] = [];
  let unanswered: string[] = [];
  if (manifest) {
    plan = planView(resolveControls(manifest, ctx.kb), automatedChecks(ctx.kb));
    stale = staleOutputs(ctx);
    unanswered = unansweredOptions(manifest, ctx.kb);
  }
  let attestations: { items: unknown[]; error?: string } = { items: [] };
  try {
    attestations = { items: loadAttestations(join(ctx.root, '.seckit', 'attestations.yaml'), ctx.kb).attestations };
  } catch (e) {
    attestations = { items: [], error: (e as Error).message.split('\n')[0] };
  }
  const sg = semgrepInfo(ctx);
  return {
    version: VERSION,
    mode: 'local' as const,
    project: { dir: ctx.root, name: manifest?.app.name ?? projectName(ctx.root) },
    manifest: manifest ?? null,
    manifestError: error ? { message: error, issues: issues ?? [] } : null,
    plan: plan ?? null,
    unanswered,
    staleFiles: stale,
    attestations,
    signer: signer(ctx.root),
    semgrep: sg ? { available: true, version: sg.version } : { available: false },
    rules: { semgrep: semgrepRuleCount(ctx.kb), builtin: BUILTIN_CHECKS.length },
    checklistDone: manifest ? Object.values(loadChecklistProgress(ctx.root)).filter((t) => t.done).length : 0,
    lastAudit: auditView(ctx) ?? null,
    auditRunning: !!ctx.auditRunning,
  };
}

/** Knowledge-base metadata the "Describe your app" form is built from. */
export function getCatalog(ctx: UiContext) {
  return catalogView(ctx.kb);
}

export function detect(ctx: UiContext) {
  const detection = detectProject(ctx.root);
  detection.name = projectName(ctx.root);
  let suggested: Manifest | null = null;
  try {
    suggested = manifestFromDetection(detection);
  } catch {
    // nothing detected: the form starts empty
  }
  return { detection, suggested };
}

/** Size of the plan a draft manifest would produce, without writing anything. */
export function preview(ctx: UiContext, input: unknown) {
  return previewView(ctx.kb, input);
}

export function saveManifest(ctx: UiContext, input: unknown) {
  const manifest = checkManifest(ctx.kb, input);
  writeText(safeOutputPath(ctx.root, MANIFEST), renderManifestYaml(manifest));
  return { saved: MANIFEST };
}

export function runGenerate(ctx: UiContext) {
  if (!existsSync(join(ctx.root, MANIFEST))) throw new UserError('Describe your app first: there is no seckit.yaml yet.');
  const lines: string[] = [];
  generate({ dir: ctx.root, log: (l = '') => lines.push(plain(l)) });
  const files = lines
    .map((l) => l.match(/^\s+(created|updated|unchanged)\s+(\S.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ path: m[2]!.trim(), change: m[1]! }));
  return { files };
}

export function runAudit(ctx: UiContext) {
  if (!existsSync(join(ctx.root, MANIFEST))) throw new UserError('Describe your app first: there is no seckit.yaml yet.');
  if (ctx.auditRunning) throw new UserError('Checks are already running.', [], 409);
  ctx.auditRunning = true;
  const started = Date.now();
  try {
    const sg = semgrepInfo(ctx);
    const report = audit({ dir: ctx.root, semgrep: ctx.semgrep === false ? false : sg?.bin });
    ctx.lastAudit = { report, finishedAt: new Date().toISOString(), durationMs: Date.now() - started };
  } finally {
    ctx.auditRunning = false;
  }
  return auditView(ctx)!;
}

export function exportAudit(ctx: UiContext, format: string): { body: string; type: string; filename: string } {
  if (!ctx.lastAudit) throw new UserError('Run the checks first.');
  if (format === 'sarif') return { body: renderSarif(ctx.lastAudit.report, VERSION), type: 'application/sarif+json', filename: 'seckit.sarif' };
  if (format === 'json') return { body: renderJson(ctx.lastAudit.report, VERSION), type: 'application/json', filename: 'seckit-audit.json' };
  throw new UserError('format must be json or sarif');
}

interface AttestInput {
  id?: unknown;
  status?: unknown;
  evidence?: unknown;
  reason?: unknown;
  expires?: unknown;
  by?: unknown;
  remove?: unknown;
}

export function recordAttestation(ctx: UiContext, input: AttestInput) {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const id = str(input.id);
  if (!id || !/^[A-Z]+-C\d+$/i.test(id)) throw new UserError('Choose a control to sign off.');
  const lines: string[] = [];
  let code: number;
  try {
    code = attest({
      dir: ctx.root,
      id,
      status: str(input.status),
      evidence: str(input.evidence),
      reason: str(input.reason),
      expires: str(input.expires),
      by: str(input.by),
      remove: input.remove === true,
      log: (l = '') => lines.push(plain(l)),
    });
  } catch (e) {
    if (e instanceof ValidationError) throw new UserError('The sign-off is incomplete.', e.issues.map((i) => i.replace(/^attestations\[\d+\]\s*/, '')));
    throw e;
  }
  if (code !== 0) throw new UserError(lines.join(' ') || 'Could not record the sign-off.');
  // A new sign-off changes control statuses; keep the last audit honest by dropping it.
  ctx.lastAudit = undefined;
  return { message: lines.join(' ') };
}

/** Rules files per assistant, and how to connect the MCP server. */
export function assistants(ctx: UiContext) {
  const { manifest } = readManifest(ctx);
  const configured = new Set(manifest?.ai_assistants ?? ['agents_md']);
  const mcpBin = resolve(ctx.root, 'node_modules', '@seckit', 'mcp', 'dist', 'bin.js');
  return {
    files: AI_CHOICES.map((c) => ({
      id: c.value,
      label: c.label,
      hint: c.hint ?? '',
      path: AI_FILES[c.value].path,
      configured: configured.has(c.value),
      exists: existsSync(join(ctx.root, AI_FILES[c.value].path)),
    })),
    mcp: {
      published: false,
      localBin: existsSync(mcpBin) ? mcpBin : null,
    },
  };
}

// ——— checklist & AI prompt ———

function requirePlan(ctx: UiContext) {
  const { manifest, error } = readManifest(ctx);
  if (!manifest) throw new UserError(error ? `seckit.yaml has problems: ${error}` : 'Describe your app first: there is no seckit.yaml yet.');
  return { manifest, plan: resolveControls(manifest, ctx.kb) };
}

export function getChecklist(ctx: UiContext) {
  const { plan } = requirePlan(ctx);
  const progress = loadChecklistProgress(ctx.root);
  // Scan results, so the checklist can flag items an automated check found a problem with.
  const scan: Record<string, { status: string; findings: { file: string; line?: number; message: string }[] }> = {};
  for (const r of ctx.lastAudit?.report.controls ?? []) {
    if (r.status === 'fail' || r.status === 'pass') scan[r.id] = { status: r.status, findings: r.findings.map(({ file, line, message }) => ({ file, line, message })) };
  }
  return checklistView(plan, progress, scan, CHECKLIST_FILE);
}

export function tickChecklist(ctx: UiContext, input: { id?: unknown; done?: unknown }) {
  const { plan } = requirePlan(ctx);
  const id = typeof input.id === 'string' ? input.id : '';
  if (!inPlan(plan, id)) throw new UserError(`${id || 'That item'} is not in this app's checklist.`);
  const done = input.done === true;
  const progress = setChecklistItem(ctx.root, id, done ? { done: true, by: signer(ctx.root) || undefined, date: new Date().toISOString().slice(0, 10) } : null);
  return { progress };
}

export function exportChecklist(ctx: UiContext): { body: string; type: string; filename: string } {
  const { plan } = requirePlan(ctx);
  const progress = loadChecklistProgress(ctx.root);
  const body = renderChecklistMarkdown(buildChecklist(plan), VERSION, new Set(Object.keys(progress)));
  return { body, type: 'text/markdown; charset=utf-8', filename: 'SECURITY-CHECKLIST.md' };
}

export function getPrompt(ctx: UiContext, query: URLSearchParams) {
  const { manifest, plan } = requirePlan(ctx);
  return promptView(plan, manifest, { mode: query.get('mode'), min: query.get('min') });
}

/**
 * Start over: remove the app description and checklist ticks. Sign-offs (human records) and files already
 * written into the project (AGENTS.md, SECURITY-PLAN.md…) are kept on purpose.
 */
export function discardManifest(ctx: UiContext) {
  const removed: string[] = [];
  for (const file of [MANIFEST, CHECKLIST_FILE]) {
    const path = safeOutputPath(ctx.root, file);
    if (existsSync(path)) {
      unlinkSync(path);
      removed.push(file);
    }
  }
  ctx.lastAudit = undefined;
  return { removed };
}

/** seckit.yaml as text, for the "Download seckit.yaml" button. */
export function exportManifest(ctx: UiContext): { body: string; type: string; filename: string } {
  const { manifest } = requirePlan(ctx);
  return { body: renderManifestYaml(manifest), type: 'text/yaml; charset=utf-8', filename: 'seckit.yaml' };
}

export const PROMPT_FILE = '.seckit/AI-PROMPT.md';

export function savePrompt(ctx: UiContext, input: { mode?: unknown; min?: unknown }) {
  const q = new URLSearchParams();
  if (typeof input.mode === 'string') q.set('mode', input.mode);
  if (typeof input.min === 'string') q.set('min', input.min);
  writeText(safeOutputPath(ctx.root, PROMPT_FILE), getPrompt(ctx, q).text);
  return { saved: PROMPT_FILE };
}
