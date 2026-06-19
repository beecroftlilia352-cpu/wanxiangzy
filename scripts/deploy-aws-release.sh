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

  for proc in "$APP_NAME" "${APP_NAME}-worker"; do
    if pm2 describe "$proc" >/dev/null 2>&1; then
      pm2 delete "$proc"
    fi
  done

  cd "$app_dir"
  pm2 start npm --name "$APP_NAME" -- start

  # 异步任务 worker (PM2 托管, 调用 npm run worker -> tsx scripts/worker.ts).
  # 通过 WORKER_ENABLED 开关；默认开启。HTTP 路由 /api/jobs/process-generations
  # 仍保留, 用于运维手动触发或回退. --max-memory-restart 防御内存泄漏.
  # --cwd 显式指定 cwd：worker's loadDotEnvIfPresent() 用 process.cwd() 找
  # .env.production，PM2 默认不继承 bash 的 cd，所以必须显式给到 release 目录，
  # 否则 env 加载失败、worker 死循环重启。
  if [ "${WORKER_ENABLED:-true}" = "true" ]; then
    pm2 start npm \
      --name "${APP_NAME}-worker" \
      --cwd "$app_dir" \
      --max-memory-restart 1500M \
      --time \
      -- run worker
  fi
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

configure_build_environment() {
  export npm_config_audit=false
  export npm_config_fund=false
  export npm_config_update_notifier=false
  export npm_config_progress=false
  export NEXT_TELEMETRY_DISABLED=1

  if [[ "${NODE_OPTIONS:-}" != *"--max-old-space-size"* ]]; then
    if [ -n "${NODE_OPTIONS:-}" ]; then
      export NODE_OPTIONS="$NODE_OPTIONS --max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE:-1536}"
    else
      export NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE:-1536}"
    fi
  fi
}

ensure_build_swap() {
  local mem_total_mb="0"
  local swap_total_mb="0"
  mem_total_mb="$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null || printf '0')"
  swap_total_mb="$(awk '/SwapTotal/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null || printf '0')"

  echo "Build memory: ${mem_total_mb:-0} MB RAM, ${swap_total_mb:-0} MB swap"

  if [ "${mem_total_mb:-0}" -ge 3500 ] || [ "${swap_total_mb:-0}" -ge 1024 ]; then
    return 0
  fi

  if ! command -v sudo >/dev/null 2>&1 || ! sudo -n true 2>/dev/null; then
    echo "Low memory detected, but passwordless sudo is unavailable; continuing without build swap." >&2
    return 0
  fi

  local swapfile="$SHARED_DIR/build.swap"
  if ! swapon --show=NAME 2>/dev/null | grep -qx "$swapfile"; then
    if [ ! -f "$swapfile" ]; then
      echo "Creating temporary build swap at $swapfile"
      sudo fallocate -l 2G "$swapfile" 2>/dev/null || sudo dd if=/dev/zero of="$swapfile" bs=1M count=2048 status=none
      sudo chmod 600 "$swapfile"
      sudo mkswap "$swapfile" >/dev/null
    fi

    echo "Enabling temporary build swap"
    if ! sudo swapon "$swapfile" 2>/dev/null; then
      echo "Existing build swap could not be enabled; recreating it." >&2
      sudo rm -f "$swapfile"
      sudo fallocate -l 2G "$swapfile" 2>/dev/null || sudo dd if=/dev/zero of="$swapfile" bs=1M count=2048 status=none
      sudo chmod 600 "$swapfile"
      sudo mkswap "$swapfile" >/dev/null
      sudo swapon "$swapfile" 2>/dev/null || echo "Unable to enable build swap; continuing without it." >&2
    fi
  fi
}

dependency_cache_key() {
  if command -v sha256sum >/dev/null 2>&1; then
    { sha256sum package.json; sha256sum package-lock.json; } | sha256sum | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    { shasum -a 256 package.json; shasum -a 256 package-lock.json; } | shasum -a 256 | awk '{ print $1 }'
  else
    node - <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const hash = crypto.createHash("sha256");
for (const file of ["package.json", "package-lock.json"]) {
  hash.update(fs.readFileSync(file));
}
process.stdout.write(hash.digest("hex"));
NODE
  fi
}

dependency_cache_key_for_dir() {
  local target_dir="$1"

  if [ ! -f "$target_dir/package.json" ] || [ ! -f "$target_dir/package-lock.json" ]; then
    return 1
  fi

  (
    cd "$target_dir"
    dependency_cache_key
  )
}

install_dependencies_into_cache() {
  local cache_dir="$1"

  echo "Installing dependencies for cache: $(basename "$cache_dir")"
  rm -rf -- node_modules "$cache_dir/node_modules"
  npm ci --prefer-offline --no-audit --no-fund
  mkdir -p "$cache_dir"
  mv node_modules "$cache_dir/node_modules"
  ln -sfn "$cache_dir/node_modules" node_modules
}

use_dependency_cache_if_valid() {
  local cache_dir="$1"

  if [ ! -d "$cache_dir/node_modules" ]; then
    return 1
  fi

  rm -rf -- node_modules
  ln -sfn "$cache_dir/node_modules" node_modules

  if npm ls --omit=dev --depth=0 >/dev/null 2>&1; then
    touch "$cache_dir"
    return 0
  fi

  echo "Dependency cache is incomplete; rebuilding: $(basename "$cache_dir")" >&2
  rm -rf -- node_modules "$cache_dir/node_modules"
  return 1
}

install_dependencies() {
  if [ ! -f package-lock.json ]; then
    echo "package-lock.json is missing; falling back to npm install." >&2
    npm install --prefer-offline --no-audit --no-fund
    return 0
  fi

  local cache_root="$SHARED_DIR/node_modules-cache"
  local cache_key
  local cache_dir
  cache_key="$(dependency_cache_key)"
  cache_dir="$cache_root/$cache_key"
  mkdir -p "$cache_root"

  if [ -n "$PREVIOUS_TARGET" ] &&
    [ -d "$PREVIOUS_TARGET/node_modules" ] &&
    previous_cache_key="$(dependency_cache_key_for_dir "$PREVIOUS_TARGET" 2>/dev/null)" &&
    [ "$previous_cache_key" = "$cache_key" ]; then
    echo "Seeding dependency cache from current release: $cache_key"
    mkdir -p "$cache_dir"
    if [ ! -d "$cache_dir/node_modules" ]; then
      cp -al "$PREVIOUS_TARGET/node_modules" "$cache_dir/node_modules" 2>/dev/null ||
        cp -a "$PREVIOUS_TARGET/node_modules" "$cache_dir/node_modules"
    fi
    if ! use_dependency_cache_if_valid "$cache_dir"; then
      install_dependencies_into_cache "$cache_dir"
    fi
    return 0
  fi

  if [ -d "$cache_dir/node_modules" ]; then
    echo "Reusing dependency cache: $cache_key"
    if ! use_dependency_cache_if_valid "$cache_dir"; then
      install_dependencies_into_cache "$cache_dir"
    fi
    return 0
  fi

  install_dependencies_into_cache "$cache_dir"
}

cleanup_dependency_cache() {
  local cache_root="$SHARED_DIR/node_modules-cache"
  if [ ! -d "$cache_root" ]; then
    return 0
  fi

  mapfile -t OLD_CACHES < <(
    find "$cache_root" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' |
      sort -rn |
      awk 'NR > 4 { sub(/^[^ ]+ /, ""); print }'
  )

  for OLD_CACHE in "${OLD_CACHES[@]}"; do
    rm -rf -- "$OLD_CACHE"
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
configure_build_environment
ensure_build_swap
install_dependencies
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
cleanup_dependency_cache

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
