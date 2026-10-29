// Checks that need no external tools. Precision over recall: a noisy audit gets ignored.
import { basename } from 'node:path';
import { parseAllDocuments } from 'yaml';
import type { ProjectFiles } from './files.js';

export interface Finding {
  /** Controls this finding violates (filtered to the plan by the audit). */
  controls: string[];
  check: string;
  message: string;
  file: string;
  line?: number;
}

export interface BuiltinCheck {
  id: string;
  controls: string[];
  run(ctx: ProjectFiles): Finding[];
}

const LOCKFILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'Podfile.lock', 'Cargo.lock', 'poetry.lock']);
const ENV_EXAMPLE = /\.(example|sample|template|dist|defaults)$/i;

/** Never print a secret: show its first 4 characters only. */
const mask = (s: string) => `${s.slice(0, 4)}…`;

function eachLine(text: string, fn: (line: string, n: number) => void): void {
  text.split(/\r?\n/).forEach((line, i) => fn(line, i + 1));
}

const SECRET_PATTERNS: { name: string; re: RegExp; controls: string[] }[] = [
  { name: 'AWS access key ID', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, controls: ['SEC-C1'] },
  { name: 'private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/, controls: ['SEC-C1'] },
  { name: 'Stripe live secret key', re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b/, controls: ['SEC-C1'] },
  { name: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/, controls: ['SEC-C1'] },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, controls: ['SEC-C1'] },
  { name: 'OpenAI API key', re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}\b|\bsk-proj-[A-Za-z0-9_-]{80,}\b/, controls: ['SEC-C1'] },
  { name: 'Anthropic API key', re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,}\b/, controls: ['SEC-C1'] },
];

const DB_URL = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?):\/\/[^\s:/@'"`]+:([^\s@'"`]+)@([^\s/:'"`]+)/;
const PLACEHOLDER = /^(?:\$\{.*|\$[A-Z_]+|<.*|%.*|\{\{.*|password|pass|passwd|pwd|secret|changeme|example|test|xxx+|\*+|\.\.\.|your[-_].*)$/i;
const LOCAL_HOSTS = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal|\[::1\])$/i;

export const hardcodedSecrets: BuiltinCheck = {
  id: 'seckit.secrets.hardcoded',
  controls: ['SEC-C1', 'DB-C4'],
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files) {
      const name = basename(file);
      if (LOCKFILES.has(name) || /\.min\.(js|css)$/.test(name) || (/^\.env/.test(name) && !ENV_EXAMPLE.test(name))) continue;
      const text = ctx.read(file);
      if (!text) continue;
      let count = 0;
      eachLine(text, (line, n) => {
        if (count >= 20) return;
        for (const p of SECRET_PATTERNS) {
          const m = line.match(p.re);
          if (m) {
            findings.push({ controls: p.controls, check: this.id, file, line: n, message: `Possible ${p.name} in source (${mask(m[0])}). Remove it, rotate it, and load it from a secret store.` });
            count++;
          }
        }
        const db = line.match(DB_URL);
        if (db && !PLACEHOLDER.test(db[1]!) && !LOCAL_HOSTS.test(db[2]!)) {
          findings.push({ controls: ['DB-C4', 'SEC-C1'], check: this.id, file, line: n, message: `Connection string with an inline password for ${db[2]}. Read it from the environment or a secret store.` });
          count++;
        }
      });
    }
    return findings;
  },
};

export const envFilesExposed: BuiltinCheck = {
  id: 'seckit.secrets.env-file-not-ignored',
  controls: ['SEC-C1'],
  run(ctx) {
    const isEnv = (f: string) => /^\.env(\..+)?$/.test(basename(f)) && !ENV_EXAMPLE.test(basename(f));
    if (ctx.git) {
      // In git mode the file list holds only tracked or not-ignored files, so any .env here is exposed.
      return ctx.files.filter(isEnv).map((file) => ({
        controls: ['SEC-C1'],
        check: this.id,
        file,
        message: `${file} is committed or not git-ignored. Add it to .gitignore; if it was ever committed, rotate its secrets.`,
      }));
    }
    const envs = ctx.files.filter(isEnv);
    const gitignore = ctx.read('.gitignore') ?? '';
    const ignored = gitignore.split(/\r?\n/).some((l) => /^\/?\.env(\*|\..*)?$/.test(l.trim()));
    return ignored
      ? []
      : envs.map((file) => ({ controls: ['SEC-C1'], check: this.id, file, message: `${file} exists but .gitignore has no .env entry.` }));
  },
};

const PUBLIC_SECRET_VAR = /\b(?:NEXT_PUBLIC|VITE|EXPO_PUBLIC|REACT_APP|NUXT_PUBLIC|GATSBY|PUBLIC)_[A-Z0-9_]*?(?:SECRET|PRIVATE|PASSWORD|SERVICE_ROLE|DATABASE_URL|OPENAI|ANTHROPIC|GROQ|MISTRAL|GEMINI_API)[A-Z0-9_]*\b/g;
const LLM_VAR = /OPENAI|ANTHROPIC|GROQ|MISTRAL|GEMINI/;

export const publicEnvSecrets: BuiltinCheck = {
  id: 'seckit.secrets.public-env-prefix',
  controls: ['SEC-C2', 'AI-C8'],
  run(ctx) {
    const findings: Finding[] = [];
    // .env files are usually git-ignored but still decide what gets bundled, so read them directly.
    const envFiles = ['.env', '.env.local', '.env.production', '.env.development'].filter((f) => !ctx.files.includes(f));
    for (const file of [...ctx.files, ...envFiles]) {
      if (LOCKFILES.has(basename(file))) continue;
      const text = ctx.read(file);
      if (!text) continue;
      const seen = new Set<string>();
      eachLine(text, (line, n) => {
        for (const m of line.matchAll(PUBLIC_SECRET_VAR)) {
          if (seen.has(m[0])) continue;
          seen.add(m[0]);
          findings.push({
            controls: LLM_VAR.test(m[0]) ? ['SEC-C2', 'AI-C8'] : ['SEC-C2'],
            check: this.id,
            file,
            line: n,
            message: `${m[0]} is a public build-time variable, so its value ships to every browser or device. Keep secrets server-side.`,
          });
        }
      });
    }
    return findings;
  },
};

export const unpinnedActions: BuiltinCheck = {
  id: 'seckit.ci.unpinned-action',
  controls: ['SEC-C7'],
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f))) {
      eachLine(ctx.read(file) ?? '', (line, n) => {
        const uses = line.match(/^\s*(?:-\s*)?uses:\s*["']?([^"'\s#]+)/)?.[1];
        if (!uses || uses.startsWith('./') || uses.startsWith('docker://')) return;
        const ref = uses.includes('@') ? uses.slice(uses.lastIndexOf('@') + 1) : '';
        if (!/^[0-9a-f]{40}$/.test(ref)) {
          findings.push({ controls: ['SEC-C7'], check: this.id, file, line: n, message: `${uses} is not pinned to a full commit SHA.` });
        }
      });
    }
    return findings;
  },
};

export const androidBackup: BuiltinCheck = {
  id: 'seckit.android.backup-enabled',
  controls: ['MSTORE-C4'],
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files.filter((f) => basename(f) === 'AndroidManifest.xml')) {
      const text = ctx.read(file) ?? '';
      const start = text.search(/<application\b/);
      if (start === -1) continue;
      const tag = text.slice(start, text.indexOf('>', start) + 1);
      const safe = /android:allowBackup\s*=\s*"false"/.test(tag) || /android:(dataExtractionRules|fullBackupContent)\s*=/.test(tag);
      if (!safe) {
        findings.push({
          controls: ['MSTORE-C4'],
          check: this.id,
          file,
          line: text.slice(0, start).split('\n').length,
          message: 'App data is included in backups (allowBackup is true or unset, with no dataExtractionRules). Exclude tokens and sensitive files.',
        });
      }
    }
    return findings;
  },
};

// Stripe requires js.stripe.com to be loaded directly from Stripe without SRI.
const SRI_EXEMPT_HOSTS = new Set(['js.stripe.com']);

export const scriptsWithoutSri: BuiltinCheck = {
  id: 'seckit.html.external-script-without-sri',
  controls: ['WEB-C5', 'PAY-C6'],
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files.filter((f) => /\.(html?|ejs|hbs|handlebars|njk|liquid|php|erb)$/i.test(f))) {
      eachLine(ctx.read(file) ?? '', (line, n) => {
        for (const m of line.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']((?:https?:)?\/\/([^/"']+)[^"']*)["'][^>]*>/gi)) {
          if (/\bintegrity\s*=/.test(m[0]) || SRI_EXEMPT_HOSTS.has(m[2]!.toLowerCase())) continue;
          findings.push({ controls: ['WEB-C5', 'PAY-C6'], check: this.id, file, line: n, message: `External script ${m[1]} has no integrity attribute.` });
        }
      });
    }
    return findings;
  },
};

// ---- Mobile platform configuration (MASVS) ----

/** Debug-only source sets may legitimately relax settings. */
const isDebugSource = (f: string) => /(^|\/)src\/debug\//.test(f);
const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;
/** Blank out <debug-overrides> blocks, keeping line numbers intact. */
const withoutDebugOverrides = (xml: string) =>
  xml.replace(/<debug-overrides>[\s\S]*?<\/debug-overrides>/g, (m) => m.replace(/[^\n]/g, ' '));
const isNetworkSecurityConfig = (f: string, text: string) => f.endsWith('.xml') && text.includes('<network-security-config');

function findAll(text: string, re: RegExp, fn: (m: RegExpMatchArray, line: number) => void): void {
  for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))) fn(m, lineAt(text, m.index!));
}

export const mobileCleartext: BuiltinCheck = {
  id: 'seckit.mobile.cleartext-allowed',
  controls: ['MPLAT-C1'],
  run(ctx) {
    const findings: Finding[] = [];
    const add = (file: string, line: number, message: string) => findings.push({ controls: ['MPLAT-C1'], check: this.id, file, line, message });
    for (const file of ctx.files.filter((f) => !isDebugSource(f))) {
      const name = basename(file);
      if (!/\.(xml|plist|json)$/.test(name)) continue;
      const text = ctx.read(file);
      if (!text) continue;
      if (name === 'AndroidManifest.xml') {
        findAll(text, /android:usesCleartextTraffic\s*=\s*"true"/, (_m, line) => add(file, line, 'android:usesCleartextTraffic="true" allows unencrypted HTTP.'));
      } else if (isNetworkSecurityConfig(file, text)) {
        findAll(withoutDebugOverrides(text), /cleartextTrafficPermitted\s*=\s*"true"/, (_m, line) =>
          add(file, line, 'cleartextTrafficPermitted="true" allows unencrypted HTTP.'),
        );
      } else if (name.endsWith('.plist')) {
        findAll(text, /<key>(NSAllowsArbitraryLoads(?:InWebContent|ForMedia)?|NSExceptionAllowsInsecureHTTPLoads)<\/key>\s*<true\s*\/>/, (m, line) =>
          add(file, line, `${m[1]} = true weakens App Transport Security${m[1] === 'NSExceptionAllowsInsecureHTTPLoads' ? ' for a domain' : ''}.`),
        );
      } else if (name === 'app.json' || name === 'app.config.json') {
        findAll(text, /"usesCleartextTraffic"\s*:\s*true/, (_m, line) => add(file, line, 'Expo android.usesCleartextTraffic is true.'));
      }
    }
    return findings;
  },
};

export const androidUserCas: BuiltinCheck = {
  id: 'seckit.android.user-ca-trusted',
  controls: ['MPLAT-C2'],
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files.filter((f) => f.endsWith('.xml') && !isDebugSource(f))) {
      const text = ctx.read(file);
      if (!text || !isNetworkSecurityConfig(file, text)) continue;
      findAll(withoutDebugOverrides(text), /<certificates\s+src\s*=\s*"user"/, (_m, line) =>
        findings.push({
          controls: ['MPLAT-C2'],
          check: this.id,
          file,
          line,
          message: 'User-installed CAs are trusted outside <debug-overrides>, so anyone who installs a CA can intercept traffic.',
        }),
      );
    }
    return findings;
  },
};

/** Text of the `{ ... }` block that opens at or after `from`, with balanced braces. */
function braceBlock(text: string, from: number): { start: number; body: string } | undefined {
  const open = text.indexOf('{', from);
  if (open === -1) return undefined;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return { start: open, body: text.slice(open, i + 1) };
  }
  return undefined;
}

export const mobileDebuggable: BuiltinCheck = {
  id: 'seckit.android.debuggable-release',
  controls: ['MPLAT-C7'],
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files.filter((f) => !isDebugSource(f))) {
      const name = basename(file);
      if (name === 'AndroidManifest.xml') {
        const text = ctx.read(file) ?? '';
        findAll(text, /android:debuggable\s*=\s*"true"/, (_m, line) =>
          findings.push({ controls: ['MPLAT-C7'], check: this.id, file, line, message: 'android:debuggable="true" in the manifest makes release builds debuggable.' }),
        );
      } else if (name === 'build.gradle' || name === 'build.gradle.kts') {
        const text = ctx.read(file) ?? '';
        findAll(text, /\b(?:release|getByName\(\s*"release"\s*\))\s*\{/, (m) => {
          const block = braceBlock(text, m.index!);
          const hit = block?.body.match(/\b(isDebuggable\s*=\s*true|debuggable\s*(=\s*)?true)\b/);
          if (block && hit) {
            findings.push({ controls: ['MPLAT-C7'], check: this.id, file, line: lineAt(text, block.start + hit.index!), message: 'The release build type is debuggable.' });
          }
        });
      }
    }
    return findings;
  },
};

export const androidExported: BuiltinCheck = {
  id: 'seckit.android.exported-without-permission',
  controls: ['MPLAT-C6'],
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files.filter((f) => basename(f) === 'AndroidManifest.xml' && !isDebugSource(f))) {
      const text = ctx.read(file) ?? '';
      // Activities are skipped: launcher and deep-link activities must be exported by design.
      findAll(text, /<(service|receiver|provider)\b[^>]*>/, (m, line) => {
        const tag = m[0];
        if (!/android:exported\s*=\s*"true"/.test(tag) || /android:(permission|readPermission|writePermission)\s*=/.test(tag)) return;
        const name = tag.match(/android:name\s*=\s*"([^"]+)"/)?.[1] ?? m[1];
        findings.push({
          controls: ['MPLAT-C6'],
          check: this.id,
          file,
          line,
          message: `Exported ${m[1]} ${name} has no android:permission, so any app can call it.`,
        });
      });
    }
    return findings;
  },
};

/** Lower bound for targetSdk; Google Play raises its requirement every year, so treat this as a floor. */
export const MIN_TARGET_SDK = 34;

export const androidTargetSdk: BuiltinCheck = {
  id: 'seckit.android.outdated-target-sdk',
  controls: ['MPLAT-C9'],
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files.filter((f) => /(^|\/)build\.gradle(\.kts)?$/.test(f))) {
      const text = ctx.read(file) ?? '';
      findAll(text, /\btargetSdk(?:Version)?\s*(?:=\s*|\(\s*)?(\d{2})\b/, (m, line) => {
        if (Number(m[1]) < MIN_TARGET_SDK) {
          findings.push({ controls: ['MPLAT-C9'], check: this.id, file, line, message: `targetSdk ${m[1]} is older than ${MIN_TARGET_SDK}; recent platform security behaviour is not applied.` });
        }
      });
    }
    return findings;
  },
};

const SPRING_CONFIG = /(^|\/)application(-[\w-]+)?\.(properties|ya?ml)$/;
// Profiles that never run in production; their relaxed settings are expected.
const DEV_PROFILE = /^(dev|devel|development|local|test|testing|ci|h2)$/i;

/** Flattened `dotted.key -> value` pairs from a Spring properties or YAML file, skipping dev-only profiles. */
function springProperties(file: string, text: string): Map<string, string> {
  const out = new Map<string, string>();
  if (file.endsWith('.properties')) {
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.\[\]-]+)\s*[=:]\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith('#')) out.set(m[1]!.toLowerCase(), m[2]!);
    }
    return out;
  }
  const flatten = (value: unknown, prefix: string, into: Map<string, string>) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, into);
    } else if (prefix) {
      into.set(prefix.toLowerCase(), Array.isArray(value) ? value.join(',') : String(value));
    }
  };
  try {
    for (const doc of parseAllDocuments(text)) {
      const props = new Map<string, string>();
      flatten(doc.toJS(), '', props);
      const profile = props.get('spring.config.activate.on-profile') ?? props.get('spring.profiles');
      if (profile && profile.split(',').every((p) => DEV_PROFILE.test(p.trim()))) continue;
      for (const [k, v] of props) out.set(k, v);
    }
  } catch {
    // unparsable YAML: nothing to check
  }
  return out;
}

const SPRING_RISKS: { key: string; bad: (v: string) => boolean; controls: string[]; message: (v: string) => string }[] = [
  {
    key: 'management.endpoints.web.exposure.include',
    bad: (v) => /(^|,)\s*(\*|env|heapdump|threaddump|configprops|logfile|shutdown|jolokia)\s*(,|$)/i.test(v),
    controls: ['API-C8'],
    message: (v) => `Actuator exposes "${v}" over HTTP; env, heapdump and configprops leak secrets. Expose only health (and info), and secure the rest.`,
  },
  {
    key: 'server.error.include-stacktrace',
    bad: (v) => /^(always|on[-_]param)$/i.test(v),
    controls: ['API-C8', 'LOG-C6'],
    message: () => 'Stack traces are included in error responses. Use server.error.include-stacktrace=never.',
  },
  {
    key: 'server.error.include-exception',
    bad: (v) => v === 'true',
    controls: ['API-C8', 'LOG-C6'],
    message: () => 'Exception class names are included in error responses.',
  },
  {
    key: 'server.error.include-message',
    bad: (v) => /^always$/i.test(v),
    controls: ['API-C8', 'LOG-C6'],
    message: () => 'Exception messages are included in error responses (they can contain SQL, paths and data).',
  },
  {
    key: 'spring.h2.console.enabled',
    bad: (v) => v === 'true',
    controls: ['API-C8'],
    message: () => 'The H2 web console is enabled; it allows running SQL (and code) on the server. Enable it only in a dev profile.',
  },
  {
    key: 'server.servlet.session.cookie.secure',
    bad: (v) => v === 'false',
    controls: ['SESS-C1'],
    message: () => 'The session cookie is sent without the Secure flag.',
  },
  {
    key: 'server.servlet.session.cookie.http-only',
    bad: (v) => v === 'false',
    controls: ['SESS-C1'],
    message: () => 'The session cookie is readable from JavaScript (HttpOnly is off).',
  },
  {
    key: 'spring.datasource.password',
    bad: (v) => v !== '' && !/^\$\{.*\}$/.test(v) && !PLACEHOLDER.test(v) && v !== 'null',
    controls: ['DB-C4', 'SEC-C1'],
    message: () => 'Database password written in the config file. Use ${DB_PASSWORD} from the environment or a secret store.',
  },
];

export const springConfig: BuiltinCheck = {
  id: 'seckit.spring.risky-config',
  controls: ['API-C8', 'LOG-C6', 'SESS-C1', 'DB-C4', 'SEC-C1'],
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files.filter((f) => SPRING_CONFIG.test(f) && !/(^|\/)src\/test\//.test(f))) {
      const profile = basename(file).match(/^application-([\w-]+)\./)?.[1];
      if (profile && DEV_PROFILE.test(profile)) continue;
      const text = ctx.read(file);
      if (!text) continue;
      const props = springProperties(file, text);
      for (const risk of SPRING_RISKS) {
        const value = props.get(risk.key);
        if (value === undefined || !risk.bad(value.trim())) continue;
        const leaf = risk.key.split('.').pop()!;
        const index = text.search(new RegExp(`(^|[.\\s])${leaf.replace(/-/g, '[-_]?')}\\s*[:=]`, 'im'));
        findings.push({
          controls: risk.controls,
          check: this.id,
          file,
          ...(index >= 0 ? { line: lineAt(text, index + 1) } : {}),
          message: `${risk.key}: ${risk.message(value.trim())}`,
        });
      }
    }
    return findings;
  },
};

export const BUILTIN_CHECKS: BuiltinCheck[] = [
  hardcodedSecrets,
  envFilesExposed,
  publicEnvSecrets,
  unpinnedActions,
  androidBackup,
  scriptsWithoutSri,
  mobileCleartext,
  androidUserCas,
  mobileDebuggable,
  androidExported,
  androidTargetSdk,
  springConfig,
];
