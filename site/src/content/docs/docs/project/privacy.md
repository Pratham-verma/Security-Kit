---
title: Privacy and security
description: What Security Kit does with your data — in short, nothing leaves your machine.
sidebar: { order: 1 }
---

## The website

- The website is static files. There is **no backend, no database and no account**.
- The app at `/app` runs entirely in your browser. Your answers and checklist ticks are stored in your browser's
  local storage; **Clear my answers** removes them.
- **Detect from my project** reads dependency and config files from the folder you pick, in your browser. Files are
  not uploaded. `.env` files are never opened.
- No cookies, no analytics, no third-party scripts. A strict Content-Security-Policy blocks loading anything else.

## The CLI, local app and Docker image

- Everything runs on your computer. Scans read your files; they never send them anywhere and run no project code.
- No telemetry. Semgrep runs with its metrics turned off.
- `seckit ui` listens on `127.0.0.1` only, requires a private key in its link, and refuses requests from other
  websites. It only writes `seckit.yaml`, `.seckit/` and AI rules files inside your project.

## Reporting a vulnerability

Please report security issues in Security Kit privately, as described in the repository's `SECURITY.md` —
not in a public issue.
