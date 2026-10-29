// Shapes returned by the local API (see src/server/api.ts).
export type Platform = 'web' | 'backend' | 'android' | 'ios' | 'cloud';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type ControlStatus = 'fail' | 'risk_accepted' | 'attested' | 'not_applicable' | 'pass' | 'skipped' | 'manual';
export type AttestationStatus = 'done' | 'not_applicable' | 'risk_accepted';

export interface Choice<T = unknown> {
  value: T;
  label: string;
  hint?: string;
}

export interface Threat {
  id: string;
  title: string;
  description?: string;
  stride: string[];
  cwe?: string[];
}

export interface Control {
  id: string;
  title: string;
  mitigates: string[];
  severity: Severity;
  level: number;
  platforms?: Platform[];
  standards: Record<string, string[] | undefined>;
  guidance: string;
  ai_rule: string;
  implement?: Partial<Record<'node' | 'web' | 'android' | 'ios', string>>;
  verify: { type: 'manual' | 'semgrep' | 'test' | 'config'; description: string }[];
  automated: string[];
}

export interface ManifestComponent {
  type: string;
  name?: string;
  [option: string]: unknown;
}

export interface Manifest {
  version: 1;
  app: { name: string; platforms: Platform[]; data_sensitivity?: 'low' | 'medium' | 'high'; assurance_level?: 1 | 2 | 3 };
  standards?: string[];
  ai_assistants?: string[];
  components: ManifestComponent[];
}

export interface PlanComponent {
  type: string;
  title: string;
  description: string;
  instance: ManifestComponent;
  threats: Threat[];
  controls: Control[];
}

export interface Plan {
  app: Manifest['app'] & { assurance_level: 1 | 2 | 3 };
  components: PlanComponent[];
}

export interface Finding {
  controls: string[];
  check: string;
  message: string;
  file: string;
  line?: number;
}

export interface Attestation {
  control: string;
  status: AttestationStatus;
  by: string;
  date: string;
  evidence?: string;
  reason?: string;
  expires?: string;
}

export interface ControlResult {
  id: string;
  title: string;
  component: string;
  severity: Severity;
  level: number;
  status: ControlStatus;
  checks: string[];
  skippedChecks: string[];
  findings: Finding[];
  attestation?: Attestation;
}

export interface AuditResult {
  finishedAt: string;
  durationMs: number;
  semgrep: { version: string; rules: number } | null;
  semgrepMissing: boolean;
  incomplete: boolean;
  controls: ControlResult[];
  errors: string[];
  warnings: string[];
}

export interface State {
  version: string;
  mode: 'local' | 'hosted';
  project: { dir: string; name: string };
  manifest: Manifest | null;
  manifestError: { message: string; issues: string[] } | null;
  plan: Plan | null;
  unanswered: string[];
  staleFiles: string[];
  attestations: { items: Attestation[]; error?: string };
  signer: string;
  semgrep: { available: boolean; version?: string };
  rules: { semgrep: number; builtin: number };
  checklistDone: number;
  lastAudit: AuditResult | null;
  auditRunning: boolean;
}

export interface OptionSchema {
  title?: string;
  type?: string;
  enum?: unknown[];
  items?: { enum?: unknown[] };
  default?: unknown;
  minItems?: number;
}

export interface CatalogComponent {
  id: string;
  name: string;
  description: string;
  category: 'app' | 'cloud';
  question: string;
  platforms: Platform[];
  options: { properties?: Record<string, OptionSchema>; required?: string[] };
  controls: number;
}

export interface Catalog {
  components: CatalogComponent[];
  choices: {
    platforms: Choice<Platform>[];
    sensitivity: Choice<'low' | 'medium' | 'high'>[];
    levels: Choice<1 | 2 | 3>[];
    assistants: Choice<string>[];
  };
  standards: Record<string, string>;
}

export interface Detection {
  detection: {
    name?: string;
    platforms: Platform[];
    platformEvidence: Partial<Record<Platform, string[]>>;
    components: { type: string; name?: string; options: Record<string, unknown>; evidence: string[] }[];
  };
  suggested: Manifest | null;
}

export interface Preview {
  valid: boolean;
  components?: number;
  controls?: number;
  bySeverity?: Record<Severity, number>;
  message?: string;
  issues?: string[];
}

export interface ChecklistItem {
  id: string;
  title: string;
  severity: Severity;
  check: string[];
  howTo: string;
  helpers: { label: string; text: string }[];
  rule: string;
  tests: string[];
  references: string[];
}

export interface ChecklistData {
  checklist: {
    sections: { title: string; category: 'app' | 'cloud'; description: string; items: ChecklistItem[] }[];
    total: number;
    bySeverity: Record<Severity, number>;
  };
  progress: Record<string, { done: boolean; by?: string; date?: string }>;
  scan: Record<string, { status: 'fail' | 'pass'; findings: { file: string; line?: number; message: string }[] }>;
  file: string;
}

export interface PromptData {
  text: string;
  mode: 'audit' | 'build' | 'test';
  items: number;
  counts: Record<Severity, number>;
}
