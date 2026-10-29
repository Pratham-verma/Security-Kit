// App-wide state, loaded through the current backend (local server or in-browser engine).
import { ApiError, backend } from './backend.js';
import type { Catalog, State } from './types.js';

export { ApiError } from './backend.js';

export const api = {
  get: <T>(path: string) => backend().request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => backend().request<T>('POST', path, body),
};

type Listener = () => void;

export const store = {
  state: null as State | null,
  catalog: null as Catalog | null,
  error: null as ApiError | null,
  listeners: new Set<Listener>(),

  async refresh(): Promise<void> {
    try {
      const [state, catalog] = await Promise.all([api.get<State>('/api/state'), this.catalog ? Promise.resolve(this.catalog) : api.get<Catalog>('/api/catalog')]);
      this.state = state;
      this.catalog = catalog;
      this.error = null;
    } catch (e) {
      this.error = e instanceof ApiError ? e : new ApiError(String(e));
    }
    this.emit();
  },

  emit(): void {
    for (const l of this.listeners) l();
  },
};
