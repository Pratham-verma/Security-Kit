import DOMPurify, { type Config } from 'dompurify';

type Purifier = ReturnType<typeof DOMPurify>;

let purifier: Purifier = DOMPurify;
const hooked = new WeakSet<Purifier>();

/**
 * Use a specific window, e.g. jsdom's on the server: useWindow(new JSDOM('').window).
 * In browsers the global window is used automatically.
 */
export function useWindow(win: Window): void {
  purifier = DOMPurify(win as unknown as Parameters<typeof DOMPurify>[0]);
}

function ready(): Purifier {
  // Without a DOM, DOMPurify cannot sanitize. Fail closed instead of passing HTML through.
  if (!purifier.isSupported) {
    throw new Error('@seckit/web: no DOM available. On the server call useWindow(new JSDOM("").window) first.');
  }
  if (!hooked.has(purifier)) {
    purifier.addHook('afterSanitizeAttributes', (node) => {
      // target is allowed only as _blank, and such links must not get a handle on this window
      // (reverse tabnabbing).
      if (!node.hasAttribute('target')) return;
      if (node.tagName === 'A' && node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer');
      else node.removeAttribute('target');
    });
    hooked.add(purifier);
  }
  return purifier;
}

export interface SanitizeOptions {
  /** Extra tags to allow on top of the defaults. */
  allowTags?: string[];
  /** Extra attributes to allow on top of the defaults. */
  allowAttributes?: string[];
}

// HTML only (no SVG/MathML); no forms (phishing), no inline styles (overlay/clickjacking tricks).
const BASE_CONFIG: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option'],
  FORBID_ATTR: ['style'],
  ALLOW_DATA_ATTR: false,
};

/** Sanitize untrusted HTML with DOMPurify and safe defaults. Controls WEB-C1, WEB-C7, AI-C2. */
export function sanitizeHtml(dirty: string, opts: SanitizeOptions = {}): string {
  return ready().sanitize(dirty, {
    ...BASE_CONFIG,
    ADD_TAGS: opts.allowTags ?? [],
    ADD_ATTR: ['target', ...(opts.allowAttributes ?? [])],
    RETURN_TRUSTED_TYPE: false,
  }) as string;
}
