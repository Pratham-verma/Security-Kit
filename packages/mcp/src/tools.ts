import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import {
  type Control,
  type KnowledgeBase,
  loadDefaultKnowledgeBase,
  loadManifest,
  loadRulePack,
  type ResolvedPlan,
  resolveControls,
} from '@seckit/core';
import {
  audit,
  BUILTIN_CHECKS,
  findSemgrep,
  formatStandards,
  hardcodedSecrets,
  type ProjectFiles,
  publicEnvSecrets,
  runSemgrep,
} from '@seckit/cli/lib';
import { classifyFile, filePlatforms } from './classify.js';
import { text, type Tool, type ToolResult } from './protocol.js';

const MAX_FILE_BYTES = 1_000_000;
const MAX_SNIPPET_BYTES = 256_000;
const SNIPPET_SEMGREP_TIMEOUT_SECONDS = 60;
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const IMPLEMENT_LABELS: Record<string, string> = { node: '@seckit/node', web: '@seckit/web', android: 'Android', ios: 'iOS' };

export interface Context {
  root: string;
  kb: KnowledgeBase;
}

export function createContext(root: string): Context {
  return { root: realpathSync(resolve(root)), kb: loadDefaultKnowledgeBase() };
}

const NO_PLAN =
  'This project has no seckit.yaml yet. Ask the developer to run `npx seckit init` (it detects the stack and asks a few questions), then `npx seckit generate`.';

function loadPlan(ctx: Context): ResolvedPlan | undefined {
  const manifest = join(ctx.root, 'seckit.yaml');
  if (!existsSync(manifest)) return undefined;
  return resolveControls(loadManifest(manifest, ctx.kb), ctx.kb);
}

/** Automated check IDs per control (built-in checks + Semgrep rules). */
function automatedChecks(kb: KnowledgeBase): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (controls: string[], id: string) => controls.forEach((c) => map.set(c, [...(map.get(c) ?? []), id]));
  for (const c of BUILTIN_CHECKS) add(c.controls, c.id);
  for (const r of loadRulePack(kb)) add(r.metadata['seckit-controls'], r.id);
  return map;
}

function controlSummary(c: Control, automated: Map<string, string[]>) {
  return {
    id: c.id,
    severity: c.severity,
    title: c.title,
    rule: c.ai_rule,
    ...(c.implement ? { use: Object.entries(c.implement).map(([where, hint]) => `${IMPLEMENT_LABELS[where] ?? where}: ${hint}`) } : {}),
    checkedBy: automated.has(c.id) ? 'seckit audit (automated)' : 'manual review',
  };
}

/** Resolve a path inside the project; refuses anything outside it, including via symlinks. */
function projectPath(ctx: Context, path: string): { abs: string; rel: string } {
  const abs = resolve(ctx.root, path);
  const inside = (p: string) => p === ctx.root || p.startsWith(ctx.root + sep);
  if (!inside(abs)) throw new Error(`${path} is outside the project`);
  // Check the nearest existing ancestor too, so a not-yet-created file under a symlinked folder is caught.
  let existing = abs;
  while (!existsSync(existing) && existing !== ctx.root) existing = dirname(existing);
  if (!inside(realpathSync(existing))) throw new Error(`${path} resolves outside the project (symlink)`);
  return { abs, rel: relative(ctx.root, abs).split(sep).join('/') };
}

function getSecurityPlan(ctx: Context, args: { component?: string }): ToolResult {
  const plan = loadPlan(ctx);
  if (!plan) return text(NO_PLAN);
  const automated = automatedChecks(ctx.kb);
  const components = plan.components.filter((c) => !args.component || c.component.id === args.component);
  if (components.length === 0) {
    return text(`No component "${args.component}" in this plan. Components: ${plan.components.map((c) => c.component.id).join(', ')}`, true);
  }
  return text({
    app: plan.app,
    howToUse: 'Follow every rule below. Before editing a file call get_controls_for_file; before finishing call check_code.',
    components: components.map((c) => ({
      component: c.component.id,
      name: c.component.name,
      ...(c.instance.name ? { instance: c.instance.name } : {}),
      controls: c.controls.map((x) => controlSummary(x, automated)),
    })),
  });
}

function getControlsForFile(ctx: Context, args: { path: string; content?: string }): ToolResult {
  const plan = loadPlan(ctx);
  if (!plan) return text(NO_PLAN);
  const { abs, rel } = projectPath(ctx, args.path);

  let content = args.content;
  if (content === undefined && existsSync(abs)) {
    if (statSync(abs).size > MAX_FILE_BYTES) throw new Error(`${rel} is larger than 1 MB`);
    content = readFileSync(abs, 'utf8');
  }
  const matches = classifyFile(rel, content ?? '');
  const platforms = filePlatforms(rel);
  const automated = automatedChecks(ctx.kb);

  const seen = new Set<string>();
  const relevant: { component: string; reason: string; controls: ReturnType<typeof controlSummary>[] }[] = [];
  for (const m of matches) {
    for (const c of plan.components.filter((pc) => pc.component.id === m.component)) {
      const controls = c.controls
        .filter((x) => !platforms || (x.platforms ?? c.component.platforms).some((p) => platforms.includes(p)))
        .filter((x) => !seen.has(x.id) && seen.add(x.id));
      if (controls.length > 0) relevant.push({ component: m.component, reason: m.reason, controls: controls.map((x) => controlSummary(x, automated)) });
    }
  }

  if (relevant.length === 0) {
    // Nothing specific: fall back to the plan's critical controls so the assistant still gets the basics.
    const critical = plan.components.flatMap((c) => c.controls).filter((x) => x.severity === 'critical' && !seen.has(x.id) && seen.add(x.id));
    return text({
      file: rel,
      note: 'No component-specific rules matched this file. These critical rules apply to the whole app:',
      controls: critical.map((x) => controlSummary(x, automated)),
    });
  }
  return text({ file: rel, ...(platforms ? { platform: platforms[0] } : {}), relevant });
}

function explainControl(ctx: Context, args: { id: string }): ToolResult {
  const id = args.id.toUpperCase();
  for (const component of ctx.kb.components.values()) {
    const c = component.controls.find((x) => x.id === id);
    if (c) {
      return text({
        id: c.id,
        title: c.title,
        component: component.name,
        severity: c.severity,
        level: c.level,
        rule: c.ai_rule,
        guidance: c.guidance.trim(),
        mitigates: c.mitigates.map((t) => `${t}: ${component.threats.find((x) => x.id === t)?.title ?? ''}`),
        standards: formatStandards(c.standards),
        ...(c.implement ? { use: c.implement } : {}),
        verify: c.verify.map((v) => `${v.type}: ${v.description}`),
      });
    }
    const t = component.threats.find((x) => x.id === id);
    if (t) {
      return text({
        id: t.id,
        title: t.title,
        component: component.name,
        ...(t.description ? { description: t.description } : {}),
        stride: t.stride.join(''),
        cwe: t.cwe ?? [],
        mitigatedBy: component.controls.filter((x) => x.mitigates.includes(t.id)).map((x) => `${x.id}: ${x.title}`),
      });
    }
  }
  return text(`Unknown control or threat ID: ${args.id}`, true);
}

async function checkCode(ctx: Context, args: { code: string; filename: string }): Promise<ToolResult> {
  if (Buffer.byteLength(args.code) > MAX_SNIPPET_BYTES) return text('Code is larger than 256 KB; check it in smaller parts or run run_audit.', true);
  const name = basename(args.filename).replace(/[^\w.-]/g, '_') || 'snippet.txt';
  if (!extname(name)) return text('filename needs an extension (e.g. "src/db.ts") so the language can be detected.', true);

  const plan = loadPlan(ctx);
  const inPlan = plan ? new Set(plan.components.flatMap((c) => c.controls.map((x) => x.id))) : undefined;
  const titles = new Map(
    [...ctx.kb.components.values()].flatMap((c) => c.controls.map((x) => [x.id, { title: x.title, severity: x.severity, rule: x.ai_rule }] as const)),
  );
  const keep = (controls: string[]) => (inPlan ? controls.filter((c) => inPlan.has(c)) : controls);

  const dir = mkdtempSync(join(tmpdir(), 'seckit-mcp-'));
  try {
    writeFileSync(join(dir, name), args.code);
    const files: ProjectFiles = { root: dir, files: [name], git: false, read: () => args.code };
    const findings = [...hardcodedSecrets.run(files), ...publicEnvSecrets.run(files)];

    let semgrepNote: string | undefined;
    const semgrep = findSemgrep();
    if (semgrep) {
      const rules = loadRulePack(ctx.kb).filter((r) => keep(r.metadata['seckit-controls']).length > 0);
      const run = runSemgrep(semgrep, dir, rules, { timeoutSeconds: SNIPPET_SEMGREP_TIMEOUT_SECONDS });
      findings.push(...run.findings);
      if (!run.ok) semgrepNote = `Code rules did not run: ${run.errors.join('; ')}`;
    } else {
      semgrepNote = 'Semgrep is not installed, so only secret checks ran. Install it (pip install semgrep) for code rules.';
    }

    const issues = findings
      .map((f) => ({ line: f.line, controls: keep(f.controls), message: f.message, check: f.check }))
      .filter((f) => f.controls.length > 0)
      .map((f) => ({ ...f, fix: f.controls.map((c) => `${c}: ${titles.get(c)?.rule ?? ''}`) }))
      .sort((a, b) => {
        const sev = (f: typeof a) => Math.min(...f.controls.map((c) => SEVERITY_ORDER[titles.get(c)?.severity ?? 'low']));
        return sev(a) - sev(b) || (a.line ?? 0) - (b.line ?? 0);
      });

    return text({
      filename: args.filename,
      result: issues.length === 0 ? (semgrepNote ? 'no issues found by the checks that ran' : 'no issues found') : `${issues.length} issue(s) found — fix them before finishing`,
      ...(plan ? {} : { note: 'No seckit.yaml: checked against all rules.' }),
      ...(semgrepNote ? { limitation: semgrepNote } : {}),
      issues,
      reminder: 'Automated checks cannot see authorization logic or business rules; also follow get_controls_for_file.',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runAudit(ctx: Context): ToolResult {
  if (!loadPlan(ctx)) return text(NO_PLAN);
  const report = audit({ dir: ctx.root });
  const by = (s: string) => report.controls.filter((c) => c.status === s);
  return text({
    app: report.app.name,
    result: report.semgrepFailed ? 'incomplete' : by('fail').length > 0 ? 'failed' : 'passed',
    summary: Object.fromEntries(['fail', 'risk_accepted', 'attested', 'not_applicable', 'pass', 'skipped', 'manual'].map((s) => [s, by(s).length])),
    failed: by('fail').map((c) => ({
      id: c.id,
      severity: c.severity,
      title: c.title,
      rule: c.control.ai_rule,
      findings: c.findings.slice(0, 10).map((f) => `${f.file}${f.line ? `:${f.line}` : ''} ${f.message}`),
      ...(c.findings.length > 10 ? { more: c.findings.length - 10 } : {}),
    })),
    ...(report.semgrepMissing ? { limitation: 'Semgrep not installed: code rules were skipped.' } : {}),
    warnings: [...report.warnings, ...report.errors],
    note: 'Manual controls need human verification and sign-off (`seckit attest`). Do not mark them done yourself.',
  });
}

const pathArg = { type: 'string', minLength: 1, maxLength: 1024, description: 'File path relative to the project root.' };

export function createTools(ctx: Context): Tool[] {
  return [
    {
      name: 'get_security_plan',
      title: 'Get security plan',
      description:
        "The app's tailored security plan: its components and every control (rule) that applies, with severity and the Security Kit SDK helper to use. Optionally filter by component.",
      inputSchema: {
        type: 'object',
        properties: { component: { type: 'string', maxLength: 64, description: 'e.g. auth, api, database, web_frontend' } },
        additionalProperties: false,
      },
      handler: (args) => getSecurityPlan(ctx, args as { component?: string }),
    },
    {
      name: 'get_controls_for_file',
      title: 'Get security rules for a file',
      description:
        'Call before creating or changing a file. Returns the security controls that apply to that file (detected from its path and code), with the rule to follow and the SDK helper to use. Pass `content` for files that do not exist yet.',
      inputSchema: {
        type: 'object',
        properties: { path: pathArg, content: { type: 'string', maxLength: MAX_FILE_BYTES, description: 'Planned file content, if the file is new or about to change.' } },
        required: ['path'],
        additionalProperties: false,
      },
      handler: (args) => getControlsForFile(ctx, args as { path: string; content?: string }),
    },
    {
      name: 'check_code',
      title: 'Check code for security issues',
      description:
        "Call before finishing a change. Checks a code snippet against the app's security controls (hard-coded secrets, injection, XSS, SSRF, weak hashing, JWT misuse, …) and returns issues with the fix to apply. The code is analysed locally and never leaves the machine.",
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', minLength: 1, maxLength: MAX_SNIPPET_BYTES },
          filename: { ...pathArg, description: 'Intended file name; its extension selects the language, e.g. "src/db.ts".' },
        },
        required: ['code', 'filename'],
        additionalProperties: false,
      },
      handler: (args) => checkCode(ctx, args as { code: string; filename: string }),
    },
    {
      name: 'explain_control',
      title: 'Explain a control or threat',
      description: 'Full guidance for a control or threat ID (e.g. AUTH-C2, API-T1): why it matters, how to implement and verify it, and the standards it maps to.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9]*-[CTct][0-9]+$', maxLength: 32 } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (args) => explainControl(ctx, args as { id: string }),
    },
    {
      name: 'run_audit',
      title: 'Audit the project',
      description:
        'Run `seckit audit` on the whole project and return failed controls with file:line findings. Slower than check_code; use it at the end of a task. Read-only.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: () => runAudit(ctx),
    },
  ];
}

export function instructions(ctx: Context): string {
  const plan = loadPlan(ctx);
  const app = plan ? ` for ${plan.app.name}` : '';
  return [
    `Security Kit${app}: the app has a tailored security plan; follow it in all code you write.`,
    '- Before creating or editing a file, call get_controls_for_file and follow the returned rules.',
    '- Before finishing, call check_code on new or changed code and fix every issue it reports.',
    '- Prefer the @seckit/node and @seckit/web helpers named in the rules over hand-written security code.',
    '- Never record sign-offs or accept risks on the developer\'s behalf; attestations are human decisions.',
  ].join('\n');
}

