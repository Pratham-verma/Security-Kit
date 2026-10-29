#!/bin/sh
# security-kit <command>: "ui" (default), "mcp", or any seckit CLI command (init, generate, audit, attest, explain...).
set -e
KIT=/opt/security-kit/packages
case "${1:-ui}" in
  ui)
    [ $# -gt 0 ] && shift
    # 0.0.0.0 is the container's own interface; publish it to the host's loopback only (-p 127.0.0.1:4777:4777).
    exec node "$KIT/ui/dist/server/bin.js" --dir /project --port 4777 --listen 0.0.0.0 --no-open "$@"
    ;;
  mcp)
    shift
    exec node "$KIT/mcp/dist/bin.js" "$@"
    ;;
  *)
    exec node "$KIT/cli/dist/bin.js" "$@"
    ;;
esac
