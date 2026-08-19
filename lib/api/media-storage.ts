import { createHash, createHmac, randomUUID } from "node:crypto";
import { getBase64Payload, isStableStoredImageUrl, type ImageStorageClass } from "@/lib/api/image-storage";
import { fetchRemoteMediaBuffer } from "@/lib/api/remote-image-fetch";
import { isRemoteUrl } from "@/lib/utils";

const DEFAULT_MEDIA_UPLOAD_TIMEOUT_MS = 120_000;
const MAX_MEDIA_STORAGE_BYTES = 120 * 1024 * 1024;

export interface StoredMedia {
  url: string;
  display_url: string;
  delete_url: string;
  width: number;
  height: number;
  object_key?: string;
  bucket_name?: string;
  content_type?: string;
  size_bytes?: number;
  sha256?: string;
}

export interface StoreMediaInput {
  media?: string;
  bytes?: Buffer;
  contentType?: string;
  name: string;
  namePrefix?: string;
  storageClass?: ImageStorageClass;
  /** Server-generated immutable key. Never accept this value from a client. */
  objectKey?: string;
  forbidOverwrite?: boolean;
}

export interface StoreMediaOptions {
  maxRemoteBytes?: number;
  suppressErrorLog?: boolean;
  timeoutMs?: number;
}

export function isStableStoredMediaUrl(url: string) {
  return isStableStoredImageUrl(url);
}

/**
 * Mint a short-lived read capability for an object that has already passed
 * the canonical media-registry ownership and verification checks.
 *
 * The bucket fence prevents a compromised or stale registry row from making
 * this worker sign a key in a different bucket. Signed URLs are deliberately
 * ephemeral and must never be persisted as business data.
 */
export function createAliyunOssRegistryReadUrl(
  objectKey: string,
  expectedBucket: string,
  filename?: string,
  variant?: string,
) {
  const config = getAliyunOssConfig();
  if (!expectedBucket || expectedBucket !== config.bucket) {
    throw new Error("媒体资产 bucket 与当前 OSS 配置不匹配");
  }
  assertRegistryObjectKey(objectKey);
  return buildAliyunSignedReadUrl(config, objectKey, filename, variant);
}

export async function storeMedia(input: StoreMediaInput, options: StoreMediaOptions = {}): Promise<StoredMedia> {
  const config = getAliyunOssConfig();
  const upload = input.bytes
    ? resolveMediaBytes(input.bytes, input.contentType, input.name)
    : await resolveMediaPayload(input.media || "", input.name, options);
  const objectKey = input.objectKey
    ? validateExplicitObjectKey(input.objectKey, resolveAliyunObjectPrefix(input))
    : buildAliyunObjectKey(input, upload.extension, upload.bytes);
  const endpoint = config.endpoint || `${config.bucket}.${config.region}.aliyuncs.com`;
  const uploadUrl = `https://${endpoint}/${encodeObjectKey(objectKey)}`;
  const date = new Date().toUTCString();
  const canonicalizedResource = `/${config.bucket}/${objectKey}`;
  const ossHeaders: Record<string, string> = {};
  const objectAcl = resolveObjectAcl(input.storageClass || inferStorageClass(input.namePrefix));
  ossHeaders["x-oss-object-acl"] = objectAcl;
  if (input.forbidOverwrite) ossHeaders["x-oss-forbid-overwrite"] = "true";
  if (config.securityToken) ossHeaders["x-oss-security-token"] = config.securityToken;
  const canonicalizedOssHeaders = Object.entries(ossHeaders)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}\n`)
    .join("");
  const stringToSign = [
    "PUT",
    "",
    upload.contentType,
    date,
    `${canonicalizedOssHeaders}${canonicalizedResource}`,
  ].join("\n");
  const signature = createHmac("sha1", config.accessKeySecret).update(stringToSign).digest("base64");
  const headers: Record<string, string> = {
    Authorization: `OSS ${config.accessKeyId}:${signature}`,
    Date: date,
    "Content-Type": upload.contentType,
    "x-oss-object-acl": objectAcl,
  };
  if (input.forbidOverwrite) headers["x-oss-forbid-overwrite"] = "true";
  if (config.securityToken) headers["x-oss-security-token"] = config.securityToken;

  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: bufferToArrayBuffer(upload.bytes),
    headers,
    signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_MEDIA_UPLOAD_TIMEOUT_MS),
  });
  const responseText = await response.text();
  if (!response.ok && !(input.forbidOverwrite && response.status === 409 && await existingObjectMatches(config, objectKey, upload.bytes))) {
    if (!options.suppressErrorLog) {
      console.error("[media-storage] aliyun oss upload error:", response.status, responseText.slice(0, 500));
    }
    throw new Error(`媒体上传失败: Aliyun OSS HTTP ${response.status}`);
  }

  const url = objectAcl === "public-read"
    ? buildPublicObjectUrl(config.publicBaseUrl, objectKey)
    : buildAliyunSignedReadUrl(config, objectKey);
  return {
    url,
    display_url: url,
    delete_url: "",
    width: 0,
    height: 0,
    object_key: objectKey,
    bucket_name: config.bucket,
    content_type: upload.contentType,
    size_bytes: upload.bytes.length,
    sha256: createHash("sha256").update(upload.bytes).digest("hex"),
  };
}

async function resolveMediaPayload(media: string, name: string, options: StoreMediaOptions) {
  if (isRemoteUrl(media)) {
    const remote = await fetchRemoteMediaBuffer(media, {
      maxBytes: options.maxRemoteBytes || MAX_MEDIA_STORAGE_BYTES,
      timeoutMs: options.timeoutMs || DEFAULT_MEDIA_UPLOAD_TIMEOUT_MS,
    });
    const bytes = remote.bytes;
    assertMediaSize(bytes);
    const contentType = normalizeMediaContentType(remote.contentType) || inferMediaContentType(bytes, name);
    return { bytes, contentType, extension: extensionFromContentType(contentType) };
  }

  const contentTypeFromDataUrl = media.match(/^data:([^;,]+)[;,]/i)?.[1];
  const bytes = Buffer.from(getBase64Payload(media), "base64");
  assertMediaSize(bytes);
  const contentType = normalizeMediaContentType(contentTypeFromDataUrl) || inferMediaContentType(bytes, name);
  return { bytes, contentType, extension: extensionFromContentType(contentType) };
}

function resolveMediaBytes(bytes: Buffer, declaredContentType: string | undefined, name: string) {
  assertMediaSize(bytes);
  const contentType = normalizeMediaContentType(declaredContentType) || inferMediaContentType(bytes, name);
  return { bytes, contentType, extension: extensionFromContentType(contentType) };
}

function assertMediaSize(bytes: Buffer) {
  if (!bytes.length) throw new Error("媒体内容为空");
  if (bytes.length > MAX_MEDIA_STORAGE_BYTES) throw new Error("媒体文件过大，无法上传");
}

function bufferToArrayBuffer(bytes: Buffer) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function getAliyunOssConfig() {
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
  const bucket = process.env.ALIYUN_OSS_BUCKET?.trim();
  const region = process.env.ALIYUN_OSS_REGION?.trim();
  const publicBaseUrl = normalizeBaseUrl(process.env.ALIYUN_OSS_PUBLIC_BASE_URL);
  const endpoint = process.env.ALIYUN_OSS_ENDPOINT?.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const securityToken = process.env.ALIYUN_OSS_SECURITY_TOKEN?.trim();

  if (!accessKeyId || !accessKeySecret || !bucket || !region || !publicBaseUrl) {
    throw new Error(
      "媒体上传服务未配置 ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_BUCKET / ALIYUN_OSS_REGION / ALIYUN_OSS_PUBLIC_BASE_URL"
    );
  }

  return { accessKeyId, accessKeySecret, bucket, region, publicBaseUrl, endpoint, securityToken };
}

function buildAliyunObjectKey(input: StoreMediaInput, extension: string, bytes: Buffer) {
  const prefix = resolveAliyunObjectPrefix(input);
  const baseName = sanitizeObjectName(`${input.namePrefix || ""}${input.name}`) || "media";
  if ((input.storageClass || inferStorageClass(input.namePrefix)) === "generated") {
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
    return `${prefix}/by-generation/${baseName}-${digest}.${extension}`;
  }
  const now = new Date();
  const datePath = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("/");
  return [prefix, datePath, `${Date.now()}-${randomUUID().slice(0, 8)}-${baseName}.${extension}`]
    .filter(Boolean)
    .join("/");
}

function validateExplicitObjectKey(objectKey: string, requiredPrefix: string) {
  if (objectKey.length > 1024 || objectKey.startsWith("/") || objectKey.includes("\\") || objectKey.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("媒体上传失败: invalid immutable object key");
  }
  const prefix = cleanObjectPath(requiredPrefix);
  if (!prefix || !objectKey.startsWith(`${prefix}/`) || !/^[A-Za-z0-9._/-]+$/.test(objectKey)) {
    throw new Error("媒体上传失败: immutable object key is outside upload prefix");
  }
  return objectKey;
}

function assertRegistryObjectKey(objectKey: string) {
  if (
    !objectKey
    || Buffer.byteLength(objectKey, "utf8") > 1023
    || objectKey.startsWith("/")
    || objectKey.includes("\\")
    || objectKey.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("媒体资产 object key 无效");
  }
}

async function existingObjectMatches(config: ReturnType<typeof getAliyunOssConfig>, objectKey: string, expected: Buffer) {
  try {
    const endpoint = config.endpoint || `${config.bucket}.${config.region}.aliyuncs.com`;
    const date = new Date().toUTCString();
    const canonicalizedResource = `/${config.bucket}/${objectKey}`;
    const canonicalizedOssHeaders = config.securityToken ? `x-oss-security-token:${config.securityToken}\n` : "";
    const signature = createHmac("sha1", config.accessKeySecret)
      .update(["GET", "", "", date, `${canonicalizedOssHeaders}${canonicalizedResource}`].join("\n"))
      .digest("base64");
    const headers: Record<string, string> = { Authorization: `OSS ${config.accessKeyId}:${signature}`, Date: date };
    if (config.securityToken) headers["x-oss-security-token"] = config.securityToken;
    const response = await fetch(`https://${endpoint}/${encodeObjectKey(objectKey)}`, {
      method: "GET",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(DEFAULT_MEDIA_UPLOAD_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const actual = Buffer.from(await response.arrayBuffer());
    return actual.length === expected.length
      && createHash("sha256").update(actual).digest("hex") === createHash("sha256").update(expected).digest("hex");
  } catch {
    return false;
  }
}

function resolveAliyunObjectPrefix(input: StoreMediaInput) {
  const storageClass = input.storageClass || inferStorageClass(input.namePrefix);
  const configuredPrefix = getStorageClassPrefixEnv(storageClass);
  if (configuredPrefix) return cleanObjectPath(configuredPrefix);

  const basePrefix = cleanObjectPath(process.env.ALIYUN_OSS_PREFIX || "ai-tryon");
  const folder = storageClass === "generated"
    ? "generated-results/original"
    : storageClass === "favorite"
      ? "user-favorites/original"
      : storageClass === "site-asset"
        ? "site-assets/original"
        : storageClass === "temp"
          ? "temp/original"
          : "user-uploads/original";

  return [basePrefix, folder].filter(Boolean).join("/");
}

function inferStorageClass(namePrefix?: string): ImageStorageClass {
  if (namePrefix?.startsWith("generated-")) return "generated";
  if (namePrefix?.startsWith("favorite-")) return "favorite";
  if (namePrefix?.startsWith("site-asset-")) return "site-asset";
  if (namePrefix?.startsWith("temp-")) return "temp";
  return "upload";
}

function getStorageClassPrefixEnv(storageClass: ImageStorageClass) {
  if (storageClass === "generated") return process.env.ALIYUN_OSS_GENERATED_PREFIX;
  if (storageClass === "favorite") return process.env.ALIYUN_OSS_FAVORITE_PREFIX;
  if (storageClass === "site-asset") return process.env.ALIYUN_OSS_SITE_ASSET_PREFIX;
  if (storageClass === "temp") return process.env.ALIYUN_OSS_TEMP_PREFIX;
  return process.env.ALIYUN_OSS_UPLOAD_PREFIX;
}

function buildPublicObjectUrl(baseUrl: string, objectKey: string) {
  return `${normalizeBaseUrl(baseUrl)}/${encodeObjectKey(objectKey)}`;
}

function buildAliyunSignedReadUrl(
  config: ReturnType<typeof getAliyunOssConfig>,
  objectKey: string,
  filename?: string,
  variant?: string,
) {
  const expiresInSeconds = boundedReadExpiry(process.env.UPLOAD_READ_URL_TTL_SECONDS);
  const expires = String(Math.floor(Date.now() / 1000) + expiresInSeconds);
  const query: Record<string, string> = {};
  if (filename) {
    query["response-content-disposition"] = buildAttachmentContentDisposition(filename);
  }
  if (variant && OSS_PROCESS_VARIANTS[variant]) {
    query["x-oss-process"] = OSS_PROCESS_VARIANTS[variant];
  }
  if (config.securityToken) query["security-token"] = config.securityToken;
  const canonicalQuery = Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const canonicalizedResource = `/${config.bucket}/${objectKey}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  const signature = createHmac("sha1", config.accessKeySecret)
    .update(["GET", "", "", expires, canonicalizedResource].join("\n"))
    .digest("base64");
  const url = new URL(buildPublicObjectUrl(config.publicBaseUrl, objectKey));
  url.searchParams.set("OSSAccessKeyId", config.accessKeyId);
  url.searchParams.set("Expires", expires);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  url.searchParams.set("Signature", signature);
  return url.toString();
}

const OSS_PROCESS_VARIANTS: Record<string, string> = {
  thumb: "image/resize,m_lfit,w_320/format,webp/quality,q_82",
  card: "image/resize,m_lfit,w_640/format,webp/quality,q_84",
  preview: "image/resize,m_lfit,w_1280/format,webp/quality,q_86",
  detail: "image/resize,m_lfit,w_2560/format,webp/quality,q_94",
};

function buildAttachmentContentDisposition(filename: string) {
  const safeFilename = filename
    .replace(/[\\/:*?"<>|\r\n]+/g, "-")
    .slice(0, 120) || "download";
  const encoded = encodeURIComponent(safeFilename)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, "%2A");
  return `attachment; filename="${safeFilename}"; filename*=UTF-8''${encoded}`;
}

function resolveObjectAcl(storageClass: ImageStorageClass) {
  return storageClass === "site-asset" ? "public-read" : "private";
}

function boundedReadExpiry(value?: string) {
  const parsed = value?.trim() ? Number(value) : 600;
  if (!Number.isInteger(parsed) || parsed < 60 || parsed > 3600) {
    throw new Error("UPLOAD_READ_URL_TTL_SECONDS 必须是 60-3600 秒的整数");
  }
  return parsed;
}

function cleanObjectPath(value: string) {
  return value
    .split("/")
    .map((part) => sanitizeObjectName(part))
    .filter(Boolean)
    .join("/");
}

function sanitizeObjectName(value: string) {
  return value
    .trim()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function encodeObjectKey(value: string) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function normalizeBaseUrl(value?: string | null) {
  return (value || "").trim().replace(/\/+$/, "");
}

function normalizeMediaContentType(value?: string | null) {
  const contentType = (value || "").split(";")[0].trim().toLowerCase();
  if (contentType.startsWith("video/") || contentType.startsWith("audio/") || contentType.startsWith("image/")) {
    return contentType;
  }
  return "";
}

function inferMediaContentType(bytes: Buffer, name: string) {
  if (bytes.subarray(0, 3).toString("ascii") === "ID3") return "audio/mpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WAVE") return "audio/wav";
  if (bytes.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  const extension = name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (extension === "mp4" || extension === "m4v") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  if (extension === "webm") return "video/webm";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "aac") return "audio/aac";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

function extensionFromContentType(contentType: string) {
  if (contentType === "video/mp4") return "mp4";
  if (contentType === "video/quicktime" || contentType === "video/mov") return "mov";
  if (contentType === "video/webm") return "webm";
  if (contentType === "audio/mpeg" || contentType === "audio/mp3") return "mp3";
  if (contentType === "audio/wav" || contentType === "audio/x-wav" || contentType === "audio/wave") return "wav";
  if (contentType === "audio/mp4" || contentType === "audio/x-m4a") return "m4a";
  if (contentType === "audio/aac") return "aac";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "bin";
}
