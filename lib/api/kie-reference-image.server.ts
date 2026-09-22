/**
 * kie 生图参考图转存：「站内/内网地址 → kie 文件服务公网 URL」。
 *
 * 背景：kie 的 jobs/createTask 只接受公网可访问的参考图 URL。局域网自建部署里，
 * 应用会把站内地址（相对路径 `/api/media-assets/<id>`，或 `http://192.168.31.213:3000/api/media-assets/<id>`
 * 这样的内网绝对地址）直接交给 kie，kie 在公网取不到图 → 图生图任务必然失败
 * （文生图不受影响）。这里在提交任务前把这类参考图读成字节、转成 base64 data URL
 * 上传到 kie 的文件服务，再用返回的 downloadUrl 提交生成任务。
 *
 * base64 上传接口（实测）：
 *   POST https://kieai.redpandaai.co/api/file-base64-upload
 *   Authorization: Bearer <kie api key>
 *   { "base64Data": "data:image/jpeg;base64,...", "uploadPath": "images/user-uploads", "fileName": "ref-<assetId>.jpg" }
 *   200 → {"success":true,"code":200,"msg":"File uploaded successfully",
 *          "data":{"fileName":..,"filePath":..,"downloadUrl":"https://tempfile.redpandaai.co/..."}}
 *
 * 主机只在这里定义一次：api.kie.ai 上该端点返回 404，只有 kieai.redpandaai.co 可用。
 * 文件名带 assetId（同一文件名会覆盖旧文件且有缓存延迟，必须保证唯一）。
 *
 * 限制：官方文档不推荐该端点上传超过 10MB 的文件。超过时不做静默降级，
 * 直接抛 KIE_REFERENCE_IMAGE_TOO_LARGE（不可重试），避免把注定失败的任务提交给 kie。
 *
 * 本模块是服务端模块（需要读对象存储字节 + Buffer）。kie-job.ts 保持无 node 依赖，
 * 只定义 KieReferenceImageResolver 钩子类型，由 lingya-routing.server.ts 注入实现。
 */

import {
  NonRetryableGenerationError,
  ProviderHttpResponseError,
  RetryableGenerationError,
} from "@/lib/api/generation-errors";
import { getImageStorageAdapter, isUpstreamImageHost } from "@/lib/api/image-storage";
import { isPrivateOrReservedIpAddress } from "@/lib/api/remote-image-fetch";
import type { KieReferenceImageResolver } from "@/lib/api/kie-job";

/** kie 文件服务主机（唯一可用主机，见文件头注释）。 */
export const KIE_FILE_HOST = "kieai.redpandaai.co";
export const KIE_FILE_BASE_URL = `https://${KIE_FILE_HOST}`;
export const KIE_FILE_BASE64_UPLOAD_PATH = "/api/file-base64-upload";
/** 官方文档不建议该端点上传 >10MB 的文件。 */
export const KIE_FILE_BASE64_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const KIE_FILE_DEFAULT_UPLOAD_PATH = "images/user-uploads";

/** 与 image-storage.ts / image-inputs.server.ts 中的canonical 媒体资产路径保持一致的判定。 */
const CANONICAL_MEDIA_ASSET_PATH =
  /^\/api\/media-assets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i;

const KIE_FILE_UPLOAD_TIMEOUT_MS = 60_000;
/** 这些状态码证明 kie 拒绝了请求：鉴权/参数类不可重试。 */
const KIE_FILE_FAILOVER_STATUS = [401, 403];
/** 这些状态码代表瞬时故障，可以重试。 */
const KIE_FILE_RETRYABLE_STATUS = [408, 425, 429, 500, 502, 503, 504, 522, 524];

export type KieReferenceImageBytes = {
  bytes: Uint8Array;
  contentType?: string;
  /** 供日志使用：媒体资产的 assetId 或对象存储 key，禁止写入完整内网 URL。 */
  sourceId?: string;
};

export type KieReferenceImageBytesLoader = (url: string) => Promise<KieReferenceImageBytes>;

export type KieReferenceImageResolverOptions = {
  /**
   * 覆盖默认的字节读取实现（默认走媒体资产注册表 + OSS 签名读）。测试与
   * 上层已有 Buffer 的场景可注入。
   */
  loadBytes?: KieReferenceImageBytesLoader;
  /** 上传请求使用的 fetch（默认全局 fetch）。 */
  fetchImpl?: typeof fetch;
  /** kie 侧上传目录，默认 images/user-uploads。 */
  uploadPath?: string;
  /** 允许注入的诊断日志（默认 console.warn），只记录 assetId/主机名。 */
  log?: (message: string) => void;
};

/** 字符层面判断是否 IP 字面量（含 IPv6 方括号形式）。 */
function isIpLiteralHost(host: string): boolean {
  if (host.includes(":")) return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

/**
 * 判断参考图 URL 是否能被 kie 公网取到：
 * 必须是绝对 http(s) URL，且主机不是内网/保留地址（复用 remote-image-fetch 的判定）。
 * 相对路径（如 /api/media-assets/<id>）一律视为 kie 取不到。
 */
export function isKieReachableReferenceImageUrl(value: string): boolean {
  const url = value?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  // 只有 IP 字面量才做保留地址判定；域名交给公网 DNS（isPrivateOrReservedIpAddress 对
  // 非 IP 输入一律返回 true，这里不能直接喂域名）。
  if (isIpLiteralHost(host) && isPrivateOrReservedIpAddress(host)) return false;
  return true;
}

/** 从（相对或内网绝对）参考图 URL 里取出 canonical 媒体资产 ID。 */
export function extractMediaAssetIdFromUrl(value: string): string | null {
  const url = value?.trim();
  if (!url) return null;
  let pathname: string;
  if (url.startsWith("/")) {
    if (url.startsWith("//")) return null;
    pathname = url.split(/[?#]/, 1)[0];
  } else {
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
  }
  return pathname.match(CANONICAL_MEDIA_ASSET_PATH)?.[1]?.toLowerCase() || null;
}

/** 该地址是否指向本应用自己的对象存储（签名 URL 我们自己取得到，只是 kie 取不到）。 */
export function isOwnObjectStorageImageUrl(value: string): boolean {
  if (isUpstreamImageHost(value)) return false;
  try {
    return getImageStorageAdapter().isStableUrl(value);
  } catch {
    return false;
  }
}

/**
 * 把参考图上传到 kie 文件服务，返回公网可访问的 downloadUrl。
 * 错误分类沿用既有类型：鉴权 → ProviderHttpResponseError（可切换部署）；
 * 参数/内容问题 → NonRetryableGenerationError；网络与瞬时故障 → RetryableGenerationError。
 */
export async function uploadKieBase64File(input: {
  apiKey: string;
  dataUrl: string;
  fileName: string;
  uploadPath?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<{ downloadUrl: string; filePath?: string; fileName?: string }> {
  const fetchImpl = input.fetchImpl || fetch;
  const url = KIE_FILE_BASE_URL + KIE_FILE_BASE64_UPLOAD_PATH;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + input.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        base64Data: input.dataUrl,
        uploadPath: input.uploadPath || KIE_FILE_DEFAULT_UPLOAD_PATH,
        fileName: input.fileName,
      }),
      signal: input.signal || AbortSignal.timeout(KIE_FILE_UPLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    // 网络层失败无法证明 kie 拒收了请求，但重传同一张图是幂等的，可以重试。
    throw new RetryableGenerationError(
      "参考图转存到 kie 文件服务失败（网络错误），assetId=" + input.fileName,
      "KIE_REFERENCE_IMAGE_UPLOAD_NETWORK",
      { cause: error },
    );
  }

  const responseText = await response.text();
  const envelope = readUploadEnvelope(responseText);

  if (!response.ok) {
    const message = "kie 文件服务拒绝了参考图上传（HTTP " + response.status + "）";
    if (KIE_FILE_FAILOVER_STATUS.includes(response.status)) {
      throw new ProviderHttpResponseError(message, {
        status: response.status,
        code: "KIE_REFERENCE_IMAGE_UPLOAD_" + response.status,
        safeToFailover: true,
      });
    }
    if (KIE_FILE_RETRYABLE_STATUS.includes(response.status)) {
      throw new RetryableGenerationError(message, "KIE_REFERENCE_IMAGE_UPLOAD_HTTP_" + response.status);
    }
    throw new NonRetryableGenerationError(message, "KIE_REFERENCE_IMAGE_UPLOAD_HTTP_" + response.status, response.status);
  }

  if (envelope.code !== null && envelope.code !== 200) {
    const message = "kie 文件服务返回错误码 " + envelope.code + "："
      + (envelope.message || "参考图上传失败");
    if (KIE_FILE_FAILOVER_STATUS.includes(envelope.code)) {
      throw new ProviderHttpResponseError(message, {
        status: envelope.code,
        code: "KIE_REFERENCE_IMAGE_UPLOAD_" + envelope.code,
        safeToFailover: true,
      });
    }
    if (KIE_FILE_RETRYABLE_STATUS.includes(envelope.code)) {
      throw new RetryableGenerationError(message, "KIE_REFERENCE_IMAGE_UPLOAD_CODE_" + envelope.code);
    }
    throw new NonRetryableGenerationError(message, "KIE_REFERENCE_IMAGE_UPLOAD_CODE_" + envelope.code);
  }

  const downloadUrl = typeof envelope.data.downloadUrl === "string" ? envelope.data.downloadUrl.trim() : "";
  if (!downloadUrl || !/^https?:\/\//i.test(downloadUrl) || !isKieReachableReferenceImageUrl(downloadUrl)) {
    // 2xx 但拿不到可用公网 URL：不能把任务提交出去，也不该重放（响应语义未知）。
    throw new NonRetryableGenerationError(
      "kie 文件服务未返回可用的参考图地址，响应字段: " + Object.keys(envelope.data).slice(0, 8).join(","),
      "KIE_REFERENCE_IMAGE_UPLOAD_INVALID_RESPONSE",
    );
  }

  return {
    downloadUrl,
    filePath: typeof envelope.data.filePath === "string" ? envelope.data.filePath : undefined,
    fileName: typeof envelope.data.fileName === "string" ? envelope.data.fileName : undefined,
  };
}

/**
 * 构造参考图转存器。同一次生成（含跨部署重试）内同一张参考图只上传一次：
 * 结果按原始 URL 缓存在闭包里，失败则不缓存（重试时重新上传）。
 */
export function createKieReferenceImageResolver(
  options: KieReferenceImageResolverOptions = {},
): KieReferenceImageResolver {
  const cache = new Map<string, Promise<string>>();
  const log = options.log || ((message: string) => console.warn(message));

  return async ({ imageUrls, apiKey, fetchImpl }) => {
    const resolved: string[] = [];
    for (const url of imageUrls) {
      if (isKieReachableReferenceImageUrl(url)) {
        resolved.push(url);
        continue;
      }
      const cached = cache.get(url);
      if (cached) {
        resolved.push(await cached);
        continue;
      }
      const pending = uploadReferenceImage(url, {
        apiKey,
        fetchImpl: options.fetchImpl || fetchImpl,
        loadBytes: options.loadBytes || defaultLoadReferenceImageBytes,
        uploadPath: options.uploadPath,
        log,
      }).catch((error: unknown) => {
        // 失败不缓存：下一次重试仍尝试上传。
        cache.delete(url);
        throw error;
      });
      cache.set(url, pending);
      resolved.push(await pending);
    }
    return resolved;
  };
}

async function uploadReferenceImage(
  url: string,
  deps: {
    apiKey: string;
    fetchImpl: typeof fetch;
    loadBytes: KieReferenceImageBytesLoader;
    uploadPath?: string;
    log: (message: string) => void;
  },
): Promise<string> {
  const assetId = extractMediaAssetIdFromUrl(url);
  const host = safeHostname(url);
  const loaded = await deps.loadBytes(url);
  const bytes = loaded.bytes;
  if (!bytes?.length) {
    throw new NonRetryableGenerationError(
      "参考图内容为空，无法转存到 kie 文件服务（assetId=" + (loaded.sourceId || assetId || "unknown") + "）",
      "KIE_REFERENCE_IMAGE_EMPTY",
    );
  }
  if (bytes.byteLength > KIE_FILE_BASE64_UPLOAD_MAX_BYTES) {
    throw new NonRetryableGenerationError(
      "参考图超过 kie 文件服务建议的 10MB 上限（assetId=" + (loaded.sourceId || assetId || "unknown") + "）",
      "KIE_REFERENCE_IMAGE_TOO_LARGE",
    );
  }

  const fileName = buildKieReferenceFileName(url, loaded.contentType);
  const dataUrl = "data:" + resolveImageContentType(loaded.contentType, fileName) + ";base64,"
    + Buffer.from(bytes).toString("base64");
  const uploaded = await uploadKieBase64File({
    apiKey: deps.apiKey,
    dataUrl,
    fileName,
    uploadPath: deps.uploadPath,
    fetchImpl: deps.fetchImpl,
  });
  // 只记录 assetId / 主机名，不记录任何内网 URL 或密钥。
  deps.log("[kie-job] 参考图已转存到 kie 文件服务: assetId=" + (assetId || "-") + ", host=" + (host || "-"));
  return uploaded.downloadUrl;
}

/** 文件名里带上 assetId（或 URL 摘要）保证唯一，避免同文件名覆盖与缓存延迟。 */
function buildKieReferenceFileName(url: string, contentType?: string): string {
  const assetId = extractMediaAssetIdFromUrl(url);
  const suffix = assetId || createUrlDigest(url);
  return "ref-" + suffix + "." + extensionForContentType(resolveImageContentType(contentType, url));
}

function createUrlDigest(url: string): string {
  // 用非加密摘要即可：只需稳定且唯一的文件名，不能泄露内网地址。
  let hash = 0x811c9dc5;
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function resolveImageContentType(contentType: string | undefined, name: string): string {
  const normalized = (contentType || "").split(";")[0].trim().toLowerCase();
  if (normalized.startsWith("image/")) return normalized;
  const extension = name.match(/\.([a-z0-9]{2,5})(?:$|\?)/i)?.[1]?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  return "image/jpeg";
}

function extensionForContentType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/avif") return "avif";
  return "jpg";
}

/**
 * 默认字节读取：参考图是应用自己的媒体资产（/api/media-assets/<assetId>，可能带内网
 * 主机前缀），或本应用对象存储的地址。两条路径都从存储侧读字节，绝不 HTTP 回打应用自己的路由。
 */
export async function defaultLoadReferenceImageBytes(url: string): Promise<KieReferenceImageBytes> {
  const assetId = extractMediaAssetIdFromUrl(url);
  if (assetId) return loadMediaAssetBytes(assetId);

  if (isOwnObjectStorageImageUrl(url)) {
    // 本应用对象存储的签名读地址：我们自己能取到，kie 公网取不到。
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(KIE_FILE_UPLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new RetryableGenerationError(
        "对象存储参考图读取失败（HTTP " + response.status + "），host=" + safeHostname(url),
        "KIE_REFERENCE_IMAGE_STORAGE_HTTP_" + response.status,
      );
    }
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || undefined,
      sourceId: safeHostname(url),
    };
  }

  throw new NonRetryableGenerationError(
    "参考图既不能被 kie.ai 公网访问，也不是可读取的站内媒体资产，host=" + (safeHostname(url) || "-"),
    "KIE_REFERENCE_IMAGE_UNREADABLE",
  );
}

/**
 * 读取媒体资产的对象字节：注册表取 bucket/object_key → 生成 OSS 签名读 URL → GET。
 * 复用 desktop 侧读取 /api/media-assets 的同一套注册表与签名能力（media-storage），
 * 参考图归属在任务创建阶段已由 input-ownership 校验过。
 */
async function loadMediaAssetBytes(assetId: string): Promise<KieReferenceImageBytes> {
  const bucketName = process.env.ALIYUN_OSS_BUCKET?.trim();
  if (!bucketName) {
    throw new NonRetryableGenerationError(
      "媒体资产读取未配置 ALIYUN_OSS_BUCKET，无法转存参考图",
      "KIE_REFERENCE_IMAGE_STORAGE_NOT_CONFIGURED",
    );
  }
  let resolved: { data: unknown; error: unknown };
  try {
    const [{ getAdminClient }] = await Promise.all([import("@/lib/supabase/admin")]);
    resolved = await getAdminClient().rpc("resolve_media_asset_object", { p_asset_id: assetId });
  } catch (error) {
    throw new RetryableGenerationError(
      "媒体资产注册表暂时不可用（assetId=" + assetId + "）",
      "KIE_REFERENCE_IMAGE_ASSET_LOOKUP_FAILED",
      { cause: error },
    );
  }
  const row = Array.isArray(resolved.data) && resolved.data[0] && typeof resolved.data[0] === "object"
    ? resolved.data[0] as { object_key?: unknown; status?: unknown; mime_type?: unknown }
    : null;
  if (resolved.error) {
    throw new RetryableGenerationError(
      "媒体资产注册表查询失败（assetId=" + assetId + "）",
      "KIE_REFERENCE_IMAGE_ASSET_LOOKUP_FAILED",
    );
  }
  if (!row || row.status !== "verified" || typeof row.object_key !== "string") {
    throw new NonRetryableGenerationError(
      "媒体资产不可读或尚未完成安全校验（assetId=" + assetId + "）",
      "KIE_REFERENCE_IMAGE_ASSET_UNAVAILABLE",
    );
  }
  const { createAliyunOssRegistryReadUrl } = await import("@/lib/api/media-storage");
  const signedUrl = createAliyunOssRegistryReadUrl(row.object_key, bucketName);
  const response = await fetch(signedUrl, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(KIE_FILE_UPLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new RetryableGenerationError(
      "媒体资产对象读取失败（HTTP " + response.status + "），assetId=" + assetId,
      "KIE_REFERENCE_IMAGE_OBJECT_HTTP_" + response.status,
    );
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: typeof row.mime_type === "string" ? row.mime_type : response.headers.get("content-type") || undefined,
    sourceId: assetId,
  };
}

function readUploadEnvelope(responseText: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return { code: null as number | null, message: "", data: {} as Record<string, unknown> };
  }
  const root = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
  const rawCode = root.code;
  const code = typeof rawCode === "number" && Number.isFinite(rawCode) ? rawCode : null;
  const data = root.data && typeof root.data === "object" && !Array.isArray(root.data)
    ? root.data as Record<string, unknown>
    : {};
  const message = typeof root.msg === "string" ? root.msg : typeof root.message === "string" ? root.message : "";
  return { code, message, data };
}

function safeHostname(value: string): string {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
}
