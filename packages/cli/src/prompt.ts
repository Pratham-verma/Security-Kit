import { createInterface } from 'node:readline';
import { color } from './util.js';

export interface Choice<T> {
  value: T;
  label: string;
  hint?: string;
}

export interface Prompter {
  input(message: string, def?: string): Promise<string>;
  confirm(message: string, def: boolean): Promise<boolean>;
  select<T>(message: string, choices: Choice<T>[], def?: T): Promise<T>;
  multiselect<T>(message: string, choices: Choice<T>[], defs?: T[], min?: number): Promise<T[]>;
}

/**
 * Read answers line by line. rl.question() drops lines that arrive while no question is
 * pending (piped input arrives all at once), so queue them, and fail loudly if input ends early.
 */
function lineReader() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const queued: string[] = [];
  let waiting: { resolve: (line: string) => void; reject: (e: Error) => void } | undefined;
  let closed = false;
  const ended = () => new Error('Input ended before all questions were answered.');

  rl.on('line', (line) => {
    if (!waiting) return void queued.push(line);
    const w = waiting;
    waiting = undefined;
    w.resolve(line);
  });
  rl.on('close', () => {
    closed = true;
    waiting?.reject(ended());
    waiting = undefined;
  });
  rl.on('SIGINT', () => {
    process.stdout.write('\n');
    process.exit(130);
  });

  const ask = (prompt: string): Promise<string> => {
    process.stdout.write(prompt);
    if (queued.length > 0) return Promise.resolve(queued.shift()!.trim());
    if (closed) return Promise.reject(ended());
    return new Promise<string>((resolve, reject) => (waiting = { resolve, reject })).then((l) => l.trim());
  };
  return { ask, close: () => rl.close() };
}

/** Dependency-free terminal prompts: numbered choices, Enter accepts the default. */
export function createTerminalPrompter(): Prompter & { close(): void } {
  const { ask, close } = lineReader();
  const q = (message: string) => `${color.cyan('?')} ${color.bold(message)}`;

  const printChoices = <T>(choices: Choice<T>[], marked: (v: T) => boolean) => {
    choices.forEach((c, i) => {
      const mark = marked(c.value) ? color.green('●') : ' ';
      console.log(`  ${mark} ${String(i + 1).padStart(2)}) ${c.label}${c.hint ? color.dim(` — ${c.hint}`) : ''}`);
    });
  };

  return {
    async input(message, def) {
      const answer = await ask(`${q(message)}${def ? color.dim(` (${def})`) : ''}: `);
      return answer || def || '';
    },

    async confirm(message, def) {
      for (;;) {
        const answer = (await ask(`${q(message)} ${color.dim(def ? '[Y/n]' : '[y/N]')} `)).toLowerCase();
        if (answer === '') return def;
        if (answer === 'y' || answer === 'yes') return true;
        if (answer === 'n' || answer === 'no') return false;
      }
    },

    async select(message, choices, def) {
      console.log(q(message));
      printChoices(choices, (v) => v === def);
      const defIndex = choices.findIndex((c) => c.value === def);
      for (;;) {
        const answer = await ask(`  Choose a number${defIndex >= 0 ? color.dim(` (${defIndex + 1})`) : ''}: `);
        if (answer === '' && defIndex >= 0) return choices[defIndex]!.value;
        const n = Number(answer);
        if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1]!.value;
      }
    },

    async multiselect(message, choices, defs = [], min = 0) {
      console.log(q(message));
      printChoices(choices, (v) => defs.includes(v));
      const defLabel = defs.map((d) => choices.findIndex((c) => c.value === d) + 1).filter((n) => n > 0).join(',');
      for (;;) {
        const answer = await ask(`  Numbers, comma-separated${defLabel ? color.dim(` (${defLabel})`) : ''}${min === 0 ? color.dim(', 0 for none') : ''}: `);
        if (answer === '' && defs.length >= min) return defs;
        if (answer === '0' && min === 0) return [];
        const nums = answer.split(/[\s,]+/).filter(Boolean).map(Number);
        if (nums.length >= Math.max(min, 1) && nums.every((n) => Number.isInteger(n) && n >= 1 && n <= choices.length)) {
          return [...new Set(nums)].map((n) => choices[n - 1]!.value);
        }
      }
    },

    close,
  };
}
