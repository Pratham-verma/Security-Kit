// "Run checks": runs `seckit audit` and explains the results.
import { codeBlock, download, h, icon, plural, timeAgo, toast } from '../dom.js';
import { api, store } from '../store.js';
import type { AuditResult, Control, ControlResult, ControlStatus } from '../types.js';
import { busy, button, callout, controlDetail, emptyState, markOpened, navigate, openingClass, pageHeader, SEVERITIES, severityBadge, STATUS, statusBadge } from '../ui.js';
import { openSignOff } from './signoffs.js';

const ORDER: ControlStatus[] = ['fail', 'risk_accepted', 'manual', 'skipped', 'pass', 'attested', 'not_applicable'];
let filter: ControlStatus | 'all' = 'fail';
const open = new Set<string>();
let running = false;
let startedAt = 0;

function planControl(id: string): { control: Control; threats: import('../types.js').Threat[] } | undefined {
  for (const c of store.state?.plan?.components ?? []) {
    const control = c.controls.find((x) => x.id === id);
    if (control) return { control, threats: c.threats };
  }
  return undefined;
}

async function run(btn: HTMLButtonElement | null, rerender: () => void): Promise<void> {
  running = true;
  startedAt = Date.now();
  rerender();
  const tick = setInterval(() => {
    const el = document.querySelector('.elapsed');
    if (el) el.textContent = `${Math.round((Date.now() - startedAt) / 1000)} s`;
  }, 1000);
  await busy(btn, async () => {
    const result = await api.post<AuditResult>('/api/audit');
    const failed = result.controls.filter((c) => c.status === 'fail').length;
    filter = failed > 0 ? 'fail' : 'all';
    toast(failed > 0 ? `${plural(failed, 'control')} failed` : 'No failed checks', failed > 0 ? 'info' : 'ok');
  });
  clearInterval(tick);
  running = false;
  await store.refresh();
}

async function exportReport(format: 'json' | 'sarif', btn: HTMLButtonElement): Promise<void> {
  await busy(btn, async () => {
    const body = await api.get<string>(`/api/audit/export?format=${format}`);
    download(format === 'sarif' ? 'seckit.sarif' : 'seckit-audit.json', body, 'application/json');
  });
}

function resultRow(r: ControlResult, rerender: () => void): HTMLElement {
  const isOpen = open.has(r.id);
  const detail = planControl(r.id);
  return h(
    'li',
    { class: ['control', isOpen ? 'open' : '', `row-${r.status}`] },
    h(
      'button',
      { type: 'button', class: 'control-head', 'aria-expanded': String(isOpen), onclick: () => {
        if (isOpen) open.delete(r.id);
        else {
          open.add(r.id);
          markOpened(r.id);
        }
        rerender();
      } },
      icon('chevron', 'icon chev'),
      severityBadge(r.severity),
      h('span', { class: 'control-id mono' }, r.id),
      h('span', { class: 'control-title' }, r.title, r.findings.length > 0 ? h('span', { class: 'muted small' }, ` · ${plural(r.findings.length, 'finding')}`) : null),
      h('span', { class: 'control-meta' }, statusBadge(r.status)),
    ),
    isOpen
      ? h(
          'div',
          { class: ['control-body', openingClass(r.id)] },
          h('p', { class: 'muted small' }, STATUS[r.status].hint),
          r.findings.length > 0
            ? h('ul', { class: 'finding-list' }, r.findings.map((f) => h('li', { class: 'finding' }, h('div', { class: 'finding-loc mono' }, icon('file'), `${f.file}${f.line ? `:${f.line}` : ''}`), h('div', null, f.message))))
            : null,
          r.attestation
            ? callout('info', `Signed off by ${r.attestation.by} on ${r.attestation.date}`, r.attestation.evidence ?? r.attestation.reason ?? '')
            : null,
          h(
            'div',
            { class: 'row-actions' },
            r.status === 'fail' ? button('Accept the risk…', { kind: 'ghost', small: true, icon: 'alert', onClick: () => openSignOff(r.id, 'risk_accepted') }) : null,
            r.status === 'manual' || r.status === 'skipped' ? button('Sign off…', { kind: 'secondary', small: true, icon: 'pen', onClick: () => openSignOff(r.id, 'done') }) : null,
          ),
          detail ? controlDetail(detail.control, detail.threats) : null,
        )
      : null,
  );
}

function results(result: AuditResult, rerender: () => void): HTMLElement {
  const counts = Object.fromEntries(ORDER.map((s) => [s, result.controls.filter((c) => c.status === s).length])) as Record<ControlStatus, number>;
  const failed = counts.fail;
  const list = result.controls
    .filter((c) => filter === 'all' || c.status === filter)
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));

  const verdict = result.incomplete
    ? callout('error', 'Checks did not finish', 'Semgrep crashed or timed out, so its controls are marked “Not checked”, never “Passed”. Try again, or check the error below.')
    : failed > 0
      ? callout('error', `${plural(failed, 'control')} failed`, 'Fix these first, starting with critical and high. Open a control to see where the problem is and how to fix it.')
      : callout('ok', 'No failed checks', 'Automated checks found no problems. Controls marked “Needs review” still need a person — see Sign-offs.');

  return h(
    'div',
    { class: 'audit-results' },
    verdict,
    h(
      'div',
      { class: 'stat-row' },
      ORDER.filter((s) => counts[s] > 0 || s === 'fail' || s === 'pass').map((s) =>
        h('button', { type: 'button', class: ['stat', `stat-${s}`, filter === s ? 'on' : ''], 'aria-pressed': String(filter === s), onclick: () => {
          filter = filter === s ? 'all' : s;
          rerender();
        } }, h('span', { class: 'stat-num' }, String(counts[s])), h('span', { class: 'stat-label' }, icon(STATUS[s].icon), STATUS[s].label)),
      ),
    ),
    result.warnings.length > 0 ? callout('warn', 'Worth a look', h('ul', null, result.warnings.map((w) => h('li', null, w)))) : null,
    result.errors.length > 0 ? callout('error', 'Errors while checking', h('ul', null, result.errors.map((w) => h('li', null, w)))) : null,
    h(
      'div',
      { class: 'list-head' },
      h('h2', null, filter === 'all' ? 'All controls' : STATUS[filter].label, h('span', { class: 'muted' }, ` (${list.length})`)),
      filter !== 'all' ? button('Show all', { kind: 'ghost', small: true, onClick: () => {
        filter = 'all';
        rerender();
      } }) : null,
    ),
    list.length > 0 ? h('ul', { class: 'control-list card' }, list.map((r) => resultRow(r, rerender))) : h('p', { class: 'muted' }, 'Nothing here.'),
  );
}

export function auditView(rerender: () => void): HTMLElement {
  const state = store.state!;
  if (!state.plan) {
    return emptyState('play', 'Nothing to check yet', 'Describe your app first, so Security Kit knows which controls to check.', button('Describe your app', { kind: 'primary', icon: 'edit', onClick: () => navigate('describe') }));
  }
  const last = state.lastAudit;
  const runBtn = button(last ? 'Run checks again' : 'Run checks', { kind: 'primary', icon: 'play', onClick: (b) => void run(b, rerender) });
  if (running || state.auditRunning) runBtn.setAttribute('disabled', '');

  const engine = state.semgrep.available
    ? h('div', { class: 'engine ok' }, icon('checkCircle'), h('div', null, h('strong', null, 'Full checks available'), h('span', { class: 'muted small' }, `${state.rules.builtin} built-in checks plus ${state.rules.semgrep} code rules (Semgrep ${state.semgrep.version}).`)))
    : h(
        'div',
        { class: 'engine warn' },
        icon('alert'),
        h('div', null, h('strong', null, 'Code scanning is off'), h('span', { class: 'muted small' }, `Only the ${state.rules.builtin} built-in checks will run. Install Semgrep to scan code for injection, weak hashing and more, then restart Security Kit:`), codeBlock('pip install semgrep')),
      );

  return h(
    'div',
    { class: 'audit' },
    pageHeader(
      'Run checks',
      'Scans your project for the problems your plan is about. Your code is read locally and never uploaded.',
      [
        last ? button('JSON', { kind: 'ghost', small: true, icon: 'download', onClick: (b) => void exportReport('json', b) }) : null,
        last ? button('SARIF', { kind: 'ghost', small: true, icon: 'download', onClick: (b) => void exportReport('sarif', b) }) : null,
        runBtn,
      ],
    ),
    engine,
    running || state.auditRunning
      ? h('div', { class: 'card running' }, h('span', { class: 'spinner spinner-lg' }), h('div', null, h('h3', null, 'Checking your project…'), h('p', { class: 'muted' }, 'This takes a few seconds, or a minute or two with code scanning on large projects. ', h('span', { class: 'elapsed mono' }, '0 s'))))
      : last
        ? [h('p', { class: 'muted small' }, icon('clock'), ` Last run ${timeAgo(last.finishedAt)} · took ${(last.durationMs / 1000).toFixed(1)} s`), results(last, rerender)]
        : emptyState('shieldCheck', 'Ready when you are', 'Security Kit checks for leaked secrets, insecure settings and risky code patterns, and maps every finding to a control in your plan.', null),
    h('details', { class: 'card ci-help' }, h('summary', null, 'Run these checks in CI'), h('p', null, 'Add the same checks to every pull request. Results show up in GitHub code scanning:'), codeBlock('npx @seckit/cli audit --format sarif -o seckit.sarif   # exit code 1 on high/critical failures'), h('p', { class: 'muted small' }, 'A full workflow is in examples/ci/github-actions.yml.')),
  );
}
