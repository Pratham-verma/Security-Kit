// "AI assistants": which rules files exist, and how to connect the MCP server.
import { codeBlock, h, icon } from '../dom.js';
import { api, store } from '../store.js';
import { button, callout, emptyState, navigate, pageHeader } from '../ui.js';

interface AssistantsInfo {
  files: { id: string; label: string; hint: string; path: string; configured: boolean; exists: boolean }[];
  mcp: { published: boolean; localBin: string | null };
}

let info: AssistantsInfo | null = null;
let mcpTab: 'claude' | 'cursor' | 'vscode' = 'claude';

export function assistantsView(rerender: () => void): HTMLElement {
  const state = store.state!;
  if (!state.plan) {
    return emptyState('bot', 'No rules yet', 'Describe your app first. Security Kit then writes security rules for your AI assistants.', button('Describe your app', { kind: 'primary', icon: 'edit', onClick: () => navigate('describe') }));
  }
  if (!info) {
    api.get<AssistantsInfo>('/api/assistants').then((r) => {
      info = r;
      rerender();
    }).catch(() => undefined);
    return h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Loading…');
  }
  const cmd = info.mcp.localBin ? ['node', info.mcp.localBin] : ['npx', '-y', '@seckit/mcp@0.1.0'];
  const args = JSON.stringify(cmd.slice(1));
  const configs = {
    claude: { label: 'Claude Code', file: '.mcp.json (or run the command below)', text: `${info.mcp.localBin ? `claude mcp add seckit -- node ${info.mcp.localBin}` : 'claude mcp add seckit -- npx -y @seckit/mcp@0.1.0'}\n\n// or commit .mcp.json:\n{ "mcpServers": { "seckit": { "command": "${cmd[0]}", "args": ${args} } } }` },
    cursor: { label: 'Cursor', file: '.cursor/mcp.json', text: `{ "mcpServers": { "seckit": { "command": "${cmd[0]}", "args": ${args} } } }` },
    vscode: { label: 'VS Code / Copilot', file: '.vscode/mcp.json', text: `{ "servers": { "seckit": { "type": "stdio", "command": "${cmd[0]}", "args": ${args} } } }` },
  };
  const current = configs[mcpTab];

  return h(
    'div',
    { class: 'assistants' },
    pageHeader('AI assistants', 'If AI writes part of your code, give it the same security rules as your team. Security Kit does this in two ways.'),
    h(
      'section',
      { class: 'card' },
      h('h2', null, icon('file'), ' 1. Rules files'),
      h('p', { class: 'muted' }, 'Instruction files your assistants read automatically. They contain one rule per control in your plan.'),
      h(
        'ul',
        { class: 'file-list' },
        info.files.map((f) =>
          h(
            'li',
            null,
            h('span', { class: ['file-state', f.exists ? 'ok' : f.configured ? 'warn' : 'off'] }, icon(f.exists ? 'checkCircle' : f.configured ? 'alert' : 'minus')),
            h('div', null, h('strong', null, f.label), h('div', { class: 'muted small' }, h('code', null, f.path), f.hint && f.hint !== f.path ? ` — ${f.hint}` : '')),
            h('span', { class: 'muted small' }, f.exists ? 'Written' : f.configured ? 'Not written yet' : 'Not selected'),
          ),
        ),
      ),
      h('p', { class: 'muted small' }, 'Choose assistants under ', h('a', { href: '#/describe' }, 'Describe your app'), ', then write the files from the ', h('a', { href: '#/plan' }, 'Security plan'), ' page.'),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', null, icon('bot'), ' 2. Live connection (MCP)'),
      h('p', { class: 'muted' }, 'With the MCP server connected, your assistant can ask which controls apply to the file it is editing and check its own code before showing it to you. It can read your plan, but it can never sign anything off.'),
      h(
        'div',
        { class: 'tab-list', role: 'tablist' },
        (Object.keys(configs) as (keyof typeof configs)[]).map((k) =>
          h('button', { type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(mcpTab === k), onclick: () => {
            mcpTab = k;
            rerender();
          } }, configs[k].label),
        ),
      ),
      h('p', { class: 'muted small' }, 'Add to ', h('code', null, current.file), ':'),
      codeBlock(current.text),
      info.mcp.localBin ? null : callout('info', '@seckit/mcp is not on npm yet', h('span', null, 'Until it is published, build the Security Kit repository and use ', h('code', null, 'node /path/to/Security-Kit/packages/mcp/dist/bin.js'), ' as the command.')),
    ),
  );
}

export function resetAssistants(): void {
  info = null;
}
