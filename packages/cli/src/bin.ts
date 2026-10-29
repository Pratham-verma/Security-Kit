#!/usr/bin/env node
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDefaultKnowledgeBase, loadManifest, resolveControls, ValidationError } from '@seckit/core';
import { attest } from './commands/attest.js';
import { checklistCommand, promptCommand } from './commands/checklist.js';
import { auditCommand } from './commands/audit.js';
import { explain } from './commands/explain.js';
import { generate } from './commands/generate.js';
import { init } from './commands/init.js';
import { createTerminalPrompter } from './prompt.js';
import { color, VERSION } from './util.js';

const HELP = `${color.bold('seckit')} ${VERSION} — tailored security for your application

${color.bold('Usage')}
  seckit init [--yes] [--force]     Describe your app (auto-detects, then asks) and write seckit.yaml
  seckit generate [--check]         Write .seckit/SECURITY-PLAN.md, controls.json and AI assistant rules
  seckit checklist [--format md]    Print a security checklist to work through by hand
  seckit prompt [--mode audit]      Print a prompt for Claude Code, Cursor, Copilot, Gemini CLI or Codex
  seckit audit [--format f]         Check the code against the plan (built-in checks + Semgrep rules)
  seckit ui [--dir path]            Open the full app in your browser for this project
  seckit attest [ID] [--status s]    Record a human sign-off for a control (no ID: list sign-offs)
  seckit validate                   Check seckit.yaml against the schema and knowledge base
  seckit explain <ID>               Show a control or threat, e.g. seckit explain AUTH-C2

${color.bold('Options')}
  --dir <path>        Project directory (default: current directory)
  -m, --manifest <f>  Manifest path (default: <dir>/seckit.yaml)
  -y, --yes           init: no questions, use auto-detection only
  -f, --force         init: overwrite an existing seckit.yaml
  --check             generate: write nothing, exit 1 if outputs are out of date (for CI)
  --format <f>        audit: text (default), json or sarif · checklist: md (default) or json
  -o, --output <file> audit, checklist, prompt: write to a file instead of the terminal
  --mode <m>          prompt: audit (review and fix existing code, default), build (rules for
                      new code) or test (run every test case and report, change nothing)
  --min-severity <s>  checklist, prompt: only critical|high|medium|low and above (default: low = everything)
  --fail-on <sev>     audit: exit 1 on failed controls at or above critical|high|medium|low|none (default: high)
  --semgrep <path>    audit: semgrep binary to use (default: $SECKIT_SEMGREP, then PATH)
  --no-semgrep        audit: run built-in checks only
  --verbose           audit: list every control and every finding
  --status <s>        attest: done | not_applicable | risk_accepted
  --evidence <text>   attest: how it was verified (required for done)
  --reason <text>     attest: why (required for not_applicable and risk_accepted)
  --expires <date>    attest: YYYY-MM-DD re-verification date (required for risk_accepted)
  --by <name>         attest: who signed off (default: git user.name)
  --remove            attest: delete the sign-off for ID
  -h, --help          Show this help
  -v, --version       Show the version
`;

/** `seckit ui …` hands over to @seckit/ui (its own options, e.g. --port), before the CLI parses anything. */
async function runUi(): Promise<number> {
  // @seckit/ui ships with the `seckit` package; it is optional for @seckit/cli alone.
  const spec = '@seckit/ui/bin';
  process.argv.splice(2, 1);
  try {
    await import(spec);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw e;
    console.error(color.red('The browser app is not installed. Run `npx seckit ui` (the seckit package includes it) or install @seckit/ui.'));
    return 1;
  }
  return 0;
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === 'ui') return runUi();
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      dir: { type: 'string' },
      manifest: { type: 'string', short: 'm' },
      yes: { type: 'boolean', short: 'y' },
      force: { type: 'boolean', short: 'f' },
      check: { type: 'boolean' },
      format: { type: 'string' },
      mode: { type: 'string' },
      'min-severity': { type: 'string' },
      output: { type: 'string', short: 'o' },
      'fail-on': { type: 'string' },
      semgrep: { type: 'string' },
      'no-semgrep': { type: 'boolean' },
      verbose: { type: 'boolean' },
      status: { type: 'string' },
      evidence: { type: 'string' },
      reason: { type: 'string' },
      expires: { type: 'string' },
      by: { type: 'string' },
      remove: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  const log = (line = '') => console.log(line);
  const dir = resolve(values.dir ?? process.cwd());
  const manifest = values.manifest ? resolve(values.manifest) : undefined;
  const [command, ...args] = positionals;

  if (values.version) {
    log(VERSION);
    return 0;
  }
  if (values.help || !command) {
    log(HELP);
    return values.help ? 0 : 2;
  }

  switch (command) {
    case 'init': {
      const prompter = values.yes ? undefined : createTerminalPrompter();
      try {
        return await init({ dir, yes: values.yes, force: values.force, log, prompter });
      } finally {
        prompter?.close();
      }
    }
    case 'generate':
      return generate({ dir, manifest, check: values.check, log });
    case 'audit':
      return auditCommand({
        dir,
        manifest,
        format: values.format,
        output: values.output,
        failOn: values['fail-on'],
        semgrep: values['no-semgrep'] ? false : values.semgrep,
        verbose: values.verbose,
        log,
      });
    case 'checklist':
      return checklistCommand({ dir, manifest, format: values.format, minSeverity: values['min-severity'], output: values.output, log });
    case 'prompt':
      return promptCommand({ dir, manifest, mode: values.mode, minSeverity: values['min-severity'], output: values.output, log });
    case 'attest':
      return attest({
        dir,
        id: args[0],
        status: values.status,
        evidence: values.evidence,
        reason: values.reason,
        expires: values.expires,
        by: values.by,
        remove: values.remove,
        log,
      });
    case 'validate': {
      const kb = loadDefaultKnowledgeBase();
      const plan = resolveControls(loadManifest(manifest ?? join(dir, 'seckit.yaml'), kb), kb);
      const total = plan.components.reduce((n, c) => n + c.controls.length, 0);
      log(color.green(`seckit.yaml is valid: ${plan.components.length} components, ${total} controls.`));
      return 0;
    }
    case 'explain':
      if (!args[0]) {
        log('Usage: seckit explain <CONTROL-OR-THREAT-ID>');
        return 2;
      }
      return explain(args[0], log);
    default:
      log(color.red(`Unknown command: ${command}`));
      log(HELP);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    const e = err as Error & { code?: string };
    if (e.name === 'AbortError') {
      process.exitCode = 130; // Ctrl+C during a prompt
    } else if (e instanceof ValidationError) {
      console.error(color.red(e.message));
      process.exitCode = 1;
    } else if (e.code?.startsWith('ERR_PARSE_ARGS')) {
      console.error(color.red(e.message), '\nRun `seckit --help` for usage.');
      process.exitCode = 2;
    } else if (e.code === 'ENOENT') {
      console.error(color.red(`File not found: ${(e as NodeJS.ErrnoException).path}`), '\nRun `seckit init` first.');
      process.exitCode = 1;
    } else {
      console.error(color.red(e.message ?? String(err)));
      process.exitCode = 1;
    }
  },
);
