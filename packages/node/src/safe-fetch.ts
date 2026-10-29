import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http, { type IncomingHttpHeaders } from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

export class SsrfBlockedError extends Error {
  override name = 'SsrfBlockedError';
}

// Everything that is not publicly routable: private, loopback, link-local (incl. cloud metadata
// 169.254.169.254), CGNAT, documentation, benchmarking, multicast and reserved ranges.
// Separate lists per family: BlockList matches IPv4 addresses against IPv6 rules too, so the
// IPv4-mapped rule (::ffff:0:0/96) in a shared list would block every IPv4 address.
const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedV4.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
  ['2001::', 32], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blockedV6.addSubnet(net, prefix, 'ipv6');
const globalUnicastV6 = new BlockList();
globalUnicastV6.addSubnet('2000::', 3, 'ipv6');

/** True only for publicly routable unicast addresses. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, 'ipv4');
  if (family === 6) return globalUnicastV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
  return false;
}

/** DNS lookup that refuses non-public addresses. Used by the socket itself, so DNS rebinding cannot bypass it. */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err, '', 0);
    const bad = addresses.find((a) => !isPublicAddress(a.address));
    if (bad || addresses.length === 0) {
      return callback(new SsrfBlockedError(`${hostname} resolves to a non-public address`), '', 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
    return callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

export interface SafeFetchOptions {
  method?: 'GET' | 'HEAD' | 'POST';
  headers?: Record<string, string>;
  body?: string | Buffer;
  /** If set, only these hosts are allowed. "*.example.com" matches subdomains. */
  allowedHosts?: string[];
  allowedPorts?: number[];
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface SafeResponse {
  status: number;
  headers: IncomingHttpHeaders;
  /** Final URL after redirects. */
  url: string;
  body: Buffer;
  text(): string;
  json(): unknown;
}

function hostAllowed(host: string, patterns: string[]): boolean {
  return patterns.some((p) => (p.startsWith('*.') ? host.endsWith(p.slice(1)) && host.length > p.length - 1 : host === p));
}

function checkUrl(url: URL, opts: SafeFetchOptions): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SsrfBlockedError(`Protocol ${url.protocol} is not allowed`);
  if (url.username || url.password) throw new SsrfBlockedError('Credentials in URLs are not allowed');
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (!(opts.allowedPorts ?? [80, 443]).includes(port)) throw new SsrfBlockedError(`Port ${port} is not allowed`);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (opts.allowedHosts && !hostAllowed(host, opts.allowedHosts)) throw new SsrfBlockedError(`Host ${host} is not allowed`);
  // IP literals never go through DNS lookup, so check them here.
  if (isIP(host) && !isPublicAddress(host)) throw new SsrfBlockedError(`Address ${host} is not public`);
}

function requestOnce(url: URL, method: string, opts: SafeFetchOptions, deadline: number) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new Error('safeFetch timed out'));
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      { method, headers: opts.headers, lookup: guardedLookup, agent: false, timeout: remaining },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const max = opts.maxBytes ?? 5 * 1024 * 1024;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > max) {
            req.destroy(new Error(`Response larger than ${max} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('safeFetch timed out')));
    req.on('error', reject);
    if (opts.body !== undefined && method !== 'GET' && method !== 'HEAD') req.write(opts.body);
    req.end();
  });
}

/**
 * Fetch a URL that came from a user (webhooks, link previews, imports) without SSRF: only
 * http(s) on ports 80/443, no credentials in URLs, and every resolved IP must be public — checked
 * at connect time on every redirect hop. Control API-C5.
 */
export async function safeFetch(input: string | URL, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  let url = new URL(input);
  let method: string = opts.method ?? 'GET';
  const deadline = Date.now() + (opts.timeoutMs ?? 10_000);
  const maxRedirects = opts.maxRedirects ?? 3;

  for (let hop = 0; ; hop++) {
    checkUrl(url, opts);
    const res = await requestOnce(url, method, opts, deadline);
    const location = res.headers.location;
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= maxRedirects) throw new SsrfBlockedError('Too many redirects');
      url = new URL(location, url);
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) method = 'GET';
      continue;
    }
    const body = res.body;
    return {
      status: res.status,
      headers: res.headers,
      url: url.toString(),
      body,
      text: () => body.toString('utf8'),
      json: () => JSON.parse(body.toString('utf8')) as unknown,
    };
  }
}
