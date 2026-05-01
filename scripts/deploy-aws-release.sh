#!/usr/bin/env bash
set -euo pipefail

trim_value() {
  local value="${1-}"
  value="${value//$'\r'/}"
  value="${value//$'\n'/}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

APP_NAME="$(trim_value "${AWS_APP_NAME:-wanxiangzy}")"
if [ -z "$APP_NAME" ]; then
  APP_NAME="wanxiangzy"
fi

BASE_DIR="$(trim_value "${AWS_APP_DIR:-}")"
if [ -z "$BASE_DIR" ]; then
  BASE_DIR="$HOME/apps/wanxiangzy"
fi
case "$BASE_DIR" in
  "~")
    BASE_DIR="$HOME"
    ;;
  "~/"*)
    BASE_DIR="$HOME/${BASE_DIR#~/}"
    ;;
esac
if [ "$BASE_DIR" != "/" ]; then
  BASE_DIR="${BASE_DIR%/}"
fi

ARCHIVE="${DEPLOY_ARCHIVE:?DEPLOY_ARCHIVE is required}"
TAG="${TAG_NAME:-manual-$(date +%Y%m%d%H%M%S)}"
SAFE_TAG="$(printf '%s' "$TAG" | tr -c 'A-Za-z0-9._-' '-')"
RELEASE_DIR="$BASE_DIR/releases/$SAFE_TAG"
SHARED_DIR="$BASE_DIR/shared"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed on the server." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed on the server." >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is not installed. Install it with: npm install -g pm2" >&2
  exit 1
fi

mkdir -p "$RELEASE_DIR" "$SHARED_DIR"

if [ ! -f "$SHARED_DIR/.env.production" ] && [ -f "$BASE_DIR/.env.production" ]; then
  cp "$BASE_DIR/.env.production" "$SHARED_DIR/.env.production"
fi

if [ ! -f "$SHARED_DIR/.env.production" ]; then
  echo "Missing $SHARED_DIR/.env.production" >&2
  echo "Create it once on the server before running tag deployments." >&2
  exit 1
fi

tar -xzf "$ARCHIVE" -C "$RELEASE_DIR"
ln -sfn "$SHARED_DIR/.env.production" "$RELEASE_DIR/.env.production"

cd "$RELEASE_DIR"
npm ci
npm run build

ln -sfn "$RELEASE_DIR" "$BASE_DIR/current"

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 delete "$APP_NAME"
fi

cd "$BASE_DIR/current"
pm2 start npm --name "$APP_NAME" -- start
pm2 save

find "$BASE_DIR/releases" -mindepth 1 -maxdepth 1 -type d | sort | head -n -5 | xargs -r rm -rf
rm -f "$ARCHIVE"

echo "Deployed $APP_NAME from tag $TAG"
