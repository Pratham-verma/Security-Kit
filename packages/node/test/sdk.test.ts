import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  assertFileType,
  buildSecurityHeaders,
  checkPasswordPolicy,
  detectFileType,
  generateOtp,
  hashPassword,
  isPublicAddress,
  isPwnedPassword,
  needsRehash,
  originCheck,
  randomToken,
  rateLimit,
  redact,
  safeEqual,
  safeFetch,
  safeRedirectPath,
  safeStorageName,
  securityHeaders,
  sessionCookieOptions,
  signWebhook,
  SsrfBlockedError,
  strictCors,
  verifyPassword,
  verifyWebhookSignature,
} from '../src/index.js';
import { fakeReq, fakeRes, run } from './helpers.js';

describe('password', () => {
  it('hashes with Argon2id at OWASP parameters and verifies', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(h, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
    expect(needsRehash(h)).toBe(false);
    expect(needsRehash('$2b$10$abcdefghijklmnopqrstuuJ5zLn0eTQyN4Rk8V7tD4u1D2yTzF0aK')).toBe(true);
  });

  it('applies length and context rules, not composition rules', () => {
    expect(checkPasswordPolicy('short').ok).toBe(false);
    expect(checkPasswordPolicy('all lowercase words are fine').ok).toBe(true);
    expect(checkPasswordPolicy('maria.lopez-2024!!', { context: ['maria.lopez@example.com'] }).ok).toBe(false);
  });

  it('checks Pwned Passwords with k-anonymity (only a 5-char prefix is sent)', async () => {
    let requested = '';
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    const fakeFetch = (async (url: string) => {
      requested = url;
      return new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n0018A45C4D1DEF81644B54AB7F969B88D65:1');
    }) as typeof fetch;
    expect(await isPwnedPassword('password', { fetch: fakeFetch })).toBe(true);
    expect(requested).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(await isPwnedPassword('a much rarer passphrase', { fetch: fakeFetch })).toBe(false);
  });
});

describe('tokens', () => {
  it('generates CSPRNG tokens and OTPs, compares in constant time', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(randomToken());
    expect(() => randomToken(8)).toThrow();
    expect(generateOtp()).toMatch(/^\d{6}$/);
    expect(safeEqual('123456', '123456')).toBe(true);
    expect(safeEqual('123456', '1234567')).toBe(false);
  });
});

describe('securityHeaders', () => {
  it('sets a nonce CSP and the standard headers, removes X-Powered-By', async () => {
    const res = fakeRes();
    res.setHeader('X-Powered-By', 'Express');
    expect((await run(securityHeaders(), fakeReq(), res)).next).toBe(true);
    const nonce = res.locals!.cspNonce as string;
    const csp = res.headers.get('content-security-policy') as string;
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}'`);
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.has('x-powered-by')).toBe(false);
  });

  it('can enforce Trusted Types for @seckit/web policies', () => {
    const csp = buildSecurityHeaders({ trustedTypes: true }, 'n')['Content-Security-Policy'];
    expect(csp).toContain("require-trusted-types-for 'script'");
    expect(csp).toContain('trusted-types seckit dompurify');
  });

  it('merges custom directives and supports report-only', () => {
    const h = buildSecurityHeaders({ csp: { reportOnly: true, directives: { 'img-src': ["'self'", 'https://cdn.example.com'] } } }, 'abc');
    expect(h['Content-Security-Policy-Report-Only']).toContain("img-src 'self' https://cdn.example.com");
    expect(h['Content-Security-Policy']).toBeUndefined();
  });
});

describe('strictCors', () => {
  const cors = strictCors({ origins: ['https://app.example.com'], credentials: true });

  it('allows exact origins only and never reflects others', async () => {
    const ok = fakeRes();
    await run(cors, fakeReq({ headers: { origin: 'https://app.example.com' } }), ok);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');

    for (const origin of ['https://evil.example', 'null', 'https://app.example.com.evil.example']) {
      const res = fakeRes();
      await run(cors, fakeReq({ headers: { origin } }), res);
      expect(res.headers.has('access-control-allow-origin'), origin).toBe(false);
    }
  });

  it('answers preflights and rejects wildcard configuration', async () => {
    const res = fakeRes();
    const r = await run(cors, fakeReq({ method: 'OPTIONS', headers: { origin: 'https://app.example.com', 'access-control-request-method': 'POST' } }), res);
    expect(r.next).toBe(false);
    expect(res.statusCode).toBe(204);
    expect(() => strictCors({ origins: ['*'] })).toThrow();
  });
});

describe('originCheck (CSRF)', () => {
  const csrf = originCheck({ allowedOrigins: ['https://app.example.com'] });
  const post = (headers: Record<string, string>) => fakeReq({ method: 'POST', headers });

  it('allows same-origin and allow-listed origins', async () => {
    expect((await run(csrf, post({ 'sec-fetch-site': 'same-origin' }), fakeRes())).next).toBe(true);
    expect((await run(csrf, post({ origin: 'https://app.example.com' }), fakeRes())).next).toBe(true);
    expect((await run(csrf, fakeReq({ method: 'GET', headers: { 'sec-fetch-site': 'cross-site' } }), fakeRes())).next).toBe(true);
    expect((await run(csrf, post({}), fakeRes())).next).toBe(true); // non-browser client
  });

  it('blocks cross-site state changes', async () => {
    const attacks: Record<string, string>[] = [
      { 'sec-fetch-site': 'cross-site' },
      { origin: 'https://evil.example' },
      { 'sec-fetch-site': 'same-site', origin: 'https://sub.example.com' },
    ];
    for (const headers of attacks) {
      const res = fakeRes();
      expect((await run(csrf, post(headers), res)).next, JSON.stringify(headers)).toBe(false);
      expect(res.statusCode).toBe(403);
    }
  });
});

describe('rateLimit', () => {
  it('returns 429 with Retry-After after the limit', async () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2 });
    const results: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = fakeRes();
      await run(limiter, fakeReq(), res);
      results.push(res.statusCode);
      if (i === 2) expect(res.headers.get('retry-after')).toBeDefined();
    }
    expect(results).toEqual([200, 200, 429]);
  });
});

describe('isPublicAddress / safeFetch (SSRF)', () => {
  it('classifies addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) expect(isPublicAddress(ip), ip).toBe(true);
    for (const ip of [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
      '::1', '::', '::ffff:127.0.0.1', '::ffff:8.8.8.8', 'fe80::1', 'fd00::1', 'fc00::1', '2001:db8::1', '64:ff9b::7f00:1', 'not-an-ip',
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it('refuses private targets, odd protocols, ports and credentials before connecting', async () => {
    for (const url of [
      'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/',
      'file:///etc/passwd', 'gopher://example.com/', 'http://example.com:6379/', 'http://user:pass@example.com/',
    ]) {
      await expect(safeFetch(url), url).rejects.toBeInstanceOf(SsrfBlockedError);
    }
  });

  it('blocks hostnames that resolve to private addresses (checked at connect time)', async () => {
    await expect(safeFetch('http://localhost/')).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('enforces the host allow-list', async () => {
    await expect(safeFetch('https://evil.example/', { allowedHosts: ['*.example.com'] })).rejects.toThrow(/not allowed/);
  });

  it('never reaches a local server, even when it is listening', async () => {
    let hit = false;
    const server = createServer((_req, res) => {
      hit = true;
      res.end('secret');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const { port } = server.address() as AddressInfo;
    await expect(safeFetch(`http://localhost:${port}/`, { allowedPorts: [port] })).rejects.toBeInstanceOf(SsrfBlockedError);
    server.close();
    expect(hit).toBe(false);
  });
});

describe('upload', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  it('detects by content and rejects disguised files', () => {
    expect(detectFileType(png)?.type).toBe('png');
    expect(assertFileType(png, ['png', 'jpeg']).ext).toBe('png');
    const php = Buffer.from('<?php system($_GET["c"]); ?>');
    expect(detectFileType(php)).toBeUndefined();
    expect(() => assertFileType(php, ['png', 'jpeg'])).toThrow(/unknown/);
    expect(detectFileType(Buffer.from('<svg onload=alert(1)>'))).toBeUndefined();
  });

  it('generates random storage names that cannot traverse paths', () => {
    expect(safeStorageName('png')).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(safeStorageName('../../etc/passwd')).toMatch(/^[0-9a-f-]{36}\.etcpasswd$/);
  });
});

describe('redact', () => {
  it('masks sensitive keys, tokens in strings, and handles cycles', () => {
    const input: Record<string, unknown> = {
      user: 'maria',
      password: 'hunter2',
      headers: { Authorization: 'Bearer abc.def.ghi', 'x-api-key': 'k' },
      card: { cardNumber: '4242424242424242', cvv: '123' },
      note: 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig in text',
    };
    input.self = input;
    const out = redact(input) as Record<string, any>;
    expect(out.user).toBe('maria');
    expect(out.password).toBe('[REDACTED]');
    expect(out.headers.Authorization).toBe('[REDACTED]');
    expect(out.headers['x-api-key']).toBe('[REDACTED]');
    expect(out.card.cardNumber).toBe('[REDACTED]');
    expect(out.card.cvv).toBe('[REDACTED]');
    expect(out.note).not.toContain('eyJ');
    expect(out.self).toBe('[Circular]');
    expect(input.password).toBe('hunter2'); // original untouched
  });
});

describe('webhooks', () => {
  const secret = 'whsec_test';
  const payload = '{"id":"evt_1","type":"payment_intent.succeeded"}';

  it('verifies valid signatures and rejects tampering, wrong secrets and replays', () => {
    const now = 1_700_000_000;
    const header = signWebhook(payload, secret, now);
    expect(verifyWebhookSignature({ payload, header, secret, now })).toBe(true);
    expect(verifyWebhookSignature({ payload: payload.replace('evt_1', 'evt_2'), header, secret, now })).toBe(false);
    expect(verifyWebhookSignature({ payload, header, secret: 'other', now })).toBe(false);
    expect(verifyWebhookSignature({ payload, header, secret, now: now + 301 })).toBe(false);
    expect(verifyWebhookSignature({ payload, header: undefined, secret, now })).toBe(false);
    expect(verifyWebhookSignature({ payload, header: 't=abc,v1=zz', secret, now })).toBe(false);
  });
});

describe('cookies and redirects', () => {
  it('produces secure session cookie options', () => {
    expect(sessionCookieOptions({ maxAgeMs: 1000 })).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 1000 });
  });

  it('only allows same-site relative redirect targets', () => {
    expect(safeRedirectPath('/account?tab=1#x')).toBe('/account?tab=1#x');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '\\\\evil.example', 'javascript:alert(1)', '/\tevil', undefined, 42]) {
      expect(safeRedirectPath(bad), String(bad)).toBe('/');
    }
  });
});
