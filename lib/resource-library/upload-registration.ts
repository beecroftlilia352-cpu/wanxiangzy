import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RESOURCE_LIBRARY_ASSET_COLUMNS,
  ResourceLibraryError,
  resourceLibraryAssetRowToClient,
} from "@/lib/resource-library/server";
import type { ResourceLibraryAsset, ResourceLibraryMediaType } from "@/lib/resource-library/types";

const TOKEN_VERSION = 1;
const TOKEN_TTL_SECONDS = 10 * 60;
const MAX_OBJECT_KEY_LENGTH = 512;

export type TrustedUploadDescriptor = {
  url: string;
  objectKey: string;
  mediaType: ResourceLibraryMediaType;
  title?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
};

type UploadRegistrationTokenPayload = TrustedUploadDescriptor & {
  v: number;
  userId: string;
  exp: number;
};

export async function registerTrustedUploadedResourceAsset(
  supabase: SupabaseClient,
  userId: string,
  descriptor: TrustedUploadDescriptor,
): Promise<ResourceLibraryAsset> {
  const trusted = normalizeTrustedUploadDescriptor(descriptor);
  const now = new Date().toISOString();
  const originKey = createUploadAssetOriginKey(trusted.objectKey);
  const { data, error } = await supabase
    .from("resource_library_assets")
    .upsert({
      user_id: userId,
      source_type: "upload",
      media_type: trusted.mediaType,
      module_key: null,
      url: trusted.url,
      preview_url: null,
      storage_provider: "aliyun-oss",
      object_key: trusted.objectKey,
      source_generation_id: null,
      source_result_index: null,
      origin_key: originKey,
      group_key: null,
      group_total: 1,
      title: normalizeTitle(trusted.title || trusted.originalFilename),
      original_filename: normalizeOptionalText(trusted.originalFilename, 255),
      mime_type: normalizeMimeType(trusted.mimeType, trusted.mediaType),
      byte_size: normalizeNonNegativeInteger(trusted.byteSize),
      width: normalizePositiveInteger(trusted.width),
      height: normalizePositiveInteger(trusted.height),
      duration_ms: normalizeNonNegativeInteger(trusted.durationMs),
      metadata: {},
      storage_state: "active",
      moderation_status: "allowed",
      saved_at: now,
      deleted_at: null,
    }, { onConflict: "user_id,origin_key" })
    .select(RESOURCE_LIBRARY_ASSET_COLUMNS)
    .single();
  if (error) {
    throw new ResourceLibraryError(error.message || "本地资源登记失败", 500, "DATABASE_ERROR");
  }
  return resourceLibraryAssetRowToClient(
    (data || {}) as Parameters<typeof resourceLibraryAssetRowToClient>[0],
  );
}

export function createUploadRegistrationToken(userId: string, descriptor: TrustedUploadDescriptor) {
  const trusted = normalizeTrustedUploadDescriptor(descriptor);
  const payload: UploadRegistrationTokenPayload = {
    v: TOKEN_VERSION,
    userId,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    ...trusted,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signTokenPayload(encoded)}`;
}

export function verifyUploadRegistrationToken(token: unknown, userId: string): TrustedUploadDescriptor {
  if (typeof token !== "string" || token.length < 20 || token.length > 4_096) {
    throw invalidToken();
  }
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) throw invalidToken();

  const expected = Buffer.from(signTokenPayload(encoded), "ascii");
  const actual = Buffer.from(signature, "ascii");
  if (!/^[A-Za-z0-9_-]+$/.test(signature)
    || actual.length !== expected.length
    || !timingSafeEqual(actual, expected)) {
    throw invalidToken();
  }

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw invalidToken();
  }
  if (!isRecord(value)
    || value.v !== TOKEN_VERSION
    || value.userId !== userId
    || typeof value.exp !== "number"
    || value.exp < Math.floor(Date.now() / 1000)) {
    throw invalidToken();
  }
  return normalizeTrustedUploadDescriptor({
    url: value.url,
    objectKey: value.objectKey,
    mediaType: value.mediaType,
    title: value.title,
    originalFilename: value.originalFilename,
    mimeType: value.mimeType,
    byteSize: value.byteSize,
    width: value.width,
    height: value.height,
    durationMs: value.durationMs,
  } as TrustedUploadDescriptor);
}

export function createUploadAssetOriginKey(objectKey: string) {
  return `upload:${createHash("sha256").update(objectKey).digest("hex")}`;
}

export function normalizeTrustedUploadDescriptor(value: TrustedUploadDescriptor): TrustedUploadDescriptor {
  if (!isRecord(value)) throw invalidUpload();
  const objectKey = typeof value.objectKey === "string" ? decodeObjectKey(value.objectKey) : "";
  const url = typeof value.url === "string" ? value.url.trim() : "";
  const mediaType = value.mediaType === "video" ? "video" : value.mediaType === "image" ? "image" : null;
  if (!objectKey || objectKey.length > MAX_OBJECT_KEY_LENGTH || !mediaType) throw invalidUpload();

  const uploadPrefix = resolveConfiguredUploadPrefix();
  if (objectKey !== uploadPrefix && !objectKey.startsWith(`${uploadPrefix}/`)) {
    throw new ResourceLibraryError("仅支持登记当前用户上传目录中的 OSS 资源", 400, "UNTRUSTED_UPLOAD_PREFIX");
  }
  const expectedUrl = buildConfiguredPublicObjectUrl(objectKey);
  if (!expectedUrl || !sameCanonicalUrl(url, expectedUrl)) {
    throw new ResourceLibraryError("上传资源地址与 OSS 对象不匹配", 400, "UNTRUSTED_UPLOAD_URL");
  }

  return {
    url: expectedUrl,
    objectKey,
    mediaType,
    title: normalizeOptionalText(value.title, 120),
    originalFilename: normalizeOptionalText(value.originalFilename, 255),
    mimeType: normalizeMimeType(value.mimeType, mediaType),
    byteSize: normalizeNonNegativeInteger(value.byteSize),
    width: normalizePositiveInteger(value.width),
    height: normalizePositiveInteger(value.height),
    durationMs: normalizeNonNegativeInteger(value.durationMs),
  };
}

function signTokenPayload(encoded: string) {
  return createHmac("sha256", getRegistrationSecret()).update(encoded).digest("base64url");
}

function getRegistrationSecret() {
  const secret = process.env.RESOURCE_LIBRARY_UPLOAD_TOKEN_SECRET?.trim()
    || process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
  if (!secret) {
    throw new ResourceLibraryError("资源登记签名服务未配置", 500, "UPLOAD_REGISTRATION_NOT_CONFIGURED");
  }
  return secret;
}

function resolveConfiguredUploadPrefix() {
  const configured = cleanObjectPath(process.env.ALIYUN_OSS_UPLOAD_PREFIX || "");
  if (configured) return configured;
  const base = cleanObjectPath(process.env.ALIYUN_OSS_PREFIX || "ai-tryon");
  return [base, "user-uploads/original"].filter(Boolean).join("/");
}

function buildConfiguredPublicObjectUrl(objectKey: string) {
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
    const expectedUrl = new URL(expected);
    return !actualUrl.username
      && !actualUrl.password
      && !actualUrl.search
      && !actualUrl.hash
      && actualUrl.href === expectedUrl.href;
  } catch {
    return false;
  }
}

function decodeObjectKey(value: string) {
  const normalized = value.trim().replace(/^\/+/, "");
  if (!normalized || normalized.includes("\\") || normalized.split("/").some((part) => part === ".." || part === ".")) {
    return "";
  }
  try {
    return normalized.split("/").map(decodeURIComponent).filter(Boolean).join("/");
  } catch {
    return "";
  }
}

function cleanObjectPath(value: string) {
  return value
    .split("/")
    .map((part) => part.trim()
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80))
    .filter(Boolean)
    .join("/");
}

function normalizeTitle(value: unknown) {
  return normalizeOptionalText(value, 120) || "本地上传";
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) || null : null;
}

function normalizeMimeType(value: unknown, mediaType: ResourceLibraryMediaType) {
  if (typeof value !== "string") return null;
  const normalized = value.split(";")[0].trim().toLowerCase();
  return normalized.startsWith(`${mediaType}/`) && normalized.length <= 120 ? normalized : null;
}

function normalizeNonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizePositiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function invalidToken() {
  return new ResourceLibraryError("上传资源登记凭证无效或已过期", 400, "INVALID_UPLOAD_REGISTRATION_TOKEN");
}

function invalidUpload() {
  return new ResourceLibraryError("上传资源信息无效", 400, "INVALID_UPLOAD_RESOURCE");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
