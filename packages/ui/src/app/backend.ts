// Where the app gets its data. Local mode: the seckit-ui server on 127.0.0.1 (can read and scan the project).
// Hosted mode: the engine running in this browser (describe, checklist, AI prompt — nothing is uploaded).
export type Mode = 'local' | 'hosted';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
    readonly status = 0,
  ) {
    super(message);
  }
}

export interface Backend {
  mode: Mode;
  /** Same paths and response shapes in both modes (see src/server/server.ts). */
  request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T>;
  /** False when the page cannot talk to its backend yet (local mode without a valid link). */
  ready(): boolean;
  /** Pick up a new link opened in this tab (local mode); true if something changed. */
  adoptFromUrl(): boolean;
  /** Local mode: check a pasted link or key against the server and keep it if it works. */
  connect?(input: string): Promise<'ok' | 'wrong-key' | 'invalid'>;
}

let current: Backend | undefined;

export function setBackend(b: Backend): void {
  current = b;
}

export function backend(): Backend {
  if (!current) throw new Error('No backend set');
  return current;
}

export const isHosted = (): boolean => current?.mode === 'hosted';
