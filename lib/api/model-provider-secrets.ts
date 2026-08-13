import crypto from "node:crypto";

const ENCRYPTION_KEY_ENV = "ADMIN_SECRETS_ENCRYPTION_KEY";
const ENCRYPTED_PREFIX = "enc:v1:";
const ENV_REF_PREFIX = "env:";

function getEncryptionKey(): Buffer | null {
  const raw = process.env[ENCRYPTION_KEY_ENV]?.trim();
  if (!raw) return null;

  const hex = raw.startsWith("hex:") ? raw.slice(4) : raw;
  if (!/^[a-f0-9]{64}$/i.test(hex)) return null;

  return Buffer.from(hex, "hex");
}

export function isEncryptedProviderSecret(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

export function isEnvProviderSecret(value: string): boolean {
  return value.startsWith(ENV_REF_PREFIX);
}

export function encryptProviderSecret(plain: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error(`${ENCRYPTION_KEY_ENV} is not configured; cannot encrypt provider API keys`);
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

export function decryptProviderSecret(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  if (isEnvProviderSecret(trimmed)) {
    const envName = trimmed.slice(ENV_REF_PREFIX.length).trim();
    return process.env[envName]?.trim() || "";
  }

  if (!isEncryptedProviderSecret(trimmed)) {
    // Legacy plaintext values are supported for local/dev migration only.
    return trimmed;
  }

  const key = getEncryptionKey();
  if (!key) return "";

  const raw = trimmed.slice(ENCRYPTED_PREFIX.length);
  const payload = Buffer.from(raw, "base64");
  if (payload.length < 12 + 16 + 1) return "";

  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function maskProviderSecret(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  if (isEnvProviderSecret(trimmed)) return trimmed;
  if (isEncryptedProviderSecret(trimmed)) return "已加密，不可见";
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}
