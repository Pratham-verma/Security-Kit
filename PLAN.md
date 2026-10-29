# Security Kit — Plan

## 1. Vision

Security Kit gives every developer — web, Android, iOS, backend — a **security plan and
code tailored to their own application**, aligned with recognized standards, and makes sure
that plan is followed whether the code is written by a human or by an AI assistant.

The developer does not pick from a generic checklist. They **describe their app**, and the kit
generates exactly the security it needs.

```
 1. DESCRIBE            2. ANALYZE               3. GENERATE               4. APPLY & VERIFY
 seckit.yaml       ──►  components → threats ──►  plan, checklist,     ──►  developer / AI applies,
 (wizard, auto-         (STRIDE) → controls       code snippets, tests,     `seckit audit` checks
  detect, or AI)        (ASVS / MASVS / OWASP)    AI rules pack             every control (local + CI)
```

## 2. Principles

1. **Tailored, not generic** — only controls that apply to the described components are emitted.
2. **Standards-traceable** — every control maps to ASVS / MASVS / OWASP Top 10 / CWE IDs.
3. **AI-native** — every control carries an `ai_rule`, so AI assistants (Claude Code, Cursor,
   Copilot, …) write code that follows the plan from the first line.
4. **Verifiable** — a control without a way to verify it is only advice; aim for automated checks.
5. **Never roll our own crypto** — wrap libsodium, Argon2, platform keystores, WebCrypto.
6. **The kit must be secure itself** — minimal pinned deps, signed releases (npm provenance /
   Sigstore), SBOM, CodeQL, fuzzing, SECURITY.md, external audit before v1.0.

## 3. Standards

| Area                  | Standard                                                    |
|-----------------------|-------------------------------------------------------------|
| Web apps / APIs       | OWASP ASVS (4.0.3 now, migrate to 5.0), OWASP Top 10 2021, OWASP API Top 10 2023 |
| Mobile                | OWASP MASVS v2 + MASTG                                      |
| AI features           | OWASP Top 10 for LLM Applications                           |
| General               | CWE Top 25, NIST SP 800-63B (auth), NIST SP 800-57 (keys)   |
| Compliance (later)    | ISO 27001, SOC 2, PCI-DSS, GDPR mappings                    |

## 4. Architecture

### 4.1 App manifest — `seckit.yaml`
Describes the application: platforms, data sensitivity, assurance level, and components with
their options. Schema: `schemas/seckit.schema.json`. Example: `examples/shop-app/seckit.yaml`.

Created by: `seckit init` wizard · auto-detection from code · an AI assistant.

### 4.2 Knowledge base — `knowledge-base/components/*.yaml`
One file per component type. Each file defines:

- `options` — JSON Schema for what the manifest may say about the component
- `threats` — what can go wrong (STRIDE category, CWE)
- `controls` — what to do about it, each with:
  - `mitigates` (threat IDs), `severity`, `level` (1–3, ASVS-style)
  - `platforms`, `when` (conditions on component options; an option the manifest leaves unset
    counts as matching, so missing answers add controls rather than silently dropping them)
  - `standards` (ASVS / MASVS / OWASP / CWE IDs)
  - `guidance` (for humans), `ai_rule` (one-line instruction for AI assistants)
  - `verify` (manual / semgrep / test / config)

Schema: `schemas/component.schema.json`. The KB is the core product asset and the main place
for open-source contributions.

### 4.3 Engine — `@seckit/core`
Loads + validates the KB and manifest, then resolves the manifest into the list of applicable
controls (filtered by component, options, platform, assurance level).

### 4.4 Outputs (Phase 1+)
```
.seckit/
  SECURITY-PLAN.md      threat model + checklist for this app
  controls.json         machine-readable required controls
  snippets/             code per platform/framework
  tests/                security tests per control
AGENTS.md / CLAUDE.md / .cursor/rules/security.mdc / .github/copilot-instructions.md
```

### 4.5 AI integration
1. **Rules pack** — tailored `ai_rule`s written into the AI assistants' instruction files.
2. **MCP server** (`@seckit/mcp`) — tools such as `get_controls_for_file`, `check_code`,
   `explain_control` so assistants consult the kit while writing code.
3. **Verification** — `seckit audit` (Semgrep rules + config checks) on pre-commit and CI
   (SARIF to GitHub) catches violations regardless of who wrote the code.

### 4.6 SDKs (building blocks used by generated code)
`@seckit/node`, `@seckit/web`, then Kotlin (Android), Swift (iOS), Python. Native per platform,
sharing the KB and a conformance test suite.

## 5. Roadmap

| Phase | Deliverable | Status |
|-------|-------------|--------|
| **0** | Manifest schema, KB schema, core engine (load/validate/resolve), first components: `auth`, `file_upload`, `database` | done |
| 0.5   | Remaining core components: `api`, `session`, `payments`, `mobile_storage`, `secrets`, `logging`, `ai_feature` (10 components, 80 controls total) + auto-detection for each | done |
| **1** | `seckit` CLI: `init` (wizard + Node/web auto-detect), `generate` (SECURITY-PLAN.md, controls.json, AI rules pack), `generate --check`, `validate`, `explain` | done (code snippets + per-control tests move to Phase 2) |
| **2** | `seckit audit` (built-in checks + Semgrep rule pack, text/JSON/SARIF, `--fail-on`), `@seckit/node` SDK, `web_frontend` component, GitHub Actions template | done |
| 2b    | `@seckit/web` browser SDK (sanitized HTML, Trusted Types, in-memory token store); attestations for manual controls (`seckit attest`); Semgrep rules for Python, Kotlin, Java, Swift (60 total); Python auto-detection | done |
| **3** | `@seckit/mcp` MCP server: `get_controls_for_file`, `check_code`, `get_security_plan`, `explain_control`, `run_audit`; read-only, no sign-off tool; dependency-free stdio protocol tested against the official SDK client | done |
| **4** | `mobile_platform` component (TLS, pinning, WebViews, deep links, exported components, debuggable builds, integrity, biometrics); native detection (Gradle, CocoaPods, SwiftPM, Flutter); MASVS config checks; mobile Semgrep rules; Network Security Config / backup rules / ATS templates; Android & iOS implementation guidance per control | done |
| 4c    | Java/Spring backends (Maven + Gradle detection, Spring Semgrep rules, `application.properties`/`.yml` checks) and Dart/Flutter Semgrep rules (104 rules total) | done |
| 4d    | `@seckit/ui`: local web UI (127.0.0.1 + one-time token, strict CSP) for the whole flow — describe, plan, checks, sign-offs, AI assistant setup | done |
| **0.1** | Open-source product: browser-safe core (Node + browser, byte-identical output, pre-compiled validators), hosted app (engine in the browser, folder detection read locally, import/export `seckit.yaml`), website + docs (Astro/Starlight, a page per control), `npx seckit` package with `seckit ui`, checklist + AI prompt flow, Docker, CI/release workflows, community files | done — publishing pending (GitHub, npm, Vercel accounts) |
| 4b    | Native SDK libraries (Kotlin AAR, Swift package) — needs a build machine with the Android SDK and Xcode, and CI on macOS, so the code is compiled and tested before it ships | todo |
| **5** | Python backends, dashboard, compliance reports | todo |

## 6. Repository layout

```
Security-Kit/
  PLAN.md
  schemas/                 seckit.schema.json, component.schema.json
  knowledge-base/
    components/            auth.yaml, file_upload.yaml, database.yaml, …
  examples/shop-app/       sample seckit.yaml
  packages/
    core/                  @seckit/core — KB loader, validation, control resolver
    cli/                   @seckit/cli — `seckit` init / generate / validate / explain
    node/                  @seckit/node — SDK helpers mapped to controls
    web/                   @seckit/web — browser SDK (DOMPurify, Trusted Types, token store)
    mcp/                   @seckit/mcp — MCP server for AI assistants
```

## 7. Open decisions

- Distribution: open-source core (Apache-2.0), paid dashboard/compliance reports later.
- Package manager: npm workspaces now; may move to pnpm + Turborepo as packages grow.
- Wizard prompts are dependency-free (node:readline) to keep the supply chain small; revisit if UX needs more.
- ASVS version: KB uses 4.0.3 IDs; add 5.0 mappings once the KB format is stable.
- KB gaps noticed: no component yet for dependency vulnerabilities (OWASP A06), OS command
  injection (CWE-78) or unsafe deserialization (CWE-502); mobile network security (cleartext
  traffic, trust-all TLS, pinning) waits for the Phase 4 `mobile_platform` component. Add these
  before claiming full Top 10 / MASVS coverage.
