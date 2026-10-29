// Dev script: validate the knowledge base and example manifests, print a summary.
// Usage: npm run validate:kb [-- path/to/seckit.yaml ...]
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadKnowledgeBase, loadManifest, loadRulePack, resolveControls, ValidationError } from './index.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

try {
  const kb = loadKnowledgeBase(join(ROOT, 'knowledge-base'));
  const counts = [...kb.components.values()].map((c) => `${c.id} (${c.threats.length}T/${c.controls.length}C)`);
  console.log(`Knowledge base OK: ${counts.join(', ')}`);
  console.log(`Semgrep rule pack OK: ${loadRulePack(kb, join(ROOT, 'knowledge-base', 'rules', 'semgrep')).length} rules`);

  const manifests = process.argv.slice(2);
  if (manifests.length === 0) {
    const examples = join(ROOT, 'examples');
    for (const dir of readdirSync(examples)) {
      if (existsSync(join(examples, dir, 'seckit.yaml'))) manifests.push(join(examples, dir, 'seckit.yaml'));
    }
  }

  for (const path of manifests) {
    const plan = resolveControls(loadManifest(path, kb), kb);
    console.log(`\n${plan.app.name} (level ${plan.app.assurance_level}, ${plan.app.platforms.join('/')})`);
    for (const { component, threats, controls } of plan.components) {
      console.log(`  ${component.name}: ${threats.length} threats, ${controls.length} controls`);
      for (const c of controls) console.log(`    [${c.severity.padEnd(8)}] ${c.id}  ${c.title}`);
    }
  }
} catch (e) {
  console.error(e instanceof ValidationError ? e.message : e);
  process.exit(1);
}
