const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Return the URL if it is safe for href/src (http, https, mailto, tel or relative), else the
 * fallback. Blocks javascript:, data:, vbscript: and obfuscated variants such as "java\tscript:",
 * because it uses the same WHATWG parser as the browser. Control WEB-C1.
 */
export function safeUrl(input: unknown, fallback = 'about:blank'): string {
  if (typeof input !== 'string') return fallback;
  const trimmed = input.trim();
  if (trimmed === '') return fallback;
  try {
    const base = (globalThis as { location?: { href: string } }).location?.href ?? 'https://seckit.invalid/';
    return SAFE_PROTOCOLS.has(new URL(trimmed, base).protocol) ? trimmed : fallback;
  } catch {
    return fallback;
  }
}

const BASE = 'http://seckit.invalid';

/**
 * Return a safe same-site path for client-side redirects (e.g. ?next=), or the fallback. Rejects
 * absolute URLs, "//evil.com", backslash tricks and control characters. Control WEB-C6.
 */
export function safeRedirectPath(target: unknown, fallback = '/'): string {
  if (typeof target !== 'string' || !target.startsWith('/') || /^\/[\\/]/.test(target) || /[\u0000-\u001f\\]/.test(target)) {
    return fallback;
  }
  try {
    const url = new URL(target, BASE);
    return url.origin === BASE ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
