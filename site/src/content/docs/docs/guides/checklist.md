---
title: The checklist
description: Work through every security check your app needs, most important first.
sidebar: { order: 2 }
---

The checklist lists every control in your plan, grouped by part of your app, **critical and high first**.

Open an item to see:

- **How to check** — how to verify it is done (for example *"11-character and known-breached passwords are rejected"*).
- **How to do it** — what to implement, in plain words.
- **Ready-made help** — helper functions in `@seckit/node` / `@seckit/web`, or Android and iOS APIs to use.
- **Standards** — the OWASP, MASVS, PCI DSS and CWE requirements it covers.

Tick an item only when it is implemented **and** you checked it. Filter by *To do* / *Done* or by severity, or search.

## Saving and sharing

- In the browser, ticks are saved in that browser. **Download** saves a Markdown copy with your ticks — good for a
  pull request or a team wiki — and **Print** gives a paper version.
- On your computer (`seckit ui`), ticks are saved in `.seckit/checklist.yaml`. Commit it to share progress.
- From the command line: `seckit checklist -o SECURITY-CHECKLIST.md`.

## Want proof?

Ticks are your word. The [automatic scan](/docs/guides/scan/) checks your code for many of these items; for the
rest, record a [sign-off](/docs/guides/sign-offs/) with how it was verified.
