---
title: Rules for AI tools
description: Write your security rules into the files Claude Code, Cursor, Copilot and other AI tools read automatically.
sidebar: { order: 6 }
---

`seckit generate` writes your plan into the instruction files AI coding tools read on their own, so every
session follows your security rules without pasting a prompt:

| Tool | File |
|---|---|
| Codex, Gemini CLI, Jules, Zed and other AGENTS.md-aware tools | `AGENTS.md` |
| Claude Code | `CLAUDE.md` |
| Cursor | `.cursor/rules/security-kit.mdc` |
| GitHub Copilot | `.github/copilot-instructions.md` |

It also writes `.seckit/SECURITY-PLAN.md` (the full plan for your team) and `.seckit/controls.json`. In existing
files, Security Kit only replaces its own marked block — your other instructions are kept. Choose the tools in
`seckit.yaml` (`ai_assistants`). In CI, `seckit generate --check` fails if the files are out of date.
