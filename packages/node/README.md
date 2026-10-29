# @seckit/node

Secure-by-default building blocks for Node.js. Each helper implements specific Security Kit
controls, so `seckit generate` can point to it and `seckit audit` can check for it.

```ts
import express from 'express';
import {
  securityHeaders, strictCors, originCheck, rateLimit,
  hashPassword, verifyPassword, checkPasswordPolicy, isPwnedPassword,
  safeFetch, assertFileType, safeStorageName, redact, verifyWebhookSignature, safeRedirectPath,
} from '@seckit/node';

const app = express();
app.set('trust proxy', 1);                                  // so req.ip is the client, not the proxy
app.use(securityHeaders());                                 // WEB-C2, WEB-C3: CSP nonce in res.locals.cspNonce
app.use(strictCors({ origins: ['https://app.example.com'], credentials: true }));   // API-C6
app.use(originCheck({ allowedOrigins: ['https://app.example.com'] }));               // SESS-C2
app.use('/api/login', rateLimit({ windowMs: 15 * 60_000, max: 10 }));               // AUTH-C1

const hash = await hashPassword(password);                  // AUTH-C2: Argon2id, OWASP parameters
const ok = await verifyPassword(hash, attempt);
const policy = checkPasswordPolicy(password, { context: [email] });                 // AUTH-C3
if (await isPwnedPassword(password)) { /* reject */ }

const res = await safeFetch(userSuppliedUrl);               // API-C5: blocks private IPs at connect time
const type = assertFileType(fileBuffer, ['png', 'jpeg']);   // UPLOAD-C1: by content, not name
const key = safeStorageName(type.ext);                      // UPLOAD-C2
logger.info(redact({ body: req.body }));                    // LOG-C2
verifyWebhookSignature({ payload: rawBody, header, secret });                       // PAY-C3
res.redirect(safeRedirectPath(req.query.next));             // WEB-C6
```

| Helper | Controls |
|---|---|
| `securityHeaders()`, `noStore()` | WEB-C2, WEB-C3, WEB-C8, API-C8 |
| `strictCors()` | API-C6 |
| `originCheck()` | SESS-C2 |
| `rateLimit()` (pluggable store) | AUTH-C1, API-C4 |
| `hashPassword()`, `verifyPassword()`, `needsRehash()` | AUTH-C2 |
| `checkPasswordPolicy()`, `isPwnedPassword()` | AUTH-C3 |
| `randomToken()`, `generateOtp()`, `safeEqual()` | SESS-C6, AUTH-C7 |
| `sessionCookieOptions()`, `SESSION_COOKIE_NAME` | SESS-C1 |
| `safeFetch()`, `isPublicAddress()` | API-C5 |
| `detectFileType()`, `assertFileType()`, `safeStorageName()` | UPLOAD-C1, UPLOAD-C2 |
| `redact()` | LOG-C2, SEC-C6 |
| `verifyWebhookSignature()` | PAY-C3 |
| `safeRedirectPath()` | WEB-C6 |

Notes:
- Middleware uses the Connect signature `(req, res, next)`: works with Express, Connect and
  `node:http`. For Fastify, register it with `@fastify/middie`.
- `rateLimit()` defaults to an in-memory store, which is per process. Behind a load balancer,
  pass a shared `store` (e.g. Redis).
- `isPwnedPassword()` throws on network errors so you choose to fail open or closed.
- One runtime dependency: `@node-rs/argon2` (prebuilt binaries, no install scripts).
