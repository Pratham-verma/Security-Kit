---
title: CLI commands
description: Every seckit command and option.
sidebar: { order: 2 }
---

| Command | What it does |
|---|---|
| `seckit init [--yes] [--force]` | Describe your app (auto-detects, then asks) and write `seckit.yaml`. `--yes`: detection only. |
| `seckit generate [--check]` | Write `.seckit/SECURITY-PLAN.md`, `controls.json` and AI tool rules. `--check`: exit 1 if out of date. |
| `seckit checklist [--format md\|json]` | Print the checklist (with ticks from `.seckit/checklist.yaml`). |
| `seckit prompt [--mode audit\|build]` | Print the AI prompt: review and fix existing code (default) or rules while building. |
| `seckit audit [--format text\|json\|sarif]` | Scan the code against the plan. |
| `seckit attest [ID] [--status s]` | Record a sign-off (no ID: list them). |
| `seckit ui [--dir path]` | Open the full app in your browser for this project. |
| `seckit validate` | Check `seckit.yaml`. |
| `seckit explain <ID>` | Explain a control or threat, e.g. `seckit explain AUTH-C2`. |

## Options

| Option | For | Meaning |
|---|---|---|
| `--dir <path>` | all | Project directory (default: current directory) |
| `-o, --output <file>` | audit, checklist, prompt | Write to a file instead of the terminal |
| `--min-severity <s>` | checklist, prompt | Only `critical`, `high`, `medium` or `low` and above |
| `--fail-on <sev>` | audit | Exit 1 at or above this severity (default `high`; `none` never fails) |
| `--no-semgrep` | audit | Built-in checks only |
| `--verbose` | audit | List every control and finding |
| `--status`, `--evidence`, `--reason`, `--expires`, `--by`, `--remove` | attest | See [Sign-offs](/docs/guides/sign-offs/) |

Environment: `SECKIT_SEMGREP` (path to semgrep), `SECKIT_SEMGREP_TIMEOUT` (seconds, default 600),
`SECKIT_UI_TOKEN` (fixed key for `seckit ui`, at least 24 characters).
