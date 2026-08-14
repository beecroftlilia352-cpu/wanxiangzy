#!/usr/bin/env bash
# LibreChat 部署脚本 —— 在 EC2 上执行
# 用法: sudo bash deploy-librechat.sh
# 前置: 已安装 docker + docker compose plugin；NEWBI_API_KEY 已写入 .env
set -euo pipefail

APP_DIR="/home/ec2-user/apps/librechat"
DOMAIN="${LIBRECHAT_DOMAIN:-chat.pixel-diffusion.com}"

echo "==> 准备目录"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

echo "==> 生成 .env（如不存在）"
if [[ ! -f .env ]]; then
  cat > .env <<EOF
NEWBI_API_KEY=${NEWBI_API_KEY:?请先设置 NEWBI_API_KEY 环境变量}
# 会话签名与加密密钥（首次部署自动生成，请勿泄露）
JWT_SECRET=$(openssl rand -hex 32)
CREDS_KEY=$(openssl rand -hex 32)
CREDS_IV=$(openssl rand -hex 16)

# 单点登录：与主站 OIDC Provider 打通（用户体系互通）
# 这些值必须与主站 env.local 中的 OIDC_CLIENT_ID / OIDC_CLIENT_SECRET 一致
OIDC_CLIENT_ID=${OIDC_CLIENT_ID:?请设置 OIDC_CLIENT_ID（与主站 env.local 一致）}
OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET:?请设置 OIDC_CLIENT_SECRET（与主站 env.local 一致）}
OPENID_CLIENT_ID=${OIDC_CLIENT_ID}
OPENID_CLIENT_SECRET=${OIDC_CLIENT_SECRET}
OPENID_ISSUER=https://pixel-diffusion.com
OPENID_SESSION_SECRET=$(openssl rand -hex 32)
OPENID_SCOPE="openid profile email"
OPENID_CALLBACK_URL=/oauth/openid/callback
OPENID_BUTTON_LABEL="使用万象智艺账号登录"
OPENID_USERNAME_CLAIM=email
OPENID_ROLE_SYNC_ENABLED=false

# 关闭本地注册：所有用户统一走主站单点登录
ALLOW_REGISTRATION=false
ALLOW_EMAIL_LOGIN=false
EOF
fi

echo "==> 启动容器"
docker compose pull
docker compose up -d

echo "==> 等待健康检查"
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:3080/api/health" >/dev/null 2>&1; then
    echo "LibreChat API 健康检查通过"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "健康检查超时，请查看日志: docker compose logs api"
    exit 1
  fi
  sleep 2
done

echo "==> 配置 Nginx 反向代理"
NGINX_CONF="/etc/nginx/conf.d/librechat.conf"
if [[ ! -f "$NGINX_CONF" ]]; then
  cat > "$NGINX_CONF" <<'NGINX'
server {
    listen 80;
    server_name __LIBRECHAT_DOMAIN__;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
NGINX
  sed -i "s/__LIBRECHAT_DOMAIN__/${DOMAIN}/g" "$NGINX_CONF"
  nginx -t
  systemctl reload nginx
  echo "Nginx 配置完成：$DOMAIN -> 127.0.0.1:3080"
fi

echo "==> SSL 证书（certbot，与主站同款流程）"
if command -v certbot >/dev/null 2>&1; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect \
    --email "${CERTBOT_EMAIL:-ganjmeng@gmail.com}" || echo "certbot 执行失败，请手动签发证书"
else
  echo "未安装 certbot，请手动配置 HTTPS"
fi

echo "==> 部署完成。首次访问 $DOMAIN 注册的第一个账号即为管理员。"
