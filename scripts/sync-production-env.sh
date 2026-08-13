#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# EC2 快速替换脚本：把本地 .env.local 完整同步到 EC2 的 .env.production。
# 最终结果：远程 .env.production 与本地 .env.local 完全一致（字节级一致）。
#
# 用法（在本机运行，本机需要能 SSH 到 EC2）：
#   SYNC_ENV_HOST=15.135.221.53 ./scripts/sync-production-env.sh
#   SYNC_ENV_HOST=15.135.221.53 SYNC_ENV_KEY=~/.ssh/ec2.pem ./scripts/sync-production-env.sh
#   SYNC_ENV_HOST=15.135.221.53 DRY_RUN=1 ./scripts/sync-production-env.sh
#
# 可用环境变量：
#   SYNC_ENV_HOST        必填，EC2 公网 IP 或域名（默认取 AWS_HOST）
#   SYNC_ENV_USER        SSH 用户，默认 ec2-user（默认取 AWS_USER）
#   SYNC_ENV_PORT        SSH 端口，默认 22（默认取 AWS_PORT）
#   SYNC_ENV_KEY         SSH 私钥路径，默认 ~/.ssh/id_rsa
#   SYNC_ENV_REMOTE_PATH 远程目标路径，默认 ~/apps/wanxiangzy/shared/.env.production
#   SOURCE_ENV           本地源文件，默认 <repo>/.env.local
#   DRY_RUN=1            只对比不写入
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SOURCE_ENV="${SOURCE_ENV:-$REPO_ROOT/.env.local}"
REMOTE_HOST="${SYNC_ENV_HOST:-${AWS_HOST:-}}"
REMOTE_USER="${SYNC_ENV_USER:-${AWS_USER:-ec2-user}}"
REMOTE_PORT="${SYNC_ENV_PORT:-${AWS_PORT:-22}}"
SSH_KEY="${SYNC_ENV_KEY:-$HOME/.ssh/id_rsa}"
REMOTE_PATH="${SYNC_ENV_REMOTE_PATH:-~/apps/wanxiangzy/shared/.env.production}"
DRY_RUN="${DRY_RUN:-0}"

usage() {
  cat >&2 <<USAGE
Usage:
  SYNC_ENV_HOST=<host> [SYNC_ENV_KEY=</path/to/key>] $0

Required:
  SYNC_ENV_HOST   EC2 public IP or domain

Optional:
  SYNC_ENV_USER           (default ec2-user)
  SYNC_ENV_PORT           (default 22)
  SYNC_ENV_KEY            (default ~/.ssh/id_rsa)
  SYNC_ENV_REMOTE_PATH    (default ~/apps/wanxiangzy/shared/.env.production)
  SOURCE_ENV              (default $REPO_ROOT/.env.local)
  DRY_RUN=1               compare only, do not write
USAGE
}

if [[ -z "$REMOTE_HOST" ]]; then
  echo "::error:: SYNC_ENV_HOST is required (or set AWS_HOST)." >&2
  usage
  exit 1
fi
if [[ ! -f "$SOURCE_ENV" ]]; then
  echo "::error:: local env source not found: $SOURCE_ENV" >&2
  exit 1
fi
if [[ ! -f "$SSH_KEY" ]]; then
  echo "::error:: SSH key not found: $SSH_KEY (set SYNC_ENV_KEY to your EC2 pem path)" >&2
  exit 1
fi

DEST="$REMOTE_USER@$REMOTE_HOST"
SSH_OPTS=(-p "$REMOTE_PORT" -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=60 -o ConnectionAttempts=3)

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "::error:: no sha256 tool available" >&2
    exit 1
  fi
}

remote_sh() {
  ssh "${SSH_OPTS[@]}" "$DEST" "$@"
}

# 解析远程 HOME，把 ~ 转成绝对路径，避免引号内 ~ 不展开的问题。
REMOTE_HOME="$(remote_sh 'printf %s "$HOME"')"
if [[ "$REMOTE_PATH" == "~" ]]; then
  REMOTE_PATH="$REMOTE_HOME"
elif [[ "$REMOTE_PATH" == "~/"* ]]; then
  REMOTE_PATH="${REMOTE_HOME}${REMOTE_PATH#\~}"
elif [[ "$REMOTE_PATH" != /* ]]; then
  REMOTE_PATH="${REMOTE_HOME}/${REMOTE_PATH}"
fi

LOCAL_SUM="$(hash_file "$SOURCE_ENV")"
REMOTE_SUM="$(remote_sh "if [ -f \"$REMOTE_PATH\" ]; then sha256sum \"$REMOTE_PATH\" | awk '{print \$1}'; else echo MISSING; fi" || echo UNREACHABLE)"

echo "source : $SOURCE_ENV ($(wc -l < "$SOURCE_ENV") lines, sha256=$LOCAL_SUM)"
echo "target : $DEST:$REMOTE_PATH"

if [[ "$DRY_RUN" == "1" ]]; then
  if [[ "$REMOTE_SUM" == "$LOCAL_SUM" ]]; then
    echo "DRY-RUN: remote already matches local (identical sha256)."
  else
    echo "DRY-RUN: differs — remote sha256=$REMOTE_SUM"
    echo "DRY-RUN: would replace remote with local content."
  fi
  exit 0
fi

TS="$(date +%Y%m%d%H%M%S)"
TMP_REMOTE="$REMOTE_PATH.tmp.$TS"

# 1) 备份远程旧文件（若存在）
remote_sh "if [ -f \"$REMOTE_PATH\" ]; then cp -a \"$REMOTE_PATH\" \"$REMOTE_PATH.bak.$TS\"; echo \"backup: $REMOTE_PATH.bak.$TS\"; fi"

# 2) 先传到临时文件，再原子替换
scp -P "$REMOTE_PORT" -i "$SSH_KEY" \
  -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=60 \
  -o ConnectionAttempts=3 \
  "$SOURCE_ENV" "$DEST:$TMP_REMOTE"

# 3) 收紧权限并原子 mv 到目标
remote_sh "chmod 600 \"$TMP_REMOTE\" && mv \"$TMP_REMOTE\" \"$REMOTE_PATH\" && chmod 600 \"$REMOTE_PATH\""

# 4) 校验远程 sha256 与本地一致
REMOTE_SUM_AFTER="$(remote_sh "sha256sum \"$REMOTE_PATH\" | awk '{print \$1}'")"
if [[ "$REMOTE_SUM_AFTER" == "$LOCAL_SUM" ]]; then
  echo "OK: remote now matches local (sha256=$LOCAL_SUM)."
else
  echo "::error:: verification failed: local=$LOCAL_SUM remote=$REMOTE_SUM_AFTER" >&2
  exit 1
fi
