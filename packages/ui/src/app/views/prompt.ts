// The AI prompt: one self-contained prompt for Claude Code, Cursor, Copilot, Gemini CLI, Codex or any AI coding tool.
import { isHosted } from '../backend.js';
import { codeBlock, copyText, download, h, icon, toast } from '../dom.js';
import { api, store } from '../store.js';
import type { PromptData, Severity } from '../types.js';
import { busy, button, callout, emptyState, navigate } from '../ui.js';

type Tool = 'claude' | 'cursor' | 'copilot' | 'gemini' | 'codex' | 'other';
const opts = { mode: 'audit' as 'audit' | 'build' | 'test', min: 'low' as Severity, tool: 'claude' as Tool };
let data: PromptData | null = null;
let key = '';
let loading = false;

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'copilot', label: 'GitHub Copilot' },
  { id: 'gemini', label: 'Gemini CLI' },
  { id: 'codex', label: 'Codex CLI' },
  { id: 'other', label: 'Other' },
];

const promptFile = () => (isHosted() ? 'SECURITY-PROMPT.md' : '.seckit/AI-PROMPT.md');

function howTo(tool: Tool): { steps: (string | HTMLElement)[]; command?: string } {
  switch (tool) {
    case 'claude':
      return {
        steps: ['Open a terminal in your project folder and run claude.', 'Paste the prompt and press Enter.', 'Approve the edits it proposes, then read its report at the end.'],
        command: `claude "Follow the instructions in ${promptFile()}"`,
      };
    case 'cursor':
      return { steps: ['Open your project in Cursor.', 'Open the chat panel and switch it to Agent mode.', 'Paste the prompt and send it. Review each change before accepting.'] };
    case 'copilot':
      return { steps: ['Open your project in VS Code.', 'Open Copilot Chat and switch it to Agent mode.', 'Paste the prompt and send it. Review each change before keeping it.'] };
    case 'gemini':
      return { steps: ['Open a terminal in your project folder and run gemini.', 'Paste the prompt and press Enter.', 'Approve the edits it proposes, then read its report.'], command: `gemini "Follow the instructions in ${promptFile()}"` };
    case 'codex':
      return { steps: ['Open a terminal in your project folder and run codex.', 'Paste the prompt and press Enter.', 'Approve the edits it proposes, then read its report.'], command: `codex "Follow the instructions in ${promptFile()}"` };
    default:
      return { steps: ['Use an AI tool that can read and edit your project files (an “agent” mode).', 'Paste the prompt and send it.', 'Review the changes and the report it gives you.'] };
  }
}

async function load(rerender: () => void): Promise<void> {
  const want = `${opts.mode}/${opts.min}`;
  if (loading || (data && key === want)) return;
  loading = true;
  try {
    data = await api.get<PromptData>(`/api/prompt?mode=${opts.mode}&min=${opts.min}`);
    key = want;
  } catch (e) {
    toast((e as Error).message, 'error');
  } finally {
    loading = false;
    rerender();
  }
}

export function resetPrompt(): void {
  // Keep showing the current prompt; the key mismatch makes the view load a fresh one.
  key = '';
}

function segmented<T extends string>(label: string, current: T, options: { value: T; label: string; hint?: string }[], set: (v: T) => void): HTMLElement {
  return h(
    'div',
    { class: 'segmented seg-wide', role: 'radiogroup', 'aria-label': label },
    options.map((o) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(current === o.value), class: current === o.value ? 'on' : '', title: o.hint ?? null, onclick: () => set(o.value) }, o.label)),
  );
}

export function promptView(rerender: () => void): HTMLElement {
  const state = store.state!;
  if (!state.plan) {
    return emptyState('bot', 'No prompt yet', 'Describe your app first, then your AI prompt appears here.', button('Describe your app', { kind: 'primary', icon: 'edit', onClick: () => navigate('describe') }));
  }
  if (!data || key !== `${opts.mode}/${opts.min}`) void load(rerender);

  const change = (fn: () => void) => () => {
    fn();
    rerender();
  };
  const counts = data?.counts;
  const tokens = data ? Math.round(data.text.length / 4) : 0;
  const guide = howTo(opts.tool);

  return h(
    'div',
    { class: 'prompt-page' },
    h(
      'header',
      { class: 'page-head' },
      h('div', null, h('h1', null, 'Your AI prompt'), h('p', { class: 'lead' }, 'Copy this prompt into your AI coding tool. It tells the AI exactly what your app needs and how to check and fix every item in your code.')),
    ),
    h(
      'div',
      { class: 'card prompt-options' },
      h('div', { class: 'field' }, h('label', { class: 'field-label' }, '1. What should the AI do?'), segmented('Mode', opts.mode, [
        { value: 'audit', label: 'Check and fix my existing code' },
        { value: 'test', label: 'Test my app' },
        { value: 'build', label: 'Follow these rules while building' },
      ], (v) => change(() => (opts.mode = v))()), h('p', { class: 'muted small' }, {
        audit: 'The AI reviews your code item by item, fixes what is missing and reports PASS / FIXED / N/A for each.',
        test: 'The AI runs every test case (code, requests and read-only cloud commands), changes nothing, and reports PASS / FAIL / N/A / NOT RUN for each.',
        build: 'Standing rules: the AI applies the right items to every feature it builds from now on.',
      }[opts.mode])),
      h('div', { class: 'field' }, h('label', { class: 'field-label' }, '2. How much?'), segmented('Scope', opts.min, [
        { value: 'low', label: `Everything${counts ? ` (${counts.low})` : ''}` },
        { value: 'high', label: `Critical + high${counts ? ` (${counts.high})` : ''}` },
        { value: 'critical', label: `Critical only${counts ? ` (${counts.critical})` : ''}` },
      ], (v) => change(() => (opts.min = v))()), h('p', { class: 'muted small' }, 'Smaller prompts finish faster. Start with critical + high on big projects, then run “Everything”.')),
      h('div', { class: 'field' }, h('label', { class: 'field-label' }, '3. Which AI tool do you use?'), h('div', { class: 'chip-toggles' }, TOOLS.map((t) => h('button', { type: 'button', class: ['chip-toggle', opts.tool === t.id ? 'on' : ''], 'aria-pressed': String(opts.tool === t.id), onclick: change(() => (opts.tool = t.id)) }, t.label)))),
    ),
    h(
      'section',
      { class: 'card prompt-card' },
      h(
        'div',
        { class: 'card-head' },
        h('div', null, h('h2', null, icon('bot'), ' The prompt'), data ? h('p', { class: 'muted small' }, `${data.items} items · about ${tokens.toLocaleString()} tokens`) : null),
        h(
          'div',
          { class: 'page-actions' },
          button('Download', { kind: 'ghost', small: true, icon: 'download', onClick: () => data && download('SECURITY-PROMPT.md', data.text, 'text/markdown') }),
          isHosted() ? null : button(`Save to ${promptFile()}`, { kind: 'ghost', small: true, icon: 'file', onClick: (b) => void busy(b, async () => {
            await api.post('/api/prompt/save', { mode: opts.mode, min: opts.min });
            toast(`Saved ${promptFile()}`);
          }) }),
          button('Copy prompt', { kind: 'primary', icon: 'copy', onClick: () => data && void copyText(data.text) }),
        ),
      ),
      data ? h('pre', { class: 'prompt-text' }, h('code', null, data.text)) : h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Writing your prompt…'),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', null, icon('play'), ` How to use it in ${TOOLS.find((t) => t.id === opts.tool)!.label}`),
      h('ol', { class: 'howto-steps' }, guide.steps.map((s) => h('li', null, s))),
      guide.command
        ? h(
            'div',
            null,
            isHosted()
              ? h('p', { class: 'muted small' }, 'Long prompt? Click “Download”, save it in your project folder as ', h('code', null, promptFile()), ', then run:')
              : h('p', { class: 'muted small' }, 'Long prompt? Click “Save to ', h('code', null, promptFile()), '” above, then run:'),
            codeBlock(guide.command),
          )
        : null,
    ),
    opts.mode === 'build'
      ? callout('info', 'Make the rules permanent', h('span', null, 'Instead of pasting this every time, write the rules into the files your AI tools read automatically (CLAUDE.md, AGENTS.md, Cursor rules). See ', h('a', { href: isHosted() ? '#/local' : '#/assistants' }, 'AI tools setup'), '.'))
      : callout('info', 'After the AI is done', h('span', null, 'Check its report, then confirm the results on your ', h('a', { href: '#/checklist' }, 'checklist'), ' and run the ', h('a', { href: isHosted() ? '#/local' : '#/audit' }, 'automatic scan'), '.')),
  );
}
