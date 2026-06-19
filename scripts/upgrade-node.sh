#!/usr/bin/env bash
#
# Upgrade Node.js on EC2 from 20.x to 22.x (Active LTS).
#
# Why: Node 20 LTS reached End-of-Life on 2026-04-30. EC2 instances on
# Node 20 no longer receive security patches. Node 22 also gives us a
# native WebSocket (no more `ws` polyfill) and `--env-file-if-exists`
# (cleaner env loading than the CJS bootstrap we used during the
# transition).
#
# This script is idempotent — running it twice is safe.
#
# Usage (on the EC2 server):
#   cd ~/apps/wanxiangzy/current
#   bash scripts/upgrade-node.sh
#
# Rollback: run `scripts/rollback-node.sh` (see companion script).
#

set -euo pipefail

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
TARGET_NODE_MAJOR="${TARGET_NODE_MAJOR:-22}"

# ---------------------------------------------------------------------------
# 1. Pre-flight: report current state
# ---------------------------------------------------------------------------
echo "==> Current environment"
echo "    node: $(node --version 2>&1 || echo 'not on PATH')"
echo "    npm:  $(npm --version 2>&1 || echo 'not on PATH')"
echo "    pm2:  $(pm2 --version 2>&1 || echo 'not installed')"
echo "    nvm:  ${NVM_DIR}/nvm.sh"
echo

# ---------------------------------------------------------------------------
# 2. Ensure nvm is loaded into this shell
# ---------------------------------------------------------------------------
if ! command -v nvm >/dev/null 2>&1; then
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "ERROR: nvm not found at $NVM_DIR" >&2
    echo "Install nvm first: https://github.com/nvm-sh/nvm#installing-and-updating" >&2
    exit 1
  fi
  # shellcheck disable=SC1091
  \. "$NVM_DIR/nvm.sh"
fi

# ---------------------------------------------------------------------------
# 3. Install Node 22 (skip if already present)
# ---------------------------------------------------------------------------
if nvm ls "$TARGET_NODE_MAJOR" >/dev/null 2>&1 && \
   nvm version "$TARGET_NODE_MAJOR" >/dev/null 2>&1; then
  echo "==> Node $TARGET_NODE_MAJOR already installed"
else
  echo "==> Installing Node $TARGET_NODE_MAJOR LTS"
  nvm install "$TARGET_NODE_MAJOR"
fi

# ---------------------------------------------------------------------------
# 4. Activate Node 22 for this shell and as the default for new shells
# ---------------------------------------------------------------------------
echo "==> Switching to Node $TARGET_NODE_MAJOR"
nvm use "$TARGET_NODE_MAJOR" >/dev/null
nvm alias default "$TARGET_NODE_MAJOR" >/dev/null

echo "==> New environment"
echo "    node: $(node --version)"
echo "    npm:  $(npm --version)"
echo

# ---------------------------------------------------------------------------
# 5. Reinstall node_modules so native modules (sharp, etc.) rebuild against
#    the new Node ABI. Skipping this step is the #1 cause of "works on
#    Node 20, crashes on Node 22" incidents.
# ---------------------------------------------------------------------------
APP_DIR="${APP_DIR:-$HOME/apps/wanxiangzy/current}"
if [ ! -d "$APP_DIR" ]; then
  echo "WARN: $APP_DIR does not exist; skipping node_modules rebuild." >&2
  echo "      Run this script again after the next tag deploy." >&2
else
  echo "==> Rebuilding native modules in $APP_DIR"
  cd "$APP_DIR"
  rm -rf node_modules .next/cache
  npm ci --prefer-offline --no-audit --no-fund
  echo
  echo "    sharp load test:"
  if node -e "require('sharp')" 2>&1 | head -3; then
    echo "    sharp: OK"
  else
    echo "    sharp: FAILED — investigate before continuing" >&2
    exit 1
  fi
fi
echo

# ---------------------------------------------------------------------------
# 6. Rewrite the pm2 systemd unit (if any) so its Environment/PATH/ExecStart
#    point at the Node we just installed. `pm2 startup` hardcodes the Node
#    version that was active when it was first run; without this step,
#    `pm2 kill` triggers systemd to respawn the daemon with the OLD Node's
#    PATH and the worker keeps crashing on Node 20 even though
#    `node --version` shows v22. This is idempotent: after the first run,
#    the unit already points at the target version and sed becomes a no-op.
# ---------------------------------------------------------------------------
if ! command -v pm2 >/dev/null 2>&1; then
  echo "WARN: pm2 not installed; nothing to restart." >&2
else
  echo "==> Looking for pm2 systemd unit"
  PM2_UNIT=""
  if [ -d /etc/systemd/system ]; then
    PM2_UNIT="$(sudo find /etc/systemd/system -maxdepth 2 -name 'pm2-*.service' 2>/dev/null | head -1 || true)"
  fi

  if [ -n "$PM2_UNIT" ]; then
    echo "    Found: $PM2_UNIT"
    CURRENT_NODE_BIN="$(which node)"
    CURRENT_NODE_DIR="$(dirname "$(dirname "$CURRENT_NODE_BIN")")"
    if sudo grep -qE "/node/v[0-9]+\.[0-9]+\.[0-9]+" "$PM2_UNIT" 2>/dev/null; then
      echo "    Unit has hardcoded Node path. Rewriting to: $CURRENT_NODE_DIR"
      sudo cp "$PM2_UNIT" "${PM2_UNIT}.bak.$(date +%Y%m%d-%H%M%S)"
      # Use '|' as the sed delimiter because the replacement path contains '/'.
      sudo sed -i -E "s|/node/v[0-9]+\.[0-9]+\.[0-9]+|$CURRENT_NODE_DIR|g" "$PM2_UNIT"
      sudo systemctl daemon-reload
      echo "    Updated. Relevant lines now:"
      sudo grep -E "ExecStart|Environment|PATH" "$PM2_UNIT" | sed 's/^/      /'
    else
      echo "    Unit has no hardcoded Node path; nothing to update"
    fi
  else
    echo "    No pm2 systemd unit found (pm2 is not managed by systemd)"
  fi
  echo

  echo "==> Restarting PM2"
  pm2 kill || true
  sleep 3

  # If systemd is managing pm2, restart via systemd so the respawned daemon
  # picks up the updated unit (with Node 22's PATH). `pm2 kill` alone only
  # kills the daemon; the systemd unit decides what environment the
  # respawned daemon inherits.
  if [ -n "$PM2_UNIT" ]; then
    UNIT_NAME="$(basename "$PM2_UNIT")"
    echo "    systemctl restart $UNIT_NAME"
    sudo systemctl restart "$UNIT_NAME" 2>&1 | sed 's/^/      /' || \
      echo "    WARN: systemctl restart failed — pm2 may need manual start" >&2
    sleep 3
  fi

  pm2 resurrect 2>&1 | sed 's/^/    /' || \
    echo "    WARN: pm2 resurrect failed — try 'pm2 start' manually" >&2
  sleep 3
  echo
  echo "==> pm2 status:"
  pm2 status
fi
echo

# ---------------------------------------------------------------------------
# 7. Sanity-check the worker on the new Node
# ---------------------------------------------------------------------------
echo "==> Worker startup probe (waits up to 30s)"
WORKER_BOOT_OK=0
for _ in $(seq 1 30); do
  if pm2 logs "${APP_NAME:-wanxiangzy}-worker" --lines 100 --nostream --raw 2>/dev/null \
       | grep -q "loop.started"; then
    WORKER_BOOT_OK=1
    break
  fi
  sleep 1
done

if [ "$WORKER_BOOT_OK" -eq 1 ]; then
  echo "    worker: loop.started detected, looks healthy"
else
  echo "    worker: no loop.started in last 30s — investigate pm2 logs"
  echo "    pm2 logs ${APP_NAME:-wanxiangzy}-worker --lines 50 --nostream --raw"
fi

echo
echo "==> Done. Recommended next steps:"
echo "    1. Confirm pm2 status shows uptime > 1m and restart count = 0"
echo "    2. Trigger a tag deploy so the cleaned-up code (no ws, no"
echo "       worker-bootstrap.cjs) takes effect: tag and push from main."
echo "    3. Optional: remove this script and scripts/rollback-node.sh"
echo "       once you're confident Node 22 is stable."
