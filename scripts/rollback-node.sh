#!/usr/bin/env bash
#
# Rollback Node.js on EC2 from 22.x back to 20.x.
#
# Use only if `scripts/upgrade-node.sh` produces an unrecoverable
# regression and you need to restore Node 20 LTS while you investigate.
#
# Usage (on the EC2 server):
#   cd ~/apps/wanxiangzy/current
#   bash scripts/rollback-node.sh
#

set -euo pipefail

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
ROLLBACK_TO_MAJOR="${ROLLBACK_TO_MAJOR:-20}"

if ! command -v nvm >/dev/null 2>&1; then
  # shellcheck disable=SC1091
  \. "$NVM_DIR/nvm.sh"
fi

echo "==> Rolling back to Node $ROLLBACK_TO_MAJOR"

if ! nvm ls "$ROLLBACK_TO_MAJOR" >/dev/null 2>&1; then
  echo "ERROR: Node $ROLLBACK_TO_MAJOR not installed; cannot rollback." >&2
  exit 1
fi

nvm use "$ROLLBACK_TO_MAJOR" >/dev/null
nvm alias default "$ROLLBACK_TO_MAJOR" >/dev/null

echo "    node: $(node --version)"
echo "    npm:  $(npm --version)"
echo

APP_DIR="${APP_DIR:-$HOME/apps/wanxiangzy/current}"
if [ -d "$APP_DIR" ]; then
  echo "==> Rebuilding node_modules against Node $ROLLBACK_TO_MAJOR ABI"
  cd "$APP_DIR"
  rm -rf node_modules .next/cache
  npm ci --prefer-offline --no-audit --no-fund
fi

if command -v pm2 >/dev/null 2>&1; then
  echo "==> Restarting PM2"
  pm2 kill || true
  sleep 2
  pm2 resurrect || true
  sleep 3
  pm2 status
fi

echo
echo "==> Rollback complete. The currently deployed code may require"
echo "    Node 22 (it removed the `ws` polyfill). If you see"
echo "    '[worker] fatal error=Node.js 20 detected without native"
echo "    WebSocket support', roll back the code tag too:"
echo "      git checkout <previous-working-tag>"
echo "      bash scripts/deploy-aws-release.sh"
