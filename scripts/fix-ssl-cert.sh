#!/usr/bin/env bash
set -euo pipefail

# One-shot helper to switch the nginx HTTPS certificate from the old domain
# (vastweargen.com) to the new domain (pixel-diffusion.com) on the EC2 host.
#
# Run directly on the EC2 server, e.g.:
#   sudo bash fix-ssl-cert.sh
#
# What it does:
#   1. Backs up nginx site configs that mention the old domain.
#   2. Rewrites ONLY the server_name directive to the new domain.
#   3. Installs certbot + the nginx plugin if missing.
#   4. Issues a Let's Encrypt cert for the new domain (+ www); certbot itself
#      updates the ssl_certificate paths.
#   5. Tests and reloads nginx.
#
# Dry run:  DRY_RUN=1 sudo bash fix-ssl-cert.sh

OLD_DOMAIN="${OLD_DOMAIN:-vastweargen.com}"
DOMAIN="${DOMAIN:-pixel-diffusion.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.pixel-diffusion.com}"
EMAIL="${SSL_EMAIL:-}"
DRY_RUN="${DRY_RUN:-0}"

run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root (sudo)." >&2
  exit 1
fi

command -v nginx >/dev/null 2>&1 || { echo "nginx not found" >&2; exit 1; }

NGINX_ETC="${NGINX_ETC:-/etc/nginx}"
BACKUP_DIR="$NGINX_ETC/ssl-backup-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Find every nginx config that references the old domain or old cert paths.
mapfile -t TARGET_FILES < <(
  grep -rlE "($OLD_DOMAIN|${DOMAIN//./\\.})" "$NGINX_ETC"/sites-enabled "$NGINX_ETC"/conf.d 2>/dev/null || true
)

if [ "${#TARGET_FILES[@]}" -eq 0 ]; then
  echo "No nginx site config references ${OLD_DOMAIN} or ${DOMAIN}; nothing to rewrite." >&2
fi

for f in "${TARGET_FILES[@]}"; do
  cp -a "$f" "$BACKUP_DIR/$(basename "$f").bak"
  echo "Backed up $f -> $BACKUP_DIR/"

  # Rewrite ONLY the server_name directive. Do NOT touch ssl_certificate paths:
  # certbot's nginx plugin rewrites those after issuing the new cert. Rewriting
  # them first breaks `nginx -t` (the new cert path does not exist yet).
  run sed -i.bak -E "/server_name/ s/${OLD_DOMAIN//./\\.}/${DOMAIN}/g" "$f"
done

# Install certbot if missing.
if ! command -v certbot >/dev/null 2>&1; then
  echo "Installing certbot + nginx plugin..."
  if command -v apt-get >/dev/null 2>&1; then
    run apt-get update
    run apt-get install -y certbot python3-certbot-nginx
  elif command -v dnf >/dev/null 2>&1; then
    run dnf install -y certbot python3-certbot-nginx
  else
    echo "Unsupported package manager; install certbot + python3-certbot-nginx manually." >&2
    exit 1
  fi
fi

# Issue the cert and let certbot configure nginx for the new domain.
# Email is optional; without it we register unsafely (no expiry notices).
CERTBOT_ARGS=(--nginx --non-interactive --agree-tos --no-eff-email --redirect)
if [ -n "$EMAIL" ]; then
  CERTBOT_ARGS+=(-m "$EMAIL")
else
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi
CERTBOT_ARGS+=(-d "$DOMAIN" -d "$WWW_DOMAIN")

run certbot "${CERTBOT_ARGS[@]}"

run nginx -t
run nginx -s reload

echo "Done. Backups are in $BACKUP_DIR"
