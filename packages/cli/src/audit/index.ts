import { join } from 'node:path';
import {
  type Attestation,
  type Control,
  type Level,
  loadAttestations,
  loadDefaultKnowledgeBase,
  loadManifest,
  loadRulePack,
  type ResolvedPlan,
  resolveControls,
  type Severity,
} from '@seckit/core';
import { BUILTIN_CHECKS, type Finding } from './builtin.js';
import { listProjectFiles } from './files.js';
import { findSemgrep, runSemgrep, type SemgrepInfo } from './semgrep.js';

export type { Finding } from './builtin.js';

/**
 * fail: an automated check found a problem. risk_accepted: it did, but the risk is signed off until
 * an expiry date. attested: a person verified it. not_applicable: signed off as not relevant.
 * pass: automated checks ran and found nothing (not proof of compliance). skipped: automated checks
 * exist but could not run (Semgrep missing). manual: needs review.
 */
export type ControlStatus = 'fail' | 'risk_accepted' | 'attested' | 'not_applicable' | 'pass' | 'skipped' | 'manual';

export interface ControlResult {
  id: string;
  title: string;
  component: string;
  severity: Severity;
  level: Level;
  status: ControlStatus;
  checks: string[];
  skippedChecks: string[];
  findings: Finding[];
  attestation?: Attestation;
  control: Control;
}

export interface AuditReport {
  app: ResolvedPlan['app'];
  semgrep?: { version: string; rules: number };
  semgrepMissing?: { rules: number };
  /** Semgrep was available but did not complete; its rules count as skipped and the audit is incomplete. */
  semgrepFailed?: { rules: number };
  controls: ControlResult[];
  errors: string[];
  /** Expired, stale or contradicted attestations. */
  warnings: string[];
}

export interface AuditOptions {
  dir: string;
  manifest?: string;
  /** Path to semgrep, or false to skip Semgrep entirely. */
  semgrep?: string | false;
  /** Default: <dir>/.seckit/attestations.yaml */
  attestations?: string;
  /** YYYY-MM-DD; defaults to today (UTC). */
  today?: string;
}

export const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/** Per-control checks that applied to this plan: which ran and which were skipped. */
function addCheck(map: Map<string, Set<string>>, controls: string[], check: string) {
  for (const c of controls) (map.get(c) ?? map.set(c, new Set()).get(c)!).add(check);
}

export function audit(opts: AuditOptions): AuditReport {
  const kb = loadDefaultKnowledgeBase();
  const plan = resolveControls(loadManifest(opts.manifest ?? join(opts.dir, 'seckit.yaml'), kb), kb);

  const inPlan = new Map<string, { control: Control; component: string }>();
  for (const c of plan.components) {
    for (const control of c.controls) if (!inPlan.has(control.id)) inPlan.set(control.id, { control, component: c.component.name });
  }
  const relevant = (controls: string[]) => controls.filter((c) => inPlan.has(c));
  // Controls of components the app has, but that the plan excluded (an option, platform or level).
  // A finding for one of these means seckit.yaml may describe the app wrongly.
  const excluded = new Set(
    plan.components.flatMap((c) => c.component.controls.map((x) => x.id)).filter((id) => !inPlan.has(id)),
  );

  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const warnings: string[] = [];
  const attested = new Map<string, Attestation>();
  for (const a of loadAttestations(opts.attestations ?? join(opts.dir, '.seckit', 'attestations.yaml'), kb).attestations) {
    if (!inPlan.has(a.control)) warnings.push(`Attestation for ${a.control} is stale: that control is not in this app's plan.`);
    else if (a.expires && a.expires < today) warnings.push(`Attestation for ${a.control} expired on ${a.expires}; re-verify it.`);
    else attested.set(a.control, a);
  }

  const ran = new Map<string, Set<string>>();
  const skipped = new Map<string, Set<string>>();
  const findings: Finding[] = [];
  const errors: string[] = [];
  const files = listProjectFiles(opts.dir);

  for (const check of BUILTIN_CHECKS) {
    const controls = relevant(check.controls);
    if (controls.length === 0) continue;
    addCheck(ran, controls, check.id);
    for (const f of check.run(files)) findings.push({ ...f, controls: relevant(f.controls) });
  }

  const rules = loadRulePack(kb).filter((r) =>
    r.metadata['seckit-controls'].some((c) => inPlan.has(c) || excluded.has(c)),
  );
  let semgrep: SemgrepInfo | undefined;
  if (opts.semgrep !== false && rules.length > 0) semgrep = findSemgrep(opts.semgrep);
  let semgrepFailed = false;
  if (semgrep) {
    const result = runSemgrep(semgrep, opts.dir, rules);
    errors.push(...result.errors);
    // A scanner that did not finish proves nothing: its rules count as skipped, never as passed.
    semgrepFailed = !result.ok;
    for (const r of rules) addCheck(result.ok ? ran : skipped, relevant(r.metadata['seckit-controls']), r.id);
    for (const f of result.findings) {
      const mismatched = f.controls.filter((c) => excluded.has(c));
      if (relevant(f.controls).length === 0 && mismatched.length > 0) {
        warnings.push(
          `${f.file}:${f.line ?? 1} looks like ${mismatched.join('/')} applies, but seckit.yaml excludes it — check the component options. (${f.message})`,
        );
      }
      findings.push({ ...f, controls: relevant(f.controls) });
    }
  } else {
    for (const r of rules) addCheck(skipped, relevant(r.metadata['seckit-controls']), r.id);
  }

  const controls: ControlResult[] = [...inPlan.values()].map(({ control, component }) => {
    // Several rules can flag the same line for one control; report it once.
    const seen = new Set<string>();
    const mine = findings.filter((f) => {
      if (!f.controls.includes(control.id)) return false;
      const key = `${f.file}:${f.line ?? 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const checks = [...(ran.get(control.id) ?? [])];
    const skippedChecks = [...(skipped.get(control.id) ?? [])];
    const att = attested.get(control.id);
    let status: ControlStatus;
    if (mine.length > 0) {
      // A sign-off never hides a failing automated check; only an explicit, expiring risk acceptance does.
      status = att?.status === 'risk_accepted' ? 'risk_accepted' : 'fail';
      if (att && att.status !== 'risk_accepted') {
        warnings.push(`${control.id} is attested as ${att.status}, but automated checks found problems.`);
      }
    } else if (att) {
      status = att.status === 'done' ? 'attested' : att.status;
    } else {
      status = checks.length > 0 ? 'pass' : skippedChecks.length > 0 ? 'skipped' : 'manual';
    }
    return {
      id: control.id,
      title: control.title,
      component,
      severity: control.severity,
      level: control.level,
      status,
      checks,
      skippedChecks,
      findings: mine,
      ...(att ? { attestation: att } : {}),
      control,
    };
  });

  return {
    app: plan.app,
    ...(semgrep ? { semgrep: { version: semgrep.version, rules: rules.length } } : {}),
    ...(semgrepFailed ? { semgrepFailed: { rules: rules.length } } : {}),
    ...(!semgrep && opts.semgrep !== false && rules.length > 0 ? { semgrepMissing: { rules: rules.length } } : {}),
    controls,
    errors,
    warnings,
  };
}

/** True if any failed control is at or above the threshold severity. */
export function failsThreshold(report: AuditReport, failOn: Severity | 'none'): boolean {
  if (failOn === 'none') return false;
  return report.controls.some((c) => c.status === 'fail' && SEVERITY_RANK[c.severity] >= SEVERITY_RANK[failOn]);
}
