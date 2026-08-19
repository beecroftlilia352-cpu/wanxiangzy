#!/usr/bin/env bash
set -euo pipefail

# Wanxiangzy 手动部署脚本（Mac 本地运行）
# 原因：EC2 1.9G 内存 next build 会 OOM，所以本地构建，只传 .next 上去。
# 用法: ./scripts/deploy-from-local.sh <tag> [worker_instances]
# 示例: ./scripts/deploy-from-local.sh v2026.08.19-oss-download-2workers.1 2

TAG="${1:?用法: $0 <tag> [worker_instances]}"
WORKER_INSTANCES="${2:-2}"

SSH_KEY="${SSH_KEY:-$HOME/Downloads/hk01.pem}"
SSH_HOST="${SSH_HOST:-3.25.242.85}"
SSH_USER="${SSH_USER:-ec2-user}"
WEB_INSTANCES="${WEB_INSTANCES:-2}"
APP_DIR="apps/wanxiangzy"
NODE_BIN="/home/ec2-user/.nvm/versions/node/v22.23.0/bin/node"
REPO="https://github.com/ganjmeng/wanxiangzy.git"
RELEASE_NAME="manual-$TAG"
LOCAL_TAR="/tmp/wanxiangzy-next-$TAG.tar.gz"
REMOTE_TAR="/tmp/wanxiangzy-next-$TAG.tar.gz"

echo "==> [1/5] 验证 Supabase Realtime 发布配置"
node --env-file-if-exists=.env.production --env-file-if-exists=.env.local - <<'NODE'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Migration gate: Supabase URL or service role key is missing.");
  process.exit(1);
}

let response;
try {
  response = await fetch(`${url}/rest/v1/rpc/is_generation_outbox_realtime_ready`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
  });
} catch {
  console.error("Migration gate: generation outbox Realtime status is unreachable.");
  process.exit(1);
}

let ready = false;
if (response.ok) {
  try {
    ready = await response.json() === true;
  } catch {
    ready = false;
  }
}
if (!ready) {
  console.error("Migration gate: generation outbox is missing from the Supabase Realtime publication.");
  process.exit(1);
}
console.log("Migration gate: generation outbox Realtime publication is ready.");
NODE

echo "==> [2/5] 本地构建 .next"
npm run build

echo "==> [3/5] 打包 .next"
tar -czf "$LOCAL_TAR" .next

echo "==> [4/5] 上传 .next 到 EC2"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$LOCAL_TAR" "$SSH_USER@$SSH_HOST:$REMOTE_TAR"

echo "==> [5/5] 远端准备 + 启动"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SSH_HOST" "TAG=$TAG WORKER_INSTANCES=$WORKER_INSTANCES WEB_INSTANCES=$WEB_INSTANCES NODE_BIN=$NODE_BIN APP_DIR=$APP_DIR REPO=$REPO REMOTE_TAR=$REMOTE_TAR bash -s" <<'REMOTE'
set -euo pipefail
RELEASE="$HOME/$APP_DIR/releases/manual-$TAG"
CURRENT="$(readlink -f "$HOME/$APP_DIR/current" 2>/dev/null || true)"
if [ ! -d "$RELEASE/.git" ]; then
  TOKEN="$(tr -d '[:space:]' < "$HOME/.wanxiangzy-gh-token")"
  git clone --depth 1 --branch "$TAG" "https://${TOKEN}@github.com/ganjmeng/wanxiangzy.git" "$RELEASE"
  git -C "$RELEASE" remote set-url origin "$REPO"
fi
if [ ! -d "$RELEASE/node_modules" ] && [ -n "$CURRENT" ] && [ -d "$CURRENT/node_modules" ]; then
  cp -a "$CURRENT/node_modules" "$RELEASE/node_modules"
elif [ ! -d "$RELEASE/node_modules" ]; then
  (cd "$RELEASE" && npm ci)
fi
cp "$HOME/$APP_DIR/shared/.env.production" "$RELEASE/.env.production"
rm -rf "$RELEASE/.next"
tar -xzf "$REMOTE_TAR" -C "$RELEASE"
ln -sfn "$RELEASE" "$HOME/$APP_DIR/current"
cd "$RELEASE"
pm2 delete wanxiangzy wanxiangzy-worker >/dev/null 2>&1 || true
PM2_APP_NAME=wanxiangzy PM2_RELEASE_DIR="$RELEASE" PM2_NODE_BIN="$NODE_BIN" PM2_WEB_INSTANCES="$WEB_INSTANCES" PM2_WORKER_INSTANCES="$WORKER_INSTANCES" PM2_KILL_TIMEOUT_MS=45000 PM2_READY_TIMEOUT_MS=60000 node -e 'process.stdout.write(JSON.stringify(require("./ecosystem.production.cjs"), null, 2))' > /tmp/ecosystem.json
NODE_ENV=production pm2 startOrReload /tmp/ecosystem.json --update-env
pm2 save
pm2 status
REMOTE

echo ""
echo "==> 完成。访问 https://pixel-diffusion.com 验证"
