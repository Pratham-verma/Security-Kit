// `seckit checklist` / `seckit prompt`, and the tick-off progress kept in .seckit/checklist.yaml.
import { join } from 'node:path';
import { loadDefaultKnowledgeBase, loadManifest, resolveControls, type Severity } from '@seckit/core';
import { parse, stringify } from 'yaml';
import { buildChecklist, type PromptMode, renderAiPrompt, renderChecklistMarkdown } from '@seckit/core';
import { color, type Log, readTextIfExists, safeOutputPath, VERSION, writeText } from '../util.js';

export const CHECKLIST_FILE = '.seckit/checklist.yaml';
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

export interface ChecklistTick {
  done: boolean;
  by?: string;
  date?: string;
  note?: string;
}

/** Ticked items from .seckit/checklist.yaml; a missing or unreadable file means nothing ticked yet. */
export function loadChecklistProgress(dir: string): Record<string, ChecklistTick> {
  const text = readTextIfExists(join(dir, CHECKLIST_FILE));
  if (!text) return {};
  const data = parse(text) as { items?: Record<string, ChecklistTick> } | null;
  const out: Record<string, ChecklistTick> = {};
  for (const [id, tick] of Object.entries(data?.items ?? {})) {
    if (/^[A-Z]+-C\d+$/.test(id) && tick && typeof tick === 'object' && typeof tick.done === 'boolean') out[id] = tick;
  }
  return out;
}

export function setChecklistItem(dir: string, id: string, tick: ChecklistTick | null): Record<string, ChecklistTick> {
  if (!/^[A-Z]+-C\d+$/.test(id)) throw new Error(`Not a control ID: ${id}`);
  const items = loadChecklistProgress(dir);
  if (tick && tick.done) items[id] = tick;
  else delete items[id];
  const sorted = Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
  writeText(
    safeOutputPath(dir, CHECKLIST_FILE),
    '# Security Kit checklist progress: items ticked as implemented and checked. Commit it to share progress.\n' +
      stringify({ version: 1, items: sorted }),
  );
  return sorted;
}

export interface ChecklistOptions {
  dir: string;
  manifest?: string;
  /** checklist: md (default) or json. */
  format?: string;
  /** prompt: audit (default) or build. */
  mode?: string;
  minSeverity?: string;
  output?: string;
  log: Log;
}

function load(opts: ChecklistOptions) {
  const kb = loadDefaultKnowledgeBase();
  const manifest = loadManifest(opts.manifest ?? join(opts.dir, 'seckit.yaml'), kb);
  return { manifest, plan: resolveControls(manifest, kb) };
}

function minSeverity(value: string | undefined, log: Log): Severity | undefined | null {
  if (value === undefined) return undefined;
  if (SEVERITIES.includes(value as Severity)) return value as Severity;
  log(color.red(`--min-severity must be one of: ${SEVERITIES.join(', ')}`));
  return null;
}

function emit(opts: ChecklistOptions, text: string, what: string): number {
  if (opts.output) {
    writeText(safeOutputPath(opts.dir, opts.output), text);
    opts.log(`${color.green('wrote')} ${what} to ${opts.output}`);
  } else {
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
  }
  return 0;
}

export function checklistCommand(opts: ChecklistOptions): number {
  const sev = minSeverity(opts.minSeverity, opts.log);
  if (sev === null) return 2;
  const { plan } = load(opts);
  const list = buildChecklist(plan, { minSeverity: sev });
  const progress = loadChecklistProgress(opts.dir);
  const done = new Set(Object.keys(progress).filter((id) => progress[id]!.done));
  if (opts.format === 'json') {
    return emit(opts, JSON.stringify({ generator: `seckit ${VERSION}`, ...list, done: [...done] }, null, 2), 'the checklist');
  }
  if (opts.format && opts.format !== 'md') {
    opts.log(color.red('--format must be md or json'));
    return 2;
  }
  return emit(opts, renderChecklistMarkdown(list, VERSION, done), 'the checklist');
}

export function promptCommand(opts: ChecklistOptions): number {
  const sev = minSeverity(opts.minSeverity, opts.log);
  if (sev === null) return 2;
  if (opts.mode && opts.mode !== 'audit' && opts.mode !== 'build' && opts.mode !== 'test') {
    opts.log(color.red('--mode must be audit (review and fix existing code), build (rules for new code) or test (run the test cases and report)'));
    return 2;
  }
  const { manifest, plan } = load(opts);
  return emit(opts, renderAiPrompt(plan, manifest, { mode: opts.mode as PromptMode | undefined, minSeverity: sev }), 'the AI prompt');
}
