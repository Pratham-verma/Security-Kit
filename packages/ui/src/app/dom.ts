// Tiny DOM toolkit. Everything is built with createElement/createTextNode, never innerHTML, so text
// from the project (file names, findings, YAML values) can never become markup.
export type Child = Node | string | number | false | null | undefined | Child[];
type Listener = (event: Event) => void;
export type Attrs = Record<string, string | number | boolean | Listener | undefined | null | string[]>;

function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

function applyAttrs(el: Element, attrs: Attrs | null | undefined): void {
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      const cls = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
      if (cls) el.setAttribute('class', cls);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else if (key === 'value' && 'value' in el) {
      (el as HTMLInputElement).value = String(value);
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag: string, attrs?: Attrs | null, ...children: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

// 24x24 stroke icons (Lucide-style paths, drawn for this app).
const ICONS: Record<string, string[]> = {
  shield: ['M12 3l8 3v6c0 5-3.5 8.5-8 9.5C7.5 20.5 4 17 4 12V6l8-3z'],
  shieldCheck: ['M12 3l8 3v6c0 5-3.5 8.5-8 9.5C7.5 20.5 4 17 4 12V6l8-3z', 'M9 12l2 2 4-4'],
  home: ['M3 11l9-7 9 7', 'M5 10v10h14V10'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4z', 'M14 6l4 4'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  play: ['M7 4l13 8-13 8V4z'],
  check: ['M5 12l5 5L20 7'],
  checkCircle: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M8 12l3 3 5-6'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  xCircle: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M9 9l6 6', 'M15 9l-6 6'],
  alert: ['M12 3l10 18H2L12 3z', 'M12 10v4', 'M12 17h.01'],
  info: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 11v6', 'M12 7.5h.01'],
  pen: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z'],
  bot: ['M5 9h14v10H5z', 'M12 5v4', 'M12 4h.01', 'M9 13h.01', 'M15 13h.01', 'M9.5 16h5'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M5 20h14'],
  file: ['M6 3h8l5 5v13H6z', 'M14 3v5h5'],
  globe: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M3 12h18', 'M12 3c3 3.5 3 14.5 0 18', 'M12 3c-3 3.5-3 14.5 0 18'],
  cloud: ['M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 9.1 4.5 4.5 0 0 0 7 18z'],
  terminal: ['M4 5h16v14H4z', 'M8 10l2 2-2 2', 'M13 14h3'],
  server: ['M4 4h16v6H4z', 'M4 14h16v6H4z', 'M8 7h.01', 'M8 17h.01'],
  android: ['M7 10h10v8H7z', 'M8 10a4 4 0 0 1 8 0', 'M10 7.5h.01', 'M14 7.5h.01', 'M5 11v5', 'M19 11v5'],
  apple: ['M16 3c0 2-1.5 3.5-3.5 3.5', 'M12 8c-1.5-1-5-1.5-6.5 1.5S5 17 7 19.5c1.2 1.4 2.5 1.5 3.5 1 1-.4 2-.4 3 0 1 .5 2.3.4 3.5-1 1-1.2 1.6-2.4 2-3.5-2-1-2.8-3.5-1.5-5.5.5-.8 1-1.3 1.6-1.6C17.4 7 14.5 7 12 8z'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4'],
  chevron: ['M9 6l6 6-6 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  sparkle: ['M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z'],
  folder: ['M3 6h6l2 2h10v11H3z'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 5v6h-6'],
  lock: ['M6 11h12v9H6z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 7v5l3 2'],
  book: ['M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5z', 'M8 7h8'],
  wand: ['M4 20L16 8', 'M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z', 'M19 11l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5.5-1z'],
  skip: ['M5 5l10 7-10 7V5z', 'M19 5v14'],
  minus: ['M5 12h14'],
};

export function icon(name: keyof typeof ICONS | string, cls = 'icon'): SVGElement {
  return s(
    'svg',
    { class: cls, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    ...(ICONS[name] ?? ICONS.info!).map((d) => s('path', { d })),
  );
}

/** Inline markdown used by the knowledge base: **bold**, `code`. */
export function inline(text: string): Child[] {
  const out: Child[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(tok.startsWith('**') ? h('strong', null, tok.slice(2, -2)) : h('code', null, tok.slice(1, -1)));
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The knowledge base's small markdown subset (paragraphs, bullet lists, bold, code) as DOM nodes. */
export function md(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const block of text.trim().split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0 && lines.every((l) => /^([-*]|\d+\.)\s/.test(l))) {
      const ordered = /^\d+\./.test(lines[0]!);
      const list = h(ordered ? 'ol' : 'ul', null, lines.map((l) => h('li', null, inline(l.replace(/^([-*]|\d+\.)\s+/, '')))));
      frag.appendChild(list);
    } else {
      frag.appendChild(h('p', null, inline(lines.join(' '))));
    }
  }
  return frag;
}

export const humanize = (v: unknown) => {
  const t = String(v).replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

let toastHost: HTMLElement | undefined;
export function toast(message: string, kind: 'ok' | 'error' | 'info' = 'ok'): void {
  toastHost ??= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const el = h('div', { class: ['toast', `toast-${kind}`] }, icon(kind === 'ok' ? 'checkCircle' : kind === 'error' ? 'xCircle' : 'info'), h('span', null, message));
  toastHost.appendChild(el);
  setTimeout(() => el.classList.add('leaving'), 3800);
  setTimeout(() => el.remove(), 4200);
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    toast('Could not copy — select the text and copy it yourself.', 'error');
  }
}

/** Modal built on <dialog>; resolves when it closes. */
export function modal(title: string, body: Child, actions: (close: () => void) => Child): HTMLDialogElement {
  const dialog = h('dialog', { class: 'modal', 'aria-label': title });
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    // Fade out, then remove; immediate when the user prefers reduced motion.
    void animateOut(dialog, 'modal-leave').then(() => {
      dialog.close();
      dialog.remove();
    });
  };
  dialog.append(
    h('header', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x'))),
    h('div', { class: 'modal-body' }, body),
    h('footer', { class: 'modal-foot' }, actions(close)),
  );
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
  return dialog;
}

export function codeBlock(text: string): HTMLElement {
  return h(
    'div',
    { class: 'code-block' },
    h('pre', null, h('code', null, text)),
    h('button', { class: 'btn btn-ghost btn-sm copy', onclick: () => copyText(text) }, icon('copy'), 'Copy'),
  );
}

export function download(filename: string, body: string, type: string): void {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** Add an exit-animation class and resolve when it ends (at most `maxMs`, so nothing can hang). */
export function animateOut(el: Element, cls: string, maxMs = 450): Promise<void> {
  if (prefersReducedMotion() || !el.isConnected) return Promise.resolve();
  return new Promise((done) => {
    const finish = () => {
      clearTimeout(timer);
      el.removeEventListener('animationend', finish);
      done();
    };
    const timer = setTimeout(finish, maxMs);
    el.addEventListener('animationend', finish, { once: true });
    el.classList.add(cls);
  });
}
