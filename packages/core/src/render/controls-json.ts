import type { ResolvedPlan } from '../types.js';

/** Machine-readable plan for tools (seckit audit, CI, the MCP server). */
export function renderControlsJson(plan: ResolvedPlan, version: string): string {
  const doc = {
    generator: `seckit ${version}`,
    app: plan.app,
    components: plan.components.map(({ instance, component, threats, controls }) => {
      const { type, name, ...options } = instance;
      return {
        type,
        ...(name ? { name } : {}),
        options,
        threats: threats.map(({ id, title, stride, cwe }) => ({ id, title, stride, cwe: cwe ?? [] })),
        controls: controls.map((c) => ({
          id: c.id,
          title: c.title,
          severity: c.severity,
          level: c.level,
          platforms: (c.platforms ?? component.platforms).filter((p) => plan.app.platforms.includes(p)),
          mitigates: c.mitigates,
          standards: c.standards,
          ai_rule: c.ai_rule,
          verify: c.verify,
        })),
      };
    }),
  };
  return JSON.stringify(doc, null, 2) + '\n';
}
