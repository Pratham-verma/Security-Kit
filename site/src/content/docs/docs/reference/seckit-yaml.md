---
title: seckit.yaml
description: The app description file that drives your plan.
sidebar: { order: 1 }
---

`seckit.yaml` lives in your project's root folder. The website, the CLI, the scan and the MCP server all read it.

```yaml
version: 1
app:
  name: shop
  platforms: [web, backend]        # web, backend, android, ios
  data_sensitivity: medium         # low, medium, high
  assurance_level: 2               # 1, 2, 3 (OWASP ASVS levels)
standards: [asvs, owasp_top10, owasp_api_top10, pci_dss, cwe]
ai_assistants: [agents_md, claude] # agents_md, claude, cursor, copilot
components:
  - type: auth
    methods: [email_password, oauth]
  - type: database
    engine: postgres
    kind: sql
  - type: payments
    provider: stripe
    webhooks: true
```

- **components** — one entry per part of your app. `type` is a component from the
  [controls reference](/docs/controls/); the other keys are its options. Leave an option out when you are not sure:
  every control that could apply is included.
- A component type can appear more than once (for example two databases); give each a `name`.
- **standards** — which standards to report against. Filled in automatically from your platforms and components.

The schema is `schemas/seckit.schema.json` in the repository. `seckit validate` checks a file.
