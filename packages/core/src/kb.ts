import { type Component, type KnowledgeBase, ValidationError, type Validators, type When } from './types.js';

/**
 * Build a knowledge base from already schema-checked components: cross-reference checks, then wizard order.
 * `issues` carries problems found while loading (e.g. schema errors) so everything is reported at once.
 */
export function buildKnowledgeBase(list: Component[], validators: Validators, issues: string[] = []): KnowledgeBase {
  const components = new Map<string, Component>();
  for (const component of list) {
    if (components.has(component.id)) {
      issues.push(`duplicate component id "${component.id}"`);
      continue;
    }
    components.set(component.id, component);
  }
  issues.push(...checkConsistency(components));
  if (issues.length > 0) throw new ValidationError('Invalid knowledge base', issues);

  const ordered = [...components.values()].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.id.localeCompare(b.id));
  return { components: new Map(ordered.map((c) => [c.id, c])), validators };
}

/** Cross-reference checks that JSON Schema cannot express. */
function checkConsistency(components: Map<string, Component>): string[] {
  const issues: string[] = [];
  const seenIds = new Set<string>();

  for (const c of components.values()) {
    const where = `component "${c.id}"`;
    const optionNames = new Set(Object.keys((c.options?.properties as object | undefined) ?? {}));
    const threatIds = new Set(c.threats.map((t) => t.id));
    const mitigated = new Set<string>();

    const checkWhen = (owner: string, when: When | undefined) => {
      for (const key of Object.keys(when ?? {})) {
        if (!optionNames.has(key)) issues.push(`${where}: ${owner} "when" uses unknown option "${key}"`);
      }
    };

    for (const item of [...c.threats, ...c.controls]) {
      if (seenIds.has(item.id)) issues.push(`${where}: id "${item.id}" is used more than once`);
      seenIds.add(item.id);
    }

    for (const t of c.threats) checkWhen(t.id, t.when);

    for (const ctl of c.controls) {
      checkWhen(ctl.id, ctl.when);
      for (const m of ctl.mitigates) {
        if (!threatIds.has(m)) issues.push(`${where}: ${ctl.id} mitigates unknown threat "${m}"`);
        mitigated.add(m);
      }
      for (const p of ctl.platforms ?? []) {
        if (!c.platforms.includes(p)) issues.push(`${where}: ${ctl.id} platform "${p}" is not a platform of the component`);
      }
    }

    for (const t of c.threats) {
      if (!mitigated.has(t.id)) issues.push(`${where}: threat ${t.id} has no mitigating control`);
    }
  }
  return issues;
}
