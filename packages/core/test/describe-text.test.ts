import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectFromText, loadKnowledgeBase, manifestFromDetection, renderAiPrompt, resolveControls, validateManifest } from '../src/index.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const kb = loadKnowledgeBase(join(ROOT, 'knowledge-base'));

const component = (text: string, type: string) => detectFromText(text).detection.components.find((c) => c.type === type);
const types = (text: string) => detectFromText(text).detection.components.map((c) => c.type);

/** The answers a description fills in must always be a valid seckit.yaml. */
function manifestFor(text: string) {
  const read = detectFromText(text);
  const m = manifestFromDetection({ ...read.detection, name: read.detection.name ?? 'app' });
  return validateManifest({ ...m, app: { ...m.app, data_sensitivity: read.data_sensitivity, assurance_level: read.assurance_level } }, kb);
}

const SAAS =
  'A React web app called Plate with a Node.js API and PostgreSQL. Users sign up with email and password or Google login, with optional 2FA. ' +
  'They pay for subscriptions with Stripe Checkout and can upload profile photos to S3. There is an AI chatbot that uses OpenAI. It runs on AWS Lambda.';

describe('detectFromText', () => {
  it('reads a typical SaaS description', () => {
    const read = detectFromText(SAAS);
    expect(read.detection.name).toBe('Plate');
    expect(read.detection.platforms).toEqual(['web', 'backend', 'cloud']);
    expect(component(SAAS, 'auth')?.options).toEqual({ methods: ['email_password', 'oauth'], mfa: 'optional' });
    expect(component(SAAS, 'database')?.options).toEqual({ engine: 'postgres', kind: 'sql' });
    expect(component(SAAS, 'payments')?.options).toEqual({ provider: 'stripe', integration: 'hosted_checkout' });
    expect(component(SAAS, 'file_upload')?.options).toMatchObject({ types: ['images'], storage: 'object_storage' });
    expect(component(SAAS, 'ai_feature')?.options).toEqual({ capabilities: ['chat'], provider: 'hosted_api' });
    expect(component(SAAS, 'web_frontend')?.options).toMatchObject({ rendering: 'spa' });
    expect(component(SAAS, 'aws_compute')?.options).toMatchObject({ services: ['lambda'] });
    expect(component(SAAS, 'aws_storage')?.options).toMatchObject({ services: ['s3'] });
    expect(types(SAAS)).toEqual(expect.arrayContaining(['session', 'api', 'secrets', 'logging', 'aws_account']));
    // Payments make the data highly sensitive; nothing here calls for level 3.
    expect(read).toMatchObject({ data_sensitivity: 'high', assurance_level: 2 });
    expect(manifestFor(SAAS).components.length).toBeGreaterThan(8);
  });

  it('ignores what the description says the app does not have', () => {
    const text = 'A web app with user accounts and a Postgres database. There are no payments, no file uploads and no AI features.';
    expect(types(text)).toEqual(expect.arrayContaining(['auth', 'database']));
    expect(types(text)).not.toContain('payments');
    expect(types(text)).not.toContain('file_upload');
    expect(types(text)).not.toContain('ai_feature');
    expect(component('Users sign in with magic links, without a password.', 'auth')?.options).toEqual({ methods: ['magic_link'] });
  });

  it('reads mobile apps, device storage and biometrics', () => {
    const text = 'A Flutter mobile app for patients to book doctor appointments. Login with SMS OTP and Face ID. Health records are cached offline. Firebase backend.';
    const read = detectFromText(text);
    expect(read.detection.platforms).toEqual(expect.arrayContaining(['android', 'ios', 'backend']));
    expect(component(text, 'auth')?.options).toMatchObject({ methods: ['otp_sms'] });
    expect(component(text, 'mobile_platform')?.options).toEqual({ biometrics: true });
    expect(component(text, 'mobile_storage')?.options).toEqual({ data: ['auth_tokens', 'health_data', 'offline_cache'] });
    expect(component(text, 'database')?.options).toEqual({ engine: 'firestore', kind: 'nosql' });
    expect(read).toMatchObject({ data_sensitivity: 'high', assurance_level: 3 });
    manifestFor(text);
  });

  it('keeps several databases apart and marks a public API', () => {
    const text = 'Django backend with MySQL and Redis. We offer a public REST API for partners.';
    const dbs = detectFromText(text).detection.components.filter((c) => c.type === 'database');
    expect(dbs.map((d) => [d.name, d.options.kind])).toEqual([['mysql', 'sql'], ['redis', 'nosql']]);
    expect(component(text, 'api')?.options).toMatchObject({ style: ['rest'], consumers: expect.arrayContaining(['third_parties']) });
    manifestFor(text);
  });

  it('rates a public static site as low sensitivity', () => {
    const read = detectFromText('A static website for a bakery with a landing page and opening hours. No personal data.');
    expect(read).toMatchObject({ data_sensitivity: 'low', assurance_level: 1 });
    expect(read.detection.platforms).toEqual(['web']);
    expect(component('A static website for a bakery.', 'web_frontend')?.options).toEqual({ rendering: 'static' });
  });

  it('finds nothing in text that is not about an app', () => {
    expect(detectFromText('Hello there, how are you today?').detection.components).toEqual([]);
  });

  it('always produces valid answers', () => {
    for (const text of [
      SAAS,
      'An Android and iOS app in Kotlin and Swift with deep links, a webview and in-app purchases.',
      'Internal microservices on EKS with Aurora, ElastiCache and DynamoDB, logs in Datadog, secrets in AWS Secrets Manager, GitHub Actions CI.',
      'A RAG assistant that answers questions about uploaded PDFs, using embeddings, tool calling and a self-hosted model on Ollama.',
      'A Next.js marketplace with Stripe Elements, PayPal, image and video uploads, and a WYSIWYG editor for sellers.',
    ]) {
      expect(() => manifestFor(text), text).not.toThrow();
    }
  });
});

describe('AI prompt', () => {
  it('tells the AI to keep the app working when it changes code, not when it only tests', () => {
    const m = manifestFor(SAAS);
    const plan = resolveControls(m, kb);
    expect(renderAiPrompt(plan, m, { mode: 'audit' })).toContain('## Keep the app working');
    expect(renderAiPrompt(plan, m, { mode: 'build' })).toContain('## Keep the app working');
    expect(renderAiPrompt(plan, m, { mode: 'test' })).not.toContain('## Keep the app working');
  });
});
