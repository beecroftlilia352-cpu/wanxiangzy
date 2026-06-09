import { randomBytes } from "node:crypto";

const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_PREFIX = "VW";

export function normalizeInviteCode(value: unknown) {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/[\s-]+/g, "")
    : "";
}

export function generateInviteCode({
  prefix = DEFAULT_PREFIX,
  randomLength = 10,
}: {
  prefix?: string;
  randomLength?: number;
} = {}) {
  const cleanPrefix = normalizeInviteCode(prefix).replace(/[^A-Z0-9]/g, "").slice(0, 12) || DEFAULT_PREFIX;
  const length = clampInteger(randomLength, 6, 24, 10);
  const bytes = randomBytes(length);
  let code = cleanPrefix;

  for (let index = 0; index < length; index += 1) {
    code += INVITE_CODE_ALPHABET[bytes[index] % INVITE_CODE_ALPHABET.length];
  }

  return code;
}

export function mapInviteCodeError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid_invite_code")) return "邀请码无效";
  if (normalized.includes("not_started_invite_code")) return "邀请码尚未生效";
  if (normalized.includes("disabled_invite_code")) return "邀请码已停用";
  if (normalized.includes("expired_invite_code")) return "邀请码已过期";
  if (normalized.includes("exhausted_invite_code")) return "邀请码已被使用";
  if (normalized.includes("consume_invite_code") || normalized.includes("could not find the function")) {
    return "邀请码服务尚未初始化，请联系管理员";
  }
  return message || "邀请码校验失败";
}

export function isExistingSignupIdentity(data: unknown) {
  if (!data || typeof data !== "object") return false;
  const user = (data as { user?: unknown }).user;
  if (!user || typeof user !== "object") return false;
  const identities = (user as { identities?: unknown }).identities;
  return Array.isArray(identities) && identities.length === 0;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
