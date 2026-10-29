// End-to-end: the official MCP SDK client talks to our server over real stdio.
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findSemgrep } from '@seckit/cli/lib';

const require = createRequire(import.meta.url);
const TSX = require.resolve('tsx/cli');
const BIN = fileURLToPath(new URL('../src/bin.ts', import.meta.url));
const TSCONFIG = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
const semgrep = findSemgrep();

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'seckit-mcp-test-'));
  const files: Record<string, string> = {
    'seckit.yaml': [
      'version: 1',
      'app: { name: mcp-fixture, platforms: [web, backend] }',
      'components:',
      '  - type: auth',
      '    methods: [email_password]',
      '  - type: database',
      '    kind: sql',
      '  - type: web_frontend',
      '  - type: secrets',
    ].join('\n'),
    'src/db.ts': 'export const find = (db, id) => db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
  };
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(dir, p, '..'), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  symlinkSync(tmpdir(), join(dir, 'escape'));
  return dir;
}

const json = (res: any) => JSON.parse(res.content[0].text);

describe('seckit MCP server over stdio (official SDK client)', () => {
  let client: Client;
  const dir = project();

  beforeAll(async () => {
    client = new Client({ name: 'seckit-test', version: '1.0.0' });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [TSX, '--tsconfig', TSCONFIG, BIN, '--dir', dir],
        env: { ...process.env } as Record<string, string>,
        stderr: 'pipe',
      }),
    );
  });
  afterAll(async () => client?.close());

  it('initializes and lists five read-only tools', async () => {
    expect(client.getServerVersion()?.name).toBe('seckit');
    expect(client.getInstructions()).toMatch(/get_controls_for_file/);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['check_code', 'explain_control', 'get_controls_for_file', 'get_security_plan', 'run_audit']);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.map((t) => t.name)).not.toContain('attest');
  });

  it('returns the controls that apply to a file', async () => {
    const res = json(await client.callTool({ name: 'get_controls_for_file', arguments: { path: 'src/auth/login.ts', content: 'const ok = await bcrypt.compare(password, hash);' } }));
    const ids = res.relevant.flatMap((r: any) => r.controls.map((c: any) => c.id));
    expect(ids).toContain('AUTH-C2');
    const c2 = res.relevant.flatMap((r: any) => r.controls).find((c: any) => c.id === 'AUTH-C2');
    expect(c2.use.join()).toMatch(/hashPassword/);
  });

  it('refuses paths outside the project, including via symlinks', async () => {
    for (const path of ['../../etc/passwd', '/etc/passwd', 'escape/anything']) {
      const res = (await client.callTool({ name: 'get_controls_for_file', arguments: { path } })) as any;
      expect(res.isError, path).toBe(true);
      expect(res.content[0].text).toMatch(/outside the project/);
    }
  });

  it('check_code finds hard-coded secrets without echoing them', async () => {
    const res = json(await client.callTool({ name: 'check_code', arguments: { filename: 'src/config.ts', code: 'export const aws = "AKIAIOSFODNN7EXAMPLE";\n' } }));
    expect(res.issues[0].controls).toContain('SEC-C1');
    expect(JSON.stringify(res)).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it.skipIf(!semgrep)('check_code finds SQL injection with Semgrep and returns the fix', async () => {
    const res = json(await client.callTool({ name: 'check_code', arguments: { filename: 'src/db.ts', code: 'export const f = (db: any, id: string) =>\n  db.query(`SELECT * FROM users WHERE id = ${id}`);\n' } }));
    const issue = res.issues.find((i: any) => i.controls.includes('DB-C1'));
    expect(issue.line).toBe(2);
    expect(issue.fix.join()).toMatch(/bound parameters/);
  });

  it('explains controls and rejects malformed IDs', async () => {
    expect(json(await client.callTool({ name: 'explain_control', arguments: { id: 'db-c1' } })).standards).toMatch(/V5\.3\.4/);
    const bad = (await client.callTool({ name: 'explain_control', arguments: { id: '../../x' } })) as any;
    expect(bad.isError).toBe(true);
  });

  it('runs the audit read-only', async () => {
    const res = json(await client.callTool({ name: 'run_audit', arguments: {} }));
    expect(res.app).toBe('mcp-fixture');
    if (semgrep) expect(res.failed.map((c: any) => c.id)).toContain('DB-C1');
    expect(res.note).toMatch(/Do not mark them done yourself/);
  });
});
