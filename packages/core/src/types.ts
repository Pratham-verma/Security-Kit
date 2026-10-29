export type Platform = 'web' | 'backend' | 'android' | 'ios' | 'cloud';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Level = 1 | 2 | 3;
export type Stride = 'S' | 'T' | 'R' | 'I' | 'D' | 'E';
export type OptionValue = string | boolean | number;
export type AiAssistant = 'agents_md' | 'claude' | 'cursor' | 'copilot';

/** Option name -> accepted values. All entries must match. */
export type When = Record<string, OptionValue[]>;

export interface Threat {
  id: string;
  title: string;
  description?: string;
  stride: Stride[];
  cwe?: string[];
  when?: When;
}

export interface Standards {
  asvs?: string[];
  masvs?: string[];
  owasp_top10?: string[];
  owasp_api_top10?: string[];
  owasp_llm_top10?: string[];
  cwe?: string[];
  pci_dss?: string[];
  nist?: string[];
  cis_aws?: string[];
}

export interface Verification {
  type: 'manual' | 'semgrep' | 'test' | 'config';
  description: string;
  ref?: string;
}

export interface Control {
  id: string;
  title: string;
  mitigates: string[];
  severity: Severity;
  level: Level;
  platforms?: Platform[];
  when?: When;
  standards: Standards;
  guidance: string;
  ai_rule: string;
  implement?: { node?: string; web?: string; android?: string; ios?: string };
  verify: Verification[];
  /** Concrete test cases (commands and expected results). */
  tests?: string[];
}

export interface Component {
  id: string;
  name: string;
  description: string;
  /** 'app' (default) for parts of the app's code; 'cloud' for its cloud account and services. */
  category?: 'app' | 'cloud';
  order?: number;
  question?: string;
  platforms: Platform[];
  options?: Record<string, unknown>;
  threats: Threat[];
  controls: Control[];
}

/** A compiled JSON Schema check (Ajv at runtime in Node, pre-compiled standalone code in the browser). */
export interface Validator {
  (data: unknown): boolean;
  errors?: { instancePath: string; message?: string }[] | null;
}

export interface Validators {
  manifest: Validator;
  attestations: Validator;
  /** Validates (and fills defaults into) a component's options; undefined if the component has none. */
  options(componentId: string): Validator | undefined;
}

export interface KnowledgeBase {
  components: Map<string, Component>;
  validators: Validators;
}

export interface ManifestComponent {
  type: string;
  name?: string;
  [option: string]: unknown;
}

export interface Manifest {
  version: 1;
  app: {
    name: string;
    platforms: Platform[];
    data_sensitivity?: 'low' | 'medium' | 'high';
    assurance_level?: Level;
  };
  standards?: string[];
  ai_assistants?: AiAssistant[];
  components: ManifestComponent[];
}

export interface ResolvedComponent {
  /** The manifest entry, with option defaults applied. */
  instance: ManifestComponent;
  component: Component;
  threats: Threat[];
  controls: Control[];
}

export interface ResolvedPlan {
  app: Manifest['app'] & { assurance_level: Level };
  components: ResolvedComponent[];
}

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(`${message}:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ValidationError';
  }
}
