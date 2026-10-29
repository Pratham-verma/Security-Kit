// Hosted mode: what needs the user's code runs on their computer. This page explains how, with commands.
import { codeBlock, download, h, icon } from '../dom.js';
import { api, store } from '../store.js';
import { busy, button, callout, pageHeader } from '../ui.js';

/** Flip to true once the packages are on npm; until then the page explains how to run from source. */
const PUBLISHED_ON_NPM = false;

function step(n: number, title: string, text: string, ...body: (HTMLElement | null)[]): HTMLElement {
  return h('section', { class: 'card local-step' }, h('div', { class: 'local-num' }, String(n)), h('div', { class: 'local-body' }, h('h2', null, title), h('p', { class: 'muted' }, text), body));
}

export function localView(): HTMLElement {
  const described = !!store.state?.manifest;
  const docker = (cmd: string) => `docker run --rm -v "$PWD:/project" --user "$(id -u):$(id -g)" security-kit ${cmd}`;
  return h(
    'div',
    { class: 'local' },
    pageHeader(
      'Run it on your code',
      'This website never sees your code. The automatic scan, sign-offs and AI tool setup run on your own computer, with the free Security Kit command-line tool — using the answers you gave here.',
    ),
    PUBLISHED_ON_NPM
      ? null
      : callout('info', 'Coming to npm soon', h('span', null, 'Until the packages are published, build Security Kit from its source repository (', h('code', null, 'npm install && npm run build'), ') or use the Docker image, then run the same commands.')),
    step(
      1,
      'Save your answers in your project',
      'Download seckit.yaml and put it in the root folder of your project. Every command below reads it.',
      described
        ? button('Download seckit.yaml', { kind: 'primary', icon: 'download', onClick: (b) => void busy(b, async () => download('seckit.yaml', await api.get<string>('/api/manifest/export'), 'text/yaml')) })
        : h('p', null, h('a', { href: '#/describe' }, 'Describe your app first'), ' — then come back here.'),
    ),
    step(
      2,
      'Scan your code',
      'Finds leaked secrets, injection, weak password hashing, insecure settings and more, and shows the file and line of each problem. Install Semgrep (pip install semgrep) for the full code checks.',
      codeBlock('npx seckit audit'),
      h('p', { class: 'muted small' }, 'Or with Docker (Semgrep included):'),
      codeBlock(docker('audit')),
    ),
    step(
      3,
      'Use the full app on your computer',
      'The same app you are using now, plus the automatic scan and sign-offs — it opens in your browser and only talks to your own computer.',
      codeBlock('npx seckit ui'),
      h('p', { class: 'muted small' }, 'Or with Docker:'),
      codeBlock(`docker run --rm -it -p 127.0.0.1:4777:4777 -v "$PWD:/project" --user "$(id -u):$(id -g)" security-kit`),
    ),
    step(
      4,
      'Give the rules to your AI tools permanently',
      'Writes the security rules into the files Claude Code, Cursor, GitHub Copilot and other AI tools read automatically (CLAUDE.md, AGENTS.md, Cursor rules), plus a full SECURITY-PLAN.md for your team.',
      codeBlock('npx seckit generate'),
    ),
    step(
      5,
      'Check every pull request',
      'Run the scan in CI so new problems are caught before they are merged. Results can appear in GitHub code scanning.',
      codeBlock('npx seckit audit --format sarif -o seckit.sarif'),
    ),
    h('p', { class: 'muted small' }, icon('lock'), ' Everything above runs locally. Security Kit sends no telemetry.'),
  );
}
