// Answer choices and defaults shared by the CLI wizard, the local UI and the hosted web app.
import type { Detection } from './detect.js';
import type { AiAssistant, Level, Manifest, Platform } from './types.js';

export interface Choice<T> {
  value: T;
  label: string;
  hint?: string;
}

type Sensitivity = NonNullable<Manifest['app']['data_sensitivity']>;

export const PLATFORM_CHOICES: Choice<Platform>[] = [
  { value: 'web', label: 'Web frontend', hint: 'browser app / website' },
  { value: 'backend', label: 'Backend / API', hint: 'server code' },
  { value: 'android', label: 'Android' },
  { value: 'ios', label: 'iOS' },
  { value: 'cloud', label: 'Cloud (AWS)', hint: 'AWS account and services' },
];

export const SENSITIVITY_CHOICES: Choice<Sensitivity>[] = [
  { value: 'low', label: 'Low', hint: 'public content, no personal data' },
  { value: 'medium', label: 'Medium', hint: 'accounts, emails, basic personal data' },
  { value: 'high', label: 'High', hint: 'payments, health, government IDs, confidential business data' },
];

export const LEVEL_CHOICES: Choice<Level>[] = [
  { value: 1, label: 'Level 1 — baseline', hint: 'low-risk apps' },
  { value: 2, label: 'Level 2 — standard', hint: 'most apps with user accounts or sensitive data' },
  { value: 3, label: 'Level 3 — high', hint: 'critical apps: banking, healthcare, infrastructure' },
];

export const AI_CHOICES: Choice<AiAssistant>[] = [
  { value: 'agents_md', label: 'AGENTS.md', hint: 'Codex, Gemini CLI, Jules, Zed and other AGENTS.md-aware tools' },
  { value: 'claude', label: 'Claude Code', hint: 'CLAUDE.md' },
  { value: 'cursor', label: 'Cursor', hint: '.cursor/rules/security-kit.mdc' },
  { value: 'copilot', label: 'GitHub Copilot', hint: '.github/copilot-instructions.md' },
];

export function defaultStandards(platforms: Platform[], componentTypes: string[]): string[] {
  const mobile = platforms.includes('android') || platforms.includes('ios');
  // A cloud-only plan (just the AWS account and services) is not an app: no ASVS or OWASP Top 10.
  const app = platforms.some((p) => p !== 'cloud');
  return [
    ...(app ? ['asvs'] : []),
    ...(mobile ? ['masvs'] : []),
    ...(app ? ['owasp_top10'] : []),
    ...(componentTypes.includes('api') ? ['owasp_api_top10'] : []),
    ...(componentTypes.includes('ai_feature') ? ['owasp_llm_top10'] : []),
    ...(componentTypes.includes('payments') ? ['pci_dss'] : []),
    ...(componentTypes.some((t) => t.startsWith('aws_')) ? ['cis_aws'] : []),
    'cwe',
  ];
}

/** Non-interactive manifest from detection alone (`seckit init --yes`). */
export function manifestFromDetection(detection: Detection): Manifest {
  if (detection.components.length === 0) {
    throw new Error('Could not detect any components. Run `seckit init` without --yes to answer the questions.');
  }
  const platforms: Platform[] = detection.platforms.length > 0 ? detection.platforms : ['web', 'backend'];
  return {
    version: 1,
    app: { name: detection.name ?? 'app', platforms, data_sensitivity: 'medium', assurance_level: 2 },
    standards: defaultStandards(platforms, detection.components.map((c) => c.type)),
    ai_assistants: ['agents_md'],
    components: detection.components.map((d) => ({ type: d.type, ...(d.name ? { name: d.name } : {}), ...d.options })),
  };
}

