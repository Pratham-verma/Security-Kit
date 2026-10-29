import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadKnowledgeBase,
  loadManifest,
  loadRulePack,
  validateAttestations,
  matchesWhen,
  resolveControls,
  validateManifest,
  ValidationError,
  buildChecklist,
  renderAiPrompt,
  renderChecklistMarkdown,
} from '../src/index.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const kb = loadKnowledgeBase(join(ROOT, 'knowledge-base'));

const baseManifest = (components: unknown[], app: object = {}) => ({
  version: 1,
  app: { name: 'test', platforms: ['web', 'backend'], ...app },
  components,
});

const controlIds = (manifest: unknown) =>
  resolveControls(validateManifest(manifest, kb), kb).components.flatMap((c) => c.controls.map((x) => x.id));

describe('knowledge base', () => {
  it('loads and passes schema + consistency checks, ordered for the wizard', () => {
    expect([...kb.components.keys()]).toEqual([
      'auth', 'session', 'web_frontend', 'api', 'database', 'file_upload', 'payments', 'secrets', 'logging', 'mobile_storage', 'mobile_platform', 'ai_feature',
      'aws_account', 'aws_compute', 'aws_storage', 'aws_database', 'aws_end_user',
    ]);
  });

  it('every control has an AI rule and maps to at least one standard', () => {
    for (const c of kb.components.values()) {
      for (const ctl of c.controls) {
        expect(ctl.ai_rule.length, ctl.id).toBeGreaterThan(20);
        expect(Object.keys(ctl.standards).length, ctl.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('attestations', () => {
  const att = (a: object) => ({ version: 1, attestations: [{ control: 'DB-C3', by: 'dev', date: '2026-10-01', ...a }] });

  it('accepts valid sign-offs', () => {
    expect(() => validateAttestations(att({ status: 'done', evidence: 'PR #12' }), kb)).not.toThrow();
    expect(() => validateAttestations(att({ status: 'not_applicable', reason: 'no DB users' }), kb)).not.toThrow();
  });

  it('requires evidence, reasons and an expiry where they matter', () => {
    expect(() => validateAttestations(att({ status: 'done' }), kb)).toThrow(/evidence/);
    expect(() => validateAttestations(att({ status: 'risk_accepted', reason: 'later' }), kb)).toThrow(/expires/);
    expect(() => validateAttestations(att({ status: 'done', evidence: 'x', control: 'NOPE-C1' }), kb)).toThrow(/unknown control/);
    expect(() =>
      validateAttestations(att({ status: 'risk_accepted', reason: 'r', expires: '2026-01-01' }), kb),
    ).toThrow(/expires before/);
  });
});

describe('rule pack', () => {
  it('loads, and every rule maps to existing controls', () => {
    const rules = loadRulePack(kb, join(ROOT, 'knowledge-base/rules/semgrep'));
    expect(rules.length).toBeGreaterThan(20);
    for (const r of rules) expect(r.metadata['seckit-controls'].length).toBeGreaterThan(0);
  });
});

describe('manifest validation', () => {
  it('accepts the shop-app example', () => {
    expect(() => loadManifest(join(ROOT, 'examples/shop-app/seckit.yaml'), kb)).not.toThrow();
  });

  it('rejects unknown component types', () => {
    expect(() => validateManifest(baseManifest([{ type: 'teleporter' }]), kb)).toThrow(/unknown component type/);
  });

  it('rejects invalid component options', () => {
    const m = baseManifest([{ type: 'auth', methods: ['carrier_pigeon'] }]);
    expect(() => validateManifest(m, kb)).toThrow(ValidationError);
  });

  it('requires database kind', () => {
    expect(() => validateManifest(baseManifest([{ type: 'database', engine: 'postgres' }]), kb)).toThrow(/kind/);
  });

  it('applies option defaults', () => {
    const m = validateManifest(baseManifest([{ type: 'file_upload', types: ['images'] }]), kb);
    expect(m.components[0]?.served_to_other_users).toBe(true);
  });
});

describe('resolveControls', () => {
  it('includes password controls only for email_password', () => {
    expect(controlIds(baseManifest([{ type: 'auth', methods: ['email_password'] }]))).toContain('AUTH-C2');
    expect(controlIds(baseManifest([{ type: 'auth', methods: ['oauth'] }]))).not.toContain('AUTH-C2');
    expect(controlIds(baseManifest([{ type: 'auth', methods: ['oauth'] }]))).toContain('AUTH-C6');
  });

  it('includes conditional controls when the option is not answered', () => {
    const ids = controlIds(baseManifest([{ type: 'auth' }]));
    expect(ids).toEqual(expect.arrayContaining(['AUTH-C2', 'AUTH-C6', 'AUTH-C7']));
  });

  it('picks SQL vs NoSQL injection controls by database kind', () => {
    const sql = controlIds(baseManifest([{ type: 'database', kind: 'sql' }]));
    const nosql = controlIds(baseManifest([{ type: 'database', kind: 'nosql' }]));
    expect(sql).toContain('DB-C1');
    expect(sql).not.toContain('DB-C2');
    expect(nosql).toContain('DB-C2');
    expect(nosql).not.toContain('DB-C1');
  });

  it('filters by assurance level', () => {
    const l1 = controlIds(baseManifest([{ type: 'database', kind: 'sql' }], { assurance_level: 1 }));
    const l2 = controlIds(baseManifest([{ type: 'database', kind: 'sql' }], { assurance_level: 2 }));
    expect(l1).not.toContain('DB-C3');
    expect(l2).toContain('DB-C3');
  });

  it('filters by platform', () => {
    // A web-only app gets no backend-only controls.
    const ids = controlIds(baseManifest([{ type: 'file_upload', types: ['images'] }], { platforms: ['web'] }));
    expect(ids).toEqual(['UPLOAD-C5']);
  });

  it('sorts controls by severity and only lists mitigated threats', () => {
    const plan = resolveControls(loadManifest(join(ROOT, 'examples/shop-app/seckit.yaml'), kb), kb);
    for (const { threats, controls } of plan.components) {
      const order = controls.map((c) => ['critical', 'high', 'medium', 'low'].indexOf(c.severity));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      const mitigated = new Set(controls.flatMap((c) => c.mitigates));
      for (const t of threats) expect(mitigated.has(t.id)).toBe(true);
    }
  });
});

describe('cloud (AWS)', () => {
  const manifest = baseManifest([{ type: 'api' }, { type: 'aws_storage', services: ['s3'] }, { type: 'aws_database', services: ['dynamodb'] }], { platforms: ['web', 'backend', 'cloud'] });

  it('asks only about AWS when the cloud is the only platform', () => {
    const cloudOnly = baseManifest([{ type: 'aws_account' }, { type: 'aws_storage', services: ['s3'] }], { platforms: ['cloud'] });
    expect(controlIds(cloudOnly).every((id) => id.startsWith('AWS'))).toBe(true);
    expect(() => validateManifest(baseManifest([{ type: 'api' }], { platforms: ['cloud'] }), kb)).toThrow(ValidationError);
    expect(() => validateManifest(baseManifest([{ type: 'aws_account' }]), kb)).toThrow(ValidationError);
  });

  it('adds only the controls for the chosen services', () => {
    const ids = controlIds(manifest);
    expect(ids).toContain('AWSSTO-C1');
    expect(ids).not.toContain('AWSSTO-C7'); // EFS/FSx only
    expect(ids).toContain('AWSDB-C9'); // DynamoDB access policies
  });

  it('carries test cases into the checklist and every prompt mode', () => {
    const m = validateManifest(manifest, kb);
    const plan = resolveControls(m, kb);
    const list = buildChecklist(plan);
    const cloud = list.sections.filter((s) => s.category === 'cloud');
    expect(cloud.map((s) => s.title)).toEqual(['AWS storage and backups', 'AWS managed databases']);
    expect(cloud.flatMap((s) => s.items).every((i) => i.tests.length > 0)).toBe(true);
    expect(renderChecklistMarkdown(list, '0')).toContain('  - Test: `aws s3control get-public-access-block');
    const test = renderAiPrompt(plan, m, { mode: 'test' });
    expect(test).toContain('# Security tests — test');
    expect(test).toContain('**read-only**');
    expect(test).toContain('## Cloud checks');
    expect(test).toContain('  - Test cases:\n    - `aws s3control get-public-access-block');
    // Apps without cloud components get no cloud note.
    const appOnly = validateManifest(baseManifest([{ type: 'api' }]), kb);
    expect(renderAiPrompt(resolveControls(appOnly, kb), appOnly)).not.toContain('## Cloud checks');
  });
});

describe('matchesWhen', () => {
  it('matches scalar and array options; an unset option matches', () => {
    expect(matchesWhen({ kind: ['sql'] }, { type: 'database', kind: 'sql' })).toBe(true);
    expect(matchesWhen({ methods: ['oauth'] }, { type: 'auth', methods: ['email_password', 'oauth'] })).toBe(true);
    expect(matchesWhen({ kind: ['sql'] }, { type: 'database', kind: 'nosql' })).toBe(false);
    expect(matchesWhen({ kind: ['sql'] }, { type: 'database' })).toBe(true); // unknown -> include
    expect(matchesWhen(undefined, { type: 'x' })).toBe(true);
  });
});
