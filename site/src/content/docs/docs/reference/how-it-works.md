---
title: How it works
description: The knowledge base, how your plan is chosen, and how standards are mapped.
sidebar: { order: 3 }
---

## The knowledge base

Security Kit's knowledge lives in plain YAML files in the repository (`knowledge-base/components/`). Each
**component** (authentication, payments, mobile storage…) lists:

- **Threats** — what can go wrong (with STRIDE category and CWE).
- **Controls** — what to do about it: severity, assurance level, the platforms and answers it applies to,
  guidance, a one-line rule for AI tools, implementation help, how to verify it, and standard mappings.

## Choosing your controls

Your plan contains a control when all of these hold:

1. Your app has the component.
2. The control's platforms include one of your app's platforms.
3. Its level is at or below your assurance level.
4. Its conditions match your answers — an option you left unanswered counts as a match.

The same engine runs in the browser and in the CLI, so both give exactly the same checklist and prompt.

## Standards

Controls are mapped by hand to OWASP ASVS 4.0.3, OWASP MASVS v2, OWASP Top 10 (2021), API Top 10 (2023),
LLM Top 10 (2025), PCI DSS 4.0, CWE and NIST SP 800-63B. See [controls by standard](/docs/controls/standards/).
The mappings show which controls address a requirement; they are not a compliance certification.
