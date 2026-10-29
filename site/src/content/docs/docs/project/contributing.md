---
title: Contributing
description: Add a control, a detection rule or a code rule — or improve the docs.
sidebar: { order: 3 }
---

Security Kit is built in the open, and the knowledge base is where contributions help most.

- **Found a false positive, or a missed problem?** Open an issue with a small code sample.
- **Add or improve a control:** edit the component YAML in `knowledge-base/components/`. Each control needs
  guidance, a one-line AI rule, how to verify it, and standard mappings.
- **Add a code rule:** add a Semgrep rule in `knowledge-base/rules/semgrep/` with `metadata.seckit-controls`, and a
  test file in `tests/` with `ruleid:` and `ok:` examples. Rules favour precision: a noisy rule teaches people to
  ignore the scan.
- **Improve detection:** dependency names live in `packages/core/src/detect.ts`.

See `CONTRIBUTING.md` in the repository for the development setup and how to run the tests.
