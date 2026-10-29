# Security Kit

**Security that fits your app.** Security Kit helps developers build more secure applications by turning
application requirements into actionable security controls. Describe what your application does — web, backend,
Android, iOS, AI features, and the AWS services it runs on — and Security Kit generates a tailored security
checklist mapped to OWASP ASVS, MASVS, Top 10, API Top 10, LLM Top 10, PCI DSS, CWE and the CIS AWS Benchmarks.
Work through it yourself, or turn it into a structured **prompt** for your AI coding tool (Claude Code, Cursor,
GitHub Copilot, Gemini CLI, Codex) to check, fix or test your code.

- 🌐 **In your browser** — the hosted app runs entirely client-side: no account, nothing uploaded.
- 💻 **On your computer** — `npx seckit` scans your code against the same plan, records sign-offs and writes
  security rules for your AI tools. Also available as a Docker image.
- 🔒 **Private by design** — no backend, no telemetry; your code never leaves your machine.

> **Status: v0.1.0, pre-release.** The website and npm packages are being prepared. Until they are published,
> run it from source (below) or with Docker.

## Quick start

### In the browser

Open the hosted app (`/app` on the Security Kit website), click **Describe your app**, and choose
**Checklist** or **AI prompt**. Download `seckit.yaml` to keep your answers with your code.

### On your computer

```bash
cd your-project
npx seckit init        # detects your stack, asks a few questions, writes seckit.yaml
npx seckit checklist   # your security checklist (Markdown)
npx seckit prompt      # a prompt for Claude Code, Cursor, Copilot, Gemini CLI or Codex
npx seckit audit       # scan your code (install Semgrep for the full code checks: pip install semgrep)
npx seckit ui          # the full app in your browser, connected to this project
npx seckit generate    # write rules into CLAUDE.md, AGENTS.md, Cursor and Copilot instruction files
```

### With Docker

```bash
docker build -t security-kit .
docker run --rm -it -p 127.0.0.1:4777:4777 -v "$PWD:/project" --user "$(id -u):$(id -g)" security-kit   # the app
docker run --rm -v "$PWD:/project" --user "$(id -u):$(id -g)" security-kit audit                          # the scan
```

Keep `-p 127.0.0.1:4777:4777` exactly like that — it exposes the app to your own machine only.

## What's inside

| Package | What it is |
|---|---|
| [`seckit`](packages/seckit) | The `npx seckit` command (CLI + browser app) |
| [`@seckit/core`](packages/core) | The engine and knowledge base; runs in Node and in browsers |
| [`@seckit/cli`](packages/cli) | `init`, `generate`, `checklist`, `prompt`, `audit`, `attest`, `explain` |
| [`@seckit/ui`](packages/ui) | The browser app — local mode (`seckit ui`) and hosted mode (the website) |
| [`@seckit/mcp`](packages/mcp) | MCP server: AI tools look up controls and check code while they work |
| [`@seckit/node`](packages/node), [`@seckit/web`](packages/web) | Small helpers that implement common controls (password hashing, headers, SSRF-safe fetch, safe HTML…) |
| [`site/`](site) | The website: landing page, hosted app and documentation |
| [`knowledge-base/`](knowledge-base) | 17 components (12 app, 5 AWS cloud), 153 controls, 126 Semgrep rules — plain YAML |

The automatic scan covers JavaScript/TypeScript, Python, Java/Kotlin (Android and Spring), Swift, Dart
(Flutter) and Terraform for AWS: leaked secrets, injection, SSRF, weak password hashing, JWT mistakes, disabled TLS verification,
insecure mobile storage and configuration, risky Spring Boot settings, and more.

## Documentation

The full documentation is in [`site/src/content/docs/docs/`](site/src/content/docs/docs) and on the website at
`/docs`, including a reference page for every control.

## Contributing

Contributions are welcome — especially to the knowledge base (controls, detection, code rules). See
[CONTRIBUTING.md](CONTRIBUTING.md). Please report security issues privately as described in
[SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
