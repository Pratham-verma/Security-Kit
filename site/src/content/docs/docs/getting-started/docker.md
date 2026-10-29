---
title: Run it with Docker
description: The Security Kit image includes the CLI, the browser app, the MCP server and Semgrep.
---

The Docker image needs nothing else installed. Build it from the repository (`docker build -t security-kit .`),
then run it **from your project folder**:

```bash
# The full app in your browser — open the link it prints
docker run --rm -it -p 127.0.0.1:4777:4777 -v "$PWD:/project" --user "$(id -u):$(id -g)" security-kit

# CLI commands
docker run --rm -v "$PWD:/project" --user "$(id -u):$(id -g)" security-kit init --yes
docker run --rm -v "$PWD:/project" --user "$(id -u):$(id -g)" security-kit audit
```

- `-v "$PWD:/project"` lets the container read your project folder (and write `seckit.yaml` and `.seckit/`).
- `--user` keeps the files it writes owned by you.
- Keep `-p 127.0.0.1:4777:4777` exactly like that: it exposes the app to your own machine only.

## A link that survives restarts

Each start prints a new private link. For a long-running container, give it a fixed key:

```bash
docker run -d --name security-kit-ui --restart unless-stopped -p 127.0.0.1:4777:4777 \
  -e SECKIT_UI_TOKEN="$(openssl rand -hex 24)" -v "$PWD:/project" --user "$(id -u):$(id -g)" security-kit
docker logs security-kit-ui | grep http
```
