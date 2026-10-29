// Minimal MCP server over stdio: newline-delimited JSON-RPC 2.0. It implements what a tools-only server
// needs (initialize, ping, tools/list, tools/call) with no runtime dependencies. Interoperability is
// tested against the official MCP SDK client.
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { Ajv, type ValidateFunction } from 'ajv';

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07'];

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler(args: Record<string, unknown>): ToolResult | Promise<ToolResult>;
}

export interface ServerInfo {
  name: string;
  version: string;
  instructions?: string;
}

type Id = string | number;
interface Message {
  jsonrpc?: string;
  id?: Id | null;
  method?: string;
  params?: Record<string, unknown>;
}

const ERR = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 };

export const text = (value: unknown, isError = false): ToolResult => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

/** Handles one parsed JSON-RPC message; returns the response, or undefined for notifications. */
export function createHandler(tools: Tool[], info: ServerInfo) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validators = new Map<string, ValidateFunction>(tools.map((t) => [t.name, ajv.compile(t.inputSchema)]));
  const byName = new Map(tools.map((t) => [t.name, t]));
  const listing = tools.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    // Every Security Kit tool only reads; none changes files or reaches the network.
    annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }));

  return async (msg: unknown): Promise<object | undefined> => {
    if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
      return { jsonrpc: '2.0', id: null, error: { code: ERR.invalidRequest, message: 'Invalid request' } };
    }
    const { id, method, params = {} } = msg as Message;
    if (method === undefined) return undefined; // a response to us, or junk without a method
    const isNotification = id === undefined || id === null;
    const reply = (result: object) => ({ jsonrpc: '2.0', id, result });
    const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
    if (isNotification) return undefined; // notifications/initialized, cancelled, ... need no reply

    switch (method) {
      case 'initialize': {
        const requested = String(params.protocolVersion ?? '');
        return reply({
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: info.name, version: info.version },
          ...(info.instructions ? { instructions: info.instructions } : {}),
        });
      }
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: listing });
      case 'tools/call': {
        const tool = byName.get(String(params.name));
        if (!tool) return fail(ERR.invalidParams, `Unknown tool: ${String(params.name)}`);
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        const validate = validators.get(tool.name)!;
        if (!validate(args)) {
          const problems = (validate.errors ?? []).map((e) => `${e.instancePath || 'arguments'} ${e.message}`).join('; ');
          return reply(text(`Invalid arguments: ${problems}`, true));
        }
        try {
          return reply(await tool.handler(args));
        } catch (e) {
          // Report the message only; stack traces would leak paths and internals to the client.
          return reply(text(`Error: ${(e as Error).message}`, true));
        }
      }
      default:
        return fail(ERR.methodNotFound, `Method not found: ${method}`);
    }
  };
}

/** Serve over stdio. Only protocol messages go to stdout; diagnostics go to stderr. */
export function serveStdio(tools: Tool[], info: ServerInfo, input: Readable = process.stdin, output: Writable = process.stdout): void {
  const handle = createHandler(tools, info);
  const send = (msg: object) => output.write(JSON.stringify(msg) + '\n');
  const rl = createInterface({ input, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (line.trim() === '') return;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: ERR.parse, message: 'Parse error' } });
      return;
    }
    handle(msg).then(
      (res) => res && send(res),
      (e: unknown) => process.stderr.write(`seckit-mcp: ${(e as Error).message}\n`),
    );
  });
  rl.on('close', () => process.exit(0));
}
