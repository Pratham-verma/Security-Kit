import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { audit, failsThreshold } from '../src/audit/index.js';
import { attest } from '../src/commands/attest.js';
import { generate } from '../src/commands/generate.js';
import { renderSarif } from '../src/audit/report.js';
import { findSemgrep } from '../src/audit/semgrep.js';

const RULES = fileURLToPath(new URL('../../../knowledge-base/rules/semgrep/', import.meta.url));
const semgrep = findSemgrep();

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'seckit-audit-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const MANIFEST = `version: 1
app: { name: audit-fixture, platforms: [web, backend, android] }
components:
  - type: secrets
  - type: web_frontend
  - type: database
    kind: sql
  - type: ai_feature
    provider: hosted_api
  - type: mobile_storage
`;

const status = (r: ReturnType<typeof audit>, id: string) => r.controls.find((c) => c.id === id)?.status;

describe('seckit audit — built-in checks', () => {
  const dir = project({
    'seckit.yaml': MANIFEST,
    'src/config.js': 'module.exports = { key: "AKIAIOSFODNN7EXAMPLE", db: "postgres://app:Pr0dPass@db.internal.example.com/app", dev: "postgres://postgres:postgres@localhost/dev" };\n',
    '.env': 'NEXT_PUBLIC_OPENAI_API_KEY=sk-x\n',
    '.github/workflows/ci.yml': 'jobs:\n  b:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/cache@0c45773b623bea8c8e75f6c82b208c3cf94ea4f9\n',
    'android/app/src/main/AndroidManifest.xml': '<manifest>\n  <application android:label="x">\n  </application>\n</manifest>\n',
    'public/index.html': '<script src="https://cdn.example.com/lib.js"></script>\n<script src="https://js.stripe.com/v3/"></script>\n',
  });
  const report = audit({ dir, semgrep: false });

  it('flags planted problems and maps them to controls', () => {
    expect(status(report, 'SEC-C1')).toBe('fail');
    expect(status(report, 'DB-C4')).toBe('fail');
    expect(status(report, 'SEC-C2')).toBe('fail');
    expect(status(report, 'AI-C8')).toBe('fail');
    expect(status(report, 'SEC-C7')).toBe('fail');
    expect(status(report, 'MSTORE-C4')).toBe('fail');
    expect(status(report, 'WEB-C5')).toBe('fail');
  });

  it('avoids known false positives and never prints secrets', () => {
    const all = report.controls.flatMap((c) => c.findings);
    expect(all.some((f) => f.message.includes('localhost'))).toBe(false); // local dev DB URL
    expect(all.some((f) => f.message.includes('js.stripe.com'))).toBe(false); // SRI-exempt provider
    expect(all.filter((f) => f.check === 'seckit.ci.unpinned-action')).toHaveLength(1); // SHA-pinned one passes
    expect(JSON.stringify(report)).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(JSON.stringify(report)).not.toContain('Pr0dPass');
  });

  it('marks Semgrep-only controls as skipped and the rest as manual', () => {
    expect(status(report, 'DB-C1')).toBe('skipped');
    expect(status(report, 'DB-C3')).toBe('manual');
  });

  it('applies the --fail-on threshold', () => {
    expect(failsThreshold(report, 'high')).toBe(true);
    expect(failsThreshold(report, 'none')).toBe(false);
  });

  it('renders SARIF 2.1.0 with one rule per failed control', () => {
    const sarif = JSON.parse(renderSarif(report, '0.0.0'));
    expect(sarif.version).toBe('2.1.0');
    const run = sarif.runs[0];
    const failed = report.controls.filter((c) => c.status === 'fail').map((c) => c.id);
    expect(run.tool.driver.rules.map((r: { id: string }) => r.id).sort()).toEqual(failed.sort());
    expect(run.results.every((r: any) => r.locations[0].physicalLocation.artifactLocation.uri)).toBe(true);
    expect(run.tool.driver.rules[0].properties['security-severity']).toMatch(/^\d+\.\d$/);
  });

  it('passes a clean project', () => {
    const clean = audit({ dir: project({ 'seckit.yaml': MANIFEST, '.gitignore': '.env\n', 'src/app.js': 'module.exports = {};\n' }), semgrep: false });
    expect(clean.controls.filter((c) => c.status === 'fail')).toEqual([]);
    expect(status(clean, 'SEC-C1')).toBe('pass');
  });
});

describe('seckit audit — mobile configuration (MASVS)', () => {
  const MOBILE = 'version: 1\napp: { name: m, platforms: [android, ios] }\ncomponents:\n  - type: mobile_platform\n  - type: mobile_storage\n';
  const dir = project({
    'seckit.yaml': MOBILE,
    'app/src/main/AndroidManifest.xml': [
      '<manifest>',
      '  <application android:usesCleartextTraffic="true" android:allowBackup="false">',
      '    <activity android:name=".Main" android:exported="true" />',
      '    <service android:name=".Sync" android:exported="true" />',
      '    <provider android:name=".Files" android:exported="true" android:readPermission="x.READ" />',
      '    <receiver android:name=".Boot" android:exported="false" />',
      '  </application>',
      '</manifest>',
    ].join('\n'),
    'app/src/debug/AndroidManifest.xml': '<manifest><application android:debuggable="true" android:usesCleartextTraffic="true"/></manifest>',
    'app/src/main/res/xml/network_security_config.xml':
      '<network-security-config>\n<base-config><trust-anchors><certificates src="user"/></trust-anchors></base-config>\n<debug-overrides><trust-anchors><certificates src="user"/></trust-anchors></debug-overrides>\n</network-security-config>',
    'app/build.gradle.kts': 'android {\n  defaultConfig { targetSdk = 30 }\n  buildTypes {\n    release {\n      isMinifyEnabled = true\n      isDebuggable = true\n    }\n    debug { isDebuggable = true }\n  }\n}\n',
    'ios/App/Info.plist': '<plist><dict>\n<key>NSAppTransportSecurity</key>\n<dict>\n<key>NSAllowsArbitraryLoads</key>\n<true/>\n</dict>\n</dict></plist>',
  });
  const report = audit({ dir, semgrep: false });
  const findings = (id: string) => report.controls.find((c) => c.id === id)!.findings;

  it('flags cleartext on Android and iOS, but not in debug source sets', () => {
    const files = findings('MPLAT-C1').map((f) => f.file).sort();
    expect(files).toEqual(['app/src/main/AndroidManifest.xml', 'ios/App/Info.plist']);
  });

  it('flags user CAs outside debug-overrides only', () => {
    expect(findings('MPLAT-C2')).toEqual([expect.objectContaining({ line: 2 })]);
  });

  it('flags exported services without a permission, not launcher activities or protected providers', () => {
    expect(findings('MPLAT-C6').map((f) => f.message)).toEqual([expect.stringContaining('.Sync')]);
  });

  it('flags a debuggable release build type and an old targetSdk', () => {
    expect(findings('MPLAT-C7')).toEqual([expect.objectContaining({ file: 'app/build.gradle.kts', line: 6 })]);
    expect(findings('MPLAT-C9')).toEqual([expect.objectContaining({ line: 2 })]);
  });

  it('generated config templates are well-formed and pass the audit themselves', () => {
    const gen = project({ 'seckit.yaml': MOBILE, '.gitignore': '.env\n' });
    expect(generate({ dir: gen, log: () => {} })).toBe(0);
    const nsc = readFileSync(join(gen, '.seckit/snippets/android/network_security_config.xml'), 'utf8');
    const rules = readFileSync(join(gen, '.seckit/snippets/android/data_extraction_rules.xml'), 'utf8');
    const ats = readFileSync(join(gen, '.seckit/snippets/ios/app-transport-security.plist.xml'), 'utf8');

    const py = spawnSync('python3', ['-c', 'import sys,xml.dom.minidom as m\nfor d in sys.argv[1:]: m.parseString(d)', nsc, rules, `<plist>${ats}</plist>`]);
    if (!py.error) expect(py.status, py.stderr?.toString()).toBe(0);

    // Dogfood: install the templates into an app and audit it.
    const app = project({
      'seckit.yaml': MOBILE,
      'app/src/main/res/xml/network_security_config.xml': nsc,
      'app/src/main/res/xml/data_extraction_rules.xml': rules,
      'ios/App/Info.plist': `<plist><dict>${ats}</dict></plist>`,
    });
    const r = audit({ dir: app, semgrep: false });
    for (const id of ['MPLAT-C1', 'MPLAT-C2']) expect(r.controls.find((c) => c.id === id)!.status, id).toBe('pass');
  });
});

describe('seckit audit — Spring Boot configuration', () => {
  const SPRING = 'version: 1\napp: { name: s, platforms: [backend] }\ncomponents:\n  - type: api\n  - type: session\n    transport: cookie\n  - type: database\n    kind: sql\n  - type: logging\n  - type: secrets\n';
  const dir = project({
    'seckit.yaml': SPRING,
    'src/main/resources/application.properties': [
      'management.endpoints.web.exposure.include=*',
      'server.error.include-stacktrace=always',
      'spring.datasource.password=Sup3rS3cret!',
      'server.servlet.session.cookie.secure=false',
    ].join('\n'),
    'src/main/resources/application-dev.properties': 'spring.h2.console.enabled=true\n',
    'src/main/resources/application.yml': 'spring:\n  h2:\n    console:\n      enabled: true\n---\nspring:\n  config:\n    activate:\n      on-profile: local\nserver:\n  error:\n    include-message: always\n',
    'service/src/main/resources/application.yaml': 'spring:\n  datasource:\n    password: ${DB_PASSWORD}\nmanagement:\n  endpoints:\n    web:\n      exposure:\n        include: health,info\n',
  });
  const report = audit({ dir, semgrep: false });
  const findings = (id: string) => report.controls.find((c) => c.id === id)!.findings;

  it('flags risky production settings in properties and YAML', () => {
    expect(findings('API-C8').map((f) => `${f.file}:${f.line}`)).toEqual([
      'src/main/resources/application.properties:1',
      'src/main/resources/application.properties:2',
      'src/main/resources/application.yml:4',
    ]);
    expect(findings('DB-C4')).toEqual([expect.objectContaining({ file: 'src/main/resources/application.properties', line: 3 })]);
    expect(findings('SESS-C1')).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain('Sup3rS3cret');
  });

  it('ignores dev profiles and environment placeholders', () => {
    const all = report.controls.flatMap((c) => c.findings.map((f) => f.file));
    expect(all).not.toContain('src/main/resources/application-dev.properties');
    expect(all).not.toContain('service/src/main/resources/application.yaml');
    expect(findings('LOG-C6').map((f) => f.message).join()).not.toMatch(/include-message/);
  });
});

describe('attestations', () => {
  const silent = () => {};
  const setup = () =>
    project({
      'seckit.yaml': MANIFEST,
      'src/config.js': 'module.exports = { key: "AKIAIOSFODNN7EXAMPLE" };\n',
      '.gitignore': '.env\n',
    });

  it('records sign-offs with seckit attest and reflects them in the audit', () => {
    const dir = setup();
    expect(attest({ dir, id: 'db-c3', status: 'done', evidence: 'Migration 0004 revokes DDL', by: 'maria', today: '2026-10-01', log: silent })).toBe(0);
    expect(attest({ dir, id: 'DB-C6', status: 'not_applicable', reason: 'No sensitive fields stored', by: 'maria', today: '2026-10-01', log: silent })).toBe(0);
    const r = audit({ dir, semgrep: false, today: '2026-10-02' });
    expect(status(r, 'DB-C3')).toBe('attested');
    expect(status(r, 'DB-C6')).toBe('not_applicable');
    expect(readFileSync(join(dir, '.seckit/attestations.yaml'), 'utf8')).toContain('Migration 0004 revokes DDL');
  });

  it('refuses incomplete sign-offs and writes nothing', () => {
    const dir = setup();
    expect(() => attest({ dir, id: 'DB-C3', status: 'done', by: 'x', log: silent })).toThrow(/evidence/);
    expect(() => attest({ dir, id: 'SEC-C1', status: 'risk_accepted', reason: 'later', by: 'x', log: silent })).toThrow(/expires/);
    expect(existsSync(join(dir, '.seckit/attestations.yaml'))).toBe(false);
  });

  it('never lets a sign-off hide a failing check, but honours an unexpired risk acceptance', () => {
    const dir = setup();
    attest({ dir, id: 'SEC-C1', status: 'done', evidence: 'we use vault', by: 'x', today: '2026-10-01', log: silent });
    let r = audit({ dir, semgrep: false, today: '2026-10-02' });
    expect(status(r, 'SEC-C1')).toBe('fail');
    expect(r.warnings.join()).toMatch(/SEC-C1 is attested as done, but automated checks found problems/);

    attest({ dir, id: 'SEC-C1', status: 'risk_accepted', reason: 'Test key, rotation ticket SEC-42', expires: '2026-11-01', by: 'x', today: '2026-10-01', log: silent });
    r = audit({ dir, semgrep: false, today: '2026-10-02' });
    expect(status(r, 'SEC-C1')).toBe('risk_accepted');
    expect(r.controls.find((c) => c.id === 'SEC-C1')!.findings).toHaveLength(1); // still visible
    const sarif = JSON.parse(renderSarif(r, '0.0.0'));
    expect(sarif.runs[0].results[0].suppressions[0].justification).toMatch(/SEC-42/);

    r = audit({ dir, semgrep: false, today: '2026-11-02' }); // after expiry
    expect(status(r, 'SEC-C1')).toBe('fail');
    expect(r.warnings.join()).toMatch(/expired on 2026-11-01/);
  });

  it('flags attestations for controls that are not in the plan', () => {
    const dir = setup();
    attest({ dir, id: 'PAY-C4', status: 'done', evidence: 'x', by: 'x', today: '2026-10-01', log: silent });
    expect(audit({ dir, semgrep: false, today: '2026-10-02' }).warnings.join()).toMatch(/PAY-C4 is stale/);
  });

  it('keeps comments in the file when updating', () => {
    const dir = setup();
    attest({ dir, id: 'DB-C3', status: 'done', evidence: 'first', by: 'x', today: '2026-10-01', log: silent });
    const path = join(dir, '.seckit/attestations.yaml');
    writeFileSync(path, readFileSync(path, 'utf8') + '# reviewed in Q4 security sync\n');
    attest({ dir, id: 'DB-C3', status: 'done', evidence: 'second', by: 'x', today: '2026-10-05', log: silent });
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('# reviewed in Q4 security sync');
    expect(text).toContain('second');
    expect(text).not.toContain('first');
  });
});

describe('seckit audit — scanner failure', () => {
  it('fails closed: a Semgrep crash marks its controls skipped, never passed', () => {
    const bin = join(mkdtempSync(join(tmpdir(), 'fake-semgrep-')), 'semgrep');
    writeFileSync(bin, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 9.9.9; exit 0; fi\necho "boom" >&2\nexit 7\n', { mode: 0o755 });
    const dir = project({ 'seckit.yaml': MANIFEST, '.gitignore': '.env\n' });
    const report = audit({ dir, semgrep: bin });
    expect(report.semgrepFailed).toBeDefined();
    expect(status(report, 'DB-C1')).toBe('skipped');
    expect(report.errors.join()).toMatch(/did not complete \(exit code 7\): boom/);
    const sarif = JSON.parse(renderSarif(report, '0.0.0'));
    expect(sarif.runs[0].invocations[0].executionSuccessful).toBe(false);
  });
});

describe.skipIf(!semgrep)('seckit audit — Semgrep rules', () => {
  it('passes the rule pack unit tests (ruleid/ok annotations)', () => {
    const r = spawnSync(semgrep!.bin, ['--test', '--metrics=off', '--config', RULES, join(RULES, 'tests')], { encoding: 'utf8' });
    expect(r.stdout + r.stderr).toMatch(/All tests passed/);
  }, 300_000);

  it('finds code-level problems through Semgrep', () => {
    const dir = project({
      'seckit.yaml': MANIFEST,
      '.gitignore': '.env\n',
      'src/db.js': 'async function get(db, id) {\n  return db.query(`SELECT * FROM users WHERE id = ${id}`);\n}\n',
    });
    const report = audit({ dir, semgrep: semgrep!.bin });
    expect(report.semgrep?.rules).toBeGreaterThan(0);
    const db = report.controls.find((c) => c.id === 'DB-C1')!;
    expect(db.status).toBe('fail');
    expect(db.findings).toEqual([expect.objectContaining({ file: 'src/db.js', line: 2 })]);
  }, 120_000);

  it('finds Spring and Flutter problems through Semgrep', () => {
    const dir = project({
      'seckit.yaml': 'version: 1\napp: { name: x, platforms: [backend, android, ios] }\ncomponents:\n  - type: database\n    kind: sql\n  - type: mobile_storage\n  - type: mobile_platform\n',
      'src/main/java/com/x/UserRepo.java': 'class UserRepo {\n  List<User> find(String name) {\n    return jdbcTemplate.query("SELECT * FROM users WHERE name = \'" + name + "\'", mapper);\n  }\n}\n',
      'app/lib/session.dart': "Future<void> save(SharedPreferences prefs, String token) async {\n  await prefs.setString('auth_token', token);\n}\n",
    });
    const report = audit({ dir, semgrep: semgrep!.bin });
    expect(report.controls.find((c) => c.id === 'DB-C1')!.findings).toEqual([expect.objectContaining({ file: 'src/main/java/com/x/UserRepo.java', line: 3 })]);
    expect(report.controls.find((c) => c.id === 'MSTORE-C1')!.findings).toEqual([expect.objectContaining({ file: 'app/lib/session.dart', line: 2 })]);
  }, 120_000);

  it('warns when the code contradicts the plan (control excluded by seckit.yaml)', () => {
    const dir = project({
      'seckit.yaml': 'version: 1\napp: { name: x, platforms: [backend] }\ncomponents:\n  - type: api\n    fetches_user_urls: false\n',
      'src/preview.js': 'async function p(req) {\n  return fetch(req.body.url);\n}\n',
    });
    const report = audit({ dir, semgrep: semgrep!.bin });
    expect(report.controls.find((c) => c.id === 'API-C5')).toBeUndefined();
    expect(report.warnings.join()).toMatch(/src\/preview.js:2 looks like API-C5 applies, but seckit.yaml excludes it/);
  }, 120_000);
});
