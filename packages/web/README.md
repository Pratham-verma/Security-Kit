# @seckit/web

Browser-side building blocks from Security Kit. Each helper implements specific controls.

```ts
import { sanitizeHtml, setSafeHtml, enableTrustedTypes, createTokenStore, safeUrl, safeRedirectPath } from '@seckit/web';

enableTrustedTypes();                       // WEB-C1: with CSP require-trusted-types-for 'script'
setSafeHtml(el, commentHtml);               // WEB-C1, WEB-C7: sanitized via DOMPurify
<div dangerouslySetInnerHTML={{ __html: sanitizeHtml(modelOutput) }} />   // AI-C2

<a href={safeUrl(profile.website)}>…</a>    // blocks javascript:, data:, "java\tscript:"
navigate(safeRedirectPath(params.get('next')));                            // WEB-C6

const tokens = createTokenStore({          // SESS-C3: memory only, never localStorage
  apiOrigins: ['https://api.example.com'],  // the token is never sent anywhere else
  refresh: () => fetch('/auth/refresh', { method: 'POST', credentials: 'include' }).then((r) => r.json()),
});
const me = await tokens.authFetch('https://api.example.com/me');
```

| Helper | Controls |
|---|---|
| `sanitizeHtml()`, `setSafeHtml()` | WEB-C1, WEB-C7, AI-C2 |
| `enableTrustedTypes()` | WEB-C1 |
| `createTokenStore()` | SESS-C3 |
| `safeUrl()` | WEB-C1 |
| `safeRedirectPath()` | WEB-C6 |

Notes:
- Sanitizing uses DOMPurify with stricter defaults: HTML only (no SVG/MathML), no forms, no inline
  styles, no `data-*` attributes, and `target` only as `_blank` with `rel="noopener noreferrer"`.
- Without a DOM (server-side rendering), `sanitizeHtml()` throws instead of returning unsanitized
  HTML. On the server call `useWindow(new JSDOM('').window)` first.
- Pair `enableTrustedTypes()` with `securityHeaders({ trustedTypes: true })` from `@seckit/node`.
- `authFetch()` retries once after a 401 for GET/HEAD only, never for requests with side effects.
