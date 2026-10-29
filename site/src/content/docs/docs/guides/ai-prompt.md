---
title: The AI prompt
description: One prompt that makes Claude Code, Cursor, Copilot, Gemini CLI or Codex check and fix your app's security.
sidebar: { order: 3 }
---

The AI prompt contains your app's description and its full security checklist, with a rule and a way to verify
each item. Paste it into an AI coding tool that can read and edit your project.

## Choose what the AI should do

- **Check and fix my existing code** — the AI explores your code, gives every item a result (PASS, FAIL, N/A or
  UNSURE, with `file:line` evidence), fixes each FAIL with tests — critical first — and ends with a report table.
  Anything that needs a human decision is listed separately instead of guessed.
- **Follow these rules while building** — standing rules: for each task, the AI applies the relevant items and
  lists which ones it covered.

**How much?** *Everything*, *Critical + high* or *Critical only*. On a large project, start with critical + high,
then run everything.

## Using it in your tool

| Tool | How |
|---|---|
| Claude Code | Run `claude` in your project folder and paste the prompt. Long prompt: save it as `SECURITY-PROMPT.md` in the project and run `claude "Follow the instructions in SECURITY-PROMPT.md"`. |
| Cursor | Open the chat in **Agent** mode and paste the prompt. |
| GitHub Copilot | In VS Code, open Copilot Chat in **Agent** mode and paste the prompt. |
| Gemini CLI | Run `gemini` in your project folder and paste, or `gemini "Follow the instructions in SECURITY-PROMPT.md"`. |
| Codex CLI | Run `codex` in your project folder and paste, or `codex "Follow the instructions in SECURITY-PROMPT.md"`. |

From the command line: `seckit prompt` (or `--mode build`, `--min-severity high`).

:::tip
Review every change the AI makes, and run the [automatic scan](/docs/guides/scan/) afterwards. AI tools can
make mistakes — the prompt tells them not to weaken protections or disable checks, but you are the reviewer.
:::

To make the rules permanent instead of pasting them, write them into the files your AI tools read automatically —
see [Rules for AI tools](/docs/guides/ai-rules/).
