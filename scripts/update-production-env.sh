#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-$HOME/apps/wanxiangzy/shared/.env.production}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  echo "Usage:" >&2
  echo "  NEW_OSS_ACCESS_KEY_ID=... NEW_OSS_ACCESS_KEY_SECRET=... ADMIN_SECRETS_ENCRYPTION_KEY=... $0 [path-to-.env.production]" >&2
  exit 1
fi

NEW_OSS_ACCESS_KEY_ID="${NEW_OSS_ACCESS_KEY_ID:-}"
NEW_OSS_ACCESS_KEY_SECRET="${NEW_OSS_ACCESS_KEY_SECRET:-}"
ADMIN_SECRETS_ENCRYPTION_KEY="${ADMIN_SECRETS_ENCRYPTION_KEY:-}"

python3 - "$ENV_FILE" "$NEW_OSS_ACCESS_KEY_ID" "$NEW_OSS_ACCESS_KEY_SECRET" "$ADMIN_SECRETS_ENCRYPTION_KEY" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
new_access_key_id = sys.argv[2]
new_access_key_secret = sys.argv[3]
admin_secrets_key = sys.argv[4]
text = path.read_text()

updates = {
    "NEXT_PUBLIC_APP_URL": "https://pixel-diffusion.com",
    "IMAGE_STORAGE_PROVIDER": "aliyun-oss",
    "ALIYUN_OSS_REGION": "oss-cn-hongkong",
    "ALIYUN_OSS_BUCKET": "vasthk",
    "ALIYUN_OSS_PUBLIC_BASE_URL": "https://vasthk.oss-cn-hongkong.aliyuncs.com",
    "NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS": "vasthk.oss-cn-hongkong.aliyuncs.com,vasthk.cn-hongkong.thepacificgls.com,cn-hongkong.thepacificgls.com",
    "ALIYUN_OSS_SITE_ASSET_PREFIX": "site-assets/original",
    "ALIYUN_OSS_UPLOAD_PREFIX": "user-uploads/original",
    "ALIYUN_OSS_GENERATED_PREFIX": "generated-results/original",
    "ALIYUN_OSS_FAVORITE_PREFIX": "user-favorites/original",
    "ALIYUN_OSS_TEMP_PREFIX": "temp/original",
}

if new_access_key_id:
    updates["ALIYUN_OSS_ACCESS_KEY_ID"] = new_access_key_id
if new_access_key_secret:
    updates["ALIYUN_OSS_ACCESS_KEY_SECRET"] = new_access_key_secret
if admin_secrets_key:
    updates["ADMIN_SECRETS_ENCRYPTION_KEY"] = admin_secrets_key

remove_keys = [
    "LINGYA_BASE_URL", "LINGYA_VISION_MODEL", "LINGYA_TEXT_MODEL", "LINGYA_API_KEY",
    "GPT_IMAGE_PROVIDER",
    "CATROUTER_BASE_URL", "CATROUTER_API_KEY", "CATROUTER_GPT_IMAGE_MODEL",
    "CATROUTER_NANO_BANANA_MODEL", "CATROUTER_NANO_BANANA_PRO_MODEL",
    "NANO_BANANA_PROVIDER",
    "YUNWU_NATIVE_BASE_URL", "YUNWU_NATIVE_API_KEY",
    "YUNWU_NANO_BANANA_MODEL", "YUNWU_NANO_BANANA_PRO_MODEL",
    "LAOZHANG_BASE_URL", "LAOZHANG_API_KEY",
    "LAOZHANG_NANO_BANANA_MODEL", "LAOZHANG_NANO_BANANA_PRO_MODEL",
    "PLATO_BASE_URL", "PLATO_API_KEY", "PLATO_GPT_IMAGE_MODEL",
    "ANALYZE_LLM_PROVIDER",
    "XIAOMI_MIMO_API_KEY", "XIAOMI_MIMO_BASE_URL", "XIAOMI_MIMO_MODEL",
    "XIAOMI_MIMO_TEXT_MODEL", "XIAOMI_MIMO_VISION_MODEL",
    "MINIMAX_BASE_URL", "MINIMAX_API_KEY", "MINIMAX_MODEL",
    "MINIMAX_VISION_MODEL", "MINIMAX_TEXT_MODEL",
    "TRYON_CLOTHING_ANALYZE_BASE_URL", "TRYON_CLOTHING_ANALYZE_API_KEY",
    "TRYON_CLOTHING_ANALYZE_MODEL", "TRYON_CLOTHING_ANALYZE_TIMEOUT_MS",
]

lines = text.splitlines()
keys_seen = set()
out = []
for line in lines:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        out.append(line)
        continue
    if "=" not in stripped:
        out.append(line)
        continue
    key = stripped.split("=", 1)[0].strip()
    if key in remove_keys:
        continue
    if key in updates:
        out.append(f"{key}={updates[key]}")
        keys_seen.add(key)
        continue
    out.append(line)

for key, value in updates.items():
    if key not in keys_seen:
        out.append(f"{key}={value}")

path.write_text("\n".join(out) + "\n")
print(f"updated {path}")
print("removed old provider keys:", len(remove_keys))
print("upserted keys:", len(updates))
if not new_access_key_id or not new_access_key_secret:
    print("WARNING: OSS AccessKey not updated; pass NEW_OSS_ACCESS_KEY_ID and NEW_OSS_ACCESS_KEY_SECRET to update them.")
if not admin_secrets_key:
    print("WARNING: ADMIN_SECRETS_ENCRYPTION_KEY not updated; pass ADMIN_SECRETS_ENCRYPTION_KEY to update it.")
PY
