// @seckit/core for browsers: the pure engine plus the knowledge base compiled in at build time.
// No Node APIs and no runtime code generation (works under a CSP without 'unsafe-eval').
import { KB_COMPONENTS, RULE_CONTROLS } from './generated/kb-data.js';
import * as compiled from './generated/validators.js';
import { buildKnowledgeBase } from './kb.js';
import type { KnowledgeBase, Validator } from './types.js';

export * from './engine.js';
export { RULE_CONTROLS } from './generated/kb-data.js';

const v = compiled as unknown as Record<string, Validator>;
let cached: KnowledgeBase | undefined;

/** The knowledge base that ships with this version of Security Kit. */
export function loadBundledKnowledgeBase(): KnowledgeBase {
  cached ??= buildKnowledgeBase(structuredClone(KB_COMPONENTS), {
    manifest: v.manifest!,
    attestations: v.attestations!,
    options: (id) => v[`options_${id}`],
  });
  return cached;
}

/** Control ID -> Semgrep rule IDs that check it (the scan itself runs in the CLI). */
export function automatedRulesByControl(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [rule, controls] of Object.entries(RULE_CONTROLS)) for (const c of controls) map.set(c, [...(map.get(c) ?? []), rule]);
  return map;
}
