---
title: Check every pull request
description: Run Security Kit in CI and see results in GitHub code scanning.
sidebar: { order: 8 }
---

Run the scan on every pull request so new problems are caught before they are merged:

```yaml
# .github/workflows/security-kit.yml (outline — pin actions to commit SHAs)
on: [pull_request]
jobs:
  security-kit:
    runs-on: ubuntu-latest
    permissions: { contents: read, security-events: write }
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version: 22 }
      - uses: actions/setup-python@<sha>
        with: { python-version: '3.12' }
      - run: pip install semgrep
      - run: npx seckit generate --check        # plan files are up to date
      - run: npx seckit audit --format sarif -o seckit.sarif
      - uses: github/codeql-action/upload-sarif@<sha>
        if: always()
        with: { sarif_file: seckit.sarif }
```

The repository's `examples/ci/github-actions.yml` is a complete version with actions pinned to commit SHAs.
`seckit audit` exits with `1` when there are failures at or above `--fail-on` (default: high), which fails the job.
