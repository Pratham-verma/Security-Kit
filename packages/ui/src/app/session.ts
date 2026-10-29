// Keeps an open page in step with Security Kit: notices when the local server restarts (Docker update,
// `seckit ui` restarted) or the website was redeployed, reconnects, and reloads to the new version.
import { ApiError, backend } from './backend.js';
import { type Child, h, icon } from './dom.js';
import { store } from './store.js';

const CHECK_EVERY_MS = 30_000;
const RETRY_MS = [2_000, 4_000, 8_000, 15_000, 30_000];

interface SessionInfo {
  buildId: string;
  /** Fingerprint of the project's data (local mode); undefined on the website. */
  dataVersion?: string;
}

let known: string | undefined;
let knownData: string | undefined;
let onDataChanged: () => Promise<void> = async () => {};
let down = false;
let attempt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let banner: HTMLElement | undefined;
let hasUnsavedChanges: () => boolean = () => false;

function showBanner(kind: 'down' | 'update', content: Child[]): void {
  banner?.remove();
  banner = h('div', { class: ['session-banner', `session-${kind}`], role: 'status', 'aria-live': 'polite' }, ...content);
  document.body.appendChild(banner);
}

function hideBanner(): void {
  banner?.remove();
  banner = undefined;
}

function reloadNow(): void {
  // A full reload fetches the new app; the private key survives in sessionStorage.
  location.reload();
}

function newVersion(): void {
  if (hasUnsavedChanges()) {
    showBanner('update', [
      icon('refresh'),
      h('span', null, 'Security Kit was updated. Save your answers, then reload to use the new version.'),
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: reloadNow }, 'Reload now'),
    ]);
    return;
  }
  showBanner('update', [h('span', { class: 'spinner' }), h('span', null, 'Security Kit was updated — loading the new version…')]);
  setTimeout(reloadNow, 1200);
}

function schedule(ms: number): void {
  clearTimeout(timer);
  timer = setTimeout(() => void check(), ms);
}

async function check(): Promise<void> {
  if (!backend().ready()) return schedule(CHECK_EVERY_MS);
  try {
    const info = await backend().request<SessionInfo>('GET', '/api/session');
    attempt = 0;
    if (known && info.buildId !== known) return newVersion();
    known ??= info.buildId;
    const dataChanged = knownData !== undefined && info.dataVersion !== knownData;
    knownData = info.dataVersion;
    if (down) {
      down = false;
      hideBanner();
      await onDataChanged(); // the server restarted: reload answers, ticks and sign-offs
    } else if (dataChanged) {
      await onDataChanged(); // seckit.yaml or .seckit/ changed outside this page
    }
    schedule(CHECK_EVERY_MS);
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(String(e));
    if (err.status === 401) {
      // Back, but with a different private key: show the "open the current link" screen.
      down = false;
      hideBanner();
      store.error = err;
      store.emit();
      return schedule(CHECK_EVERY_MS);
    }
    if (err.status === 0) {
      down = true;
      const wait = RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]!;
      showBanner('down', [
        h('span', { class: 'spinner' }),
        h('span', null, backend().mode === 'hosted' ? 'You are offline. Your answers are safe in this browser.' : 'Security Kit is restarting or stopped — reconnecting…'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => void check() }, 'Try now'),
      ]);
      return schedule(wait);
    }
    schedule(CHECK_EVERY_MS);
  }
}

/** Check right away (e.g. the user pressed Refresh). */
export function checkNow(): Promise<void> {
  return check();
}

/**
 * Start watching. `unsaved` tells whether reloading now would lose the user's edits; `refreshData`
 * reloads the page's data in place (no full reload) when the project data changed elsewhere.
 */
export function watchSession(unsaved: () => boolean, refreshData: () => Promise<void>): void {
  hasUnsavedChanges = unsaved;
  onDataChanged = refreshData;
  void check();
  // Website: answers and ticks live in localStorage; another tab changing them fires this event.
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith('seckit:')) void refreshData();
  });
  const onReturn = () => {
    if (document.visibilityState === 'visible') void check();
  };
  document.addEventListener('visibilitychange', onReturn);
  window.addEventListener('focus', onReturn);
  window.addEventListener('online', () => void check());
}
