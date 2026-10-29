// Local mode: talks to the seckit-ui server. The session key comes from the link seckit-ui printed
// (#token=...); it is kept in localStorage so reloads and new tabs keep working, and never put in a URL
// again. If site data is cleared, the user pastes the link once more (see connect()).
import { ApiError, type Backend } from './backend.js';

const TOKEN_KEY = 'seckit-token';
const TEXT_RESPONSES = /^\/api\/(audit|checklist|manifest)\/export/;

/** Where the key is kept: localStorage (survives closing the tab), with sessionStorage as a fallback. */
function saveToken(key: string): void {
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      store().setItem(TOKEN_KEY, key);
      return;
    } catch {
      // storage blocked: try the next one (or keep the key in memory only)
    }
  }
}

function loadToken(): string | null {
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      const key = store().getItem(TOKEN_KEY);
      if (key) return key;
    } catch {
      // storage blocked
    }
  }
  return null;
}

function forgetToken(): void {
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      store().removeItem(TOKEN_KEY);
    } catch {
      // storage blocked
    }
  }
}

function readToken(): string | null {
  const m = location.hash.match(/^#token=([\w-]+)/);
  if (m) {
    saveToken(m[1]!);
    history.replaceState(null, '', `${location.pathname}#/`);
    return m[1]!;
  }
  return loadToken();
}

/** The key from a pasted link ("http://127.0.0.1:4777/#token=…") or a bare key. */
export function keyFromInput(input: string): string | null {
  const text = input.trim();
  const fromLink = text.match(/[#&?]token=([\w-]+)/);
  if (fromLink) return fromLink[1]!;
  return /^[\w-]{16,}$/.test(text) ? text : null;
}

export function httpBackend(): Backend {
  let token: string | null = null;
  return {
    mode: 'local',
    ready() {
      token ??= readToken();
      return !!token;
    },
    async connect(input: string): Promise<'ok' | 'wrong-key' | 'invalid'> {
      const key = keyFromInput(input);
      if (!key) return 'invalid';
      let res: Response;
      try {
        res = await fetch('/api/session', { headers: { 'X-Seckit-Token': key } });
      } catch {
        throw new ApiError('Security Kit is not running. Start it again with `seckit ui`, or start its Docker container.');
      }
      if (res.status === 401) return 'wrong-key';
      if (!res.ok) throw new ApiError(`Security Kit answered with an error (${res.status}).`);
      token = key;
      saveToken(key);
      return 'ok';
    },
    adoptFromUrl() {
      if (!/^#token=[\w-]+/.test(location.hash)) return false;
      token = readToken();
      return !!token;
    },
    async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
      token ??= readToken();
      let res: Response;
      try {
        res = await fetch(path, {
          method,
          headers: { 'X-Seckit-Token': token ?? '', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      } catch {
        throw new ApiError('Security Kit is not running. Start it again with `seckit ui` in your project folder.');
      }
      if (TEXT_RESPONSES.test(path) && res.ok) return (await res.text()) as T;
      const data = (await res.json().catch(() => ({}))) as { error?: string; issues?: string[] };
      if (res.status === 401) {
        // The key is from an earlier run: forget it, so opening the current link starts clean.
        token = null;
        forgetToken();
      }
      if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, data.issues ?? [], res.status);
      return data as T;
    },
  };
}
