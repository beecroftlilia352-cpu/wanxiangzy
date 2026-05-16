import { createHmac, randomUUID } from "node:crypto";

const IMGBB_API_URL = "https://api.imgbb.com/1/upload";
const DEFAULT_IMAGE_UPLOAD_TIMEOUT_MS = 45_000;
const MAX_IMAGE_STORAGE_BYTES = 32 * 1024 * 1024;
const DEFAULT_ALIYUN_DOWNLOAD_EXPIRES_SECONDS = 5 * 60;

export type ImageStorageProvider = "imgbb" | "aliyun-oss";
export type ImageStorageClass = "upload" | "generated" | "favorite" | "site-asset" | "temp";

export interface StoredImage {
  url: string;
  display_url: string;
  delete_url: string;
  width: number;
  height: number;
}

export interface StoreImageInput {
  image: string;
  name: string;
  namePrefix?: string;
  storageClass?: ImageStorageClass;
}

export interface StoreImageOptions {
  suppressErrorLog?: boolean;
  timeoutMs?: number;
}

export interface ImageStorageAdapter {
  provider: ImageStorageProvider;
  isStableUrl(url: string): boolean;
  storeImage(input: StoreImageInput, options?: StoreImageOptions): Promise<StoredImage>;
}

export function getImageStorageAdapter(): ImageStorageAdapter {
  const provider = (process.env.IMAGE_STORAGE_PROVIDER || "imgbb").trim().toLowerCase();
  if (provider === "aliyun-oss") return aliyunOssStorageAdapter;
  return imgbbStorageAdapter;
}

export function getBase64Payload(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

export function isStableStoredImageUrl(url: string) {
  return getImageStorageAdapter().isStableUrl(url);
}

export async function storeImage(
  input: StoreImageInput,
  options?: StoreImageOptions
) {
  return getImageStorageAdapter().storeImage(input, options);
}

export function createAliyunOssDownloadUrl(
  imageUrl: string,
  filename: string,
  expiresInSeconds = DEFAULT_ALIYUN_DOWNLOAD_EXPIRES_SECONDS
) {
  let config: ReturnType<typeof getAliyunOssConfig>;
  try {
    config = getAliyunOssConfig();
  } catch {
    return null;
  }

  const objectKey = resolveAliyunOssObjectKey(imageUrl, config);
  if (!objectKey) return null;

  const expires = String(Math.floor(Date.now() / 1000) + expiresInSeconds);
  const downloadUrl = new URL(buildPublicObjectUrl(config.downloadBaseUrl, objectKey));
  const canonicalQuery: Record<string, string> = {
    "response-content-disposition": buildAttachmentContentDisposition(filename),
  };
  if (config.securityToken) canonicalQuery["security-token"] = config.securityToken;

  const canonicalizedResource = buildAliyunCanonicalizedResource(config.bucket, objectKey, canonicalQuery);
  const stringToSign = ["GET", "", "", expires, canonicalizedResource].join("\n");
  const signature = createHmac("sha1", config.accessKeySecret).update(stringToSign).digest("base64");

  downloadUrl.searchParams.set("OSSAccessKeyId", config.accessKeyId);
  downloadUrl.searchParams.set("Expires", expires);
  for (const [key, value] of Object.entries(canonicalQuery)) {
    downloadUrl.searchParams.set(key, value);
  }
  downloadUrl.searchParams.set("Signature", signature);

  return downloadUrl.toString();
}

const imgbbStorageAdapter: ImageStorageAdapter = {
  provider: "imgbb",

  isStableUrl(url: string) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === "i.ibb.co" || host.endsWith(".ibb.co");
    } catch {
      return false;
    }
  },

  async storeImage(input: StoreImageInput, options: StoreImageOptions = {}) {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
      throw new Error("图片上传服务未配置 IMGBB_API_KEY");
    }

    const form = new FormData();
    form.append("key", apiKey);
    form.append("image", input.image);
    form.append("name", `${input.namePrefix || ""}${input.name}`);

    const response = await fetch(IMGBB_API_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_IMAGE_UPLOAD_TIMEOUT_MS),
    });

    const responseText = await response.text();
    if (!response.ok) {
      if (!options.suppressErrorLog) {
        console.error("[image-storage] imgbb upload error:", response.status, responseText.slice(0, 500));
      }
      throw new Error(`图片上传失败: ImgBB HTTP ${response.status}`);
    }

    const data = JSON.parse(responseText);
    if (!data.success || !data.data?.url) {
      if (!options.suppressErrorLog) {
        console.error("[image-storage] imgbb upload failed:", responseText.slice(0, 500));
      }
      throw new Error("图片上传失败: ImgBB did not return a URL");
    }

    return {
      url: data.data.url,
      display_url: data.data.display_url || data.data.url,
      delete_url: data.data.delete_url || "",
      width: Number(data.data.width || 0),
      height: Number(data.data.height || 0),
    };
  },
};

const aliyunOssStorageAdapter: ImageStorageAdapter = {
  provider: "aliyun-oss",

  isStableUrl(url: string) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      const publicBaseHost = process.env.ALIYUN_OSS_PUBLIC_BASE_URL
        ? new URL(normalizeBaseUrl(process.env.ALIYUN_OSS_PUBLIC_BASE_URL)).hostname.toLowerCase()
        : "";
      const bucket = process.env.ALIYUN_OSS_BUCKET?.trim();
      const region = process.env.ALIYUN_OSS_REGION?.trim();
      const defaultHost = bucket && region ? `${bucket}.${region}.aliyuncs.com`.toLowerCase() : "";
      return Boolean(host && (host === publicBaseHost || host === defaultHost));
    } catch {
      return false;
    }
  },

  async storeImage(input: StoreImageInput, options: StoreImageOptions = {}) {
    const config = getAliyunOssConfig();
    const upload = await resolveUploadPayload(input.image, input.name, options);
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
      signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_IMAGE_UPLOAD_TIMEOUT_MS),
    });

    const responseText = await response.text();
    if (!response.ok) {
      if (!options.suppressErrorLog) {
        console.error("[image-storage] aliyun oss upload error:", response.status, responseText.slice(0, 500));
      }
      throw new Error(`图片上传失败: Aliyun OSS HTTP ${response.status}`);
    }

    const url = buildPublicObjectUrl(config.publicBaseUrl, objectKey);
    return {
      url,
      display_url: url,
      delete_url: "",
      width: 0,
      height: 0,
    };
  },
};

function getAliyunOssConfig() {
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
  const bucket = process.env.ALIYUN_OSS_BUCKET?.trim();
  const region = process.env.ALIYUN_OSS_REGION?.trim();
  const publicBaseUrl = normalizeBaseUrl(process.env.ALIYUN_OSS_PUBLIC_BASE_URL);
  const downloadBaseUrl = normalizeBaseUrl(process.env.ALIYUN_OSS_DOWNLOAD_BASE_URL) || publicBaseUrl;
  const endpoint = process.env.ALIYUN_OSS_ENDPOINT?.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const securityToken = process.env.ALIYUN_OSS_SECURITY_TOKEN?.trim();

  if (!accessKeyId || !accessKeySecret || !bucket || !region || !publicBaseUrl) {
    throw new Error(
      "图片上传服务未配置 ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_BUCKET / ALIYUN_OSS_REGION / ALIYUN_OSS_PUBLIC_BASE_URL"
    );
  }

  return { accessKeyId, accessKeySecret, bucket, region, publicBaseUrl, downloadBaseUrl, endpoint, securityToken };
}

function resolveAliyunOssObjectKey(
  imageUrl: string,
  config: ReturnType<typeof getAliyunOssConfig>
) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;

  const host = parsedUrl.hostname.toLowerCase();
  if (!getAliyunOssDownloadHosts(config).has(host)) return null;

  let pathname = parsedUrl.pathname;
  const publicBase = new URL(config.publicBaseUrl);
  if (host === publicBase.hostname.toLowerCase()) {
    pathname = stripBasePath(pathname, publicBase.pathname);
    if (!pathname) return null;
  }

  return decodeObjectKey(pathname);
}

function getAliyunOssDownloadHosts(config: ReturnType<typeof getAliyunOssConfig>) {
  const hosts = new Set<string>();
  hosts.add(new URL(config.publicBaseUrl).hostname.toLowerCase());
  hosts.add(new URL(config.downloadBaseUrl).hostname.toLowerCase());
  hosts.add(`${config.bucket}.${config.region}.aliyuncs.com`.toLowerCase());
  if (config.endpoint) hosts.add(config.endpoint.toLowerCase());

  for (const host of (process.env.NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS || "").split(",")) {
    const normalizedHost = normalizeHost(host);
    if (normalizedHost) hosts.add(normalizedHost);
  }

  return hosts;
}

function buildPublicObjectUrl(baseUrl: string, objectKey: string) {
  return `${normalizeBaseUrl(baseUrl)}/${encodeObjectKey(objectKey)}`;
}

function stripBasePath(pathname: string, basePathname: string) {
  const basePath = basePathname === "/" ? "" : basePathname.replace(/\/+$/, "");
  if (!basePath) return pathname;
  if (pathname === basePath) return "";
  if (!pathname.startsWith(`${basePath}/`)) return "";
  return pathname.slice(basePath.length);
}

function decodeObjectKey(pathname: string) {
  const path = pathname.replace(/^\/+/, "");
  if (!path) return null;

  try {
    return path.split("/").map(decodeURIComponent).filter(Boolean).join("/");
  } catch {
    return null;
  }
}

function buildAliyunCanonicalizedResource(
  bucket: string,
  objectKey: string,
  query: Record<string, string>
) {
  const queryString = Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const resource = `/${bucket}/${objectKey}`;
  return queryString ? `${resource}?${queryString}` : resource;
}

function buildAttachmentContentDisposition(filename: string) {
  const safeFilename = sanitizeDownloadFilename(filename);
  return `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeRFC5987ValueChars(safeFilename)}`;
}

function sanitizeDownloadFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "tryon-result.jpg";
}

function encodeRFC5987ValueChars(value: string) {
  return encodeURIComponent(value)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, "%2A");
}

async function resolveUploadPayload(image: string, name: string, options: StoreImageOptions) {
  if (isRemoteUrl(image)) {
    const response = await fetch(image, {
      signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_IMAGE_UPLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`图片上传失败: remote image HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assertUploadSize(bytes);
    const contentType = normalizeImageContentType(response.headers.get("content-type")) || inferContentType(bytes, name);
    return { bytes, contentType, extension: extensionFromContentType(contentType) };
  }

  const contentTypeFromDataUrl = image.match(/^data:([^;,]+)[;,]/i)?.[1];
  const bytes = Buffer.from(getBase64Payload(image), "base64");
  assertUploadSize(bytes);
  const contentType = normalizeImageContentType(contentTypeFromDataUrl) || inferContentType(bytes, name);
  return { bytes, contentType, extension: extensionFromContentType(contentType) };
}

function assertUploadSize(bytes: Buffer) {
  if (!bytes.length) throw new Error("图片内容为空");
  if (bytes.length > MAX_IMAGE_STORAGE_BYTES) throw new Error("图片过大，无法上传");
}

function isRemoteUrl(value: string) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function buildAliyunObjectKey(input: StoreImageInput, extension: string) {
  const prefix = resolveAliyunObjectPrefix(input);
  const now = new Date();
  const datePath = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("/");
  const baseName = sanitizeObjectName(`${input.namePrefix || ""}${input.name}`) || "image";
  return [prefix, datePath, `${Date.now()}-${randomUUID().slice(0, 8)}-${baseName}.${extension}`]
    .filter(Boolean)
    .join("/");
}

function resolveAliyunObjectPrefix(input: StoreImageInput) {
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

function normalizeHost(value?: string | null) {
  const host = (value || "").trim().replace(/^https?:\/\//i, "").split("/")[0]?.trim();
  return host ? host.toLowerCase() : "";
}

function normalizeImageContentType(value?: string | null) {
  const contentType = (value || "").split(";")[0].trim().toLowerCase();
  return contentType.startsWith("image/") ? contentType : "";
}

function inferContentType(bytes: Buffer, name: string) {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.subarray(0, 6).toString("ascii").startsWith("GIF8")) return "image/gif";
  const extension = name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "application/octet-stream";
}

function extensionFromContentType(contentType: string) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "bin";
}
