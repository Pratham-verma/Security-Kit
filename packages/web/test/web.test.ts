import { describe, expect, it, vi } from 'vitest';
import { createTokenStore, enableTrustedTypes, safeRedirectPath, safeUrl, sanitizeHtml, setSafeHtml } from '../src/index.js';

describe('sanitizeHtml', () => {
  it('removes scripts, event handlers, javascript: URLs, styles and forms', () => {
    const dirty =
      '<p>Hi <b>there</b></p><script>alert(1)</script><img src=x onerror=alert(1)>' +
      '<a href="javascript:alert(1)">x</a><span style="position:fixed">overlay</span>' +
      '<form action="https://evil.example"><input name=pw></form><svg><script>alert(1)</script></svg>';
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain('<p>Hi <b>there</b></p>');
    for (const bad of ['<script', 'onerror', 'javascript:', 'style=', '<form', '<input', '<svg']) {
      expect(clean, bad).not.toContain(bad);
    }
  });

  it('adds rel=noopener to links that open new tabs', () => {
    expect(sanitizeHtml('<a href="https://example.com" target="_blank">x</a>')).toContain('rel="noopener noreferrer"');
    expect(sanitizeHtml('<a href="https://example.com" target="_top">x</a>')).not.toContain('target');
    expect(sanitizeHtml('<p target="_blank">x</p>')).not.toContain('target');
  });

  it('allows opting in to extra tags and attributes', () => {
    expect(sanitizeHtml('<p data-id="1">x</p>')).not.toContain('data-id');
    expect(sanitizeHtml('<p data-id="1">x</p>', { allowAttributes: ['data-id'] })).toContain('data-id="1"');
  });
});

describe('Trusted Types', () => {
  it('returns false where the browser has no Trusted Types', () => {
    expect(enableTrustedTypes()).toBe(false);
  });

  it('creates a sanitizing policy and uses it in setSafeHtml', () => {
    const rules: Record<string, (s: string) => string> = {};
    vi.stubGlobal('trustedTypes', {
      createPolicy: (_name: string, r: Record<string, (s: string) => string>) => {
        Object.assign(rules, r);
        return { createHTML: (s: string) => r.createHTML!(s) };
      },
    });
    expect(enableTrustedTypes()).toBe(true);
    const el = document.createElement('div');
    setSafeHtml(el, '<b>ok</b><img src=x onerror=alert(1)>');
    expect(el.innerHTML).toBe('<b>ok</b><img src="x">');
    expect(() => rules.createScript!('alert(1)')).toThrow();
    expect(() => rules.createScriptURL!('https://evil.example/x.js')).toThrow();
    vi.unstubAllGlobals();
  });
});

describe('createTokenStore', () => {
  const ok = () => new Response('{}', { status: 200 });

  it('keeps the token in memory and refreshes once for concurrent callers', async () => {
    let refreshes = 0;
    const store = createTokenStore({
      apiOrigins: ['https://api.example.com'],
      refresh: async () => ({ accessToken: `t${++refreshes}`, expiresIn: 300 }),
      fetch: async () => ok(),
    });
    const tokens = await Promise.all([store.getToken(), store.getToken(), store.getToken()]);
    expect(tokens).toEqual(['t1', 't1', 't1']);
    expect(refreshes).toBe(1);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('refreshes before expiry', async () => {
    let t = 0;
    let n = 0;
    const store = createTokenStore({
      apiOrigins: ['https://api.example.com'],
      refresh: async () => ({ accessToken: `t${++n}`, expiresIn: 60 }),
      now: () => t,
    });
    expect(await store.getToken()).toBe('t1');
    t = 31_000; // inside the 30 s skew window before expiry
    expect(await store.getToken()).toBe('t2');
  });

  it('sends the token only to API origins', async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const store = createTokenStore({
      apiOrigins: ['https://api.example.com'],
      refresh: async () => ({ accessToken: 'secret-token', expiresIn: 300 }),
      fetch: async (url, init) => {
        seen.push({ url: String(url), auth: new Headers(init?.headers).get('authorization') });
        return ok();
      },
    });
    await store.authFetch('https://api.example.com/me');
    await expect(store.authFetch('https://evil.example/collect')).rejects.toThrow(/refusing/);
    await expect(store.authFetch('https://api.example.com.evil.example/')).rejects.toThrow(/refusing/);
    expect(seen).toEqual([{ url: 'https://api.example.com/me', auth: 'Bearer secret-token' }]);
  });

  it('retries a GET once after 401 with a fresh token, but never a POST', async () => {
    let n = 0;
    const statuses = [401, 200, 401];
    const store = createTokenStore({
      apiOrigins: ['https://api.example.com'],
      refresh: async () => ({ accessToken: `t${++n}`, expiresIn: 300 }),
      fetch: async () => new Response(null, { status: statuses.shift()! }),
    });
    expect((await store.authFetch('https://api.example.com/me')).status).toBe(200);
    expect(n).toBe(2);
    expect((await store.authFetch('https://api.example.com/me', { method: 'POST', body: '{}' })).status).toBe(401);
  });
});

describe('safeUrl and safeRedirectPath', () => {
  it('allows web, mail and relative URLs; blocks script URLs, including obfuscated ones', () => {
    for (const good of ['https://example.com/a', '/profile', 'mailto:a@example.com', 'tel:+123', '?q=1']) {
      expect(safeUrl(good), good).toBe(good);
    }
    for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>', 'vbscript:x', '', null]) {
      expect(safeUrl(bad), String(bad)).toBe('about:blank');
    }
  });

  it('only allows same-site relative redirects', () => {
    expect(safeRedirectPath('/next?x=1')).toBe('/next?x=1');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      expect(safeRedirectPath(bad), bad).toBe('/');
    }
  });
});
