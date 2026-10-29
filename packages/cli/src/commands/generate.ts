import { join, relative } from 'node:path';
import { loadDefaultKnowledgeBase, loadManifest, loadRulePack, resolveControls } from '@seckit/core';
import { BUILTIN_CHECKS } from '../audit/builtin.js';
import { AI_FILES, mergeManagedBlock, renderCursorRule, renderRules } from '@seckit/core';
import { renderControlsJson } from '@seckit/core';
import { renderPlanMarkdown } from '@seckit/core';
import { renderSnippets } from '@seckit/core';
import { color, type Log, readTextIfExists, safeOutputPath, VERSION, writeText } from '../util.js';

export interface GenerateOptions {
  dir: string;
  manifest?: string;
  /** Do not write; exit 1 if any output is missing or out of date (for CI). */
  check?: boolean;
  log: Log;
}

interface Output {
  path: string;
  content: string;
  mode: 'managed' | 'owned';
}

export function generate(opts: GenerateOptions): number {
  const { dir, log } = opts;
  const manifestPath = opts.manifest ?? join(dir, 'seckit.yaml');
  const kb = loadDefaultKnowledgeBase();
  const manifest = loadManifest(manifestPath, kb);
  const plan = resolveControls(manifest, kb);

  const checks = new Map<string, string[]>();
  const addCheck = (controls: string[], id: string) => controls.forEach((c) => checks.set(c, [...(checks.get(c) ?? []), id]));
  for (const check of BUILTIN_CHECKS) addCheck(check.controls, check.id);
  for (const rule of loadRulePack(kb)) addCheck(rule.metadata['seckit-controls'], rule.id);

  const rules = renderRules(plan);
  const outputs: Output[] = [
    { path: '.seckit/SECURITY-PLAN.md', content: renderPlanMarkdown(plan, manifest, VERSION, checks), mode: 'owned' },
    { path: '.seckit/controls.json', content: renderControlsJson(plan, VERSION), mode: 'owned' },
  ];
  for (const snippet of renderSnippets(plan)) outputs.push({ ...snippet, mode: 'owned' });
  for (const assistant of manifest.ai_assistants ?? ['agents_md']) {
    const { path, mode } = AI_FILES[assistant];
    outputs.push({ path, mode, content: assistant === 'cursor' ? renderCursorRule(rules, VERSION) : rules });
  }

  const stale: string[] = [];
  for (const out of outputs) {
    const target = safeOutputPath(dir, out.path);
    const current = readTextIfExists(target);
    const next = out.mode === 'managed' ? mergeManagedBlock(current, out.content) : out.content;

    if (current === next) {
      if (!opts.check) log(`  ${color.dim('unchanged')} ${out.path}`);
      continue;
    }
    if (opts.check) {
      stale.push(out.path);
      continue;
    }
    writeText(target, next);
    log(`  ${color.green(current === undefined ? 'created  ' : 'updated  ')} ${out.path}`);
  }

  const total = plan.components.reduce((n, c) => n + c.controls.length, 0);
  if (opts.check) {
    if (stale.length === 0) {
      log(color.green('Security Kit outputs are up to date.'));
      return 0;
    }
    log(color.red(`Out of date: ${stale.join(', ')}`));
    log(`Run ${color.bold('npx seckit generate')} and commit the result.`);
    return 1;
  }

  log('');
  log(`${color.bold(plan.app.name)}: ${plan.components.length} components, ${total} controls (level ${plan.app.assurance_level}).`);
  log(`Read the plan: ${color.cyan(relative(process.cwd(), join(dir, '.seckit/SECURITY-PLAN.md')) || '.seckit/SECURITY-PLAN.md')}`);
  return 0;
}
