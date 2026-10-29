# @seckit/ui

Security Kit in your browser. The same engine as the `seckit` CLI, for people who prefer clicking to typing:

1. **Describe your app** — a form pre-filled from auto-detection (frameworks, databases, payments, mobile…).
   The number of security checks updates live as you answer.
2. **Get your kit** — choose how you want to work:
   - **Checklist** — every check your app needs, most important first, with "how to check" and "how to do it"
     for each. Tick items off (saved to `.seckit/checklist.yaml`), download as Markdown or print it.
   - **AI prompt** — one ready-made prompt for Claude Code, Cursor, GitHub Copilot, Gemini CLI, Codex or any AI
     coding tool. Choose "check and fix my existing code" or "follow these rules while building", and how much
     (everything, critical + high, critical only). Copy it, download it, or save it as `.seckit/AI-PROMPT.md`.

**Advanced** (sidebar): the automatic scan (`seckit audit`: built-in checks + Semgrep, JSON/SARIF export),
the full security plan with standards mapping, sign-offs (`.seckit/attestations.yaml`), and AI tools setup
(rules files and the MCP server).

## Run it

```bash
npx seckit ui                     # the app for the project in the current folder
npx seckit ui --dir path/to/app   # or another folder
```

It prints a link like `http://127.0.0.1:4777/#token=…` and opens your browser. Install Semgrep
(`pip install semgrep`) for the full code checks; without it only the built-in checks run.
Options: `--port <n>`, `--no-open`, `--no-semgrep`, `--listen <addr>` (containers only).

## Hosted mode (the website)

`npm run build` also produces `dist/hosted/` — the same app with the engine running in the browser
(`src/app/hosted-backend.ts`): describe, checklist and AI prompt, stored in local storage, nothing uploaded.
The website copies it to `/app`. Anything that needs the user's code points to the CLI.

## Security design

The UI can write files in your project, so the local server is locked down:

- **Loopback only** — listens on `127.0.0.1`, never on your network.
- **One-time token** — every API call needs the random token from the printed link. It travels in the URL
  fragment, which browsers never send to servers or put in `Referer` headers.
- **DNS-rebinding and cross-site protection** — requests whose `Host` is not `127.0.0.1:<port>` /
  `localhost:<port>` are refused, as are cross-origin requests and non-JSON writes.
- **Strict CSP** — `script-src 'self'`, no inline scripts or styles, no third-party assets; the page cannot
  load anything from the internet. All text from your project is inserted as text, never as HTML.
- **Writes stay in the project** — only `seckit.yaml`, `.seckit/` and the AI rules files, through the same
  symlink-safe paths as the CLI. Sign-offs are human decisions: the UI records them, the MCP server cannot.
