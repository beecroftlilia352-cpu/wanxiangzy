import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1;
const DEFAULT_MASK_REFERENCE_TTL_SECONDS = 30 * 60;
const MIN_MASK_REFERENCE_TTL_SECONDS = 5 * 60;
const MAX_MASK_REFERENCE_TTL_SECONDS = 24 * 60 * 60;
const MAX_TOKEN_LENGTH = 4_096;
const MASK_REFERENCE_ORIGIN = "https://ai-tool-ref.invalid";
const MASK_REFERENCE_PATH = "/mask/";

type MaskReferencePayload = {
  v: typeof TOKEN_VERSION;
  type: "mask";
  userId: string;
  url: string;
  objectKey: string;
  width: number;
  height: number;
  contentType: "image/png";
  exp: number;
};

export type AiToolMaskReference = {
  token: string;
  referenceUrl: string;
  url: string;
  objectKey: string;
  width: number;
  height: number;
  contentType: "image/png";
  expiresAt: string;
};

export class AiToolAssetReferenceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, options: { code: string; status?: number }) {
    super(message);
    this.name = "AiToolAssetReferenceError";
    this.code = options.code;
    this.status = options.status ?? 400;
  }
}

export function createAiToolMaskReference(input: {
  userId: string;
  url: string;
  objectKey: string;
  width: number;
  height: number;
  contentType: "image/png";
  nowSeconds?: number;
}): AiToolMaskReference {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload = normalizeMaskReferencePayload({
    v: TOKEN_VERSION,
    type: "mask",
    userId: input.userId,
    url: input.url,
    objectKey: input.objectKey,
    width: input.width,
    height: input.height,
    contentType: input.contentType,
    exp: now + getMaskReferenceTtlSeconds(),
  });
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const token = `${encoded}.${sign(encoded)}`;
  return {
    token,
    referenceUrl: `${MASK_REFERENCE_ORIGIN}${MASK_REFERENCE_PATH}${encodeURIComponent(token)}`,
    url: payload.url,
    objectKey: payload.objectKey,
    width: payload.width,
    height: payload.height,
    contentType: payload.contentType,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export function verifyAiToolMaskReference(
  value: unknown,
  userId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): AiToolMaskReference {
  const token = extractMaskReferenceToken(value);
  if (!token || token.length > MAX_TOKEN_LENGTH) throw invalidReference();
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(signature)) throw invalidReference();

  const expected = Buffer.from(sign(encoded), "ascii");
  const actual = Buffer.from(signature, "ascii");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalidReference();

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw invalidReference();
  }
  const payload = normalizeMaskReferencePayload(raw);
  if (payload.userId !== userId) {
    throw new AiToolAssetReferenceError("蒙版引用不属于当前用户", {
      code: "AI_TOOL_MASK_REFERENCE_FORBIDDEN",
      status: 403,
    });
  }
  if (payload.exp <= nowSeconds) {
    throw new AiToolAssetReferenceError("蒙版引用已过期，请重新生成蒙版", {
      code: "AI_TOOL_MASK_REFERENCE_EXPIRED",
      status: 410,
    });
  }
  return {
    token,
    referenceUrl: `${MASK_REFERENCE_ORIGIN}${MASK_REFERENCE_PATH}${encodeURIComponent(token)}`,
    url: payload.url,
    objectKey: payload.objectKey,
    width: payload.width,
    height: payload.height,
    contentType: payload.contentType,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export function isAiToolMaskReferenceUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === MASK_REFERENCE_ORIGIN
      && url.pathname.startsWith(MASK_REFERENCE_PATH)
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

/** Accepts only canonical objects that our server wrote with this user's
 * hashed scope in an AI-owned generated/temp prefix. */
export function assertAiToolOwnedOssAssetUrl(
  value: unknown,
  userId: string,
  storageClasses: Array<"generated" | "temp">,
) {
  if (typeof value !== "string") throw invalidOwnedAsset();
  const baseValue = process.env.ALIYUN_OSS_PUBLIC_BASE_URL?.trim();
  if (!baseValue) throw invalidOwnedAsset();
  try {
    const url = new URL(value);
    const base = new URL(baseValue);
    if (url.protocol !== "https:"
      || url.hostname.toLowerCase() !== base.hostname.toLowerCase()
      || url.username
      || url.password
      || url.search
      || url.hash) {
      throw invalidOwnedAsset();
    }
    const basePath = decodeObjectKey(base.pathname);
    let objectKey = decodeObjectKey(url.pathname);
    if (basePath) {
      if (!objectKey.startsWith(`${basePath}/`)) throw invalidOwnedAsset();
      objectKey = objectKey.slice(basePath.length + 1);
    }
    const inAllowedPrefix = storageClasses.some((storageClass) => {
      const prefix = storageClass === "temp" ? resolveTempPrefix() : resolveGeneratedPrefix();
      return objectKey === prefix || objectKey.startsWith(`${prefix}/`);
    });
    const userScope = createHash("sha256").update(userId).digest("hex").slice(0, 12);
    const filename = objectKey.split("/").at(-1) || "";
    if (!inAllowedPrefix || !filename.includes(userScope)) throw invalidOwnedAsset();
    return buildPublicObjectUrl(objectKey);
  } catch (error) {
    if (error instanceof AiToolAssetReferenceError) throw error;
    throw invalidOwnedAsset();
  }
}

function extractMaskReferenceToken(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!isAiToolMaskReferenceUrl(trimmed)) return trimmed;
  try {
    return decodeURIComponent(new URL(trimmed).pathname.slice(MASK_REFERENCE_PATH.length));
  } catch {
    return "";
  }
}

function normalizeMaskReferencePayload(value: unknown): MaskReferencePayload {
  if (!isRecord(value)
    || value.v !== TOKEN_VERSION
    || value.type !== "mask"
    || typeof value.userId !== "string"
    || !value.userId
    || typeof value.url !== "string"
    || typeof value.objectKey !== "string"
    || value.contentType !== "image/png"
    || !isPositiveInteger(value.width)
    || !isPositiveInteger(value.height)
    || value.width * value.height > 32_000_000
    || !isPositiveInteger(value.exp)) {
    throw invalidReference();
  }
  const objectKey = decodeObjectKey(value.objectKey);
  const allowedPrefixes = [resolveTempPrefix(), resolveGeneratedPrefix()];
  if (!objectKey || !allowedPrefixes.some((prefix) => (
    objectKey === prefix || objectKey.startsWith(`${prefix}/`)
  ))) {
    throw invalidReference();
  }
  const expectedUrl = buildPublicObjectUrl(objectKey);
  if (!expectedUrl || !sameCanonicalUrl(value.url, expectedUrl)) throw invalidReference();
  return {
    v: TOKEN_VERSION,
    type: "mask",
    userId: value.userId,
    url: expectedUrl,
    objectKey,
    width: value.width,
    height: value.height,
    contentType: "image/png",
    exp: value.exp,
  };
}

function sign(encoded: string) {
  return createHmac("sha256", getReferenceSecret()).update(encoded).digest("base64url");
}

function getReferenceSecret() {
  const secret = process.env.AI_TOOL_ASSET_REF_SECRET?.trim()
    || process.env.RESOURCE_LIBRARY_UPLOAD_TOKEN_SECRET?.trim()
    || process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
  if (!secret) {
    throw new AiToolAssetReferenceError("AI 工具资产引用签名尚未配置", {
      code: "AI_TOOL_ASSET_REFERENCE_NOT_CONFIGURED",
      status: 503,
    });
  }
  return secret;
}

function getMaskReferenceTtlSeconds() {
  const configured = Number(process.env.AI_TOOL_MASK_REF_TTL_SECONDS);
  if (!Number.isFinite(configured)) return DEFAULT_MASK_REFERENCE_TTL_SECONDS;
  return Math.min(MAX_MASK_REFERENCE_TTL_SECONDS, Math.max(MIN_MASK_REFERENCE_TTL_SECONDS, Math.round(configured)));
}

function resolveTempPrefix() {
  const configured = cleanPath(process.env.ALIYUN_OSS_TEMP_PREFIX || "");
  if (configured) return configured;
  const base = cleanPath(process.env.ALIYUN_OSS_PREFIX || "ai-tryon");
  return [base, "temp/original"].filter(Boolean).join("/");
}

function resolveGeneratedPrefix() {
  const configured = cleanPath(process.env.ALIYUN_OSS_GENERATED_PREFIX || "");
  if (configured) return configured;
  const base = cleanPath(process.env.ALIYUN_OSS_PREFIX || "ai-tryon");
  return [base, "generated-results/original"].filter(Boolean).join("/");
}

function buildPublicObjectUrl(objectKey: string) {
  const base = (process.env.ALIYUN_OSS_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  try {
    const parsed = new URL(base);
    if (parsed.protocol !== "https:") return "";
  } catch {
    return "";
  }
  return `${base}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

function sameCanonicalUrl(actual: string, expected: string) {
  try {
    const actualUrl = new URL(actual);
    return !actualUrl.username
      && !actualUrl.password
      && !actualUrl.search
      && !actualUrl.hash
      && actualUrl.href === expected;
  } catch {
    return false;
  }
}

function decodeObjectKey(value: string) {
  const normalized = value.trim().replace(/^\/+/, "");
  if (!normalized || normalized.includes("\\") || normalized.split("/").some((part) => part === "." || part === "..")) {
    return "";
  }
  try {
    return normalized.split("/").map(decodeURIComponent).filter(Boolean).join("/");
  } catch {
    return "";
  }
}

function cleanPath(value: string) {
  return value.split("/").map((part) => part.trim()).filter(Boolean).join("/");
}

function invalidReference() {
  return new AiToolAssetReferenceError("蒙版引用无效，请重新生成蒙版", {
    code: "AI_TOOL_MASK_REFERENCE_INVALID",
  });
}

function invalidOwnedAsset() {
  return new AiToolAssetReferenceError("AI 工具图片不属于当前用户", {
    code: "AI_TOOL_ASSET_NOT_OWNED",
    status: 403,
  });
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
