import { type Child, h, icon, plural, s, timeAgo } from '../dom.js';
import { isHosted } from '../backend.js';
import { store } from '../store.js';
import type { ControlResult, Severity, State } from '../types.js';
import { button, callout, emptyState, navigate, PLATFORM_ICONS, PLATFORM_LABELS, severityBadge, SEVERITIES, STATUS, statusBadge } from '../ui.js';

const STEPS = [
  { route: 'describe', icon: 'edit', title: 'Describe your app', text: 'Tell Security Kit what your app has — logins, payments, uploads, a mobile app. It detects most of it for you.' },
  { route: 'kit', icon: 'sparkle', title: 'Pick your kit', text: 'A checklist to work through yourself, or a ready-made prompt for Claude Code, Cursor, Copilot or any AI tool.' },
  { route: 'checklist', icon: 'list', title: 'Cover every check', text: 'Only the checks your app needs, mapped to OWASP, MASVS, PCI DSS and CWE — what to check and how to fix it.' },
  { route: 'scan', icon: 'play', title: 'Scan to confirm', text: 'Optional: an automatic scan finds leaked secrets, injection and insecure settings in your code.' },
];

function welcome(state: State): HTMLElement {
  return h(
    'div',
    { class: 'welcome' },
    h(
      'section',
      { class: 'hero' },
      h('div', { class: 'hero-icon' }, icon('shieldCheck')),
      h('h1', null, 'Security that fits your app'),
      h(
        'p',
        { class: 'lead' },
        'Security Kit builds a security plan for ',
        h('strong', null, state.project.name),
        ' from what your app actually contains, checks your code against it, and gives the same rules to the AI assistants that write your code.',
      ),
      h('div', { class: 'hero-actions' }, button('Describe your app', { kind: 'primary', icon: 'edit', onClick: () => navigate('describe') }), h('span', { class: 'muted small' }, isHosted() ? 'Takes about two minutes. Runs in your browser — nothing is uploaded.' : 'Takes about two minutes. Nothing leaves your computer.')),
    ),
    h(
      'ol',
      { class: 'steps-grid' },
      STEPS.map((step, i) => h('li', { class: 'step-card' }, h('div', { class: 'step-num' }, String(i + 1)), h('div', { class: 'step-icon' }, icon(step.icon)), h('h3', null, step.title), h('p', null, step.text))),
    ),
    state.manifestError
      ? callout('error', 'seckit.yaml could not be read', [h('p', null, state.manifestError.message), h('ul', null, state.manifestError.issues.map((i) => h('li', null, i)))])
      : null,
  );
}

function ring(pct: number, label: string): SVGElement {
  const r = 52;
  const c = 2 * Math.PI * r;
  const arc = s('circle', { cx: 60, cy: 60, r, class: 'ring-value', 'stroke-dasharray': `${(c * pct) / 100} ${c}`, transform: 'rotate(-90 60 60)' });
  return s(
    'svg',
    { class: 'ring', viewBox: '0 0 120 120', role: 'img', 'aria-label': `${Math.round(pct)}% ${label}` },
    s('circle', { cx: 60, cy: 60, r, class: 'ring-track' }),
    arc,
    s('text', { x: 60, y: 58, class: 'ring-pct', 'text-anchor': 'middle' }, `${Math.round(pct)}%`),
    s('text', { x: 60, y: 78, class: 'ring-label', 'text-anchor': 'middle' }, label),
  );
}

function kitCards(state: State, total: number): HTMLElement {
  const done = state.checklistDone;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const fill = h('span', { class: 'bar-fill bg-ok' });
  fill.style.width = `${pct}%`;
  return h(
    'div',
    { class: 'grid-2' },
    h(
      'a',
      { class: 'card kit-mini', href: '#/checklist' },
      h('div', { class: 'kit-mini-head' }, h('span', { class: 'kit-icon sm' }, icon('list')), h('h3', null, 'Checklist'), icon('chevron', 'icon chev')),
      h('strong', { class: 'progress-big' }, `${done} of ${total} done`),
      h('span', { class: 'bar bar-lg' }, fill),
      h('p', { class: 'muted small' }, done === 0 ? 'Work through each check yourself and tick it off.' : done === total ? 'Everything ticked.' : `${total - done} left — critical and high first.`),
    ),
    h(
      'a',
      { class: 'card kit-mini', href: '#/prompt' },
      h('div', { class: 'kit-mini-head' }, h('span', { class: 'kit-icon sm' }, icon('bot')), h('h3', null, 'AI prompt'), icon('chevron', 'icon chev')),
      h('strong', { class: 'progress-big' }, 'Let your AI do it'),
      h('p', { class: 'muted small' }, 'Copy one prompt into Claude Code, Cursor, Copilot, Gemini CLI or Codex. It checks and fixes every item in your code.'),
    ),
  );
}

function issueRow(c: ControlResult): HTMLElement {
  const first = c.findings[0];
  return h(
    'li',
    { class: 'issue-row', onclick: () => navigate('audit'), tabindex: 0, onkeydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && navigate('audit') },
    severityBadge(c.severity),
    h('div', { class: 'issue-main' }, h('div', { class: 'issue-title' }, c.title), first ? h('div', { class: 'issue-loc mono' }, `${first.file}${first.line ? `:${first.line}` : ''}`, c.findings.length > 1 ? h('span', { class: 'muted' }, ` and ${c.findings.length - 1} more`) : null) : null),
    h('span', { class: 'muted mono small' }, c.id),
    icon('chevron', 'icon chev'),
  );
}

function dashboard(state: State): HTMLElement {
  const plan = state.plan!;
  const audit = state.lastAudit;
  const unique = new Map(plan.components.flatMap((c) => c.controls).map((c) => [c.id, c]));
  const bySev: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const c of unique.values()) bySev[c.severity]++;
  const counts = (st: string[]) => audit?.controls.filter((c) => st.includes(c.status)).length ?? 0;
  const verified = counts(['pass', 'attested', 'not_applicable']);
  const failed = audit?.controls.filter((c) => c.status === 'fail').sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)) ?? [];

  const summary: Child = audit
    ? h(
        'div',
        { class: 'card score-card' },
        ring(audit.controls.length ? (verified / audit.controls.length) * 100 : 0, 'verified'),
        h(
          'div',
          { class: 'score-legend' },
          (['fail', 'pass', 'attested', 'manual', 'skipped'] as const).map((st) =>
            h('div', { class: 'legend-row' }, statusBadge(st), h('strong', null, String(counts(st === 'attested' ? ['attested', 'not_applicable', 'risk_accepted'] : [st])))),
          ),
          h('p', { class: 'muted small' }, `Last checked ${timeAgo(audit.finishedAt)}. “Verified” = passed automated checks or signed off.`),
        ),
      )
    : h(
        'div',
        { class: 'card score-card score-empty' },
        h('div', { class: 'empty-icon' }, icon('play')),
        h('div', null, h('h3', null, 'Scan your code automatically'), h('p', { class: 'muted' }, 'Optional: find leaked secrets, injection and insecure settings, and see which checks already pass.'), button(isHosted() ? 'How to scan your code' : 'Run the scan', { kind: 'secondary', icon: 'play', onClick: () => navigate(isHosted() ? 'local' : 'audit') })),
      );

  return h(
    'div',
    { class: 'dashboard' },
    h(
      'header',
      { class: 'page-head' },
      h(
        'div',
        null,
        h('h1', null, plan.app.name),
        h(
          'p',
          { class: 'lead' },
          h('span', { class: 'platforms' }, plan.app.platforms.map((p) => h('span', { class: 'platform-pill' }, icon(PLATFORM_ICONS[p]), PLATFORM_LABELS[p]))),
          h('span', { class: 'dot-sep' }, '·'),
          h('span', null, `Assurance level ${plan.app.assurance_level}`),
          h('span', { class: 'dot-sep' }, '·'),
          h('span', null, `${plural(plan.components.length, 'component')}, ${plural(unique.size, 'control')}`),
        ),
      ),
      h('div', { class: 'page-actions' }, button('Edit app description', { icon: 'edit', onClick: () => navigate('describe') })),
    ),
    h('h2', { class: 'section-title' }, 'Your kit'),
    kitCards(state, unique.size),
    h('h2', { class: 'section-title' }, 'Security status'),
    h(
      'div',
      { class: 'grid-2' },
      summary,
      h(
        'div',
        { class: 'card' },
        h('h3', null, 'Controls by severity'),
        h(
          'div',
          { class: 'sev-bars' },
          SEVERITIES.map((sev) => {
            const fill = h('span', { class: ['bar-fill', `bg-${sev}`] });
            fill.style.width = `${unique.size ? (bySev[sev] / unique.size) * 100 : 0}%`;
            return h('div', { class: 'sev-bar' }, severityBadge(sev), h('span', { class: 'bar' }, fill), h('strong', null, String(bySev[sev])));
          }),
        ),
        h('p', { class: 'muted small' }, 'Severity says how bad it is if a control is missing. Fix critical and high first.'),
      ),
    ),
    audit
      ? h(
          'section',
          { class: 'card' },
          h('div', { class: 'card-head' }, h('h3', null, failed.length > 0 ? 'Fix these first' : 'No failed checks'), failed.length > 0 ? h('a', { href: '#/audit' }, 'See all results') : null),
          failed.length > 0 ? h('ul', { class: 'issue-list' }, failed.slice(0, 6).map(issueRow)) : h('p', { class: 'muted' }, `${STATUS.pass.hint} Controls that need a person are listed under Sign-offs.`),
        )
      : null,
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, 'What your plan covers'), h('a', { href: '#/plan' }, 'Open the plan')),
      h(
        'ul',
        { class: 'coverage' },
        plan.components.map((c) => {
          const fails = audit?.controls.filter((r) => r.status === 'fail' && c.controls.some((x) => x.id === r.id)).length ?? 0;
          return h(
            'li',
            null,
            h('a', { href: `#/plan?c=${encodeURIComponent(c.type + (c.instance.name ? `:${c.instance.name}` : ''))}` }, h('strong', null, c.title, c.instance.name ? h('span', { class: 'muted' }, ` (${c.instance.name})`) : null), h('span', { class: 'muted small' }, plural(c.controls.length, 'control')), fails > 0 ? h('span', { class: 'badge sev-critical' }, `${fails} failed`) : null),
          );
        }),
      ),
    ),
  );
}

export function overviewView(): HTMLElement {
  const state = store.state!;
  if (state.plan) return dashboard(state);
  // No plan yet: never show a pretend overview — explain how to get a real one.
  return h(
    'div',
    { class: 'overview-empty' },
    emptyState(
      'shieldCheck',
      'No overview yet',
      'The overview shows the security of your app: your progress, what to fix first and what your plan covers. Create your security plan first — then your overview appears here.',
      h(
        'div',
        { class: 'overview-empty-steps' },
        h('ol', null, h('li', null, h('strong', null, 'Describe your app'), ' — about two minutes'), h('li', null, h('strong', null, 'Get your security plan'), ' — built from your answers'), h('li', null, h('strong', null, 'See your overview'), ' — right here')),
        button('Create my security plan', { kind: 'primary', icon: 'edit', onClick: () => navigate('describe') }),
      ),
    ),
    state.manifestError ? callout('error', 'Your saved answers could not be read', h('span', null, state.manifestError.message)) : null,
  );
}
