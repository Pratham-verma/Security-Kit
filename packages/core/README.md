# @seckit/core

The Security Kit engine: the knowledge base (components, threats, controls, standards mappings), manifest
validation, control resolution, detection, and the checklist / AI prompt / plan renderers.

- `@seckit/core` — Node: loads the knowledge base and projects from disk.
- `@seckit/core/browser` — browsers: the same engine with the knowledge base compiled in and pre-compiled
  validators (works under a Content-Security-Policy without `unsafe-eval`).
- `@seckit/core/engine` — the pure engine only.

Apache-2.0.
