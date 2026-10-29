#!/usr/bin/env node
// seckit-ui: open Security Kit in the browser for one project.
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { startUiServer } from './server.js';

const HELP = `seckit-ui — Security Kit in your browser

Usage: seckit-ui [--dir <path>] [--port <n>] [--no-open]

  --dir <path>      Project directory (default: current directory)
  --port <n>        Port on 127.0.0.1 (default: 4777, or a free port if it is taken)
  --no-open         Print the link instead of opening the browser
  --no-semgrep      Run built-in checks only
  --listen <addr>   Listen address (default 127.0.0.1; containers use 0.0.0.0 and publish to 127.0.0.1)
  -h, --help        Show this help

The server listens on 127.0.0.1 only and needs the one-time link it prints.`;

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  const child = spawn(cmd as string, args as string[], { stdio: 'ignore', detached: true });
  child.on('error', () => console.log('Could not open a browser; open the link above yourself.'));
  child.unref();
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string', default: process.cwd() },
      port: { type: 'string' },
      'no-open': { type: 'boolean', default: false },
      'no-semgrep': { type: 'boolean', default: false },
      listen: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const semgrep = values['no-semgrep'] ? false : undefined;
  const listen = values.listen;
  let ui;
  if (values.port !== undefined) {
    ui = await startUiServer({ dir: values.dir!, port: Number(values.port), semgrep, listen });
  } else {
    try {
      ui = await startUiServer({ dir: values.dir!, port: 4777, semgrep, listen });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
      ui = await startUiServer({ dir: values.dir!, port: 0, semgrep, listen });
    }
  }
  console.log(`Security Kit is running for ${ui.context.root}`);
  console.log(`\n  ${ui.url}\n`);
  console.log('Keep this window open while you use it. Press Ctrl+C to stop.');
  if (!values['no-open']) openBrowser(ui.url);
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
