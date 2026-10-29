# Changelog

## 0.1.0 — first public release (unreleased)

- **Cloud (AWS):** 5 new components — AWS account, compute and web services, storage and backups, managed
  databases, end-user computing — with 55 controls referencing the CIS AWS Foundations, Compute, Database,
  Storage and End User Compute Benchmarks. Every cloud control has AWS CLI **test cases**. AWS is detected from
  Terraform, CloudFormation/SAM, Serverless, CDK, Elastic Beanstalk files and AWS SDK packages; 22 Terraform
  Semgrep rules check the infrastructure code.
- **"Test my app" prompt mode** (`seckit prompt --mode test`): the AI runs every test case read-only, changes
  nothing and reports PASS / FAIL / N/A / NOT RUN. Test cases also appear in the checklist and the other prompts.

- **Hosted app** at `/app`: describe your app, get a checklist or an AI prompt — the engine runs in the browser,
  nothing is uploaded. Detect your stack from a project folder (read locally), import/export `seckit.yaml`.
- **Website and docs** (Astro + Starlight) with a reference page for every control and a by-standard index.
- **`npx seckit`** package: CLI plus the browser app (`seckit ui`).
- **CLI:** `init`, `generate`, `checklist`, `prompt`, `audit`, `attest`, `validate`, `explain`.
- **Knowledge base:** 17 components, 153 controls; 126 Semgrep rules for JS/TS, Python, Java/Kotlin, Swift, Dart, Terraform.
- **Audit:** built-in checks (secrets, `.env`, CI pinning, Android/iOS config, Spring Boot config, SRI) plus
  Semgrep; text, JSON and SARIF output.
- **Local app** (`seckit ui`, Docker): describe, checklist, AI prompt, automatic scan, sign-offs, AI tool setup.
- **MCP server** (`@seckit/mcp`) and helper libraries (`@seckit/node`, `@seckit/web`).
- `@seckit/core` runs in Node and browsers with byte-identical output; validators are pre-compiled so the
  hosted app works under a CSP without `unsafe-eval`.
