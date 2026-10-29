import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { assetDir } from './assets.js';
import { type KnowledgeBase, ValidationError } from './types.js';

export interface SemgrepRule {
  id: string;
  message: string;
  severity: string;
  languages: string[];
  metadata: { 'seckit-controls': string[]; [key: string]: unknown };
  [key: string]: unknown;
}

export function defaultRulesDir(): string {
  return join(assetDir('knowledge-base'), 'rules', 'semgrep');
}

/** Load the Semgrep rule pack and check that every rule maps to controls that exist in the knowledge base. */
export function loadRulePack(kb: KnowledgeBase, dir = defaultRulesDir()): SemgrepRule[] {
  const controlIds = new Set([...kb.components.values()].flatMap((c) => c.controls.map((x) => x.id)));
  const issues: string[] = [];
  const seen = new Set<string>();
  const rules: SemgrepRule[] = [];

  const files = readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const file of files.sort()) {
    const doc = parse(readFileSync(join(dir, file), 'utf8')) as { rules?: SemgrepRule[] } | null;
    for (const rule of doc?.rules ?? []) {
      const where = `${file}: ${rule.id ?? '(no id)'}`;
      if (typeof rule.id !== 'string' || !/^seckit\.[a-z0-9-]+\.[a-z0-9-]+$/.test(rule.id)) {
        issues.push(`${where}: id must look like seckit.<control>.<name>`);
        continue;
      }
      if (seen.has(rule.id)) issues.push(`${where}: duplicate rule id`);
      seen.add(rule.id);

      const controls = rule.metadata?.['seckit-controls'];
      if (!Array.isArray(controls) || controls.length === 0) {
        issues.push(`${where}: metadata.seckit-controls must list at least one control`);
        continue;
      }
      for (const c of controls) if (!controlIds.has(c)) issues.push(`${where}: unknown control "${c}"`);
      const prefix = rule.id.split('.')[1]!.toUpperCase();
      if (!controls.includes(prefix)) issues.push(`${where}: id prefix ${prefix} is not among its controls`);
      rules.push(rule);
    }
  }

  if (issues.length > 0) throw new ValidationError('Invalid Semgrep rule pack', issues);
  return rules;
}
