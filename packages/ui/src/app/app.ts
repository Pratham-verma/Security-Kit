// App shell: sidebar navigation, hash router, rendering. Started by entry-local.ts (seckit ui / Docker)
// or entry-hosted.ts (the website), each with its own backend.
import { backend, type Backend, setBackend } from './backend.js';
import { codeBlock, h, icon, modal, toast } from './dom.js';
import { checkNow, watchSession } from './session.js';
import { api, store } from './store.js';
import { button, callout } from './ui.js';
import { assistantsView, resetAssistants } from './views/assistants.js';
import { auditView } from './views/audit.js';
import { checklistView, resetChecklist } from './views/checklist.js';
import { describeView, hasUnsavedChanges, resetDescribe } from './views/describe.js';
import { homeView } from './views/home.js';
import { kitView } from './views/kit.js';
import { localView } from './views/local.js';
import { overviewView } from './views/overview.js';
import { planView } from './views/plan.js';
import { promptView, resetPrompt } from './views/prompt.js';
import { signoffsView } from './views/signoffs.js';

interface Route {
  id: string;
  label: string;
  icon: string;
  step?: number;
  sub?: boolean;
  group?: string;
}

const MAIN_ROUTES: Route[] = [
  { id: '', label: 'Home', icon: 'home' },
  { id: 'overview', label: 'Overview', icon: 'shieldCheck' },
  { id: 'describe', label: 'Describe your app', icon: 'edit', step: 1 },
  { id: 'kit', label: 'Get your kit', icon: 'sparkle', step: 2 },
  { id: 'checklist', label: 'Checklist', icon: 'list', sub: true },
  { id: 'prompt', label: 'AI prompt', icon: 'bot', sub: true },
];

const LOCAL_ROUTES: Route[] = [
  ...MAIN_ROUTES,
  { id: 'audit', label: 'Automatic scan', icon: 'play', group: 'Advanced' },
  { id: 'plan', label: 'Security plan', icon: 'book', group: 'Advanced' },
  { id: 'signoffs', label: 'Sign-offs', icon: 'pen', group: 'Advanced' },
  { id: 'assistants', label: 'AI tools setup', icon: 'wand', group: 'Advanced' },
];

const HOSTED_ROUTES: Route[] = [
  ...MAIN_ROUTES,
  { id: 'plan', label: 'Security plan', icon: 'book', group: 'More' },
  { id: 'local', label: 'Run it on your code', icon: 'play', group: 'More' },
];

let ROUTES: Route[] = LOCAL_ROUTES;
const hosted = () => backend().mode === 'hosted';

const main = h('main', { class: 'main', id: 'main', tabindex: -1 });
const nav = h('nav', { class: 'nav', 'aria-label': 'Main' });
const project = h('div', { class: 'project' });
const sidebar = h(
  'aside',
  { class: 'sidebar' },
  h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark' }, icon('shield')), h('span', null, h('strong', null, 'Security Kit'), h('span', { class: 'brand-sub' }, 'for your app'))),
  project,
  nav,
  h('div', { class: 'sidebar-foot' }),
);

function renderFoot(): void {
  const s = store.state;
  const foot = sidebar.querySelector('.sidebar-foot')!;
  if (hosted()) {
    foot.replaceChildren(
      h('div', { class: 'foot-row' }, h('span', { class: 'local-pill' }, icon('lock'), 'Runs in your browser'), refreshButton()),
      h(
        'div',
        { class: 'foot-row' },
        h('a', { href: '/docs/' }, 'Docs'),
        h('span', { class: 'version' }, s ? `v${s.version}` : ''),
        s?.manifest ? h('button', { type: 'button', class: 'link-btn', onclick: clearAnswers }, 'Clear my answers') : null,
      ),
    );
  } else {
    foot.replaceChildren(
      h('div', { class: 'foot-row' }, h('span', { class: 'local-pill' }, icon('lock'), 'Runs locally'), refreshButton()),
      h('div', { class: 'foot-row' }, h('span', { class: 'version' }, s ? `v${s.version}` : '')),
    );
  }
}

function refreshButton(): HTMLButtonElement {
  return h('button', { type: 'button', class: 'refresh-btn', title: 'Reload your data', 'aria-label': 'Refresh data', onclick: (e: Event) => void refreshClicked(e.currentTarget as HTMLButtonElement) }, icon('refresh'), h('span', null, 'Refresh'));
}

function clearAnswers(): void {
  modal('Clear your answers?', h('p', null, 'This removes your app description and checklist ticks from this browser. Download seckit.yaml first if you want to keep them.'), (close) => [
    button('Cancel', { kind: 'ghost', onClick: close }),
    button('Clear', { kind: 'danger', onClick: async () => {
      close();
      await api.post('/api/reset');
      toast('Your answers were removed from this browser');
      location.hash = '#/';
      await store.refresh();
    } }),
  ]);
}

function route(): { id: string; params: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [id, query] = raw.split('?');
  return { id: ROUTES.some((r) => r.id === id) ? id! : '', params: new URLSearchParams(query ?? '') };
}

function stepDone(id: string): boolean {
  const s = store.state;
  if (!s) return false;
  if (id === 'describe') return !!s.manifest;
  if (id === 'kit') return !!s.plan;
  return false;
}

/** Last two folders of a path, e.g. "…/work/demo-shop". */
function shortPath(dir: string): string {
  const parts = dir.split(/[\\/]/).filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : dir;
}

function renderNav(current: string): void {
  const s = store.state;
  const failed = s?.lastAudit?.controls.filter((c) => c.status === 'fail').length ?? 0;
  let group = '';
  nav.replaceChildren(
    ...ROUTES.flatMap((r) => {
      const heading = r.group && r.group !== group ? h('div', { class: 'nav-group' }, r.group) : null;
      group = r.group ?? group;
      const link = h(
        'a',
        { href: `#/${r.id}`, class: ['nav-item', r.sub ? 'nav-sub' : '', r.id === current ? 'active' : ''], 'aria-current': r.id === current ? 'page' : null },
        r.step ? h('span', { class: ['nav-step', stepDone(r.id) ? 'done' : ''] }, stepDone(r.id) ? icon('check') : String(r.step)) : h('span', { class: 'nav-icon' }, icon(r.icon)),
        h('span', null, r.label),
        r.id === 'audit' && failed > 0 ? h('span', { class: 'nav-count' }, String(failed)) : null,
      );
      return heading ? [heading, link] : [link];
    }),
  );
  project.replaceChildren(
    ...(s && (!hosted() || s.manifest)
      ? [h('span', { class: 'project-label' }, icon('folder'), 'Project'), h('strong', { class: 'project-name' }, s.project.name), ...(s.project.dir ? [h('span', { class: 'project-dir', title: s.project.dir }, shortPath(s.project.dir))] : [])]
      : []),
  );
  renderFoot();
}

/** Shown when the page has no valid access key: paste the link to reconnect, or how to find it. */
function reconnect(): HTMLElement {
  const input = h('input', {
    class: 'input',
    type: 'text',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'http://127.0.0.1:4777/#token=…',
    'aria-label': 'Your Security Kit link or key',
  });
  const message = h('p', { class: 'reconnect-message', role: 'status', 'aria-live': 'polite' });
  const connectBtn = button('Connect', { kind: 'primary', icon: 'lock', onClick: () => void connect() });
  const connect = async () => {
    const b = backend();
    if (!b.connect) return;
    connectBtn.setAttribute('disabled', '');
    message.className = 'reconnect-message';
    message.textContent = 'Checking…';
    try {
      const result = await b.connect(input.value);
      if (result === 'ok') {
        message.textContent = '';
        store.error = null;
        store.state = null;
        render();
        await store.refresh();
        toast('Connected — this browser will remember the key');
        return;
      }
      message.classList.add('bad');
      message.textContent =
        result === 'invalid'
          ? 'That doesn’t look like a Security Kit link. Paste the whole link, including the part after #token=.'
          : 'That key does not match this Security Kit. It may be from an earlier run — get the current link below.';
    } catch (e) {
      message.classList.add('bad');
      message.textContent = (e as Error).message;
    } finally {
      connectBtn.removeAttribute('disabled');
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void connect();
  });
  setTimeout(() => input.focus(), 0);

  return h(
    'div',
    { class: 'empty reconnect' },
    h('div', { class: 'empty-icon' }, icon('lock')),
    h('h2', null, 'Connect to Security Kit'),
    h(
      'p',
      null,
      'For your safety, Security Kit only answers pages that have its private access key. This browser does not have it — for example after cookies and site data were cleared, or after Security Kit was restarted with a new key.',
    ),
    h('div', { class: 'reconnect-form' }, h('label', { class: 'field-label' }, 'Paste your Security Kit link'), h('div', { class: 'reconnect-row' }, input, connectBtn), message),
    h(
      'div',
      { class: 'reconnect-steps' },
      h('p', null, h('strong', null, 'Where is my link?')),
      h('p', null, 'Running in Docker — get it with:'),
      codeBlock('docker logs security-kit-ui | grep http'),
      h('p', null, 'Running ', h('code', null, 'seckit ui'), ' — it is printed in its terminal window.'),
      h('p', { class: 'muted small' }, 'You only need to do this once per browser: the key is remembered until you clear this site’s data.'),
    ),
  );
}

let lastRoute = '';
export function render(): void {
  const { id, params } = route();
  renderNav(id);
  if (!backend().ready()) {
    main.replaceChildren(reconnect());
    return;
  }
  if (!hosted() && store.error?.status === 401) {
    main.replaceChildren(reconnect());
    return;
  }
  if (store.error) {
    main.replaceChildren(callout('error', 'Cannot reach Security Kit', store.error.message));
    return;
  }
  if (!store.state || !store.catalog) {
    main.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Loading…'));
    return;
  }
  const view =
    id === 'describe' ? describeView(render)
    : id === 'kit' ? kitView()
    : id === 'checklist' ? checklistView(render)
    : id === 'prompt' ? promptView(render)
    : id === 'plan' ? planView(render, params)
    : id === 'audit' ? auditView(render)
    : id === 'signoffs' ? signoffsView(render)
    : id === 'assistants' ? assistantsView(render)
    : id === 'local' ? localView()
    : id === 'overview' ? overviewView()
    : homeView();
  // Animate in only when the page changes, not on every data update (that would flicker).
  if (id !== lastRoute) view.classList.add('view-enter');
  main.replaceChildren(view);
  if (id !== lastRoute) {
    window.scrollTo(0, 0);
    document.title = `${ROUTES.find((r) => r.id === id)!.label} · Security Kit`;
    lastRoute = id;
  }
}

/** Mount the app into the page and start it with the given backend. */
export function startApp(b: Backend): void {
  setBackend(b);
  ROUTES = b.mode === 'hosted' ? HOSTED_ROUTES : LOCAL_ROUTES;
  document.body.replaceChildren(h('div', { class: ['app', `mode-${b.mode}`] }, sidebar, main));
  store.listeners.add(render);
  window.addEventListener('hashchange', () => {
    if (backend().adoptFromUrl()) {
      store.error = null;
      store.state = null;
      render();
      void store.refresh();
      return;
    }
    const id = route().id;
    // Pages built from backend data reload on each visit, so they reflect new answers and scans.
    if (id === 'assistants') resetAssistants();
    if (id === 'checklist') resetChecklist();
    if (id === 'prompt') resetPrompt();
    render();
  });
  render();
  if (b.ready()) void store.refresh();
  watchSession(hasUnsavedChanges, refreshData);
}

/**
 * Reload everything the page shows from the backend, in place: state, checklist, prompt, AI tools info,
 * and the Describe form (unless it has unsaved edits, which are kept).
 */
async function refreshData(): Promise<void> {
  resetChecklist();
  resetPrompt();
  resetAssistants();
  if (!hasUnsavedChanges()) resetDescribe();
  await store.refresh();
}

async function refreshClicked(btn: HTMLButtonElement): Promise<void> {
  btn.classList.add('is-busy');
  btn.setAttribute('disabled', '');
  try {
    await checkNow();
    await refreshData();
    toast(hasUnsavedChanges() ? 'Refreshed — your unsaved answers were kept' : 'Up to date');
  } finally {
    btn.classList.remove('is-busy');
    btn.removeAttribute('disabled');
  }
}
