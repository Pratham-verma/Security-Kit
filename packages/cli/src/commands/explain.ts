import { loadDefaultKnowledgeBase } from '@seckit/core';
import { formatStandards } from '@seckit/core';
import { color, type Log } from '../util.js';

export function explain(id: string, log: Log): number {
  const kb = loadDefaultKnowledgeBase();
  const wanted = id.toUpperCase();

  for (const component of kb.components.values()) {
    const control = component.controls.find((c) => c.id === wanted);
    if (control) {
      log(`${color.bold(control.id)} · ${control.title}`);
      log(color.dim(`${component.name} · severity ${control.severity} · level ${control.level}`));
      log('');
      log(control.guidance.trim());
      log('');
      log(`${color.bold('Mitigates:')} ${control.mitigates.map((m) => `${m} ${component.threats.find((t) => t.id === m)?.title ?? ''}`).join('; ')}`);
      log(`${color.bold('Standards:')} ${formatStandards(control.standards)}`);
      log(`${color.bold('AI rule:')}   ${control.ai_rule}`);
      log(color.bold('Verify:'));
      for (const v of control.verify) log(`  - [${v.type}] ${v.description}`);
      return 0;
    }

    const threat = component.threats.find((t) => t.id === wanted);
    if (threat) {
      log(`${color.bold(threat.id)} · ${threat.title}`);
      log(color.dim(`${component.name} · STRIDE ${threat.stride.join('')}${threat.cwe ? ` · ${threat.cwe.join(', ')}` : ''}`));
      if (threat.description) log(`\n${threat.description}`);
      log(`\n${color.bold('Mitigated by:')}`);
      for (const c of component.controls.filter((c) => c.mitigates.includes(threat.id))) log(`  - ${c.id} ${c.title}`);
      return 0;
    }
  }

  log(color.red(`Unknown control or threat ID: ${id}`));
  return 1;
}
