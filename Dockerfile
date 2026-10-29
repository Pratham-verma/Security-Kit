# Security Kit: CLI, browser UI and MCP server, with Semgrep for full code checks.
#
#   docker build -t security-kit .
#   docker run --rm -it -p 127.0.0.1:4777:4777 -v "$PWD:/project" --user "$(id -u):$(id -g)" security-kit
#   docker run --rm -v "$PWD:/project" --user "$(id -u):$(id -g)" security-kit audit

# ——— build ———
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/node/package.json packages/node/
COPY packages/web/package.json packages/web/
COPY packages/mcp/package.json packages/mcp/
COPY packages/ui/package.json packages/ui/
COPY packages/seckit/package.json packages/seckit/
# The website (site/, Astro) is not part of the image: drop it from the workspaces so none of its
# dependencies are installed. The lockfile still pins every version the tool uses.
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));p.workspaces=['packages/*'];fs.writeFileSync('package.json',JSON.stringify(p,null,2))" \
 && npm install --no-audit --no-fund
COPY schemas schemas
COPY knowledge-base knowledge-base
COPY packages packages
RUN npm run build \
 && rm -rf node_modules packages/*/node_modules \
 && npm install --omit=dev --no-audit --no-fund \
 && rm -rf packages/*/src packages/*/test packages/*/tsconfig*.json packages/*/vitest.config.ts \
 # Readable by any --user; source checkouts (e.g. VM shared folders) can carry owner-only modes.
 && chmod -R u=rwX,go=rX packages schemas knowledge-base node_modules package.json

# ——— runtime ———
FROM node:22-bookworm-slim
ARG SEMGREP_VERSION=1.182.1
# git: lets the audit honour .gitignore. Semgrep lives in its own venv, pinned.
# Timeouts and retries: a stalled mirror connection fails fast instead of hanging the build.
RUN apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 update \
 && apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 install -y --no-install-recommends python3 python3-venv git ca-certificates tini \
 && python3 -m venv /opt/semgrep \
 && /opt/semgrep/bin/pip install --no-cache-dir --timeout 60 --retries 5 "semgrep==${SEMGREP_VERSION}" \
 && ln -s /opt/semgrep/bin/semgrep /usr/local/bin/semgrep \
 && apt-get purge -y python3-venv && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/security-kit
COPY --from=build /src/package.json ./
COPY --from=build /src/node_modules node_modules
COPY --from=build /src/packages packages
COPY --from=build /src/schemas schemas
COPY --from=build /src/knowledge-base knowledge-base
COPY docker/entrypoint.sh /usr/local/bin/security-kit
RUN chmod 755 /usr/local/bin/security-kit

# The project to secure is mounted here. Any user id works (run with --user to keep file ownership).
ENV SECKIT_SEMGREP=/usr/local/bin/semgrep \
    SEMGREP_SEND_METRICS=off \
    HOME=/tmp \
    NODE_ENV=production
RUN git config --system --add safe.directory '*'
WORKDIR /project
EXPOSE 4777
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/security-kit"]
CMD ["ui"]
