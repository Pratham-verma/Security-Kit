import { sanitizeHtml } from './sanitize.js';

/** Allow this name (and "dompurify") in the CSP `trusted-types` directive. */
export const TRUSTED_TYPES_POLICY = 'seckit';

interface Policy {
  createHTML(input: string): unknown;
}
interface PolicyFactory {
  createPolicy(name: string, rules: Record<string, (input: string) => string>): Policy;
}

let policy: Policy | undefined;

/**
 * Create the "seckit" Trusted Types policy, which sanitizes all HTML it creates. Combine with the
 * CSP `require-trusted-types-for 'script'` (securityHeaders({ trustedTypes: true }) in @seckit/node)
 * so the browser rejects any HTML that did not pass the sanitizer. Returns false where unsupported.
 * Control WEB-C1.
 */
export function enableTrustedTypes(): boolean {
  const factory = (globalThis as { trustedTypes?: PolicyFactory }).trustedTypes;
  if (!factory?.createPolicy) return false;
  policy ??= factory.createPolicy(TRUSTED_TYPES_POLICY, {
    createHTML: (input) => sanitizeHtml(input),
    createScript: () => {
      throw new TypeError('Creating scripts from strings is not allowed');
    },
    createScriptURL: () => {
      throw new TypeError('Creating script URLs from strings is not allowed');
    },
  });
  return true;
}

/**
 * Put untrusted HTML into an element safely: through the Trusted Types policy when enabled,
 * otherwise through sanitizeHtml(). Controls WEB-C1, WEB-C7, AI-C2.
 */
export function setSafeHtml(el: Element, dirty: string): void {
  const value = policy ? policy.createHTML(dirty) : sanitizeHtml(dirty);
  el.innerHTML = value as string; // nosemgrep: seckit.web-c1.dynamic-html-sink
}
