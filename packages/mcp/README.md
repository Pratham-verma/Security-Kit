# @seckit/mcp

An MCP server that lets AI coding assistants use your app's Security Kit plan **while they write
code**: they ask which rules apply to the file they are editing, and check their code before they finish.

| Tool | What the assistant gets |
|---|---|
| `get_controls_for_file` | The controls that apply to a file (detected from its path and code), with the rule to follow and the `@seckit/node` / `@seckit/web` helper to use. Works for files that do not exist yet. |
| `check_code` | Checks a snippet for hard-coded secrets and, with Semgrep installed, the full rule pack (injection, XSS, SSRF, weak hashing, JWT misuse, …). Returns issues with fixes. |
| `get_security_plan` | The whole plan, optionally for one component. |
| `explain_control` | Guidance, standards and verification steps for a control or threat ID. |
| `run_audit` | `seckit audit` on the whole project. |

## Setup

The server reads `seckit.yaml` from the directory it is started in (or `--dir`). Run `seckit init`
and `seckit generate` first.

**Claude Code**

```bash
claude mcp add seckit -- npx -y @seckit/mcp@0.1.0
```

or commit a project-scoped `.mcp.json`:

```json
{ "mcpServers": { "seckit": { "command": "npx", "args": ["-y", "@seckit/mcp@0.1.0"] } } }
```

**Cursor** — `.cursor/mcp.json`: same shape as `.mcp.json` above.

**VS Code / GitHub Copilot** — `.vscode/mcp.json`:

```json
{ "servers": { "seckit": { "type": "stdio", "command": "npx", "args": ["-y", "@seckit/mcp@0.1.0"] } } }
```

> `@seckit/mcp` is not published to npm yet. Until it is, build this repository and point the
> command at `node /path/to/Security-Kit/packages/mcp/dist/bin.js`.

## Security design

- **Read-only.** Every tool is annotated `readOnlyHint: true`; none writes files or reaches the network.
- **No sign-off tool on purpose.** Attestations (`seckit attest`) are human decisions; an assistant
  must not be able to approve its own work.
- **Stays inside the project.** Paths outside the project root, or that escape it through symlinks,
  are refused. Files over 1 MB and snippets over 256 KB are rejected.
- **Local only.** stdio transport, no listening socket. Code checked by `check_code` is written to a
  private temp directory, scanned locally (Semgrep with metrics off, 60 s timeout) and deleted.
- **No secret echo.** Findings show at most the first four characters of a detected secret.
- **Zero runtime dependencies beyond Security Kit itself.** The MCP protocol layer (JSON-RPC over
  stdio) is implemented in about 125 lines; it is tested against the official MCP SDK client, which is
  only a dev dependency.
