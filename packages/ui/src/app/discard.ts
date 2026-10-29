// "Discard": remove the saved app description (and checklist ticks) to start over with a new app.
import { isHosted } from './backend.js';
import { animateOut, h, modal, toast } from './dom.js';
import { api, store } from './store.js';
import { busy, button, navigate } from './ui.js';
import { resetChecklist } from './views/checklist.js';
import { resetDescribe } from './views/describe.js';
import { resetPrompt } from './views/prompt.js';

/** Ask, then discard the saved description of `name` and go to "Describe your app". */
export function confirmDiscard(name: string): void {
  const hosted = isHosted();
  modal(
    `Discard ${name}?`,
    h(
      'div',
      { class: 'discard-body' },
      h('p', null, 'This removes your description of ', h('strong', null, name), ' so you can start over with a new app.'),
      hosted
        ? h('ul', null, h('li', null, 'Removed: your answers and checklist ticks saved in this browser.'))
        : h(
            'ul',
            null,
            h('li', null, 'Removed: ', h('code', null, 'seckit.yaml'), ' and your checklist ticks (', h('code', null, '.seckit/checklist.yaml'), ').'),
            h('li', null, 'Kept: sign-offs, and files already written into your project such as ', h('code', null, 'AGENTS.md'), ' or ', h('code', null, '.seckit/SECURITY-PLAN.md'), '.'),
          ),
      h('p', { class: 'muted small' }, hosted ? 'Download seckit.yaml first if you may want it back.' : 'If the folder is in git, you can get seckit.yaml back from there.'),
    ),
    (close) => [
      button('Cancel', { kind: 'ghost', onClick: close }),
      button(`Discard ${name}`, { kind: 'danger', icon: 'x', onClick: (b) => void busy(b, async () => {
        await api.post('/api/manifest/discard');
        close();
        // The page content and the project card dissolve together before the fresh Describe page slides in.
        const leaving = [document.querySelector('.main > *'), document.querySelector('.project')].filter((el): el is Element => !!el);
        await Promise.all(leaving.map((el) => animateOut(el, 'discard-leave', 400)));
        resetDescribe();
        resetChecklist();
        resetPrompt();
        await store.refresh();
        navigate('describe');
        // The sidebar card stays in the page: clear its exit state and let it fade back in, now showing the folder.
        for (const el of leaving) {
          el.classList.remove('discard-leave');
          if (el.isConnected) {
            el.classList.remove('view-enter');
            void (el as HTMLElement).offsetWidth; // restart the enter animation
            el.classList.add('view-enter');
          }
        }
        toast(`Discarded ${name} — describe your new app`);
      }) }),
    ],
  );
}
