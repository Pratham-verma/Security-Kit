# Contributing to Security Kit

Thanks for helping! The most valuable contributions are to the **knowledge base**: better controls, more accurate
standard mappings, detection for more frameworks, and precise code rules.

## Development setup

Requires Node.js 20+ (and Python 3 + `pip install semgrep` for the code-rule tests).

```bash
npm install
npm run build          # core → cli → node → web → mcp → ui
npm test               # all packages
npm run typecheck
SECKIT_SEMGREP=$(which semgrep) npm test    # also runs the Semgrep rule tests and Semgrep-backed audit tests
npm run validate:kb    # validate the knowledge base and print the plan for each example
npm run build:site     # build the website (landing, hosted app, docs) into site/dist
npm run seckit -- --help                    # run the CLI from source
```

> **VirtualBox shared folders:** `vboxsf` does not allow symlinks, which npm workspaces need
> (`EPERM ... symlink`). Keep the repo on the VM's own disk, or enable symlinks for the share on the host:
> `VBoxManage setextradata "<VM>" VBoxInternal2/SharedFoldersEnableSymlinksCreate/<share> 1` and restart the VM.

## Repository layout

```
knowledge-base/components/   one YAML file per component: threats, controls, standards
knowledge-base/rules/semgrep/ code rules, with test files in tests/
schemas/                     JSON Schemas for components, seckit.yaml and attestations
packages/core                engine (runs in Node and browsers); src/generated/ is built from the KB
packages/cli                 CLI, audit (built-in checks + Semgrep)
packages/ui                  browser app: local server (src/server), app (src/app), shared model (src/shared)
packages/mcp                 MCP server
packages/node, packages/web  helper libraries
site/                        Astro + Starlight website
```

## Adding or changing a control

1. Edit `knowledge-base/components/<id>.yaml` (schema: `schemas/component.schema.json`).
2. Every threat needs at least one mitigating control. Every control needs `guidance`, a one-line `ai_rule`,
   at least one `verify` entry, and standard IDs. Use `when` for controls that only apply to some answers.
3. Run `npm run generate -w @seckit/core` — this refreshes `packages/core/src/generated/` (the browser build of
   the knowledge base). A test fails if you forget.
4. Run `npm run validate:kb` and `npm test -w @seckit/core`.

## Adding a code rule

1. Add a rule to `knowledge-base/rules/semgrep/<component>.yaml`. Its id is `seckit.<control-id>.<name>` and
   `metadata.seckit-controls` lists the controls it checks.
2. Add examples to `knowledge-base/rules/semgrep/tests/<component>.<ext>` with `// ruleid: <id>` above code that
   must be flagged and `// ok: <id>` above safe code.
3. Run `semgrep --test --config knowledge-base/rules/semgrep/ knowledge-base/rules/semgrep/tests/`.
4. Rules favour **precision over recall**: a noisy rule teaches people to ignore the scan.

## Detection

Dependency → component mappings live in `packages/core/src/detect.ts`. Detection reads files through a
`FileSource`, so it runs the same on disk (CLI) and in the browser; add a test in `packages/core/test/`.

## Pull requests

- Keep changes focused; add tests.
- Note which control IDs a change touches (e.g. `AUTH-C2`).
- The UI must stay free of `innerHTML` and inline scripts (it runs under a strict Content-Security-Policy).

By contributing you agree that your contributions are licensed under the Apache-2.0 license.
