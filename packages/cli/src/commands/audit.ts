import { resolve } from 'node:path';
import type { Severity } from '@seckit/core';
import { audit, failsThreshold } from '../audit/index.js';
import { renderJson, renderSarif, renderText } from '../audit/report.js';
import { color, type Log, VERSION, writeText } from '../util.js';

export interface AuditCommandOptions {
  dir: string;
  manifest?: string;
  format?: string;
  output?: string;
  failOn?: string;
  semgrep?: string | false;
  verbose?: boolean;
  log: Log;
}

const FAIL_ON = ['critical', 'high', 'medium', 'low', 'none'] as const;
const FORMATS = ['text', 'json', 'sarif'] as const;

export function auditCommand(opts: AuditCommandOptions): number {
  const failOn = (opts.failOn ?? 'high') as Severity | 'none';
  const format = (opts.format ?? 'text') as (typeof FORMATS)[number];
  if (!FAIL_ON.includes(failOn)) {
    opts.log(color.red(`--fail-on must be one of: ${FAIL_ON.join(', ')}`));
    return 2;
  }
  if (!FORMATS.includes(format)) {
    opts.log(color.red(`--format must be one of: ${FORMATS.join(', ')}`));
    return 2;
  }

  const report = audit({ dir: opts.dir, manifest: opts.manifest, semgrep: opts.semgrep });
  const failed = failsThreshold(report, failOn);
  const out =
    format === 'json'
      ? renderJson(report, VERSION)
      : format === 'sarif'
        ? renderSarif(report, VERSION)
        : renderText(report, { verbose: opts.verbose, failed, failOn });

  if (opts.output) {
    writeText(resolve(opts.output), out);
    // Keep a short human summary on the console when the report goes to a file.
    if (format !== 'text') opts.log(renderText(report, { failed, failOn }).trimEnd());
    opts.log(color.dim(`Report written to ${opts.output}`));
  } else {
    process.stdout.write(out);
  }
  // 1: findings at or above the threshold. 2: the audit could not complete, which must not look like a pass.
  return failed ? 1 : report.semgrepFailed ? 2 : 0;
}
