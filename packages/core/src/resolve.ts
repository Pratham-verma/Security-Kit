import type {
  Control,
  KnowledgeBase,
  Level,
  Manifest,
  ManifestComponent,
  Platform,
  ResolvedPlan,
  Severity,
  When,
} from './types.js';

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * True if every option named in `when` has a value (or array item) among the accepted values.
 * An unset option matches: when we do not know, include the control rather than silently drop it.
 */
export function matchesWhen(when: When | undefined, instance: ManifestComponent): boolean {
  if (!when) return true;
  return Object.entries(when).every(([option, accepted]) => {
    const value = instance[option];
    if (value === undefined) return true;
    const values = Array.isArray(value) ? value : [value];
    return values.some((v) => accepted.includes(v as never));
  });
}

/**
 * Turn a validated manifest into the threats and controls that apply to this app,
 * filtered by component options, platforms and assurance level.
 */
export function resolveControls(manifest: Manifest, kb: KnowledgeBase): ResolvedPlan {
  const level: Level = manifest.app.assurance_level ?? 2;
  const appPlatforms = new Set<Platform>(manifest.app.platforms);

  const components = manifest.components.map((instance) => {
    const component = kb.components.get(instance.type);
    if (!component) throw new Error(`Unknown component type "${instance.type}"; validate the manifest first`);

    const onAppPlatform = (c: Control) => (c.platforms ?? component.platforms).some((p) => appPlatforms.has(p));

    const controls = component.controls
      .filter((c) => c.level <= level && matchesWhen(c.when, instance) && onAppPlatform(c))
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

    const mitigated = new Set(controls.flatMap((c) => c.mitigates));
    const threats = component.threats.filter((t) => matchesWhen(t.when, instance) && mitigated.has(t.id));

    return { instance, component, threats, controls };
  });

  return { app: { ...manifest.app, assurance_level: level }, components };
}
