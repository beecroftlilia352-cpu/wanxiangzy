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

  # Mirror the systemd unit rewrite from upgrade-node.sh so the respawned
  # pm2 daemon inherits Node $ROLLBACK_TO_MAJOR's PATH. Without this, the
  # systemd unit still points at Node 22 and `pm2 kill` would respawn
  # pm2 under Node 22 — which defeats the whole rollback.
  PM2_UNIT=""
  if [ -d /etc/systemd/system ]; then
    PM2_UNIT="$(sudo find /etc/systemd/system -maxdepth 2 -name 'pm2-*.service' 2>/dev/null | head -1 || true)"
  fi
  if [ -n "$PM2_UNIT" ]; then
    echo "    Found pm2 systemd unit: $PM2_UNIT"
    CURRENT_NODE_BIN="$(which node)"
    CURRENT_NODE_DIR="$(dirname "$(dirname "$CURRENT_NODE_BIN")")"
    if sudo grep -qE "/node/v[0-9]+\.[0-9]+\.[0-9]+" "$PM2_UNIT" 2>/dev/null; then
      echo "    Rewriting unit to: $CURRENT_NODE_DIR"
      sudo cp "$PM2_UNIT" "${PM2_UNIT}.bak.$(date +%Y%m%d-%H%M%S)"
      sudo sed -i -E "s|/node/v[0-9]+\.[0-9]+\.[0-9]+|$CURRENT_NODE_DIR|g" "$PM2_UNIT"
      sudo systemctl daemon-reload
    fi
  fi

  pm2 kill || true
  sleep 2

  if [ -n "$PM2_UNIT" ]; then
    UNIT_NAME="$(basename "$PM2_UNIT")"
    sudo systemctl restart "$UNIT_NAME" 2>&1 | sed 's/^/      /' || true
    sleep 3
  fi

  pm2 resurrect 2>&1 | sed 's/^/    /' || true
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
