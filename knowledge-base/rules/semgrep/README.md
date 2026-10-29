# Security Kit Semgrep rules

Rules used by `seckit audit`. Each rule declares the controls it verifies in
`metadata.seckit-controls`; `seckit audit` only runs rules for controls in the app's plan.

- One file per knowledge-base component. Rule IDs start with `seckit.<control>.`
- Test fixtures live in `tests/<same-name>.<ext>` with `// ruleid:` / `// ok:` annotations.
  Run: `semgrep --test --config knowledge-base/rules/semgrep/ knowledge-base/rules/semgrep/tests/`
- Rules favour precision over recall: a noisy rule teaches people to ignore the audit.
