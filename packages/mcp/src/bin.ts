#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { serveStdio } from './protocol.js';
import { createContext, createTools, instructions } from './tools.js';

const { values } = parseArgs({ options: { dir: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
if (values.help) {
  process.stderr.write('Usage: seckit-mcp [--dir <project>]   (MCP server over stdio; default dir: current directory)\n');
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const ctx = createContext(values.dir ?? process.cwd());
serveStdio(createTools(ctx), { name: 'seckit', version, instructions: instructions(ctx) });
