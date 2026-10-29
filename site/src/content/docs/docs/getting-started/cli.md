---
title: Install the CLI
description: Run Security Kit on your computer to scan your code, record sign-offs and write rules for your AI tools.
---

The command-line tool does everything the website does, plus what needs your code: the automatic scan,
sign-offs, and writing rules files for AI tools.

:::caution[Not on npm yet]
The packages are being prepared for npm. Until they are published, build from source:
`npm install && npm run build` in the Security Kit repository, then run `node packages/cli/dist/bin.js`
instead of `npx seckit` — or use the [Docker image](/docs/getting-started/docker/).
:::

Requirements: Node.js 20 or newer. For the full code checks, also install [Semgrep](https://semgrep.dev)
(`pip install semgrep`); without it, only the built-in checks run.

```bash
cd your-project
npx seckit init        # detects your stack, asks a few questions, writes seckit.yaml
npx seckit checklist   # prints your checklist (Markdown)
npx seckit prompt      # prints the AI prompt
npx seckit audit       # scans your code
npx seckit ui          # opens the full app in your browser, connected to this project
```

All commands are listed in the [CLI reference](/docs/reference/cli/).
