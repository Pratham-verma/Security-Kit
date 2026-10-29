const BASE = 'http://seckit.invalid';

/**
 * Return a safe same-site path for redirects, or the fallback. Rejects absolute URLs,
 * protocol-relative "//evil.com", backslash tricks and control characters. Control WEB-C6.
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
