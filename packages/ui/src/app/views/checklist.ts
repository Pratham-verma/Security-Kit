// The checklist: every security check for the app, ticked off by hand. Progress lives in .seckit/checklist.yaml.
import { isHosted } from '../backend.js';
import { download, h, icon, inline, md, plural, toast } from '../dom.js';
import { api, store } from '../store.js';
import type { ChecklistData, ChecklistItem, Severity } from '../types.js';
import { busy, button, callout, emptyState, markOpened, navigate, openingClass, SEVERITIES, severityBadge } from '../ui.js';

let data: ChecklistData | null = null;
/** Set when the data may be out of date: it stays on screen while fresh data loads (no spinner flash). */
let stale = false;
let loading = false;
const view = { show: 'all' as 'all' | 'todo' | 'done', severities: new Set<Severity>(), query: '' };
const open = new Set<string>();

async function load(rerender: () => void): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    data = await api.get<ChecklistData>('/api/checklist');
  } catch (e) {
    toast((e as Error).message, 'error');
  } finally {
    loading = false;
    rerender();
  }
}

export function resetChecklist(): void {
  stale = true;
}

/** Ticks sent but not answered yet; a reply for one item must not undo another item's pending tick. */
const pending = new Map<string, boolean>();

async function tick(item: ChecklistItem, done: boolean, rerender: () => void): Promise<void> {
  if (!data) return;
  // Optimistic: flip now, roll back if the server refuses.
  const before = data.progress[item.id];
  if (done) data.progress[item.id] = { done: true };
  else delete data.progress[item.id];
  pending.set(item.id, done);
  rerender();
  try {
    const res = await api.post<{ progress: ChecklistData['progress'] }>('/api/checklist', { id: item.id, done });
    pending.delete(item.id);
    data.progress = res.progress;
    for (const [id, d] of pending) {
      if (d) data.progress[id] = { done: true };
      else delete data.progress[id];
    }
    // Keep the overview's progress count in step without reloading everything.
    if (store.state) store.state.checklistDone = Object.values(data.progress).filter((t) => t.done).length;
  } catch (e) {
    pending.delete(item.id);
    if (before) data.progress[item.id] = before;
    else delete data.progress[item.id];
    toast((e as Error).message, 'error');
  }
  rerender();
}

function matches(item: ChecklistItem, done: boolean): boolean {
  if (view.show === 'todo' && done) return false;
  if (view.show === 'done' && !done) return false;
  if (view.severities.size > 0 && !view.severities.has(item.severity)) return false;
  const q = view.query.trim().toLowerCase();
  if (!q) return true;
  const hay = [item.id, item.title, item.howTo, item.rule, ...item.check, ...item.tests, ...item.references].join(' ').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function itemRow(item: ChecklistItem, rerender: () => void): HTMLElement {
  const done = !!data!.progress[item.id]?.done;
  const scan = data!.scan[item.id];
  const isOpen = open.has(item.id);
  const box = h('input', { type: 'checkbox', class: 'tick', checked: done, 'aria-label': `Done: ${item.title}`, onchange: (e: Event) => void tick(item, (e.target as HTMLInputElement).checked, rerender) });
  return h(
    'li',
    { class: ['check-item', done ? 'done' : '', isOpen ? 'open' : ''] },
    h(
      'div',
      { class: 'check-row' },
      h('label', { class: 'tick-wrap' }, box, h('span', { class: 'tick-box' }, icon('check'))),
      h(
        'button',
        { type: 'button', class: 'check-head', 'aria-expanded': String(isOpen), onclick: () => {
          if (isOpen) open.delete(item.id);
          else {
          open.add(item.id);
          markOpened(item.id);
        }
          rerender();
        } },
        severityBadge(item.severity),
        h('span', { class: 'check-title' }, item.title),
        scan?.status === 'fail' ? h('span', { class: 'status st-fail', title: 'The automatic scan found a problem' }, icon('alert'), 'Scan found a problem') : null,
        h('span', { class: 'control-id mono' }, item.id),
        icon('chevron', 'icon chev'),
      ),
    ),
    isOpen
      ? h(
          'div',
          { class: ['check-body', openingClass(item.id)] },
          scan?.status === 'fail'
            ? callout('error', 'The automatic scan found a problem', h('ul', { class: 'findings' }, scan.findings.map((f) => h('li', null, h('span', { class: 'mono' }, `${f.file}${f.line ? `:${f.line}` : ''}`), ' — ', f.message))))
            : null,
          h('div', { class: 'check-block' }, h('h4', null, icon('search'), ' How to check'), h('ul', null, item.check.map((c) => h('li', null, c)))),
          item.tests.length > 0
            ? h('div', { class: 'check-block' }, h('h4', null, icon('terminal'), ' Test cases'), h('ul', { class: 'test-cases' }, item.tests.map((c) => h('li', null, inline(c)))))
            : null,
          h('div', { class: 'check-block' }, h('h4', null, icon('wand'), ' How to do it'), h('div', { class: 'prose' }, md(item.howTo))),
          item.helpers.length > 0
            ? h('div', { class: 'implement' }, h('h4', null, 'Ready-made help'), h('ul', { class: 'implement-list' }, item.helpers.map((x) => h('li', null, h('span', { class: 'implement-label' }, x.label), h('span', null, x.text)))))
            : null,
          item.references.length > 0 ? h('p', { class: 'refs' }, h('span', { class: 'muted small' }, 'Standards: '), item.references.map((r) => h('span', { class: 'chip chip-mono chip-sm' }, r))) : null,
        )
      : null,
  );
}

export function checklistView(rerender: () => void): HTMLElement {
  const state = store.state!;
  if (!state.plan) {
    return emptyState('list', 'No checklist yet', 'Describe your app first, then your checklist appears here.', button('Describe your app', { kind: 'primary', icon: 'edit', onClick: () => navigate('describe') }));
  }
  if (stale && data && pending.size === 0) {
    stale = false;
    void load(rerender);
  }
  if (!data) {
    stale = false;
    void load(rerender);
    return h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Building your checklist…');
  }
  const list = data.checklist;
  const all = list.sections.flatMap((s) => s.items);
  const doneCount = all.filter((i) => data!.progress[i.id]?.done).length;
  const pct = list.total ? Math.round((doneCount / list.total) * 100) : 0;
  const scanFails = all.filter((i) => data!.scan[i.id]?.status === 'fail').length;
  const fill = h('span', { class: 'bar-fill bg-ok' });
  fill.style.width = `${pct}%`;

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search, e.g. “password”, “SQL”, “ASVS V3”', value: view.query, 'aria-label': 'Search the checklist', onchange: (e: Event) => {
    view.query = (e.target as HTMLInputElement).value;
    rerender();
  }, onkeydown: (e: Event) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      view.query = (e.target as HTMLInputElement).value;
      rerender();
    }
  } });

  const sections = list.sections
    .map((s) => ({ ...s, shown: s.items.filter((i) => matches(i, !!data!.progress[i.id]?.done)) }))
    .filter((s) => s.shown.length > 0);

  return h(
    'div',
    { class: 'checklist' },
    h(
      'header',
      { class: 'page-head' },
      h('div', null, h('h1', null, 'Your security checklist'), h('p', { class: 'lead' }, `${plural(list.total, 'check')} for ${state.plan.app.name}. Open an item to see how to check it and how to do it, then tick it when it is done.`)),
      h(
        'div',
        { class: 'page-actions' },
        button('Download', { kind: 'secondary', icon: 'download', onClick: (b) => void busy(b, async () => {
          const body = await api.get<string>('/api/checklist/export');
          download('SECURITY-CHECKLIST.md', body, 'text/markdown');
        }) }),
        button('Print', { kind: 'ghost', icon: 'file', onClick: () => window.print() }),
      ),
    ),
    h(
      'div',
      { class: 'card progress-card' },
      h('div', { class: 'progress-top' }, h('strong', { class: 'progress-big' }, `${doneCount} of ${list.total} done`), h('span', { class: 'muted' }, `${pct}%`)),
      h('span', { class: 'bar bar-lg' }, fill),
      h(
        'p',
        { class: 'muted small' },
        doneCount === list.total ? 'Everything is ticked. Re-check after big changes.' : 'Start with the Critical and High items. ',
        isHosted() ? 'Ticks are saved in this browser. Download the checklist to keep a copy or share it.' : ['Ticks are saved in ', h('code', null, data.file), ' — commit it to share progress with your team.'],
      ),
    ),
    scanFails > 0
      ? callout('error', `The automatic scan found problems in ${plural(scanFails, 'item')}`, 'They are marked “Scan found a problem” below. Fix them before you tick them.')
      : callout('info', 'Want proof, not just ticks?', h('span', null, h('a', { href: isHosted() ? '#/local' : '#/audit' }, 'Run the automatic scan'), isHosted() ? ' on your computer — it checks your code for many of these items.' : ' — it checks your code for many of these items and marks problems here.')),
    h(
      'div',
      { class: 'toolbar' },
      h('div', { class: 'search' }, icon('search'), search),
      h(
        'div',
        { class: 'segmented', role: 'radiogroup', 'aria-label': 'Show' },
        (['all', 'todo', 'done'] as const).map((v) =>
          h('button', { type: 'button', role: 'radio', 'aria-checked': String(view.show === v), class: view.show === v ? 'on' : '', onclick: () => {
            view.show = v;
            rerender();
          } }, v === 'all' ? `All (${list.total})` : v === 'todo' ? `To do (${list.total - doneCount})` : `Done (${doneCount})`),
        ),
      ),
      h(
        'div',
        { class: 'filter-chips', role: 'group', 'aria-label': 'Severity' },
        SEVERITIES.filter((s) => list.bySeverity[s] > 0).map((s) =>
          h('button', { type: 'button', class: ['chip-toggle', view.severities.has(s) ? 'on' : ''], 'aria-pressed': String(view.severities.has(s)), onclick: () => {
            if (view.severities.has(s)) view.severities.delete(s);
            else view.severities.add(s);
            rerender();
          } }, `${s.charAt(0).toUpperCase()}${s.slice(1)} (${list.bySeverity[s]})`),
        ),
      ),
    ),
    sections.length === 0
      ? emptyState('checkCircle', view.show === 'todo' ? 'Nothing left to do here' : 'Nothing matches', view.show === 'todo' ? 'Every item in this view is ticked.' : 'Try another search or clear the filters.')
      : sections.map((s, n) => {
          const sDone = s.items.filter((i) => data!.progress[i.id]?.done).length;
          const firstCloud = s.category === 'cloud' && sections.findIndex((x) => x.category === 'cloud') === n;
          return [firstCloud ? h('h2', { class: 'category-head' }, icon('cloud'), ' Cloud (AWS)', h('span', { class: 'muted small' }, ' — your AWS account and services; each item has AWS CLI test cases')) : null, h(
            'section',
            { class: 'card check-section' },
            h('header', { class: 'group-head' }, h('div', null, h('h2', null, s.category === 'cloud' ? icon('cloud') : null, s.title), h('p', { class: 'muted' }, s.description)), h('span', { class: ['count-pill', sDone === s.items.length ? 'all-done' : ''] }, `${sDone}/${s.items.length}`)),
            h('ul', { class: 'check-list' }, s.shown.map((i) => itemRow(i, rerender))),
          )];
        }),
  );
}
