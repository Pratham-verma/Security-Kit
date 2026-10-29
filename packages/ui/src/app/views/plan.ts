// "Security plan": every control the app needs, grouped by component, with search and filters.
import { isHosted } from '../backend.js';
import { h, icon, plural, toast } from '../dom.js';
import { api, store } from '../store.js';
import type { Control, ControlResult, PlanComponent, Severity } from '../types.js';
import { busy, button, callout, controlDetail, emptyState, markOpened, navigate, openingClass, pageHeader, SEVERITIES, severityBadge, standardChips, statusBadge } from '../ui.js';

const filters = { query: '', severities: new Set<Severity>(), component: '', attention: false };
const open = new Set<string>();

const componentKey = (c: PlanComponent) => c.type + (c.instance.name ? `:${c.instance.name}` : '');

function matches(control: Control, result: ControlResult | undefined): boolean {
  if (filters.severities.size > 0 && !filters.severities.has(control.severity)) return false;
  if (filters.attention && !(result && ['fail', 'manual', 'skipped'].includes(result.status))) return false;
  const q = filters.query.trim().toLowerCase();
  if (!q) return true;
  const hay = [control.id, control.title, control.guidance, control.ai_rule, ...Object.values(control.standards).flatMap((v) => v ?? [])].join(' ').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function controlRow(control: Control, component: PlanComponent, result: ControlResult | undefined, rerender: () => void): HTMLElement {
  const key = `${componentKey(component)}/${control.id}`;
  const isOpen = open.has(key);
  const toggle = () => {
    if (isOpen) open.delete(key);
    else {
          open.add(key);
          markOpened(key);
        }
    rerender();
  };
  return h(
    'li',
    { class: ['control', isOpen ? 'open' : ''] },
    h(
      'button',
      { type: 'button', class: 'control-head', 'aria-expanded': String(isOpen), onclick: toggle },
      icon('chevron', 'icon chev'),
      severityBadge(control.severity),
      h('span', { class: 'control-id mono' }, control.id),
      h('span', { class: 'control-title' }, control.title),
      h('span', { class: 'control-meta' }, standardChips(control.standards, 2), result ? statusBadge(result.status) : control.automated.length > 0 ? h('span', { class: 'chip chip-sm', title: 'Checked automatically by “Run checks”' }, icon('play'), 'Automated') : h('span', { class: 'chip chip-sm', title: 'Needs a person to verify' }, icon('pen'), 'Manual')),
    ),
    isOpen
      ? h(
          'div',
          { class: ['control-body', openingClass(key)] },
          result && result.findings.length > 0
            ? callout('error', `${plural(result.findings.length, 'problem')} found`, h('ul', { class: 'findings' }, result.findings.map((f) => h('li', null, h('span', { class: 'mono' }, `${f.file}${f.line ? `:${f.line}` : ''}`), ' — ', f.message))))
            : null,
          controlDetail(control, component.threats),
        )
      : null,
  );
}

async function generateFiles(btn: HTMLButtonElement): Promise<void> {
  await busy(btn, async () => {
    const out = await api.post<{ files: { path: string; change: string }[] }>('/api/generate');
    const written = out.files.filter((f) => f.change !== 'unchanged');
    toast(written.length > 0 ? `${plural(written.length, 'file')} written` : 'All files were already up to date');
    await store.refresh();
  });
}

export function planView(rerender: () => void, params: URLSearchParams): HTMLElement {
  const state = store.state!;
  if (!state.plan) {
    return emptyState('list', 'No security plan yet', 'Describe your app first. Security Kit then picks the controls it needs.', button('Describe your app', { kind: 'primary', icon: 'edit', onClick: () => navigate('describe') }));
  }
  const fromLink = params.get('c');
  if (fromLink !== null) {
    filters.component = fromLink;
    history.replaceState(null, '', '#/plan');
  }

  const plan = state.plan;
  const results = new Map((state.lastAudit?.controls ?? []).map((r) => [r.id, r]));
  const unique = new Set(plan.components.flatMap((c) => c.controls.map((x) => x.id)));
  const stale = state.staleFiles;

  const search = h('input', { class: 'input search-input', type: 'search', placeholder: 'Search controls, e.g. “password”, “ASVS V3”, “SQL”', value: filters.query, 'aria-label': 'Search controls', oninput: (e: Event) => {
    filters.query = (e.target as HTMLInputElement).value;
    clearTimeout((search as unknown as { t?: number }).t);
    (search as unknown as { t?: number }).t = window.setTimeout(() => {
      rerender();
      const el = document.querySelector<HTMLInputElement>('.search-input');
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }, 200);
  } });

  const groups = plan.components
    .filter((c) => !filters.component || componentKey(c) === filters.component)
    .map((c) => ({ c, controls: c.controls.filter((x) => matches(x, results.get(x.id))) }))
    .filter((g) => g.controls.length > 0);
  const shown = groups.reduce((n, g) => n + g.controls.length, 0);

  return h(
    'div',
    { class: 'plan' },
    pageHeader(
      'Security plan',
      `${plural(unique.size, 'control')} for ${plan.app.name}, chosen from your answers. Open a control to see how to fix it, why it matters and which standards it covers.`,
      isHosted() ? null : button(stale.length > 0 ? 'Write plan files' : 'Rewrite plan files', { kind: stale.length > 0 ? 'primary' : 'secondary', icon: 'file', onClick: (b) => void generateFiles(b) }),
    ),
    isHosted()
      ? null
      : stale.length > 0
      ? callout('warn', 'Plan files are out of date', h('span', null, 'These files do not match your answers yet: ', stale.map((f, i) => [i > 0 ? ', ' : '', h('code', null, f)]), '. Write them so your team and AI assistants see the current plan.'))
      : callout('ok', 'Plan files are up to date', h('span', null, h('code', null, '.seckit/SECURITY-PLAN.md'), ' and the AI assistant rules match your answers. Commit them with your code.')),
    state.unanswered.length > 0
      ? callout('info', `${plural(state.unanswered.length, 'question')} left open`, h('span', null, 'Controls for every possible answer are included. ', h('a', { href: '#/describe' }, 'Answer them'), ' for a tighter plan.'))
      : null,
    h(
      'div',
      { class: 'toolbar' },
      h('div', { class: 'search' }, icon('search'), search),
      h(
        'div',
        { class: 'filter-chips', role: 'group', 'aria-label': 'Severity' },
        SEVERITIES.map((s) =>
          h('button', { type: 'button', class: ['chip-toggle', `sev-toggle-${s}`, filters.severities.has(s) ? 'on' : ''], 'aria-pressed': String(filters.severities.has(s)), onclick: () => {
            if (filters.severities.has(s)) filters.severities.delete(s);
            else filters.severities.add(s);
            rerender();
          } }, s.charAt(0).toUpperCase() + s.slice(1)),
        ),
      ),
      h(
        'select',
        { class: 'input select-sm', 'aria-label': 'Component', onchange: (e: Event) => {
          filters.component = (e.target as HTMLSelectElement).value;
          rerender();
        } },
        h('option', { value: '' }, 'All components'),
        plan.components.map((c) => h('option', { value: componentKey(c), selected: componentKey(c) === filters.component }, c.title + (c.instance.name ? ` (${c.instance.name})` : ''))),
      ),
      state.lastAudit
        ? h('label', { class: 'check-label' }, h('input', { type: 'checkbox', checked: filters.attention, onchange: (e: Event) => {
            filters.attention = (e.target as HTMLInputElement).checked;
            rerender();
          } }), 'Needs attention only')
        : null,
    ),
    h('p', { class: 'muted small result-count' }, shown === unique.size && groups.length === plan.components.length ? `Showing all ${plural(shown, 'control')}` : `Showing ${plural(shown, 'control')}`),
    groups.length === 0
      ? emptyState('search', 'No controls match', 'Try another search word or clear the filters.', button('Clear filters', { onClick: () => {
          filters.query = '';
          filters.severities.clear();
          filters.component = '';
          filters.attention = false;
          rerender();
        } }))
      : groups.map(({ c, controls }) =>
          h(
            'section',
            { class: 'component-group card' },
            h(
              'header',
              { class: 'group-head' },
              h('div', null, h('h2', null, c.title, c.instance.name ? h('span', { class: 'muted' }, ` (${c.instance.name})`) : null), h('p', { class: 'muted' }, c.description)),
              h('span', { class: 'muted small' }, plural(controls.length, 'control')),
            ),
            h('ul', { class: 'control-list' }, controls.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)).map((x) => controlRow(x, c, results.get(x.id), rerender))),
          ),
        ),
  );
}
