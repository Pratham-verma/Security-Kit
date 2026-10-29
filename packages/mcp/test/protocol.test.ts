import { describe, expect, it } from 'vitest';
import { classifyFile, filePlatforms } from '../src/classify.js';
import { createHandler, text, type Tool } from '../src/protocol.js';

const echo: Tool = {
  name: 'echo',
  title: 'Echo',
  description: 'test',
  inputSchema: { type: 'object', properties: { msg: { type: 'string', maxLength: 5 } }, required: ['msg'], additionalProperties: false },
  handler: (args) => {
    if (args.msg === 'boom') throw new Error('kaput');
    return text(String(args.msg));
  },
};
const handle = createHandler([echo], { name: 'seckit', version: '0.0.1', instructions: 'be safe' });
const call = (id: number, method: string, params?: object) => handle({ jsonrpc: '2.0', id, method, params });

describe('MCP protocol', () => {
  it('negotiates the protocol version', async () => {
    const res = (await call(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } })) as any;
    expect(res.result.protocolVersion).toBe('2025-06-18');
    expect(res.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(res.result.instructions).toBe('be safe');
    const future = (await call(2, 'initialize', { protocolVersion: '2099-01-01' })) as any;
    expect(future.result.protocolVersion).toBe('2025-11-25');
  });

  it('lists tools as read-only and answers ping', async () => {
    const res = (await call(3, 'tools/list')) as any;
    expect(res.result.tools[0]).toMatchObject({ name: 'echo', annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } });
    expect(((await call(4, 'ping')) as any).result).toEqual({});
  });

  it('never answers notifications', async () => {
    expect(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeUndefined();
  });

  it('reports unknown methods and tools as JSON-RPC errors', async () => {
    expect(((await call(5, 'resources/list')) as any).error.code).toBe(-32601);
    expect(((await call(6, 'tools/call', { name: 'nope', arguments: {} })) as any).error.code).toBe(-32602);
  });

  it('returns invalid arguments and handler failures as tool errors, without stack traces', async () => {
    const bad = (await call(7, 'tools/call', { name: 'echo', arguments: { msg: 'too long' } })) as any;
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toMatch(/Invalid arguments/);
    const boom = (await call(8, 'tools/call', { name: 'echo', arguments: { msg: 'boom' } })) as any;
    expect(boom.result).toEqual({ content: [{ type: 'text', text: 'Error: kaput' }], isError: true });
  });
});

describe('classifyFile / filePlatforms', () => {
  const comps = (path: string, content = '') => classifyFile(path, content).map((m) => m.component);

  it('detects components from paths and code', () => {
    expect(comps('src/routes/login.ts')).toEqual(expect.arrayContaining(['auth', 'api']));
    expect(comps('src/db.ts', 'await pool.query("SELECT 1 FROM users")')).toContain('database');
    expect(comps('src/upload.ts', "import multer from 'multer'")).toContain('file_upload');
    expect(comps('app/chat.py', 'client.chat.completions.create(model=m)')).toContain('ai_feature');
    expect(comps('src/components/Comment.tsx', '<div dangerouslySetInnerHTML={{__html: x}} />')).toContain('web_frontend');
    expect(comps('src/util/math.ts', 'export const add = (a, b) => a + b;')).toEqual([]);
    expect(comps('app/src/main/AndroidManifest.xml')).toContain('mobile_platform');
    expect(comps('ios/App/Net.swift', 'func urlSession(_ s: URLSession, didReceive challenge: URLAuthenticationChallenge)')).toContain('mobile_platform');
    expect(comps('src/main/java/com/x/UserRepository.java', 'jdbcTemplate.query(sql, mapper)')).toContain('database');
    expect(comps('src/main/java/com/x/ItemController.java', '@RestController class ItemController {}')).toEqual(['api']);
    expect(comps('lib/screens/login.dart', "final auth = LocalAuthentication();")).toEqual(expect.arrayContaining(['mobile_storage', 'mobile_platform']));
  });

  it('infers platforms without mistaking JVM backends for Android', () => {
    expect(filePlatforms('android/app/src/main/java/com/x/Store.kt')).toEqual(['android']);
    expect(filePlatforms('src/main/java/com/x/UserController.java')).toBeUndefined();
    expect(filePlatforms('ios/App/Store.swift')).toEqual(['ios']);
    expect(filePlatforms('src/components/Button.tsx')).toEqual(['web']);
    expect(filePlatforms('server/routes/users.ts')).toEqual(['backend']);
    expect(filePlatforms('lib/main.dart')).toEqual(['android', 'ios']);
    expect(filePlatforms('server/bin/server.dart')).toEqual(['backend']);
  });
});
