# seckit

**Security Kit** — describe your app, get the security it actually needs.

```bash
npx seckit init        # describe your app (detects your stack, asks a few questions)
npx seckit checklist   # your security checklist
npx seckit prompt      # a prompt for Claude Code, Cursor, Copilot, Gemini CLI or Codex
npx seckit audit       # scan your code (install Semgrep for the full code checks)
npx seckit ui          # the full app in your browser, for this project
```

Controls are mapped to OWASP ASVS, MASVS, Top 10, API Top 10, LLM Top 10, PCI DSS and CWE.
Everything runs on your machine; nothing is uploaded. Apache-2.0.
