---
title: The automatic scan
description: Scan your code against your plan for leaked secrets, injection, weak crypto and insecure settings.
sidebar: { order: 4 }
---

`seckit audit` (or **Automatic scan** in `seckit ui`) checks your project against your plan. It only reads files —
nothing is uploaded and no project code is run.

It uses two kinds of checks:

- **Built-in checks** (no extra install): hard-coded secrets and keys, committed `.env` files, secrets in public
  front-end variables, unpinned CI actions, risky Android/iOS settings (cleartext traffic, trusted user CAs,
  debuggable or backed-up release builds, exported components, old target SDK), risky Spring Boot settings, and
  third-party scripts without integrity hashes.
- **Code rules** (needs [Semgrep](https://semgrep.dev)): over 100 rules for JavaScript/TypeScript, Python,
  Java/Kotlin, Swift and Dart — SQL injection, SSRF, open redirects, weak password hashing, JWT mistakes, disabled
  TLS verification, insecure token storage, unsafe WebViews and more.

Every finding is linked to a control in your plan, with the file and line. Each control gets a status:

| Status | Meaning |
|---|---|
| Failed | A check found a problem. |
| Passed | Checks ran and found nothing. Good evidence — not a guarantee. |
| Needs review | No tool can check this; a person must ([sign-off](/docs/guides/sign-offs/)). |
| Not checked | Checks exist but could not run (Semgrep missing or crashed). Never reported as passed. |

```bash
seckit audit                           # text report; exit code 1 on high/critical failures
seckit audit --fail-on critical        # only fail on critical
seckit audit --format sarif -o seckit.sarif   # for GitHub code scanning
```

Exit codes: `0` passed, `1` failures at or above `--fail-on`, `2` incomplete (the scanner crashed or timed out).
