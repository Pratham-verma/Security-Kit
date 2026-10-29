import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadDefaultKnowledgeBase, type Manifest, renderManifestYaml, unansweredOptions, validateManifest } from '@seckit/core';

export { renderManifestYaml, unansweredOptions } from '@seckit/core';
import { type Detection, detectProject } from '../detect.js';
import type { Prompter } from '../prompt.js';
import { color, type Log, safeOutputPath, writeText } from '../util.js';
import { manifestFromDetection, runWizard } from '../wizard.js';
import { generate } from './generate.js';

export interface InitOptions {
  dir: string;
  /** Non-interactive: build the manifest from auto-detection only. */
  yes?: boolean;
  force?: boolean;
  log: Log;
  /** Required unless `yes` is set. */
  prompter?: Prompter;
}

function printDetection(d: Detection, log: Log): void {
  if (d.platforms.length === 0 && d.components.length === 0) {
    log(color.dim('Nothing detected automatically — answer a few questions instead.'));
    return;
  }
  log(color.bold('Detected:'));
  for (const p of d.platforms) log(`  platform  ${p} ${color.dim(`(${d.platformEvidence[p]!.join(', ')})`)}`);
  for (const c of d.components) log(`  component ${c.type}${c.name ? ` (${c.name})` : ''} ${color.dim(`(${c.evidence.join(', ')})`)}`);
  log('');
}

export async function init(opts: InitOptions): Promise<number> {
  const { dir, log } = opts;
  const kb = loadDefaultKnowledgeBase();
  const target = safeOutputPath(dir, 'seckit.yaml');

  if (existsSync(target) && !opts.force) {
    if (opts.yes || !opts.prompter) {
      log(color.red('seckit.yaml already exists. Use --force to overwrite it.'));
      return 1;
    }
    if (!(await opts.prompter.confirm('seckit.yaml already exists. Overwrite it?', false))) return 1;
  }

  const detection = detectProject(dir);
  printDetection(detection, log);

  let manifest: Manifest;
  if (opts.yes) {
    manifest = manifestFromDetection(detection);
  } else {
    if (!opts.prompter) throw new Error('Interactive init needs a terminal; use --yes for auto-detection only.');
    manifest = await runWizard(kb, detection, opts.prompter);
  }

  validateManifest(manifest, kb); // throws with details if invalid; fills option defaults
  writeText(target, renderManifestYaml(manifest));
  log(`${color.green('created')} seckit.yaml`);

  const missing = unansweredOptions(manifest, kb);
  if (missing.length > 0) {
    log(color.yellow(`Not answered: ${missing.join(', ')}.`));
    log(color.yellow('Controls for every possible answer are included; fill these in seckit.yaml for a tighter plan.'));
  }

  const runNow = opts.yes || !opts.prompter || (await opts.prompter.confirm('Generate the security plan now?', true));
  if (!runNow) {
    log(`Next: ${color.bold('npx seckit generate')}`);
    return 0;
  }
  log('');
  return generate({ dir, manifest: join(dir, 'seckit.yaml'), log });
}
