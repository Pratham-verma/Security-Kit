import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import type { SemgrepRule } from '@seckit/core';
import { stringify } from 'yaml';
import type { Finding } from './builtin.js';

export interface SemgrepInfo {
  bin: string;
  version: string;
}

/** Locate a working semgrep binary: explicit path, $SECKIT_SEMGREP, then PATH. */
export function findSemgrep(explicit?: string): SemgrepInfo | undefined {
  const candidates = explicit ? [explicit] : [process.env.SECKIT_SEMGREP, 'semgrep'].filter((c): c is string => !!c);
  for (const bin of candidates) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8', env: semgrepEnv() });
    if (r.status === 0) return { bin, version: r.stdout.trim() };
  }
  return undefined;
}

const semgrepEnv = () => ({ ...process.env, SEMGREP_SEND_METRICS: 'off', SEMGREP_ENABLE_VERSION_CHECK: '0' });

interface SemgrepJson {
  results: { path: string; start: { line: number }; extra: { message: string; metadata?: Record<string, unknown> } }[];
  errors: { message?: string; type?: unknown; level?: string }[];
}

export interface SemgrepRun {
  /** False when Semgrep did not complete (crash, timeout, unreadable output): its rules did not run. */
  ok: boolean;
  findings: Finding[];
  errors: string[];
}

const DEFAULT_TIMEOUT_SECONDS = 600;

export function runSemgrep(semgrep: SemgrepInfo, root: string, rules: SemgrepRule[], opts: { timeoutSeconds?: number } = {}): SemgrepRun {
  const dir = mkdtempSync(join(tmpdir(), 'seckit-semgrep-'));
  try {
    // Semgrep prefixes check_id with the config path, so carry the plain rule id in metadata.
    const tagged = rules.map((r) => ({ ...r, metadata: { ...r.metadata, 'seckit-id': r.id } }));
    const config = join(dir, 'seckit-rules.yaml');
    writeFileSync(config, stringify({ rules: tagged }));

    const args = ['scan', '--config', config, '--json', '--metrics=off', '--disable-version-check', '--quiet'];
    for (const ex of ['node_modules', '.seckit', 'dist', 'build', '.next', 'coverage', 'vendor', 'Pods']) args.push('--exclude', ex);
    args.push(root);

    const timeoutSeconds = opts.timeoutSeconds ?? (Number(process.env.SECKIT_SEMGREP_TIMEOUT) || DEFAULT_TIMEOUT_SECONDS);
    const r = spawnSync(semgrep.bin, args, {
      encoding: 'utf8',
      env: semgrepEnv(),
      stdio: ['ignore', 'pipe', 'pipe'], // never let semgrep wait on stdin
      maxBuffer: 512 * 1024 * 1024,
      timeout: timeoutSeconds * 1000,
    });
    if (r.error) {
      const reason = (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT' ? `timed out after ${timeoutSeconds}s (set SECKIT_SEMGREP_TIMEOUT)` : r.error.message;
      return { ok: false, findings: [], errors: [`semgrep did not complete: ${reason}`] };
    }

    let out: SemgrepJson;
    try {
      out = JSON.parse(r.stdout) as SemgrepJson;
      if (!Array.isArray(out.results)) throw new Error('no results');
    } catch {
      const tail = (r.stderr ?? '').trim().split('\n').slice(-3).join(' ');
      return { ok: false, findings: [], errors: [`semgrep did not complete (exit code ${r.status})${tail ? `: ${tail}` : ''}`] };
    }

    const findings = out.results.map((res) => {
      const meta = res.extra.metadata ?? {};
      const path = isAbsolute(res.path) ? relative(root, res.path) : res.path;
      return {
        controls: (meta['seckit-controls'] as string[] | undefined) ?? [],
        check: String(meta['seckit-id'] ?? 'semgrep'),
        file: path.split('\\').join('/'),
        line: res.start.line,
        message: res.extra.message,
      };
    });
    const errors = out.errors
      .filter((e) => e.level !== 'warn')
      .map((e) => `semgrep: ${(e.message ?? JSON.stringify(e.type)).split('\n')[0]}`);
    return { ok: true, findings, errors };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
