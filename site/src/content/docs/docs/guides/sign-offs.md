---
title: Sign-offs
description: Record human decisions for controls no tool can verify.
sidebar: { order: 5 }
---

Many important controls can't be proven by a scan — *"users can only see their own orders"*, *"backups are
encrypted and restores are tested"*. A **sign-off** records that a person verified it, who, when, and how.

Each sign-off is one of:

- **Done** — with evidence of how it was verified (for example *"tested with a second account: 403, see PR #42"*).
- **Not applicable** — with the reason.
- **Risk accepted** — with the reason **and an expiry date**, after which the audit flags it again.

```bash
seckit attest API-C1 --status done --evidence "Tested with a second account: 403 (PR #42)"
seckit attest PAY-C8 --status not_applicable --reason "No in-app purchases"
seckit attest LOG-C5 --status risk_accepted --reason "Alerting lands in Q3" --expires 2026-12-31
seckit attest                       # list sign-offs
```

Sign-offs are saved in `.seckit/attestations.yaml` — commit it so they are reviewed like code. A sign-off **never
hides a failing automated check**; only an expiring risk acceptance does. AI tools connected through MCP can read
your plan but cannot sign anything off.
