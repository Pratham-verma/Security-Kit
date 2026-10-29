import type { Control, Level, ResolvedPlan, Standards } from '../types.js';

export const STANDARD_LABELS: Record<keyof Standards, string> = {
  asvs: 'ASVS 4.0.3',
  masvs: 'MASVS',
  owasp_top10: 'OWASP Top 10 (2021)',
  owasp_api_top10: 'OWASP API Top 10 (2023)',
  owasp_llm_top10: 'OWASP LLM Top 10 (2025)',
  cwe: 'CWE',
  pci_dss: 'PCI DSS 4.0',
  cis_aws: 'CIS AWS Benchmarks',
  nist: 'NIST',
};

export const LEVEL_LABELS: Record<Level, string> = {
  1: 'baseline',
  2: 'standard — apps with user accounts or sensitive data',
  3: 'high — critical apps (finance, health, infrastructure)',
};

export function formatStandards(s: Standards): string {
  return (Object.entries(s) as [keyof Standards, string[]][])
    .map(([key, ids]) => `${STANDARD_LABELS[key]}: ${ids.join(', ')}`)
    .join(' · ');
}

export function componentHeading(plan: ResolvedPlan['components'][number]): string {
  return plan.component.name + (plan.instance.name ? ` (${plan.instance.name})` : '');
}

/** Controls across all components, first occurrence of each ID only (a component type may appear twice). */
export function uniqueControls(plan: ResolvedPlan): { heading: string; control: Control }[] {
  const seen = new Set<string>();
  const out: { heading: string; control: Control }[] = [];
  for (const c of plan.components) {
    for (const control of c.controls) {
      if (seen.has(control.id)) continue;
      seen.add(control.id);
      out.push({ heading: c.component.name, control });
    }
  }
  return out;
}

export const escapeCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
