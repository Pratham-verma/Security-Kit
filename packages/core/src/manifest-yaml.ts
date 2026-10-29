// seckit.yaml as text, and which questions a manifest leaves open. No Node APIs: used in the browser too.
import { Document, isMap, isScalar, isSeq, visit } from 'yaml';
import type { KnowledgeBase, Manifest } from './types.js';

/** Options the schema declares that the manifest leaves unset and has no default for. */
export function unansweredOptions(manifest: Manifest, kb: KnowledgeBase): string[] {
  const missing: string[] = [];
  for (const c of manifest.components) {
    const props = ((kb.components.get(c.type)?.options?.properties ?? {}) as Record<string, { default?: unknown }>);
    for (const [name, s] of Object.entries(props)) {
      if (c[name] === undefined && s.default === undefined) missing.push(`${c.type}.${name}`);
    }
  }
  return missing;
}

export function renderManifestYaml(manifest: Manifest): string {
  const doc = new Document(manifest);
  doc.commentBefore =
    ' Security Kit app manifest — describes your app so Security Kit can tailor its security plan.\n' +
    ' Edit it, then run `npx seckit generate`. Schema: schemas/seckit.schema.json';
  visit(doc, {
    Seq(_, node) {
      if (node.items.every((i) => isScalar(i))) node.flow = true;
    },
  });
  if (isMap(doc.contents)) {
    for (const pair of doc.contents.items.slice(1)) {
      if (isScalar(pair.key)) pair.key.spaceBefore = true;
    }
  }
  const components = doc.get('components', true);
  if (isSeq(components)) components.items.slice(1).forEach((item) => isMap(item) && (item.spaceBefore = true));
  return doc.toString({ lineWidth: 0 });
}
