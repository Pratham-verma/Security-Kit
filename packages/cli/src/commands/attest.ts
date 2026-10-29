import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  type Attestation,
  type AttestationStatus,
  loadDefaultKnowledgeBase,
  loadManifest,
  resolveControls,
  validateAttestations,
} from '@seckit/core';
import { Document, isMap, isSeq, parseDocument, type YAMLSeq } from 'yaml';
import { color, type Log, readTextIfExists, safeOutputPath, writeText } from '../util.js';

export interface AttestOptions {
  dir: string;
  id?: string;
  status?: string;
  evidence?: string;
  reason?: string;
  expires?: string;
  by?: string;
  remove?: boolean;
  /** YYYY-MM-DD; defaults to today (UTC). */
  today?: string;
  log: Log;
}

const FILE = '.seckit/attestations.yaml';
const STATUSES: AttestationStatus[] = ['done', 'not_applicable', 'risk_accepted'];
const HEADER =
  ' Security Kit attestations: human sign-offs for controls automated checks cannot fully verify.\n' +
  ' Commit this file so sign-offs are reviewed. Manage with `seckit attest`. Schema: schemas/attestations.schema.json';

function gitUser(dir: string): string | undefined {
  const r = spawnSync('git', ['config', 'user.name'], { cwd: dir, encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : undefined;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function list(attestations: Attestation[], today: string, log: Log): number {
  if (attestations.length === 0) {
    log(`No attestations yet. Record one with: seckit attest <ID> --status done --evidence "..."`);
    return 0;
  }
  for (const a of attestations) {
    const left = a.expires ? daysBetween(today, a.expires) : undefined;
    const expiry =
      left === undefined ? '' : left < 0 ? color.red(` expired ${a.expires}`) : left <= 30 ? color.yellow(` expires ${a.expires}`) : color.dim(` until ${a.expires}`);
    log(`${a.control.padEnd(12)} ${a.status.padEnd(15)} ${color.dim(`${a.by}, ${a.date}`)}${expiry}`);
    log(color.dim(`             ${a.evidence ?? a.reason ?? ''}`));
  }
  return 0;
}

export function attest(opts: AttestOptions): number {
  const { dir, log } = opts;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const kb = loadDefaultKnowledgeBase();
  const path = safeOutputPath(dir, FILE);
  const text = readTextIfExists(path);
  const doc = text === undefined ? new Document({ version: 1, attestations: [] }) : parseDocument(text);
  if (text === undefined) doc.commentBefore = HEADER;
  const current = validateAttestations(doc.toJS() ?? { version: 1, attestations: [] }, kb);

  if (!opts.id) return list(current.attestations, today, log);

  const id = opts.id.toUpperCase();
  if (!isMap(doc.contents)) throw new Error(`${FILE} must be a mapping`);
  let seq = doc.get('attestations', true);
  if (!isSeq(seq)) {
    doc.set('attestations', doc.createNode([]));
    seq = doc.get('attestations', true);
  }
  const items = (seq as YAMLSeq).items;
  const index = current.attestations.findIndex((a) => a.control === id);

  if (opts.remove) {
    if (index === -1) {
      log(color.red(`${id} has no attestation.`));
      return 1;
    }
    items.splice(index, 1);
    writeText(path, doc.toString({ lineWidth: 0 }));
    log(`${color.green('removed')} attestation for ${id}`);
    return 0;
  }

  const status = opts.status as AttestationStatus | undefined;
  if (!status || !STATUSES.includes(status)) {
    log(color.red(`--status must be one of: ${STATUSES.join(', ')}`));
    return 2;
  }
  const entry: Attestation = {
    control: id,
    status,
    by: opts.by ?? gitUser(dir) ?? process.env.USER ?? 'unknown',
    date: today,
    ...(opts.evidence ? { evidence: opts.evidence } : {}),
    ...(opts.reason ? { reason: opts.reason } : {}),
    ...(opts.expires ? { expires: opts.expires } : {}),
  };
  const node = doc.createNode(entry);
  if (index === -1) items.push(node);
  else items[index] = node;

  validateAttestations(doc.toJS(), kb); // throws with details (e.g. missing --evidence) before anything is written

  let notInPlan = false;
  const manifestPath = join(dir, 'seckit.yaml');
  if (readTextIfExists(manifestPath) !== undefined) {
    const plan = resolveControls(loadManifest(manifestPath, kb), kb);
    notInPlan = !plan.components.some((c) => c.controls.some((x) => x.id === id));
  }

  writeText(path, doc.toString({ lineWidth: 0 }));
  log(`${color.green(index === -1 ? 'recorded' : 'updated')} ${id} as ${status} in ${FILE}`);
  if (notInPlan) log(color.yellow(`Note: ${id} is not in this app's plan, so the audit will report the attestation as stale.`));
  if (status === 'risk_accepted' && opts.expires && daysBetween(today, opts.expires) > 365) {
    log(color.yellow('Note: risk acceptances longer than a year are rarely re-reviewed; consider a shorter expiry.'));
  }
  return 0;
}
