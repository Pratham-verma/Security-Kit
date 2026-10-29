import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JS build script
import { generate } from '../scripts/build-kb.mjs';
import { automatedRulesByControl, loadBundledKnowledgeBase } from '../src/browser.js';
import {
  detect,
  type FileSource,
  loadDefaultKnowledgeBase,
  loadRulePack,
  nodeFileSource,
  parseManifest,
  renderAiPrompt,
  renderChecklistMarkdown,
  buildChecklist,
  resolveControls,
  ValidationError,
} from '../src/index.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const EXAMPLE = readFileSync(here('../../../examples/shop-app/seckit.yaml'), 'utf8');

describe('browser engine', () => {
  it('ships generated files that match the knowledge base (run `npm run generate -w @seckit/core`)', () => {
    const { kbData, validators } = generate() as { kbData: string; validators: string };
    expect(readFileSync(here('../src/generated/kb-data.ts'), 'utf8')).toBe(kbData);
    expect(readFileSync(here('../src/generated/validators.ts'), 'utf8')).toBe(validators);
  });

  it('bundles for the browser without Node built-ins or eval', async () => {
    const out = await build({
      entryPoints: [here('../src/browser.ts')],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      logLevel: 'silent',
    });
    const code = out.outputFiles[0]!.text;
    expect(code).not.toMatch(/from\s*["']node:/);
    expect(code).not.toMatch(/\bnew Function\(/);
  }, 60_000);

  it('produces exactly the same plan, checklist and AI prompt as the Node engine', () => {
    const nodeKb = loadDefaultKnowledgeBase();
    const webKb = loadBundledKnowledgeBase();
    expect([...webKb.components.keys()]).toEqual([...nodeKb.components.keys()]);
    const nodePlan = resolveControls(parseManifest(EXAMPLE, nodeKb), nodeKb);
    const webManifest = parseManifest(EXAMPLE, webKb);
    const webPlan = resolveControls(webManifest, webKb);
    expect(webPlan).toEqual(nodePlan);
    expect(renderChecklistMarkdown(buildChecklist(webPlan), '0.1.0')).toBe(renderChecklistMarkdown(buildChecklist(nodePlan), '0.1.0'));
    expect(renderAiPrompt(webPlan, webManifest)).toBe(renderAiPrompt(nodePlan, parseManifest(EXAMPLE, nodeKb)));
  });

  it('pre-compiled validators reject the same bad input and fill the same defaults', () => {
    const bad = 'version: 1\napp: { name: x, platforms: [web] }\ncomponents:\n  - type: database\n    engine: nope\n';
    const err = (kb: ReturnType<typeof loadDefaultKnowledgeBase>) => {
      try {
        parseManifest(bad, kb);
      } catch (e) {
        return (e as ValidationError).issues;
      }
      return [];
    };
    expect(err(loadBundledKnowledgeBase())).toEqual(err(loadDefaultKnowledgeBase()));
    expect(err(loadBundledKnowledgeBase()).length).toBeGreaterThan(0);
    const withDefaults = 'version: 1\napp: { name: x, platforms: [android] }\ncomponents:\n  - type: mobile_platform\n';
    expect(parseManifest(withDefaults, loadBundledKnowledgeBase())).toEqual(parseManifest(withDefaults, loadDefaultKnowledgeBase()));
  });

  it('knows which controls the Semgrep rules check', () => {
    const map = automatedRulesByControl();
    const rules = loadRulePack(loadDefaultKnowledgeBase());
    expect(new Set([...map.values()].flat())).toEqual(new Set(rules.map((r) => r.id)));
    expect(map.get('DB-C1')).toEqual(expect.arrayContaining(['seckit.db-c1.sql-string-building']));
  });
});

describe('detection over a FileSource', () => {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: '@acme/shop', dependencies: { express: '^4', pg: '^8', stripe: '^17', 'react-dom': '^18' } }),
    'mobile/pubspec.yaml': 'name: wallet\ndependencies:\n  flutter:\n    sdk: flutter\n  local_auth: ^2.3.0\nflutter:\n  uses-material-design: true\n',
    'backend/pom.xml': '<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>',
    '.env': 'SECRET=x',
  };

  /** The same files as the browser adapter sees them: an in-memory map. */
  function memorySource(map: Record<string, string>): FileSource {
    return {
      read: (p) => map[p],
      list: (dir) => {
        const prefix = dir ? `${dir}/` : '';
        const names = new Set<string>();
        for (const p of Object.keys(map)) {
          if (!p.startsWith(prefix)) continue;
          const rest = p.slice(prefix.length);
          names.add(rest.includes('/') ? `${rest.split('/')[0]}/` : rest);
        }
        return [...names];
      },
    };
  }

  it('gives the same result from memory as from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seckit-detect-'));
    for (const [p, c] of Object.entries(files)) {
      mkdirSync(join(dir, p, '..'), { recursive: true });
      writeFileSync(join(dir, p), c);
    }
    const fromDisk = detect(nodeFileSource(dir), 'x');
    const fromMemory = detect(memorySource(files), 'x');
    expect(fromMemory).toEqual(fromDisk);
    expect(fromMemory.name).toBe('shop');
    expect(fromMemory.platforms).toEqual(['web', 'backend', 'android', 'ios']);
    expect(fromMemory.components.map((c) => c.type)).toEqual(expect.arrayContaining(['api', 'database', 'payments', 'secrets', 'mobile_platform']));
  });

  it('detects AWS services from Terraform, CloudFormation, Serverless and SDK packages', () => {
    const aws = detect(
      memorySource({
        'package.json': JSON.stringify({ name: 'api', dependencies: { express: '^4', '@aws-sdk/client-s3': '^3' } }),
        'infra/terraform/main.tf': [
          'provider "aws" { region = "eu-west-1" }',
          'resource "aws_ecs_service" "app" {}',
          'resource "aws_lb" "web" {}',
          'resource "aws_db_instance" "db" {}',
          'resource "aws_organizations_policy" "scp" {}',
          'data "aws_rds_cluster" "ignored" {}',
        ].join('\n'),
        'template.yaml': 'AWSTemplateFormatVersion: "2010-09-09"\nResources:\n  Table:\n    Type: AWS::DynamoDB::Table\n',
        'worker/serverless.yml': 'service: worker\nprovider:\n  name: aws\n  runtime: nodejs20.x\n',
      }),
      'x',
    );
    const byType = Object.fromEntries(aws.components.map((c) => [c.type, c.options]));
    expect(aws.platforms).toContain('cloud');
    expect(byType.aws_account).toEqual({ organization: true });
    expect(byType.aws_compute).toEqual({ services: expect.arrayContaining(['ecs', 'lambda']), public_endpoint: true });
    expect(byType.aws_storage).toEqual({ services: ['s3'] });
    expect(byType.aws_database).toEqual({ services: expect.arrayContaining(['rds', 'dynamodb']) });
    expect((byType.aws_database!.services as string[])).not.toContain('aurora');
    expect(byType.aws_end_user).toBeUndefined();
    // An AWS SDK alone (e.g. uploads to S3) does not make AWS a platform.
    const sdkOnly = detect(memorySource({ 'package.json': JSON.stringify({ dependencies: { express: '^4', '@aws-sdk/client-s3': '^3' } }) }), 'x');
    expect(sdkOnly.platforms).not.toContain('cloud');
    expect(sdkOnly.components.some((c) => c.type.startsWith('aws_'))).toBe(false);
    // No AWS evidence, no cloud components.
    expect(detect(memorySource(files), 'x').components.some((c) => c.type.startsWith('aws_'))).toBe(false);
  });

  it('never reads outside the project on disk', () => {
    const src = nodeFileSource(mkdtempSync(join(tmpdir(), 'seckit-detect-')));
    expect(src.read('../../etc/passwd')).toBeUndefined();
    expect(src.list('..')).toEqual([]);
  });
});
