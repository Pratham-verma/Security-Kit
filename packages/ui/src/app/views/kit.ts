// "Get your kit": after describing the app, choose a checklist (do it yourself) or a prompt (let your AI do it).
import { isHosted } from '../backend.js';
import { download, h, icon, plural } from '../dom.js';
import { api, store } from '../store.js';
import { busy, button, emptyState, navigate, severityBadge, SEVERITIES } from '../ui.js';

export function kitView(): HTMLElement {
  const state = store.state!;
  if (!state.plan) {
    return emptyState('edit', 'Describe your app first', 'Security Kit needs to know what your app has before it can build your checklist or AI prompt.', button('Describe your app', { kind: 'primary', icon: 'edit', onClick: () => navigate('describe') }));
  }
  const unique = new Map(state.plan.components.flatMap((c) => c.controls).map((c) => [c.id, c]));
  const bySev = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const c of unique.values()) bySev[c.severity]++;

  const option = (route: string, iconName: string, title: string, lead: string, points: string[], cta: string) =>
    h(
      'a',
      { class: 'kit-card', href: `#/${route}` },
      h('div', { class: 'kit-icon' }, icon(iconName)),
      h('h2', null, title),
      h('p', { class: 'lead' }, lead),
      h('ul', { class: 'kit-points' }, points.map((p) => h('li', null, icon('check'), h('span', null, p)))),
      h('span', { class: 'btn btn-primary kit-cta' }, h('span', null, cta), icon('chevron')),
    );

  return h(
    'div',
    { class: 'kit' },
    h(
      'header',
      { class: 'page-head kit-head' },
      h(
        'div',
        null,
        h('h1', null, 'How do you want to secure it?'),
        h('p', { class: 'lead' }, `Your app needs ${plural(unique.size, 'security check')}. Choose how you want to work through them.`),
        h('div', { class: 'sev-mini' }, SEVERITIES.filter((s) => bySev[s] > 0).map((s) => [severityBadge(s), h('span', null, String(bySev[s]))])),
      ),
    ),
    h(
      'div',
      { class: 'kit-grid' },
      option(
        'checklist',
        'list',
        'A checklist',
        'You check or implement each item yourself.',
        ['Every check your app needs, most important first', 'What to check and how to fix it, in plain words', 'Tick items off — progress is saved', 'Download as Markdown or print it'],
        'Open my checklist',
      ),
      option(
        'prompt',
        'bot',
        'A prompt for your AI',
        'Paste it into Claude Code, Cursor, Copilot, Gemini CLI or Codex.',
        ['The AI checks every item in your real code', 'It fixes what is missing, with tests', 'It reports PASS / FIXED / N/A for each item', 'Or use it as rules while building new features'],
        'Get my AI prompt',
      ),
    ),
    h('p', { class: 'muted small kit-tip' }, icon('info'), ' Tip: use both — let the AI fix things with the prompt, then confirm each item on the checklist.'),
    isHosted()
      ? h(
          'section',
          { class: 'card kit-save' },
          h('div', null, h('h3', null, 'Keep your answers with your code'), h('p', { class: 'muted small' }, 'Download seckit.yaml and put it in your project folder. The Security Kit CLI, Docker image and AI tools use it to scan your code against this same plan.')),
          button('Download seckit.yaml', { kind: 'secondary', icon: 'download', onClick: (b) => void busy(b, async () => download('seckit.yaml', await api.get<string>('/api/manifest/export'), 'text/yaml')) }),
        )
      : null,
  );
}
