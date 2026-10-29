// Home: what Security Kit is, how it works, what you get and what it covers. The default page.
import { isHosted } from '../backend.js';
import { h, icon, plural } from '../dom.js';
import { confirmDiscard } from '../discard.js';
import { store } from '../store.js';
import { button, navigate } from '../ui.js';

const STEPS = [
  { icon: 'edit', title: 'Describe your app', text: 'Tell Security Kit what your app has — logins, payments, uploads, a mobile app, AI features. It detects most of it from your project.' },
  { icon: 'sparkle', title: 'Get your kit', text: 'Only the security controls your app needs, each mapped to the standards that matter, with what to check and how to fix it.' },
  { icon: 'list', title: 'Work through it', text: 'Tick off a checklist yourself, or paste one prompt into your AI coding tool and let it check and fix your code.' },
  { icon: 'shieldCheck', title: 'Prove it', text: 'Scan your code for problems automatically, and record a sign-off for what only a person can verify.' },
];

const PLATFORMS = ['Web frontends', 'Backends & APIs', 'Android', 'iOS', 'Flutter', 'React Native', 'Cloud (AWS)'];
const LANGUAGES = ['JavaScript / TypeScript', 'Python', 'Java / Kotlin', 'Swift', 'Dart', 'Terraform (AWS)'];
const AI_TOOLS = ['Claude Code', 'Cursor', 'GitHub Copilot', 'Gemini CLI', 'Codex'];

function feature(iconName: string, title: string, text: string, route: string, cta: string): HTMLElement {
  return h(
    'a',
    { class: 'home-feature', href: `#/${route}` },
    h('span', { class: 'home-feature-icon' }, icon(iconName)),
    h('h3', null, title),
    h('p', null, text),
    h('span', { class: 'home-link' }, cta, icon('chevron')),
  );
}

/** One button with two parts: continue with the saved app, or discard it (asks first). */
function continueOrDiscard(name: string): HTMLElement {
  return h(
    'div',
    { class: 'split-btn', role: 'group', 'aria-label': `${name}: continue or discard` },
    h('button', { type: 'button', class: 'btn btn-primary split-main', onclick: () => navigate('kit') }, icon('sparkle'), h('span', null, `Continue with ${name}`)),
    h('button', { type: 'button', class: 'btn btn-primary split-side', title: `Discard ${name} and start over`, 'aria-label': `Discard ${name}`, onclick: () => confirmDiscard(name) }, icon('x'), h('span', null, 'Discard')),
  );
}

export function homeView(): HTMLElement {
  const state = store.state!;
  const catalog = store.catalog!;
  const hosted = isHosted();
  const described = !!state.manifest;
  const controls = catalog.components.reduce((n, c) => n + c.controls, 0);
  const standards = Object.entries(catalog.standards).filter(([key]) => key !== 'nist');
  const codeRules = state.rules.semgrep;

  return h(
    'div',
    { class: 'home' },
    h(
      'section',
      { class: 'home-hero' },
      h('div', { class: 'home-hero-text' },
        h('p', { class: 'home-eyebrow' }, icon('shieldCheck'), `Security Kit ${state.version} · free and open source`),
        h('h1', null, 'Security that fits ', h('span', { class: 'home-accent' }, 'your'), ' app'),
        h(
          'p',
          { class: 'lead' },
          'Security Kit helps developers build more secure applications by turning application requirements into actionable security controls. Simply describe what your application does, and Security Kit generates a tailored security checklist mapped to recognized standards and frameworks, including OWASP, MASVS, PCI DSS, and CWE.',
        ),
        h(
          'div',
          { class: 'home-cta' },
          described
            ? [
                continueOrDiscard(state.manifest!.app.name),
                button('See your overview', { kind: 'secondary', icon: 'shieldCheck', onClick: () => navigate('overview') }),
              ]
            : [
                button('Describe your app', { kind: 'primary', icon: 'edit', onClick: () => navigate('describe') }),
                h('span', { class: 'muted small' }, hosted ? 'Takes about two minutes. Runs in your browser.' : 'Takes about two minutes. Nothing leaves your computer.'),
              ],
        ),
      ),
      h(
        'div',
        { class: 'home-stats' },
        [
          [String(catalog.components.length), 'parts of an app covered'],
          [String(controls), 'security controls'],
          [codeRules > 0 ? String(codeRules + state.rules.builtin) : '100+', 'automatic code checks'],
          [String(standards.length), 'security standards'],
        ].map(([n, label]) => h('div', { class: 'home-stat' }, h('strong', null, n), h('span', null, label))),
      ),
    ),

    h(
      'section',
      { class: 'home-section home-about' },
      h('h2', null, 'About Security Kit'),
      h('p', null, "Whether you're building a web app, mobile app, API, or AI-powered product, Security Kit helps you identify the security controls relevant to your application without having to navigate complex security documentation yourself."),
      h('p', null, 'Running on AWS? Security Kit also secures where your app lives — your AWS account, compute, storage, databases and end-user services — with checks based on the CIS AWS Benchmarks and ready-to-run test cases for each one.'),
      h('p', null, 'Use the generated checklist to guide your security implementation, or transform it into a structured prompt for your AI coding assistant to help implement security directly in your code.'),
      h('p', null, 'Our mission is to make application security practical, accessible, and easier to integrate into every stage of development.'),
      h('p', { class: 'home-about-tag' }, icon('shieldCheck'), " Security shouldn't be an afterthought. With Security Kit, it becomes part of how you build."),
    ),

    h(
      'section',
      { class: 'home-section' },
      h('h2', null, 'How it works'),
      h('ol', { class: 'home-steps' }, STEPS.map((s, i) => h('li', null, h('span', { class: 'home-step-num' }, String(i + 1)), h('span', { class: 'home-feature-icon' }, icon(s.icon)), h('h3', null, s.title), h('p', null, s.text)))),
    ),

    h(
      'section',
      { class: 'home-section' },
      h('h2', null, 'What you get'),
      h(
        'div',
        { class: 'home-features' },
        feature('list', 'Security checklist', 'Every check your app needs, most important first, with how to check it and how to do it. Tick items off, download or print it.', 'checklist', 'Open the checklist'),
        feature('bot', 'AI prompt', `One prompt for ${AI_TOOLS.slice(0, 3).join(', ')} and others: the AI reviews your code item by item, fixes what is missing and reports back.`, 'prompt', 'Get the prompt'),
        feature('play', 'Automatic scan', 'Finds leaked secrets, injection, weak password hashing, unsafe TLS and insecure mobile or server settings — with the file and line.', hosted ? 'local' : 'audit', hosted ? 'Run it on your code' : 'Run the scan'),
        feature('pen', 'Sign-offs', 'Some things only a person can verify. Record who checked what, when and how — reviewed like code.', hosted ? 'local' : 'signoffs', hosted ? 'How it works' : 'Open sign-offs'),
        feature('wand', 'Rules for AI tools', 'Writes your security rules into CLAUDE.md, AGENTS.md, Cursor and Copilot instruction files, and connects AI tools through MCP.', hosted ? 'local' : 'assistants', hosted ? 'How to set it up' : 'Set it up'),
        feature('book', 'Security plan', 'The full plan: why each control matters, the threats it stops and the exact standard requirements it covers.', 'plan', 'Read the plan'),
      ),
    ),

    h(
      'section',
      { class: 'home-section home-cover' },
      h('h2', null, 'What it covers'),
      h(
        'div',
        { class: 'home-cover-grid' },
        h('div', null, h('h3', null, 'Parts of your app'), h('div', { class: 'home-chips' }, catalog.components.map((c) => h('span', { class: 'chip' }, c.name)))),
        h('div', null, h('h3', null, 'Platforms'), h('div', { class: 'home-chips' }, PLATFORMS.map((p) => h('span', { class: 'chip' }, p)))),
        h('div', null, h('h3', null, 'Code scanning'), h('div', { class: 'home-chips' }, LANGUAGES.map((l) => h('span', { class: 'chip' }, l)))),
        h('div', null, h('h3', null, 'Standards'), h('div', { class: 'home-chips' }, standards.map(([, label]) => h('span', { class: 'chip chip-mono' }, label)))),
      ),
    ),

    h(
      'section',
      { class: 'home-section home-privacy' },
      h('span', { class: 'home-feature-icon' }, icon('lock')),
      h(
        'div',
        null,
        h('h2', null, 'Private by design'),
        h(
          'p',
          null,
          hosted
            ? 'This app runs entirely in your browser: no account, no server, no tracking. Your answers stay in this browser, and folder detection reads dependency files locally — nothing is uploaded.'
            : `Everything runs on this computer, for ${state.project.name}. The scan only reads your files, Security Kit sends no telemetry, and this app only answers your own browser.`,
        ),
      ),
    ),

    h(
      'footer',
      { class: 'home-foot muted small' },
      `Security Kit ${state.version} · Apache-2.0 · ${plural(controls, 'control')} in ${plural(catalog.components.length, 'component')}`,
      hosted ? [' · ', h('a', { href: '/docs/' }, 'Documentation')] : null,
    ),
  );
}
