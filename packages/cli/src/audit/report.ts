import type { Severity } from '@seckit/core';
import { STANDARD_LABELS } from '@seckit/core';
import { color } from '../util.js';
import { type AuditReport, type ControlResult, SEVERITY_RANK } from './index.js';

const bySeverity = (a: ControlResult, b: ControlResult) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
const count = (r: AuditReport, s: ControlResult['status']) => r.controls.filter((c) => c.status === s);

export function renderText(report: AuditReport, opts: { verbose?: boolean; failed: boolean; failOn: string }): string {
  const L: string[] = [];
  const failed = count(report, 'fail').sort(bySeverity);
  const passed = count(report, 'pass');
  const skipped = count(report, 'skipped');
  const manual = count(report, 'manual');
  const accepted = count(report, 'risk_accepted').sort(bySeverity);
  const attested = count(report, 'attested');
  const notApplicable = count(report, 'not_applicable');
  const limit = opts.verbose ? Infinity : 10;

  L.push(`${color.bold('Security Kit audit')} · ${report.app.name} · ${report.controls.length} controls in plan`);
  if (report.semgrep && !report.semgrepFailed) L.push(color.dim(`Semgrep ${report.semgrep.version} · ${report.semgrep.rules} rules`));
  if (report.semgrepFailed) L.push(color.red(`Semgrep did not complete: ${report.semgrepFailed.rules} code rules did not run. See the errors below.`));
  if (report.semgrepMissing) {
    L.push(color.yellow(`Semgrep not found: ${report.semgrepMissing.rules} code rules skipped. Install it (pip install semgrep) for full coverage.`));
  }
  L.push('');

  for (const c of failed) {
    L.push(`${color.red('FAIL')}  ${color.bold(c.id)}  ${c.severity.padEnd(8)} ${c.title}`);
    for (const f of c.findings.slice(0, limit)) {
      L.push(`      ${color.cyan(`${f.file}${f.line ? `:${f.line}` : ''}`)}  ${f.message}`);
    }
    if (c.findings.length > limit) L.push(color.dim(`      … and ${c.findings.length - limit} more (use --verbose)`));
  }
  for (const c of accepted) {
    const a = c.attestation!;
    L.push(`${color.yellow('RISK')}  ${color.bold(c.id)}  ${c.severity.padEnd(8)} ${c.title}`);
    L.push(color.dim(`      accepted by ${a.by} until ${a.expires}: ${a.reason}`));
    for (const f of c.findings.slice(0, limit)) L.push(color.dim(`      ${f.file}${f.line ? `:${f.line}` : ''}  ${f.message}`));
  }
  if (opts.verbose) {
    for (const c of attested) L.push(`${color.green('DONE')}  ${c.id}  ${c.title} ${color.dim(`(attested by ${c.attestation!.by}: ${c.attestation!.evidence})`)}`);
    for (const c of notApplicable) L.push(`${color.dim('N/A ')}  ${c.id}  ${c.title} ${color.dim(`(${c.attestation!.reason})`)}`);
    for (const c of passed) L.push(`${color.green('PASS')}  ${c.id}  ${c.title} ${color.dim(`(${c.checks.length} checks)`)}`);
    for (const c of skipped) L.push(`${color.yellow('SKIP')}  ${c.id}  ${c.title} ${color.dim('(needs Semgrep)')}`);
    for (const c of manual) L.push(`${color.dim('TODO')}  ${c.id}  ${c.title} ${color.dim('(manual review)')}`);
  }

  const severities = (['critical', 'high', 'medium', 'low'] as Severity[])
    .map((s) => [s, failed.filter((c) => c.severity === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`);

  L.push('', color.bold('Summary'));
  L.push(`  ${color.red('✗')} ${String(failed.length).padStart(3)} failed   ${severities.length ? color.dim(`(${severities.join(', ')})`) : ''}`);
  L.push(`  ${color.green('✓')} ${String(passed.length).padStart(3)} passed   ${color.dim('automated checks found no issues — not a guarantee')}`);
  if (attested.length) L.push(`  ${color.green('✓')} ${String(attested.length).padStart(3)} attested ${color.dim('verified by a person (.seckit/attestations.yaml)')}`);
  if (notApplicable.length) L.push(`  ${color.dim('–')} ${String(notApplicable.length).padStart(3)} n/a      ${color.dim('signed off as not applicable')}`);
  if (accepted.length) L.push(`  ${color.yellow('!')} ${String(accepted.length).padStart(3)} accepted ${color.dim('known risks, accepted until their expiry date')}`);
  if (skipped.length) L.push(`  ${color.yellow('○')} ${String(skipped.length).padStart(3)} skipped  ${color.dim('need Semgrep')}`);
  L.push(`  ${color.dim('?')} ${String(manual.length).padStart(3)} manual   ${color.dim('verify by hand, then record it: seckit attest <ID>')}`);
  for (const e of report.errors) L.push(color.yellow(`  ! ${e}`));
  for (const w of report.warnings) L.push(color.yellow(`  ! ${w}`));
  L.push('');
  L.push(
    opts.failed
      ? color.red(`Result: FAILED (fail-on: ${opts.failOn})`)
      : report.semgrepFailed
        ? color.red('Result: INCOMPLETE (the code scan did not finish; fix the error and re-run)')
        : color.green(`Result: PASSED (fail-on: ${opts.failOn})`),
  );
  return L.join('\n') + '\n';
}

export function renderJson(report: AuditReport, version: string): string {
  const statuses = ['fail', 'risk_accepted', 'attested', 'not_applicable', 'pass', 'skipped', 'manual'] as const;
  const summary = Object.fromEntries(statuses.map((s) => [s, count(report, s).length]));
  return (
    JSON.stringify(
      {
        generator: `seckit ${version}`,
        app: report.app,
        semgrep: report.semgrep ?? null,
        incomplete: !!report.semgrepFailed,
        summary,
        controls: report.controls.map(({ control: _control, ...rest }) => rest),
        errors: report.errors,
        warnings: report.warnings,
      },
      null,
      2,
    ) + '\n'
  );
}

const SARIF_LEVEL: Record<Severity, string> = { critical: 'error', high: 'error', medium: 'warning', low: 'note' };
// GitHub code scanning maps security-severity to critical (>=9), high (>=7), medium (>=4), low.
const SECURITY_SEVERITY: Record<Severity, string> = { critical: '9.5', high: '8.0', medium: '5.5', low: '3.0' };

/**
 * SARIF 2.1.0 for GitHub code scanning and other viewers. One SARIF rule per control. Findings under
 * an accepted risk are included as suppressed results, so the decision stays visible.
 */
export function renderSarif(report: AuditReport, version: string): string {
  const failed = report.controls.filter((c) => c.status === 'fail' || c.status === 'risk_accepted');
  const rules = failed.map((c) => ({
    id: c.id,
    name: c.id.replace(/-/g, ''),
    shortDescription: { text: c.title },
    fullDescription: { text: c.control.guidance.trim().split('\n')[0] },
    help: { text: `${c.control.ai_rule}\n\nRun \`npx seckit explain ${c.id}\` for details.` },
    defaultConfiguration: { level: SARIF_LEVEL[c.severity] },
    properties: {
      tags: [
        'security',
        ...Object.entries(c.control.standards).flatMap(([k, ids]) =>
          (ids as string[]).map((id) => `${STANDARD_LABELS[k as keyof typeof STANDARD_LABELS] ?? k}: ${id}`),
        ),
      ],
      'security-severity': SECURITY_SEVERITY[c.severity],
    },
  }));
  const results = failed.flatMap((c) =>
    c.findings.map((f) => ({
      ruleId: c.id,
      level: SARIF_LEVEL[c.severity],
      message: { text: `${f.message} (${f.check})` },
      ...(c.status === 'risk_accepted'
        ? {
            suppressions: [
              {
                kind: 'external',
                status: 'accepted',
                justification: `${c.attestation!.reason} (accepted by ${c.attestation!.by} until ${c.attestation!.expires})`,
              },
            ],
          }
        : {}),
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: f.file },
            region: { startLine: f.line ?? 1 },
          },
        },
      ],
    })),
  );
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'Security Kit', version, rules } },
        invocations: [
          {
            executionSuccessful: !report.semgrepFailed,
            toolExecutionNotifications: report.errors.map((text) => ({ level: 'error', message: { text } })),
          },
        ],
        results,
      },
    ],
  };
  return JSON.stringify(sarif, null, 2) + '\n';
}
