import {
  AI_CHOICES,
  type AiAssistant,
  type Component,
  defaultStandards,
  type KnowledgeBase,
  LEVEL_CHOICES,
  type Manifest,
  type ManifestComponent,
  PLATFORM_CHOICES,
  SENSITIVITY_CHOICES,
} from '@seckit/core';
import { type DetectedComponent, type Detection, ENGINE_KIND } from './detect.js';

export { AI_CHOICES, defaultStandards, LEVEL_CHOICES, manifestFromDetection, PLATFORM_CHOICES, SENSITIVITY_CHOICES } from '@seckit/core';
import type { Choice, Prompter } from './prompt.js';

const humanize = (v: unknown) => String(v).replace(/_/g, ' ');

interface OptionSchema {
  title?: string;
  type?: string;
  enum?: unknown[];
  items?: { enum?: unknown[] };
  default?: unknown;
  minItems?: number;
}

/** Fill a default the option schema cannot express, e.g. database kind from engine. */
function inferredDefault(componentId: string, option: string, current: Record<string, unknown>): unknown {
  if (componentId === 'database' && option === 'kind' && typeof current.engine === 'string') {
    return ENGINE_KIND[current.engine];
  }
  return undefined;
}

/** Ask for each option declared in the component's options schema. */
async function askOptions(
  component: Component,
  prefill: Record<string, unknown>,
  p: Prompter,
): Promise<Record<string, unknown>> {
  const schema = (component.options ?? {}) as { properties?: Record<string, OptionSchema>; required?: string[] };
  const required = new Set(schema.required ?? []);
  const options: Record<string, unknown> = {};

  for (const [name, s] of Object.entries(schema.properties ?? {})) {
    const message = s.title ?? humanize(name);
    const def = prefill[name] ?? inferredDefault(component.id, name, options) ?? s.default;

    if (s.enum) {
      const choices: Choice<unknown>[] = s.enum.map((v) => ({ value: v, label: humanize(v) }));
      if (!required.has(name)) choices.push({ value: null, label: 'not sure / skip' });
      const value = await p.select(message, choices, def ?? (required.has(name) ? undefined : null));
      if (value !== null) options[name] = value;
    } else if (s.type === 'array' && s.items?.enum) {
      const choices = s.items.enum.map((v) => ({ value: v, label: humanize(v) }));
      const value = await p.multiselect(message, choices, Array.isArray(def) ? def : [], s.minItems ?? 0);
      if (value.length > 0) options[name] = value;
    } else if (s.type === 'boolean') {
      options[name] = await p.confirm(message, typeof def === 'boolean' ? def : false);
    } else {
      const value = await p.input(message, def === undefined ? undefined : String(def));
      if (value) options[name] = value;
    }
  }
  return options;
}

export async function runWizard(kb: KnowledgeBase, detection: Detection, p: Prompter): Promise<Manifest> {
  const name = await p.input('Application name', detection.name);
  const platforms = await p.multiselect(
    'Which platforms does the app have?',
    PLATFORM_CHOICES,
    detection.platforms.length > 0 ? detection.platforms : undefined,
    1,
  );
  const data_sensitivity = await p.select('Most sensitive data the app handles?', SENSITIVITY_CHOICES, 'medium');
  const assurance_level = await p.select(
    'Security assurance level (OWASP ASVS)?',
    LEVEL_CHOICES,
    data_sensitivity === 'low' ? 1 : 2,
  );

  const components: ManifestComponent[] = [];
  for (const component of kb.components.values()) {
    if (!component.platforms.some((pl) => platforms.includes(pl))) continue;

    const detected: DetectedComponent[] = detection.components.filter((c) => c.type === component.id);
    if (detected.length === 0) {
      if (await p.confirm(component.question ?? `Does the app have: ${component.name}?`, false)) {
        components.push({ type: component.id, ...(await askOptions(component, {}, p)) });
      }
      continue;
    }
    for (const d of detected) {
      const label = `${component.name}${d.name ? ` (${d.name})` : ''}`;
      if (await p.confirm(`Detected ${label} [${d.evidence.join(', ')}]. Include it?`, true)) {
        components.push({ type: component.id, ...(d.name ? { name: d.name } : {}), ...(await askOptions(component, d.options, p)) });
      }
    }
  }
  if (components.length === 0) {
    throw new Error('No components selected. Security Kit needs at least one component to build a plan.');
  }

  const ai_assistants = await p.multiselect<AiAssistant>(
    'Which AI coding assistants should get the security rules?',
    AI_CHOICES,
    ['agents_md'],
  );

  return {
    version: 1,
    app: { name, platforms, data_sensitivity, assurance_level },
    standards: defaultStandards(platforms, components.map((c) => c.type)),
    ai_assistants,
    components,
  };
}
