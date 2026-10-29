// Shared building blocks: badges, headers, empty states, the control detail panel.
import { type Child, codeBlock, h, icon, md, toast } from './dom.js';
import { ApiError, store } from './store.js';
import type { Control, ControlStatus, Platform, Severity, Threat } from './types.js';

export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

export const STATUS: Record<ControlStatus, { label: string; hint: string; icon: string }> = {
  fail: { label: 'Failed', hint: 'An automated check found a problem.', icon: 'xCircle' },
  risk_accepted: { label: 'Risk accepted', hint: 'A problem was found, and someone accepted the risk until a set date.', icon: 'alert' },
  attested: { label: 'Signed off', hint: 'A person verified this control.', icon: 'pen' },
  not_applicable: { label: 'Not applicable', hint: 'Signed off as not relevant to this app.', icon: 'minus' },
  pass: { label: 'Passed', hint: 'Automated checks ran and found no problem. This is good evidence, not a guarantee.', icon: 'checkCircle' },
  skipped: { label: 'Not checked', hint: 'Automated checks exist but could not run (Semgrep is not installed).', icon: 'skip' },
  manual: { label: 'Needs review', hint: 'No tool can check this. Review it and sign it off.', icon: 'info' },
};

export const PLATFORM_ICONS: Record<Platform, string> = { web: 'globe', backend: 'server', android: 'android', ios: 'apple', cloud: 'cloud' };
export const PLATFORM_LABELS: Record<Platform, string> = { web: 'Web', backend: 'Backend', android: 'Android', ios: 'iOS', cloud: 'Cloud (AWS)' };
const IMPLEMENT_LABELS: Record<string, string> = { node: 'Node.js — @seckit/node', web: 'Browser — @seckit/web', android: 'Android', ios: 'iOS' };
const VERIFY_LABELS: Record<string, string> = { semgrep: 'Code scan', config: 'Config check', test: 'Test', manual: 'Manual review' };

export function severityBadge(sev: Severity): HTMLElement {
  return h('span', { class: ['badge', `sev-${sev}`] }, sev.charAt(0).toUpperCase() + sev.slice(1));
}

export function statusBadge(status: ControlStatus): HTMLElement {
  const info = STATUS[status];
  return h('span', { class: ['status', `st-${status}`], title: info.hint }, icon(info.icon), info.label);
}

export function pageHeader(title: string, subtitle: Child, actions?: Child): HTMLElement {
  return h('header', { class: 'page-head' }, h('div', null, h('h1', null, title), h('p', { class: 'lead' }, subtitle)), actions ? h('div', { class: 'page-actions' }, actions) : null);
}

export function emptyState(iconName: string, title: string, text: Child, action?: Child): HTMLElement {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, icon(iconName)), h('h2', null, title), h('p', null, text), action ?? null);
}

export function callout(kind: 'info' | 'warn' | 'error' | 'ok', title: Child, body?: Child): HTMLElement {
  const ic = kind === 'ok' ? 'checkCircle' : kind === 'error' ? 'xCircle' : kind === 'warn' ? 'alert' : 'info';
  return h('div', { class: ['callout', `callout-${kind}`], role: kind === 'error' ? 'alert' : null }, icon(ic), h('div', null, h('strong', null, title), body ? h('div', { class: 'callout-body' }, body) : null));
}

export function button(label: Child, opts: { kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: string; onClick?: (btn: HTMLButtonElement) => void; small?: boolean; type?: 'button' | 'submit' } = {}): HTMLButtonElement {
  const btn = h(
    'button',
    { type: opts.type ?? 'button', class: ['btn', `btn-${opts.kind ?? 'secondary'}`, opts.small ? 'btn-sm' : ''] },
    opts.icon ? icon(opts.icon) : null,
    h('span', null, label),
  );
  if (opts.onClick) btn.addEventListener('click', () => opts.onClick!(btn));
  return btn;
}

/** Run an async action from a button: disables it and shows a spinner; errors become toasts. */
export async function busy<T>(btn: HTMLButtonElement | null, fn: () => Promise<T>): Promise<T | undefined> {
  btn?.setAttribute('disabled', '');
  btn?.classList.add('is-busy');
  try {
    return await fn();
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(String(e));
    toast(err.issues.length > 0 ? `${err.message} ${err.issues[0]}` : err.message, 'error');
    return undefined;
  } finally {
    btn?.removeAttribute('disabled');
    btn?.classList.remove('is-busy');
  }
}

export function standardsList(standards: Control['standards']): HTMLElement {
  const labels = store.catalog?.standards ?? {};
  const rows = Object.entries(standards).filter(([, ids]) => ids && ids.length > 0);
  return h(
    'dl',
    { class: 'standards' },
    rows.map(([key, ids]) => [h('dt', null, labels[key] ?? key.toUpperCase()), h('dd', null, ids!.map((id) => h('span', { class: 'chip chip-mono' }, id)))]),
  );
}

export function standardChips(standards: Control['standards'], max = 3): HTMLElement {
  const ids = Object.entries(standards)
    .filter(([k]) => k !== 'cwe' && k !== 'nist')
    .flatMap(([, v]) => v ?? []);
  const shown = ids.slice(0, max);
  return h('span', { class: 'std-chips' }, shown.map((id) => h('span', { class: 'chip chip-mono chip-sm' }, id)), ids.length > max ? h('span', { class: 'muted small' }, `+${ids.length - max}`) : null);
}

function tabs(items: { id: string; label: string; body: () => Child }[]): HTMLElement {
  const panel = h('div', { class: 'tab-panel', role: 'tabpanel' });
  const buttons = items.map((item, i) =>
    h('button', { type: 'button', role: 'tab', class: 'tab', 'aria-selected': i === 0 ? 'true' : 'false', onclick: () => select(i) }, item.label),
  );
  // Fade only when the user switches tabs, not when the page re-renders.
  const select = (i: number, animate = true) => {
    buttons.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
    panel.replaceChildren(h('div', { class: animate ? 'tab-enter' : null }, items[i]!.body()));
  };
  select(0, false);
  return h('div', { class: 'tabs' }, h('div', { class: 'tab-list', role: 'tablist' }, buttons), panel);
}

/** Everything about one control: how to fix it, why, the AI rule, standards and verification. */
export function controlDetail(control: Control, threats: Threat[] = []): HTMLElement {
  const mitigated = threats.filter((t) => control.mitigates.includes(t.id));
  return tabs([
    {
      id: 'fix',
      label: 'How to fix',
      body: () => [
        h('div', { class: 'prose' }, md(control.guidance)),
        control.implement && Object.keys(control.implement).length > 0
          ? h(
              'div',
              { class: 'implement' },
              h('h4', null, 'Ready-made help'),
              h('ul', { class: 'implement-list' }, Object.entries(control.implement).map(([k, v]) => h('li', null, h('span', { class: 'implement-label' }, IMPLEMENT_LABELS[k] ?? k), h('span', null, v ?? '')))),
            )
          : null,
      ],
    },
    {
      id: 'why',
      label: 'Why it matters',
      body: () =>
        mitigated.length === 0
          ? h('p', { class: 'muted' }, 'This control reduces risk across the component.')
          : h(
              'ul',
              { class: 'threats' },
              mitigated.map((t) =>
                h('li', null, h('strong', null, t.title), t.description ? h('p', null, t.description) : null, t.cwe?.length ? h('div', null, t.cwe.map((c) => h('span', { class: 'chip chip-mono chip-sm' }, c))) : null),
              ),
            ),
    },
    {
      id: 'ai',
      label: 'Rule for AI assistants',
      body: () => [h('p', { class: 'muted small' }, 'Your AI coding assistants receive this rule in their instructions file:'), codeBlock(control.ai_rule)],
    },
    { id: 'std', label: 'Standards', body: () => standardsList(control.standards) },
    {
      id: 'verify',
      label: 'How it is checked',
      body: () => [
        h('ul', { class: 'verify-list' }, control.verify.map((v) => h('li', null, h('span', { class: 'chip chip-sm' }, VERIFY_LABELS[v.type] ?? v.type), ' ', v.description))),
        control.automated.length > 0
          ? h('p', { class: 'muted small' }, `${control.automated.length} automated check${control.automated.length === 1 ? '' : 's'} run for this control during “Run checks”.`)
          : h('p', { class: 'muted small' }, 'No tool can check this automatically. Review it yourself and record a sign-off.'),
      ],
    },
  ]);
}

export function navigate(route: string): void {
  location.hash = `#/${route}`;
}

/** The item the user just expanded: only its body animates open, not every open item on each re-render. */
let justOpened: string | null = null;

export function markOpened(key: string): void {
  justOpened = key;
  setTimeout(() => {
    if (justOpened === key) justOpened = null;
  }, 400);
}

export const openingClass = (key: string): string => (justOpened === key ? 'opening' : '');
