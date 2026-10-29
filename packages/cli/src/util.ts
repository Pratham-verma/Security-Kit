import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

export const VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

export type Log = (line?: string) => void;

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
export const color = { bold: paint(1), dim: paint(2), red: paint(31), green: paint(32), yellow: paint(33), cyan: paint(36) };

export function readTextIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

/**
 * Resolve `rel` inside `root` and refuse paths that escape it or pass through a symlink,
 * so generated output can never be redirected to overwrite files elsewhere.
 */
export function safeOutputPath(root: string, rel: string): string {
  const base = resolve(root);
  const target = resolve(base, rel);
  if (!target.startsWith(base + sep)) throw new Error(`Refusing to write outside the project: ${rel}`);

  for (let p = target; p !== base; p = dirname(p)) {
    let isLink = false;
    try {
      isLink = lstatSync(p).isSymbolicLink();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    if (isLink) throw new Error(`Refusing to write through a symlink: ${relative(base, p)}`);
  }
  return target;
}

export function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
