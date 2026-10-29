---
title: MCP server
description: Let your AI coding tool look up the controls for the file it is editing and check its own code.
sidebar: { order: 7 }
---

The Security Kit MCP server gives AI tools five read-only tools: the security plan, the controls that apply to a
file, checking a code snippet, explaining a control, and running the audit. The AI can **read** your plan but can
**never sign anything off**, and it cannot reach files outside your project.

| Tool | Configuration |
|---|---|
| Claude Code | `claude mcp add seckit -- npx -y @seckit/mcp@0.1.0`, or `.mcp.json`: `{ "mcpServers": { "seckit": { "command": "npx", "args": ["-y", "@seckit/mcp@0.1.0"] } } }` |
| Cursor | `.cursor/mcp.json` — same as `.mcp.json` |
| VS Code / Copilot | `.vscode/mcp.json`: `{ "servers": { "seckit": { "type": "stdio", "command": "npx", "args": ["-y", "@seckit/mcp@0.1.0"] } } }` |

Until the packages are on npm, use `node /path/to/Security-Kit/packages/mcp/dist/bin.js` as the command.
