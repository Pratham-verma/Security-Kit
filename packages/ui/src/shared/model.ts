// The data the UI shows, computed from the engine. Shared by the local server (Node) and the hosted app
// (browser), so both modes give exactly the same answers. No Node or DOM APIs here.
import {
  AI_CHOICES,
  buildChecklist,
  type Control,
  defaultStandards,
  type KnowledgeBase,
  LEVEL_CHOICES,
  type Manifest,
  PLATFORM_CHOICES,
  renderAiPrompt,
  type ResolvedPlan,
  resolveControls,
  SENSITIVITY_CHOICES,
  type Severity,
  STANDARD_LABELS,
  ValidationError,
  validateManifest,
} from '@seckit/core/engine';

/** An error the page should show as-is (bad input, not a crash). */
export class UserError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
    readonly status = 400,
  ) {
    super(message);
  }
}

export const SEVERITY_VALUES: Severity[] = ['critical', 'high', 'medium', 'low'];
export const asSeverity = (v: string | null | undefined): Severity | undefined => (SEVERITY_VALUES.includes(v as Severity) ? (v as Severity) : undefined);

/** `automated`: control ID -> IDs of the automated checks that verify it. */
export function planView(plan: ResolvedPlan, automated: Map<string, string[]>) {
  const view = (c: Control) => ({ ...c, automated: automated.get(c.id) ?? [] });
  return {
    app: plan.app,
    components: plan.components.map((rc) => ({
      type: rc.component.id,
      title: rc.component.name,
      description: rc.component.description,
      instance: rc.instance,
      threats: rc.threats,
      controls: rc.controls.map(view),
    })),
  };
}

type ChoiceList = { value: unknown; label: string; hint?: string }[];

export interface CatalogView {
  components: { id: string; name: string; description: string; category: 'app' | 'cloud'; question: string; platforms: string[]; options: Record<string, unknown>; controls: number }[];
  choices: Record<'platforms' | 'sensitivity' | 'levels' | 'assistants', ChoiceList>;
  standards: Record<string, string>;
}

/** Knowledge-base metadata the "Describe your app" form is built from. */
export function catalogView(kb: KnowledgeBase): CatalogView {
  return {
    components: [...kb.components.values()].map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      category: c.category ?? 'app',
      question: c.question ?? `Does the app have: ${c.name}?`,
      platforms: c.platforms,
      options: c.options ?? {},
      controls: c.controls.length,
    })),
    choices: { platforms: PLATFORM_CHOICES, sensitivity: SENSITIVITY_CHOICES, levels: LEVEL_CHOICES, assistants: AI_CHOICES },
    standards: STANDARD_LABELS,
  };
}

/** Validate a manifest from the form; fill standards the same way `seckit init` does. */
export function checkManifest(kb: KnowledgeBase, input: unknown): Manifest {
  if (!input || typeof input !== 'object') throw new UserError('Expected a manifest object.');
  const manifest = structuredClone(input) as Manifest;
  if (manifest.app && Array.isArray(manifest.app.platforms) && Array.isArray(manifest.components) && !manifest.standards) {
    manifest.standards = defaultStandards(manifest.app.platforms, manifest.components.map((c) => c.type));
  }
  try {
    validateManifest(manifest, kb);
  } catch (e) {
    if (e instanceof ValidationError) throw new UserError('Some answers need attention.', e.issues);
    throw e;
  }
  return manifest;
}

/** Size of the plan a draft manifest would produce, without saving anything. */
export function previewView(kb: KnowledgeBase, input: unknown) {
  try {
    const plan = resolveControls(checkManifest(kb, input), kb);
    const unique = new Map(plan.components.flatMap((c) => c.controls).map((c) => [c.id, c]));
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const c of unique.values()) bySeverity[c.severity]++;
    return { valid: true, components: plan.components.length, controls: unique.size, bySeverity };
  } catch (e) {
    if (e instanceof UserError) return { valid: false, message: e.message, issues: e.issues };
    throw e;
  }
}

export type Progress = Record<string, { done: boolean; by?: string; date?: string }>;
export type ScanView = Record<string, { status: string; findings: { file: string; line?: number; message: string }[] }>;

export function checklistView(plan: ResolvedPlan, progress: Progress, scan: ScanView, file: string) {
  return { checklist: buildChecklist(plan), progress, scan, file };
}

export function inPlan(plan: ResolvedPlan, id: string): boolean {
  return plan.components.some((c) => c.controls.some((x) => x.id === id));
}

export function promptView(plan: ResolvedPlan, manifest: Manifest, query: { mode?: string | null; min?: string | null }) {
  const mode = query.mode === 'build' || query.mode === 'test' ? query.mode : 'audit';
  const minSeverity = asSeverity(query.min);
  const text = renderAiPrompt(plan, manifest, { mode, minSeverity });
  const counts = Object.fromEntries(SEVERITY_VALUES.map((s) => [s, buildChecklist(plan, { minSeverity: s }).total]));
  return { text, mode, items: buildChecklist(plan, { minSeverity }).total, counts };
}

/**
 * App name from the project's own metadata (package.json, pyproject.toml, pubspec.yaml, pom.xml, Gradle).
 * `fallback` (the folder name) is a last resort — in Docker it is always "project".
 */
export function projectNameFrom(read: (file: string) => string | undefined, fallback: string): string {
  const text = (file: string) => read(file) ?? '';
  const fromPackageJson = () => {
    try {
      return (JSON.parse(text('package.json') || '{}') as { name?: string }).name?.replace(/^@[^/]+\//, '');
    } catch {
      return undefined;
    }
  };
  const candidates = [
    fromPackageJson(),
    text('pyproject.toml').match(/^\[(?:project|tool\.poetry)\][^[]*?^name\s*=\s*["']([^"']+)["']/ms)?.[1],
    text('pubspec.yaml').match(/^name:\s*([\w-]+)/m)?.[1],
    text('pom.xml').replace(/<parent>[\s\S]*?<\/parent>/, '').match(/<artifactId>\s*([\w.-]+)\s*<\/artifactId>/)?.[1],
    text('settings.gradle.kts').match(/rootProject\.name\s*=\s*"([^"]+)"/)?.[1],
    text('settings.gradle').match(/rootProject\.name\s*=\s*['"]([^'"]+)['"]/)?.[1],
  ];
  return candidates.find((n) => n && n.trim())?.trim() ?? fallback;
}
