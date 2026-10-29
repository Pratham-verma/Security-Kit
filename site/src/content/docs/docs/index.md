---
title: What is Security Kit?
description: Security Kit gives your app the security it actually needs — a tailored checklist and AI prompt, mapped to OWASP, MASVS, PCI DSS and CWE.
---

Security Kit is like an app kit, but for security. You describe your application — its logins, payments,
file uploads, APIs, mobile app or AI features — and Security Kit gives you **only the security controls your app
needs**, each mapped to the standards that matter (OWASP ASVS, MASVS, Top 10, API Top 10, LLM Top 10, PCI DSS, CWE).

Then you choose how to work through them:

- **A checklist** — every check, most important first, with what to verify and how to fix it. Tick them off as you go.
- **A prompt for your AI tool** — paste it into Claude Code, Cursor, GitHub Copilot, Gemini CLI or Codex. The AI
  reviews your code item by item, fixes what is missing, and reports back.

## Two ways to use it

| | In your browser | On your computer (CLI / Docker) |
|---|---|---|
| Describe your app | ✅ | ✅ |
| Checklist and AI prompt | ✅ | ✅ |
| Scan your code automatically | — | ✅ |
| Sign-offs, rules files for AI tools, MCP | — | ✅ |
| Where your data lives | This browser only | Your project folder |

Start in the browser at [/app](/app/) — no install, no account. When you want proof, save your answers as
`seckit.yaml` in your project and run the [automatic scan](/docs/guides/scan/) on your machine.

## What it covers

Web frontends, backends and APIs (Node.js, Python, Java/Spring and more), Android and iOS apps (native and
Flutter / React Native), and AI features. Browse every [security control](/docs/controls/).

:::note
Security Kit helps you find and fix common security problems. A passing checklist or scan is strong evidence,
not a guarantee — for high-risk apps, combine it with a professional review.
:::
