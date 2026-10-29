import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.svelte-kit', '.turbo',
  'vendor', 'Pods', '.gradle', 'target', '.venv', 'venv', '__pycache__', '.seckit',
]);
const MAX_BYTES = 1_000_000;

export interface ProjectFiles {
  root: string;
  /** Paths relative to root, using "/" separators. */
  files: string[];
  git: boolean;
  /** Text content, or undefined for missing, large or binary files. */
  read(rel: string): string | undefined;
}

/** Files git would track (tracked + untracked-not-ignored), or a filtered directory walk outside git. */
export function listProjectFiles(root: string): ProjectFiles {
  const git = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  let files: string[];
  const inGit = git.status === 0;
  if (inGit) {
    files = git.stdout
      .split('\0')
      .filter((f) => f && !f.split('/').some((part) => SKIP_DIRS.has(part)) && existsSync(join(root, f)));
  } else {
    files = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
        } else if (entry.isFile()) {
          files.push(relative(root, join(dir, entry.name)).split('\\').join('/'));
        }
      }
    };
    walk(root);
  }

  const cache = new Map<string, string | undefined>();
  const read = (rel: string) => {
    if (cache.has(rel)) return cache.get(rel);
    let text: string | undefined;
    try {
      const path = join(root, rel);
      if (statSync(path).size <= MAX_BYTES) {
        const buf = readFileSync(path);
        if (!buf.subarray(0, 8000).includes(0)) text = buf.toString('utf8');
      }
    } catch {
      text = undefined;
    }
    cache.set(rel, text);
    return text;
  };

  return { root, files: files.sort(), git: inGit, read };
}
