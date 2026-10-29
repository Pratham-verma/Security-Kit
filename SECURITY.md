# Security policy

Security Kit is a security tool, so we take vulnerabilities in it seriously.

## Reporting a vulnerability

**Please do not open a public issue.** Use GitHub's private vulnerability reporting
("Report a vulnerability" on the repository's Security tab). Include:

- what is affected (package, version, website page) and the impact,
- steps or a minimal proof of concept to reproduce,
- any suggested fix.

We aim to acknowledge reports within 3 working days and to agree on a fix and disclosure timeline with you.
We are happy to credit reporters.

## Scope

In scope: the npm packages (`seckit`, `@seckit/*`), the Docker image, the website and hosted app, and the
knowledge base (for example a control or rule that gives dangerously wrong advice).

Not a vulnerability in Security Kit: a missed finding or false positive in a user's project (please open a normal
issue with a code sample), or problems in projects that use Security Kit.

## Design notes

- The hosted app has no backend and runs under a strict Content-Security-Policy (`script-src 'self'`).
- `seckit ui` listens on 127.0.0.1 only, requires a per-session token, and checks `Host` and `Origin`.
- The MCP server is read-only and cannot sign anything off.
