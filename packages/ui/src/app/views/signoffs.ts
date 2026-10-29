// "Sign-offs": record human decisions for controls tools cannot verify (.seckit/attestations.yaml).
import { h, icon, md, modal, plural, toast } from '../dom.js';
import { api, ApiError, store } from '../store.js';
import type { Attestation, AttestationStatus, Control } from '../types.js';
import { busy, button, callout, emptyState, navigate, pageHeader, severityBadge, SEVERITIES, statusBadge } from '../ui.js';

let tab: 'review' | 'done' = 'review';

const STATUS_CHOICES: { value: AttestationStatus; label: string; hint: string }[] = [
  { value: 'done', label: 'Done — I verified it', hint: 'Describe how you checked it.' },
  { value: 'not_applicable', label: 'Not applicable', hint: 'Explain why it does not apply to this app.' },
  { value: 'risk_accepted', label: 'Accept the risk for now', hint: 'Explain why, and set a date to look at it again.' },
];

function findControl(id: string): Control | undefined {
  for (const c of store.state?.plan?.components ?? []) {
    const found = c.controls.find((x) => x.id === id);
    if (found) return found;
  }
  return undefined;
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export function openSignOff(id: string, initial: AttestationStatus = 'done', existing?: Attestation): void {
  const control = findControl(id);
  let status: AttestationStatus = existing?.status ?? initial;
  const errors = h('div', { class: 'form-errors' });
  const text = h('textarea', { class: 'input', rows: 4, placeholder: 'e.g. “Tested the login with 20 wrong passwords: locked after 5, see PR #42.”', 'aria-label': 'Evidence or reason' });
  text.value = existing?.evidence ?? existing?.reason ?? '';
  const expires = h('input', { class: 'input', type: 'date', value: existing?.expires ?? inDays(90), min: inDays(1), 'aria-label': 'Review again by' });
  const by = h('input', { class: 'input', type: 'text', value: existing?.by ?? store.state?.signer ?? '', 'aria-label': 'Signed off by' });
  const textLabel = h('label', { class: 'field-label' });
  const expiresField = h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Review again by'), expires);

  const cards = h('div', { class: 'choice-cards single compact', role: 'radiogroup', 'aria-label': 'Decision' });
  const paint = () => {
    cards.replaceChildren(
      ...STATUS_CHOICES.map((c) =>
        h('button', { type: 'button', role: 'radio', 'aria-checked': String(status === c.value), class: ['choice-card', status === c.value ? 'on' : ''], onclick: () => {
          status = c.value;
          paint();
        } }, h('span', { class: 'choice-text' }, h('strong', null, c.label), h('span', { class: 'muted small' }, c.hint)), h('span', { class: 'choice-check' }, icon('check'))),
      ),
    );
    textLabel.textContent = status === 'done' ? 'How did you verify it?' : 'Why?';
    expiresField.hidden = status !== 'risk_accepted';
  };
  paint();

  modal(
    `Sign off ${id}`,
    [
      control ? h('div', { class: 'signoff-control' }, h('div', { class: 'row' }, severityBadge(control.severity), h('strong', null, control.title)), h('details', null, h('summary', null, 'What this control asks for'), h('div', { class: 'prose' }, md(control.guidance)), h('ul', { class: 'verify-list' }, control.verify.map((v) => h('li', null, v.description))))) : null,
      h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Your decision'), cards),
      h('div', { class: 'field' }, textLabel, text),
      expiresField,
      h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Signed off by'), by),
      h('p', { class: 'muted small' }, 'Saved to ', h('code', null, '.seckit/attestations.yaml'), '. Commit it so sign-offs are reviewed like code. A sign-off never hides a failing automated check.'),
      errors,
    ],
    (close) => [
      button('Cancel', { kind: 'ghost', onClick: close }),
      button('Save sign-off', { kind: 'primary', icon: 'pen', onClick: (b) => void busy(b, async () => {
        const value = text.value.trim();
        try {
          await api.post('/api/attest', {
            id,
            status,
            by: by.value,
            ...(status === 'done' ? { evidence: value } : { reason: value }),
            ...(status === 'risk_accepted' ? { expires: expires.value } : {}),
          });
        } catch (e) {
          if (e instanceof ApiError) {
            errors.replaceChildren(callout('error', e.message, e.issues.length > 0 ? h('ul', null, e.issues.map((i) => h('li', null, i))) : null));
            return;
          }
          throw e;
        }
        close();
        toast(`${id} signed off`);
        await store.refresh();
      }) }),
    ],
  );
}

async function remove(id: string, btn: HTMLButtonElement): Promise<void> {
  modal(`Remove the sign-off for ${id}?`, h('p', null, 'The control goes back to “Needs review”.'), (close) => [
    button('Cancel', { kind: 'ghost', onClick: close }),
    button('Remove', { kind: 'danger', onClick: () => {
      close();
      void busy(btn, async () => {
        await api.post('/api/attest', { id, remove: true });
        toast(`Removed the sign-off for ${id}`);
        await store.refresh();
      });
    } }),
  ]);
}

export function signoffsView(rerender: () => void): HTMLElement {
  const state = store.state!;
  if (!state.plan) {
    return emptyState('pen', 'Nothing to sign off yet', 'Describe your app first.', button('Describe your app', { kind: 'primary', icon: 'edit', onClick: () => navigate('describe') }));
  }
  const signed = new Map(state.attestations.items.map((a) => [a.control, a]));
  const unique = new Map(state.plan.components.flatMap((c) => c.controls).map((c) => [c.id, c]));
  const audit = state.lastAudit;
  // Without an audit, anything that has no automated check needs a person.
  const toReview = [...unique.values()]
    .filter((c) => !signed.has(c.id))
    .filter((c) => {
      const r = audit?.controls.find((x) => x.id === c.id);
      return r ? r.status === 'manual' || r.status === 'skipped' : c.automated.length === 0;
    })
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  const today = new Date().toISOString().slice(0, 10);

  return h(
    'div',
    { class: 'signoffs' },
    pageHeader('Sign-offs', 'Some controls can only be verified by a person — like “we tested restoring backups”. Review each one and record your decision, so everyone can see what was checked, by whom, and when.'),
    state.attestations.error ? callout('error', '.seckit/attestations.yaml has problems', state.attestations.error) : null,
    h(
      'div',
      { class: 'tab-list big', role: 'tablist' },
      h('button', { type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(tab === 'review'), onclick: () => {
        tab = 'review';
        rerender();
      } }, 'To review ', h('span', { class: 'count' }, String(toReview.length))),
      h('button', { type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(tab === 'done'), onclick: () => {
        tab = 'done';
        rerender();
      } }, 'Signed off ', h('span', { class: 'count' }, String(signed.size))),
    ),
    tab === 'review'
      ? toReview.length === 0
        ? emptyState('checkCircle', 'Nothing left to review', 'Every control without an automated check has a sign-off.')
        : h(
            'ul',
            { class: 'review-list card' },
            toReview.map((c) =>
              h(
                'li',
                { class: 'review-row' },
                severityBadge(c.severity),
                h('div', { class: 'review-main' }, h('div', null, h('span', { class: 'mono muted' }, c.id), ' ', h('strong', null, c.title)), h('div', { class: 'muted small' }, c.verify.map((v) => v.description).join(' '))),
                button('Sign off', { kind: 'secondary', small: true, icon: 'pen', onClick: () => openSignOff(c.id) }),
              ),
            ),
          )
      : signed.size === 0
        ? emptyState('pen', 'No sign-offs yet', `Start with the ${plural(toReview.length, 'control')} under “To review”.`)
        : h(
            'ul',
            { class: 'review-list card' },
            [...signed.values()].map((a) => {
              const c = unique.get(a.control);
              const expired = a.expires !== undefined && a.expires < today;
              return h(
                'li',
                { class: 'review-row' },
                statusBadge(a.status === 'done' ? 'attested' : a.status),
                h(
                  'div',
                  { class: 'review-main' },
                  h('div', null, h('span', { class: 'mono muted' }, a.control), ' ', h('strong', null, c?.title ?? 'Not in the current plan')),
                  h('div', { class: 'small' }, a.evidence ?? a.reason ?? ''),
                  h('div', { class: 'muted small' }, `${a.by} · ${a.date}`, a.expires ? h('span', { class: expired ? 'expired' : '' }, ` · ${expired ? 'expired' : 'review by'} ${a.expires}`) : null),
                ),
                h('div', { class: 'row-actions' }, button('Edit', { kind: 'ghost', small: true, onClick: () => openSignOff(a.control, a.status, a) }), button('Remove', { kind: 'ghost', small: true, onClick: (b) => void remove(a.control, b) })),
              );
            }),
          ),
  );
}
