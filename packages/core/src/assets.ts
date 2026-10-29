import { fileURLToPath } from 'node:url';

// Running from source (tsx / vitest inside the monorepo): read the repo-root folders so KB
// edits are picked up immediately. Built package: read the copies made by scripts/copy-assets.mjs.
const BASE = import.meta.url.endsWith('.ts') ? '../../../' : '../assets/';

export function assetDir(name: 'schemas' | 'knowledge-base'): string {
  return fileURLToPath(new URL(`${BASE}${name}/`, import.meta.url));
}
