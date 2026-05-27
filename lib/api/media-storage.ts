import { createHmac, randomUUID } from "node:crypto";
import { getBase64Payload, isStableStoredImageUrl, type ImageStorageClass } from "@/lib/api/image-storage";

const DEFAULT_MEDIA_UPLOAD_TIMEOUT_MS = 120_000;
const MAX_MEDIA_STORAGE_BYTES = 120 * 1024 * 1024;

export interface StoredMedia {
  url: string;
  display_url: string;
  delete_url: string;
  width: number;
  height: number;
}

export interface StoreMediaInput {
  media: string;
  name: string;
  namePrefix?: string;
  storageClass?: ImageStorageClass;
}

export interface StoreMediaOptions {
  suppressErrorLog?: boolean;
  timeoutMs?: number;
}

export function isStableStoredMediaUrl(url: string) {
  return isStableStoredImageUrl(url);
}

export async function storeMedia(input: StoreMediaInput, options: StoreMediaOptions = {}): Promise<StoredMedia> {
  const config = getAliyunOssConfig();
  const upload = await resolveMediaPayload(input.media, input.name, options);
  const objectKey = buildAliyunObjectKey(input, upload.extension);
  const endpoint = config.endpoint || `${config.bucket}.${config.region}.aliyuncs.com`;
  const uploadUrl = `https://${endpoint}/${encodeObjectKey(objectKey)}`;
  const date = new Date().toUTCString();
  const canonicalizedResource = `/${config.bucket}/${objectKey}`;
  const canonicalizedOssHeaders = config.securityToken ? `x-oss-security-token:${config.securityToken}\n` : "";
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
  };
  if (config.securityToken) headers["x-oss-security-token"] = config.securityToken;

  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: upload.bytes,
    headers,
    signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_MEDIA_UPLOAD_TIMEOUT_MS),
  });
  const responseText = await response.text();
  if (!response.ok) {
    if (!options.suppressErrorLog) {
      console.error("[media-storage] aliyun oss upload error:", response.status, responseText.slice(0, 500));
    }
    throw new Error(`媒体上传失败: Aliyun OSS HTTP ${response.status}`);
  }

  const url = buildPublicObjectUrl(config.publicBaseUrl, objectKey);
  return { url, display_url: url, delete_url: "", width: 0, height: 0 };
}

async function resolveMediaPayload(media: string, name: string, options: StoreMediaOptions) {
  if (isRemoteUrl(media)) {
    const response = await fetch(media, {
      signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_MEDIA_UPLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`媒体上传失败: remote media HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assertMediaSize(bytes);
    const contentType = normalizeMediaContentType(response.headers.get("content-type")) || inferMediaContentType(bytes, name);
    return { bytes, contentType, extension: extensionFromContentType(contentType) };
  }

  const contentTypeFromDataUrl = media.match(/^data:([^;,]+)[;,]/i)?.[1];
  const bytes = Buffer.from(getBase64Payload(media), "base64");
  assertMediaSize(bytes);
  const contentType = normalizeMediaContentType(contentTypeFromDataUrl) || inferMediaContentType(bytes, name);
  return { bytes, contentType, extension: extensionFromContentType(contentType) };
}

function assertMediaSize(bytes: Buffer) {
  if (!bytes.length) throw new Error("媒体内容为空");
  if (bytes.length > MAX_MEDIA_STORAGE_BYTES) throw new Error("媒体文件过大，无法上传");
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

function buildAliyunObjectKey(input: StoreMediaInput, extension: string) {
  const prefix = resolveAliyunObjectPrefix(input);
  const now = new Date();
  const datePath = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("/");
  const baseName = sanitizeObjectName(`${input.namePrefix || ""}${input.name}`) || "media";
  return [prefix, datePath, `${Date.now()}-${randomUUID().slice(0, 8)}-${baseName}.${extension}`]
    .filter(Boolean)
    .join("/");
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

function isRemoteUrl(value: string) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
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
  if (bytes.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  const extension = name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (extension === "mp4" || extension === "m4v") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  if (extension === "webm") return "video/webm";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

function extensionFromContentType(contentType: string) {
  if (contentType === "video/mp4") return "mp4";
  if (contentType === "video/quicktime" || contentType === "video/mov") return "mov";
  if (contentType === "video/webm") return "webm";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "bin";
}
