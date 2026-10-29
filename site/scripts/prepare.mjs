// Runs before `astro build` / `astro dev`:
//  1. copies the hosted app (packages/ui/dist/hosted) to public/app/
//  2. generates one docs page per security control, plus a standards index, from the knowledge base
//     (src/content/docs/docs/controls/ — generated, not committed), so the docs never drift from the tool.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { automatedRulesByControl, loadBundledKnowledgeBase, STANDARD_LABELS } from '@seckit/core/browser';

const here = (p) => new URL(p, import.meta.url);

// 1. Hosted app
const app = here('../../packages/ui/dist/hosted/');
if (!existsSync(app)) {
  console.error('packages/ui/dist/hosted is missing: run `node packages/ui/scripts/build-app.mjs` (or `npm run build:site` from the repo root).');
  process.exit(1);
}
rmSync(here('../public/app/'), { recursive: true, force: true });
cpSync(app, here('../public/app/'), { recursive: true });

// 2. Control reference
const kb = loadBundledKnowledgeBase();
const automated = automatedRulesByControl();
const out = here('../src/content/docs/docs/controls/');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const q = (s) => JSON.stringify(s); // a JSON string is a valid YAML scalar
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sev = (s) => `<span class="badge-sev ${s}">${cap(s)}</span>`;
const PLATFORMS = { web: 'Web', backend: 'Backend', android: 'Android', ios: 'iOS', cloud: 'Cloud (AWS)' };
const VERIFY = { semgrep: 'Code scan', config: 'Config check', test: 'Test', manual: 'Manual review' };
const HELPERS = { node: 'Node.js (`@seckit/node`)', web: 'Browser (`@seckit/web`)', android: 'Android', ios: 'iOS' };
const controlPath = (component, control) => `/docs/controls/${component.id.replace(/_/g, '-')}/${control.id.toLowerCase()}/`;
const whenText = (when) =>
  Object.entries(when ?? {})
    .map(([k, v]) => `${k.replace(/_/g, ' ')} is ${v.map((x) => `\`${x}\``).join(' or ')}`)
    .join(', and ');

const byStandard = new Map();
for (const component of kb.components.values()) {
  const dir = new URL(`${component.id.replace(/_/g, '-')}/`, out);
  mkdirSync(dir, { recursive: true });
  const controls = [...component.controls].sort((a, b) => ['critical', 'high', 'medium', 'low'].indexOf(a.severity) - ['critical', 'high', 'medium', 'low'].indexOf(b.severity));

  writeFileSync(
    new URL('index.md', dir),
    [
      '---',
      `title: ${q(component.name)}`,
      `description: ${q(component.description)}`,
      `sidebar: { order: 0, label: "Overview" }`,
      '---',
      '',
      component.description,
      '',
      `**Applies to:** ${component.platforms.map((p) => PLATFORMS[p]).join(', ')} · **Asked as:** “${component.question ?? component.name}”`,
      '',
      '## Threats',
      '',
      ...component.threats.map((t) => `- **${t.id}** — ${t.title}${t.cwe?.length ? ` (${t.cwe.join(', ')})` : ''}`),
      '',
      '## Controls',
      '',
      '| Control | Severity | Level |',
      '|---|---|---|',
      ...controls.map((c) => `| [${c.id} — ${c.title}](${controlPath(component, c)}) | ${sev(c.severity)} | ${c.level} |`),
      '',
    ].join('\n'),
  );

  controls.forEach((c, i) => {
    for (const [key, ids] of Object.entries(c.standards)) {
      for (const id of ids) {
        const m = byStandard.get(key) ?? new Map();
        m.set(id, [...(m.get(id) ?? []), { component, control: c }]);
        byStandard.set(key, m);
      }
    }
    const threats = component.threats.filter((t) => c.mitigates.includes(t.id));
    const rules = automated.get(c.id) ?? [];
    writeFileSync(
      new URL(`${c.id.toLowerCase()}.md`, dir),
      [
        '---',
        `title: ${q(`${c.id}: ${c.title}`)}`,
        `description: ${q(c.ai_rule)}`,
        `sidebar: { order: ${i + 1}, label: ${q(`${c.id} ${c.title}`)} }`,
        '---',
        '',
        `${sev(c.severity)} · Level ${c.level} · [${component.name}](/docs/controls/${component.id.replace(/_/g, '-')}/)` +
          (c.platforms ? ` · ${c.platforms.map((p) => PLATFORMS[p]).join(', ')} only` : '') +
          (c.when ? ` · applies when ${whenText(c.when)}` : ''),
        '',
        '## What to do',
        '',
        c.guidance.trim(),
        '',
        ...(c.implement && Object.keys(c.implement).length
          ? ['### Ready-made help', '', ...Object.entries(c.implement).map(([k, v]) => `- **${HELPERS[k] ?? k}:** ${v}`), '']
          : []),
        '## Why it matters',
        '',
        ...(threats.length ? threats.map((t) => `- **${t.title}**${t.description ? ` — ${t.description}` : ''}${t.cwe?.length ? ` (${t.cwe.join(', ')})` : ''}`) : ['This control reduces risk across the component.']),
        '',
        '## How to check',
        '',
        ...c.verify.map((v) => `- **${VERIFY[v.type] ?? v.type}:** ${v.description}`),
        '',
        rules.length
          ? `The [automatic scan](/docs/guides/scan/) runs ${rules.length} code rule${rules.length === 1 ? '' : 's'} for this control: ${rules.map((r) => `\`${r}\``).join(', ')}.`
          : 'No automated rule checks this yet: verify it by hand and record a [sign-off](/docs/guides/sign-offs/).',
        '',
        '## Rule for AI assistants',
        '',
        `> ${c.ai_rule}`,
        '',
        '## Standards',
        '',
        '| Standard | Requirements |',
        '|---|---|',
        ...Object.entries(c.standards).map(([k, ids]) => `| ${STANDARD_LABELS[k] ?? k} | ${ids.join(', ')} |`),
        '',
      ].join('\n'),
    );
  });
}

// Overview of all controls, and an index per standard.
const all = [...kb.components.values()];
const total = all.reduce((n, c) => n + c.controls.length, 0);
writeFileSync(
  new URL('index.md', out),
  [
    '---',
    'title: Security controls',
    `description: ${q(`All ${total} security controls in Security Kit, by component, with standards mappings.`)}`,
    'sidebar: { order: 0, label: Overview }',
    '---',
    '',
    `Security Kit's knowledge base has **${total} controls** in **${all.length} components**. Your plan contains only the ones that apply to your app.`,
    'Each control page explains what to do, why, how to check it, the rule your AI tools receive, and the standards it maps to.',
    '',
    '| Component | Controls | Applies to |',
    '|---|---|---|',
    ...all.map((c) => `| [${c.name}](/docs/controls/${c.id.replace(/_/g, '-')}/) | ${c.controls.length} | ${c.platforms.map((p) => PLATFORMS[p]).join(', ')} |`),
    '',
    'See also: [controls by standard](/docs/controls/standards/).',
    '',
  ].join('\n'),
);
const numeric = (a, b) => a.localeCompare(b, 'en', { numeric: true });
writeFileSync(
  new URL('standards.md', out),
  [
    '---',
    'title: Controls by standard',
    'description: Which Security Kit controls cover each requirement of OWASP ASVS, MASVS, Top 10, API Top 10, LLM Top 10, PCI DSS and CWE.',
    'sidebar: { label: By standard }',
    '---',
    '',
    'Mappings are maintained by hand in the knowledge base. They show which controls address a requirement — not a certification of compliance.',
    '',
    ...[...byStandard.keys()].flatMap((key) => [
      `## ${STANDARD_LABELS[key] ?? key}`,
      '',
      '| Requirement | Controls |',
      '|---|---|',
      ...[...byStandard.get(key).entries()]
        .sort(([a], [b]) => numeric(a, b))
        .map(([id, list]) => `| ${id} | ${[...new Map(list.map((x) => [x.control.id, x])).values()].map(({ component, control }) => `[${control.id}](${controlPath(component, control)})`).join(', ')} |`),
      '',
    ]),
  ].join('\n'),
);
console.log(`prepared public/app and ${total} control pages`);
