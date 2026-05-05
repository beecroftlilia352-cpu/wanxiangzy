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
PREVIOUS_TARGET="$(readlink -f "$BASE_DIR/current" 2>/dev/null || true)"

start_app() {
  local app_dir="$1"

  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 delete "$APP_NAME"
  fi

  cd "$app_dir"
  pm2 start npm --name "$APP_NAME" -- start
}

healthcheck_app() {
  local port="${PORT:-}"
  if [ -z "$port" ] && [ -f "$BASE_DIR/current/.env.production" ]; then
    port="$(
      awk -F= '
        /^PORT=/ {
          value=$0
          sub(/^PORT=/, "", value)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
          gsub(/^["'\'']|["'\'']$/, "", value)
          print value
        }
      ' "$BASE_DIR/current/.env.production" | tail -n 1
    )"
  fi
  port="${port:-3000}"
  local url="http://127.0.0.1:${port}/"

  for _ in $(seq 1 30); do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS -o /dev/null "$url"; then
        return 0
      fi
    else
      if node -e "fetch(process.argv[1]).then((r)=>process.exit(r.ok||r.status<500?0:1)).catch(()=>process.exit(1))" "$url"; then
        return 0
      fi
    fi
    sleep 2
  done

  return 1
}

rollback_previous_release() {
  if [ -n "$PREVIOUS_TARGET" ] && [ -d "$PREVIOUS_TARGET" ]; then
    echo "Rolling back to previous release: $PREVIOUS_TARGET" >&2
    ln -sfn "$PREVIOUS_TARGET" "$BASE_DIR/current"
    start_app "$BASE_DIR/current"
    pm2 save
  else
    echo "No previous release found for rollback." >&2
  fi
}

cleanup_legacy_root_lockfiles() {
  for lockfile in package-lock.json npm-shrinkwrap.json yarn.lock pnpm-lock.yaml; do
    if [ -f "$BASE_DIR/$lockfile" ]; then
      echo "Removing legacy root lockfile: $BASE_DIR/$lockfile"
      rm -f -- "$BASE_DIR/$lockfile"
    fi
  done
}

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
cleanup_legacy_root_lockfiles

cd "$RELEASE_DIR"
npm ci
npm run build

ln -sfn "$RELEASE_DIR" "$BASE_DIR/current"
start_app "$BASE_DIR/current"

if ! healthcheck_app; then
  echo "Healthcheck failed for $APP_NAME from tag $TAG" >&2
  pm2 logs "$APP_NAME" --lines 80 --nostream >&2 || true
  rollback_previous_release
  exit 1
fi

pm2 save

CURRENT_TARGET="$(readlink -f "$BASE_DIR/current" 2>/dev/null || true)"
mapfile -t OLD_RELEASES < <(
  find "$BASE_DIR/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' |
    sort -rn |
    awk 'NR > 5 { sub(/^[^ ]+ /, ""); print }'
)

for OLD_RELEASE in "${OLD_RELEASES[@]}"; do
  if [ "$OLD_RELEASE" = "$RELEASE_DIR" ] || [ "$OLD_RELEASE" = "$CURRENT_TARGET" ]; then
    continue
  fi
  rm -rf -- "$OLD_RELEASE"
done

if [ ! -d "$RELEASE_DIR" ]; then
  echo "Deployment release directory was removed unexpectedly: $RELEASE_DIR" >&2
  exit 1
fi

rm -f "$ARCHIVE"

echo "Deployed $APP_NAME from tag $TAG"
