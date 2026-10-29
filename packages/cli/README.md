# @seckit/cli

The Security Kit command-line tool. Most people install it through the [`seckit`](../seckit) package
(`npx seckit …`), which also includes the browser app.

```bash
seckit init        # describe your app → seckit.yaml
seckit checklist   # your security checklist
seckit prompt      # a prompt for your AI coding tool
seckit audit       # scan your code (built-in checks + Semgrep rules)
seckit generate    # write SECURITY-PLAN.md and rules for AI tools
seckit attest      # record human sign-offs
```

Run `seckit --help` for every option. Apache-2.0.
