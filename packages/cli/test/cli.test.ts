import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDefaultKnowledgeBase, loadManifest, resolveControls, validateManifest } from '@seckit/core';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { loadChecklistProgress, setChecklistItem } from '../src/commands/checklist.js';
import { generate } from '../src/commands/generate.js';
import { init, renderManifestYaml } from '../src/commands/init.js';
import { detectProject } from '../src/detect.js';
import type { Prompter } from '../src/prompt.js';
import { BLOCK_BEGIN, BLOCK_END, mergeManagedBlock } from '@seckit/core';
import { buildChecklist, renderAiPrompt, renderChecklistMarkdown } from '@seckit/core';
import { safeOutputPath } from '../src/util.js';
import { runWizard } from '../src/wizard.js';

const EXAMPLE = fileURLToPath(new URL('../../../examples/shop-app/seckit.yaml', import.meta.url));
const kb = loadDefaultKnowledgeBase();
const silent = () => {};

function tempProject(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'seckit-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const pkg = (deps: string[], name = 'demo') =>
  JSON.stringify({ name, dependencies: Object.fromEntries(deps.map((d) => [d, '*'])) });

/** Accepts defaults, except answers whose message contains an override key. */
function autoPrompter(overrides: Record<string, unknown> = {}): Prompter {
  const pick = (message: string) => Object.entries(overrides).find(([k]) => message.includes(k))?.[1];
  return {
    input: async (m, def) => (pick(m) as string | undefined) ?? def ?? '',
    confirm: async (m, def) => (pick(m) as boolean | undefined) ?? def,
    select: async (m, choices, def) => (pick(m) as never) ?? def ?? choices[0]!.value,
    multiselect: async (m, choices, defs = [], min = 0) =>
      (pick(m) as never[]) ?? (defs.length >= min ? defs : choices.slice(0, min).map((c) => c.value)),
  };
}

describe('detectProject', () => {
  it('detects a Node web/backend app with auth, postgres and uploads', () => {
    const dir = tempProject({
      'package.json': pkg(['next', 'react-dom', 'next-auth', 'bcrypt', 'pg', 'multer', 'sharp', '@aws-sdk/client-s3'], '@acme/shop'),
    });
    const d = detectProject(dir);
    expect(d.name).toBe('shop');
    expect(d.platforms).toEqual(['web', 'backend']);
    const byType = Object.fromEntries(d.components.map((c) => [c.type, c.options]));
    expect(byType.auth).toEqual({ methods: ['email_password', 'oauth'] });
    expect(byType.database).toEqual({ engine: 'postgres', kind: 'sql' });
    expect(byType.file_upload).toEqual({ types: ['images'], storage: 'object_storage' });
  });

  it('reads the Prisma provider and finds React Native + native folders', () => {
    const dir = tempProject({
      'package.json': pkg(['react-native', '@prisma/client']),
      'server/prisma/schema.prisma': 'datasource db {\n  provider = "mysql"\n  url = env("DATABASE_URL")\n}',
      'ios/Podfile': '',
      'android/build.gradle': '',
    });
    const d = detectProject(dir);
    expect(d.platforms).toEqual(['android', 'ios']);
    expect(d.components).toContainEqual(expect.objectContaining({ type: 'database', options: { engine: 'mysql', kind: 'sql' } }));
  });

  it('detects sessions, API styles, payments, secrets, logging and AI', () => {
    const dir = tempProject({
      'package.json': pkg(['fastify', '@fastify/jwt', 'mercurius', 'stripe', 'dotenv', 'pino', '@sentry/node', 'openai', '@pinecone-database/pinecone']),
      '.github/workflows/ci.yml': '',
    });
    const byType = Object.fromEntries(detectProject(dir).components.map((c) => [c.type, c.options]));
    expect(byType.session).toEqual({ kind: 'jwt' });
    expect(byType.api).toEqual({ style: ['rest', 'graphql'] });
    expect(byType.payments).toEqual({ provider: 'stripe' });
    expect(byType.secrets).toEqual({ storage: 'env_vars', ci_cd: true });
    expect(byType.logging).toEqual({ destination: 'log_service' });
    expect(byType.ai_feature).toEqual({ provider: 'hosted_api' }); // capabilities are never guessed
  });

  it('adds mobile on-device data for mobile apps, and self-hosted AI', () => {
    const d = detectProject(tempProject({ 'package.json': pkg(['expo', '@react-native-async-storage/async-storage', 'ollama']) }));
    expect(d.components.find((c) => c.type === 'mobile_storage')?.evidence).toEqual(['@react-native-async-storage/async-storage']);
    expect(d.components.find((c) => c.type === 'ai_feature')?.options).toEqual({ provider: 'self_hosted' });
    expect(d.components.map((c) => c.type)).not.toContain('logging'); // no backend
  });

  it('detects a Django project from requirements.txt', () => {
    const dir = tempProject({
      'requirements.txt': [
        'Django==5.2  # web framework', 'djangorestframework', 'djangorestframework_simplejwt>=5', 'psycopg2-binary',
        'stripe', 'sentry-sdk[django]', 'openai', 'Pillow', 'django-storages[s3]', 'boto3', '-r base.txt',
      ].join('\n'),
    });
    const d = detectProject(dir);
    expect(d.platforms).toEqual(['web', 'backend']); // Django renders templates
    const byType = Object.fromEntries(d.components.map((c) => [c.type, c.options]));
    expect(byType.database).toEqual({ engine: 'postgres', kind: 'sql' });
    expect(byType.session).toEqual({}); // Django sessions and SimpleJWT disagree -> left unset (all controls apply)
    expect(byType.payments).toEqual({ provider: 'stripe' });
    expect(byType.logging).toEqual({ destination: 'log_service' });
    expect(byType.ai_feature).toEqual({ provider: 'hosted_api' });
    expect(byType.file_upload).toEqual({ types: ['images'], storage: 'object_storage' });
    expect(d.components.find((c) => c.type === 'database')!.evidence).toContain('psycopg2-binary (PyPI)');
  });

  it('reads pyproject.toml dependency sections only', () => {
    const dir = tempProject({
      'pyproject.toml': [
        '[project]', 'name = "svc"', 'keywords = ["django", "stripe"]', 'dependencies = [', '  "fastapi>=0.115",', '  "SQLAlchemy[asyncio]",', '  "asyncpg",', ']',
        '', '[project.optional-dependencies]', 'ai = ["anthropic"]',
        '', '[tool.poetry.group.dev.dependencies]', 'python-multipart = "^0.0.9"',
      ].join('\n'),
    });
    const types = detectProject(dir).components.map((c) => c.type);
    expect(types).toEqual(expect.arrayContaining(['api', 'database', 'ai_feature', 'file_upload']));
    expect(types).not.toContain('payments'); // "stripe" only appears in keywords
  });

  it('detects a native Android app from Gradle, the manifest and Kotlin sources', () => {
    const dir = tempProject({
      'settings.gradle.kts': 'rootProject.name = "wallet"',
      'app/build.gradle.kts': [
        'dependencies {',
        '  implementation("com.stripe:stripe-android:21.0.0")',
        '  implementation(libs.androidx.room.runtime)',
        '}',
      ].join('\n'),
      'gradle/libs.versions.toml': '[libraries]\nandroidx-room-runtime = { group = "androidx.room", name = "room-runtime", version.ref = "room" }\nbiometric = { module = "androidx.biometric:biometric", version = "1.1.0" }\n',
      'app/src/main/AndroidManifest.xml':
        '<manifest><application><activity android:name=".Main" android:exported="true"><intent-filter><data android:scheme="wallet" /></intent-filter></activity></application></manifest>',
      'app/src/main/java/com/x/Help.kt': 'class Help { val w = android.webkit.WebView(ctx) }',
    });
    const d = detectProject(dir);
    expect(d.platforms).toEqual(['android']);
    const byType = Object.fromEntries(d.components.map((c) => [c.type, c.options]));
    expect(byType.payments).toEqual({ provider: 'stripe' });
    expect(byType.mobile_platform).toEqual({ webviews: true, biometrics: true, deep_links: true });
    expect(d.components.find((c) => c.type === 'mobile_storage')!.evidence).toContain('androidx.room:room-runtime (Maven)');
    expect(byType.secrets).toBeDefined(); // mobile apps hold API keys too
  });

  it('detects iOS (CocoaPods, SwiftPM) and Flutter apps', () => {
    const ios = tempProject({
      'ios/Podfile': "platform :ios, '16.0'\ntarget 'App' do\n  pod 'KeychainAccess'\nend\n",
      'ios/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved': JSON.stringify({ pins: [{ identity: 'stripe-ios' }], version: 2 }),
      'ios/App/Info.plist': '<plist><dict><key>CFBundleURLTypes</key><array/></dict></plist>',
      'ios/App/Login.swift': 'import LocalAuthentication\nlet c = LAContext()',
    });
    const d = detectProject(ios);
    expect(d.platforms).toEqual(['ios']);
    const byType = Object.fromEntries(d.components.map((c) => [c.type, c.options]));
    expect(byType.payments).toEqual({ provider: 'stripe' });
    expect(byType.mobile_platform).toEqual({ biometrics: true, deep_links: true });

    const flutter = detectProject(tempProject({ 'pubspec.yaml': 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n  local_auth: ^2.3.0\n  webview_flutter: ^4.0.0\nflutter:\n  uses-material-design: true\n' }));
    expect(flutter.platforms).toEqual(['android', 'ios']);
    expect(flutter.components.find((c) => c.type === 'mobile_platform')!.options).toEqual({ webviews: true, biometrics: true });
  });

  it('does not mistake a Gradle backend for Android', () => {
    const d = detectProject(tempProject({ 'backend/build.gradle': '', 'backend/settings.gradle': '' }));
    expect(d.platforms).not.toContain('android');
  });

  it('detects a Spring Boot backend from pom.xml and Gradle', () => {
    const dep = (g: string, a: string) => `<dependency><groupId>${g}</groupId><artifactId>${a}</artifactId></dependency>`;
    const maven = detectProject(tempProject({
      'pom.xml': `<project><dependencies>${[
        dep('org.springframework.boot', 'spring-boot-starter-web'),
        dep('org.springframework.boot', 'spring-boot-starter-security'),
        dep('org.springframework.boot', 'spring-boot-starter-data-jpa'),
        dep('org.postgresql', 'postgresql'),
        dep('io.jsonwebtoken', 'jjwt-api'),
        dep('com.stripe', 'stripe-java'),
      ].join('')}</dependencies></project>`,
    }));
    expect(maven.platforms).toEqual(['backend']);
    const byType = Object.fromEntries(maven.components.map((c) => [c.type, c.options]));
    expect(byType.api).toEqual({ style: ['rest'] });
    expect(byType.database).toEqual({ engine: 'postgres', kind: 'sql' });
    expect(byType.session).toEqual({ kind: 'jwt' });
    expect(byType.payments).toEqual({ provider: 'stripe' });
    expect(byType.auth).toBeDefined();
    expect(maven.platformEvidence.backend).toContain('org.springframework.boot:spring-boot-starter-web (Maven)');

    const gradle = detectProject(tempProject({
      'build.gradle.kts': 'dependencies {\n  implementation("org.springframework.boot:spring-boot-starter-web")\n  implementation("org.springframework.boot:spring-boot-starter-thymeleaf")\n}\n',
    }));
    expect(gradle.platforms).toEqual(['web', 'backend']);
    expect(gradle.components.map((c) => c.type)).toContain('web_frontend');
  });

  it('creates one database component per engine and ignores redis next to a real DB', () => {
    const d = detectProject(tempProject({ 'package.json': pkg(['express', 'pg', 'mongoose', 'ioredis']) }));
    const dbs = d.components.filter((c) => c.type === 'database');
    expect(dbs.map((c) => c.name)).toEqual(['postgres', 'mongodb']);
  });
});

describe('wizard', () => {
  it('builds a valid manifest, pre-filled from detection', async () => {
    const detection = detectProject(tempProject({ 'package.json': pkg(['express', 'mongoose', 'bcrypt']) }));
    const manifest = await runWizard(kb, detection, autoPrompter({ 'Can users upload files?': true, 'kinds of files': ['documents'] }));
    expect(() => validateManifest(manifest, kb)).not.toThrow();
    expect(manifest.app.platforms).toEqual(['backend']);
    expect(manifest.components.map((c) => c.type)).toEqual(['auth', 'api', 'database', 'file_upload', 'secrets', 'logging']);
    expect(manifest.components.find((c) => c.type === 'database')).toMatchObject({ engine: 'mongodb', kind: 'nosql' });
    expect(manifest.components.find((c) => c.type === 'file_upload')).toMatchObject({ types: ['documents'] });
    expect(manifest.standards).toEqual(['asvs', 'owasp_top10', 'owasp_api_top10', 'cwe']);
  });

  it('infers database kind from the chosen engine', async () => {
    const detection = detectProject(tempProject());
    const manifest = await runWizard(
      kb,
      detection,
      autoPrompter({ platforms: ['backend'], 'store data in a database': true, 'database engine': 'dynamodb' }),
    );
    expect(manifest.components).toEqual([expect.objectContaining({ type: 'database', engine: 'dynamodb', kind: 'nosql' })]);
  });
});

describe('mergeManagedBlock', () => {
  it('creates, appends, replaces, and is idempotent', () => {
    const created = mergeManagedBlock(undefined, 'rules v1');
    expect(created).toBe(`${BLOCK_BEGIN}\nrules v1\n${BLOCK_END}\n`);

    const appended = mergeManagedBlock('# My project\n\nOwn notes.\n', 'rules v1');
    expect(appended.startsWith('# My project\n\nOwn notes.\n\n')).toBe(true);

    const replaced = mergeManagedBlock(`${appended}\n## After\n`, 'rules v2');
    expect(replaced).toContain('Own notes.');
    expect(replaced).toContain('rules v2');
    expect(replaced).not.toContain('rules v1');
    expect(replaced).toContain('## After');
    expect(mergeManagedBlock(replaced, 'rules v2')).toBe(replaced);
  });

  it('refuses unbalanced markers', () => {
    expect(() => mergeManagedBlock(`${BLOCK_BEGIN}\nhalf`, 'x')).toThrow(/unbalanced/);
  });
});

describe('safeOutputPath', () => {
  it('refuses paths outside the project and through symlinks', () => {
    const dir = tempProject();
    const outside = tempProject();
    symlinkSync(outside, join(dir, '.seckit'));
    expect(() => safeOutputPath(dir, '../escape.md')).toThrow(/outside/);
    expect(() => safeOutputPath(dir, '.seckit/SECURITY-PLAN.md')).toThrow(/symlink/);
  });
});

describe('generate', () => {
  it('writes the plan, controls.json and every AI rules file; second run changes nothing', () => {
    const dir = tempProject({ 'CLAUDE.md': '# Team notes\n\nUse pnpm.\n' });
    writeFileSync(join(dir, 'seckit.yaml'), readFileSync(EXAMPLE));

    expect(generate({ dir, log: silent })).toBe(0);

    const plan = readFileSync(join(dir, '.seckit/SECURITY-PLAN.md'), 'utf8');
    expect(plan).toContain('# Security plan: shop-app');
    expect(plan).toContain('#### AUTH-C2 · Hash passwords');
    expect(plan).toContain('| V2.4.1 | AUTH-C2 |');

    const controls = JSON.parse(readFileSync(join(dir, '.seckit/controls.json'), 'utf8'));
    expect(controls.components).toHaveLength(12);
    expect(readFileSync(join(dir, '.seckit/snippets/android/network_security_config.xml'), 'utf8')).toContain('cleartextTrafficPermitted="false"');
    expect(readFileSync(join(dir, '.seckit/snippets/ios/app-transport-security.plist.xml'), 'utf8')).toContain('NSPinnedDomains');
    expect(plan).toContain('PCI DSS 4.0');

    const claude = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    expect(claude.startsWith('# Team notes\n\nUse pnpm.\n')).toBe(true);
    expect(claude).toContain('**DB-C1** (critical)');
    expect(readFileSync(join(dir, '.cursor/rules/security-kit.mdc'), 'utf8')).toContain('alwaysApply: true');
    expect(readFileSync(join(dir, '.github/copilot-instructions.md'), 'utf8')).toContain(BLOCK_BEGIN);
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain('UPLOAD-C1');

    expect(generate({ dir, check: true, log: silent })).toBe(0);
    writeFileSync(join(dir, 'AGENTS.md'), 'tampered');
    expect(generate({ dir, check: true, log: silent })).toBe(1);
  });
});

describe('init --yes', () => {
  it('writes a valid seckit.yaml from detection and generates the plan', async () => {
    const dir = tempProject({ 'package.json': pkg(['express', 'pg', 'passport-local', 'bcrypt']) });
    expect(await init({ dir, yes: true, log: silent })).toBe(0);
    const manifest = parse(readFileSync(join(dir, 'seckit.yaml'), 'utf8'));
    expect(() => validateManifest(manifest, kb)).not.toThrow();
    expect(readFileSync(join(dir, '.seckit/SECURITY-PLAN.md'), 'utf8')).toContain('AUTH-C2');
    // Refuses to overwrite without --force
    expect(await init({ dir, yes: true, log: silent })).toBe(1);
  });

  it('fails clearly when nothing can be detected', async () => {
    await expect(init({ dir: tempProject(), yes: true, log: silent })).rejects.toThrow(/without --yes/);
  });
});

describe('renderManifestYaml', () => {
  it('round-trips and uses flow style for scalar lists', () => {
    const manifest = parse(readFileSync(EXAMPLE, 'utf8'));
    const text = renderManifestYaml(manifest);
    expect(text).toContain('platforms: [ web, backend, android, ios ]');
    expect(parse(text)).toEqual(manifest);
  });
});

describe('checklist and AI prompt', () => {
  const dir = tempProject({ 'seckit.yaml': readFileSync(EXAMPLE, 'utf8') });
  const manifest = loadManifest(join(dir, 'seckit.yaml'), kb);
  const plan = resolveControls(manifest, kb);
  const ids = [...new Set(plan.components.flatMap((c) => c.controls.map((x) => x.id)))];

  it('lists every control once, most severe first within each section', () => {
    const list = buildChecklist(plan);
    const items = list.sections.flatMap((s) => s.items);
    expect(items.map((i) => i.id).sort()).toEqual([...ids].sort());
    expect(list.total).toBe(ids.length);
    for (const s of list.sections) {
      const ranks = s.items.map((i) => ['critical', 'high', 'medium', 'low'].indexOf(i.severity));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
    const pw = items.find((i) => i.id === 'AUTH-C2')!;
    expect(pw.check.length).toBeGreaterThan(0);
    expect(pw.references).toEqual(expect.arrayContaining(['CWE-916']));
    expect(buildChecklist(plan, { minSeverity: 'high' }).sections.flatMap((s) => s.items).every((i) => ['critical', 'high'].includes(i.severity))).toBe(true);
  });

  it('renders a Markdown task list and keeps ticks in .seckit/checklist.yaml', () => {
    expect(renderChecklistMarkdown(buildChecklist(plan), '0.0.1')).toContain('- [ ] **AUTH-C2 · Critical — Hash passwords');
    setChecklistItem(dir, 'AUTH-C2', { done: true, by: 'Dev', date: '2026-10-27' });
    expect(loadChecklistProgress(dir)).toEqual({ 'AUTH-C2': { done: true, by: 'Dev', date: '2026-10-27' } });
    const md = renderChecklistMarkdown(buildChecklist(plan), '0.0.1', new Set(Object.keys(loadChecklistProgress(dir))));
    expect(md).toContain('- [x] **AUTH-C2');
    expect(md).toMatch(new RegExp(`Progress: 1 of ${ids.length} done`));
    setChecklistItem(dir, 'AUTH-C2', null);
    expect(loadChecklistProgress(dir)).toEqual({});
    expect(() => setChecklistItem(dir, '../../etc', { done: true })).toThrow(/Not a control ID/);
  });

  it('builds a self-contained AI prompt in audit and build modes', () => {
    const audit = renderAiPrompt(plan, manifest);
    expect(audit).toMatch(/^# Security review and hardening — shop-app/);
    expect(audit).toContain('**FAIL**');
    for (const id of ids) expect(audit).toContain(`**${id}**`);
    const build = renderAiPrompt(plan, manifest, { mode: 'build' });
    expect(build).toMatch(/^# Security rules for building shop-app/);
    expect(build).toContain('standing rules');
    const short = renderAiPrompt(plan, manifest, { minSeverity: 'critical' });
    expect(short.length).toBeLessThan(audit.length / 2);
    expect(short).toContain('(critical only)');
  });
});
