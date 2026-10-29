// Copy the repo-root schemas and knowledge base into the package so the published build is self-contained.
import { cpSync, rmSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const out = new URL('../assets/', import.meta.url);

rmSync(out, { recursive: true, force: true });
for (const name of ['schemas', 'knowledge-base']) {
  cpSync(new URL(`${name}/`, root), new URL(`${name}/`, out), { recursive: true });
}
