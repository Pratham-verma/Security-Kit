export interface TokenResponse {
  accessToken: string;
  /** Lifetime in seconds. */
  expiresIn: number;
}

export interface TokenStoreOptions {
  /** Get a fresh access token, typically from an endpoint that reads an HttpOnly refresh cookie. */
  refresh: () => Promise<TokenResponse>;
  /** The only origins that may receive the token, e.g. ["https://api.example.com"]. */
  apiOrigins: string[];
  /** Refresh this many seconds before expiry. */
  refreshSkewSeconds?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface TokenStore {
  getToken(): Promise<string>;
  setToken(token: string, expiresIn: number): void;
  clear(): void;
  /** fetch() that adds the bearer token, but only for configured API origins. */
  authFetch(input: string | URL, init?: RequestInit): Promise<Response>;
}

/**
 * Keeps the access token in memory only — never in localStorage/sessionStorage, where any XSS can
 * read it — refreshes it before expiry (one refresh at a time), and refuses to send it to any
 * origin that is not an API origin. Control SESS-C3.
 */
export function createTokenStore(opts: TokenStoreOptions): TokenStore {
  const origins = new Set(opts.apiOrigins.map((o) => new URL(o).origin));
  if (origins.size === 0) throw new Error('createTokenStore: apiOrigins must not be empty');
  const now = opts.now ?? Date.now;
  const skewMs = (opts.refreshSkewSeconds ?? 30) * 1000;
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  let token: string | undefined;
  let expiresAt = 0;
  let inflight: Promise<string> | undefined;

  const setToken = (t: string, expiresIn: number) => {
    token = t;
    expiresAt = now() + expiresIn * 1000;
  };
  const clear = () => {
    token = undefined;
    expiresAt = 0;
  };

  const getToken = (): Promise<string> => {
    if (token && now() < expiresAt - skewMs) return Promise.resolve(token);
    inflight ??= opts
      .refresh()
      .then((r) => {
        setToken(r.accessToken, r.expiresIn);
        return r.accessToken;
      })
      .finally(() => {
        inflight = undefined;
      });
    return inflight;
  };

  const authFetch = async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
    const base = (globalThis as { location?: { href: string } }).location?.href;
    const url = new URL(input, base);
    if (!origins.has(url.origin)) {
      throw new Error(`authFetch: refusing to send the access token to ${url.origin} (not an API origin)`);
    }
    const send = async () => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${await getToken()}`);
      return doFetch(url, { ...init, headers });
    };
    const res = await send();
    // Retry once with a fresh token, but only for requests that are safe to repeat.
    const method = (init.method ?? 'GET').toUpperCase();
    if (res.status === 401 && (method === 'GET' || method === 'HEAD')) {
      clear();
      return send();
    }
    return res;
  };

  return { getToken, setToken, clear, authFetch };
}
