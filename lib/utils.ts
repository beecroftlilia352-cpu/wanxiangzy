import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { downloadMediaFile, type MediaDownloadProgress } from "@/lib/media-download";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const DOWNLOAD_PREFIX_ALIASES: Record<string, string> = {
  tryon: "try",
  "image-to-image": "img",
  "text-to-image": "txt",
  "model-background": "bg",
  pose: "pose",
  "product-set": "set",
  "product-retouch": "ret",
  "all-category-product": "cat",
  "all-category-product-image": "cat",
  "outfit-fusion": "mix",
  "outfit-fusion-asset": "mix",
  "garment-3d": "3d",
  grass: "grass",
  "material-enhancement": "mat",
  "face-swap": "face",
  model: "model",
  "model-reference": "model",
  "first-last-frame-video": "vid",
  "motion-video": "vid",
  "image-video": "vid",
  history: "hist",
};

function compactDownloadPrefix(prefix: string): string {
  const normalized = prefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) return "img";
  const alias = DOWNLOAD_PREFIX_ALIASES[normalized];
  if (alias) return alias;

  const initials = normalized
    .split("-")
    .filter(Boolean)
    .map((part) => part[0])
    .join("");

  return (initials || normalized).slice(0, 6);
}

function normalizeDownloadExtension(ext: string): string {
  return ext
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5) || "png";
}

/**
 * 生成短下载文件名
 * 格式: vwg-{模块短码}-{MMDD}-{HHmm}-{序号}.{ext}
 * 示例: vwg-try-0502-1430-01.png
 */
export function generateDownloadFilename(prefix: string, index: number, ext = "png"): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const moduleCode = compactDownloadPrefix(prefix);
  const date = `${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  const seq = String(index + 1).padStart(2, "0");
  return `vwg-${moduleCode}-${date}-${time}-${seq}.${normalizeDownloadExtension(ext)}`;
}

/**
 * 从 URL 推断文件扩展名
 */
function inferExt(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".mp4")) return "mp4";
  if (lower.includes(".mov")) return "mov";
  if (lower.includes(".webm")) return "webm";
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "jpg";
  if (lower.includes(".webp")) return "webp";
  if (lower.includes(".png")) return "png";
  return "png";
}

export async function downloadMedia(
  url: string,
  filename: string,
  options: { signal?: AbortSignal; onProgress?: (progress: MediaDownloadProgress) => void } = {},
) {
  return downloadMediaFile(url, filename, options);
}

export async function downloadImage(url: string, filename: string) {
  return downloadMedia(url, filename);
}

/**
 * 批量下载图片（逐个触发，避免浏览器拦截）
 */
export async function downloadImages(urls: string[], prefix: string) {
  for (let i = 0; i < urls.length; i++) {
    const ext = inferExt(urls[i]);
    const filename = generateDownloadFilename(prefix, i, ext);
    await downloadImage(urls[i], filename);
    if (i < urls.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

/**
 * Fire-and-forget wrapper around `downloadImage` for the result-grid click
 * handlers. The bare `downloadImage` throws on non-2xx (the share-link proxy
 * can return 404/504/413), and the 8 grid callers used to discard the
 * rejection — user clicked "download", nothing happened, no toast. This wraps
 * the call so a single rejected promise never escapes unhandled.
 *
 * The message is the upstream error verbatim (already localized by the
 * server); on a non-Error throw we fall back to a generic copy the caller
 * can replace via the `fallback` option.
 */
export function safeDownloadImage(
  url: string,
  filename: string,
  options: { fallback?: string } = {}
): void {
  downloadImage(url, filename).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : options.fallback ?? "";
    if (message) {
      // Lazy require to avoid pulling sonner into the server bundle.
      import("sonner").then(({ toast }) => {
        toast.error(message);
      }).catch(() => {
        // sonner unavailable — silently drop; the raw URL still works for
        // the user to retry manually if needed.
      });
    }
  });
}

export const ACCEPTED_IMAGE_TYPES = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

const LIKELY_IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png|webp|avif|heic|heif)$/i;

export function isLikelyImageFile(file: Pick<File, "type" | "name">): boolean {
  const type = (file.type || "").toLowerCase();
  return type.startsWith("image/") || LIKELY_IMAGE_EXTENSION_PATTERN.test(file.name || "");
}

export function createLocalImagePreview(file: File): string {
  return URL.createObjectURL(file);
}

export const ACCEPTED_VIDEO_TYPES = {
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/mov": [".mov"],
};

export const MAX_FILE_SIZE_MB = 15;
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_VIDEO_FILE_SIZE_MB = 100;
export const MAX_VIDEO_FILE_SIZE = MAX_VIDEO_FILE_SIZE_MB * 1024 * 1024;
export const MAX_AUDIO_FILE_SIZE_MB = 30;
export const MAX_AUDIO_FILE_SIZE = MAX_AUDIO_FILE_SIZE_MB * 1024 * 1024;
const IMAGE_PREPROCESS_TIMEOUT_MS = 20_000;
const IMAGE_UPLOAD_CLIENT_TIMEOUT_MS = 75_000;
const IMAGE_UPLOAD_RETRY_DELAYS_MS = [0, 700, 1_600] as const;
export const MAX_CLOTHING_FILES = 5;

export interface UploadResult {
  url: string;
  display_url: string;
  delete_url: string;
  width: number;
  height: number;
  object_key?: string;
  asset?: unknown;
  resource_registration_token?: string;
}

/**
 * 压缩图片（超过 maxSizeMB 时自动压缩）
 */
async function compressImage(file: File, maxSizeMB: number = MAX_FILE_SIZE_MB): Promise<File> {
  if (file.size <= maxSizeMB * 1024 * 1024) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
    const outputType = isPng ? "image/webp" : "image/jpeg";
    const outputExt = outputType === "image/webp" ? "webp" : "jpg";
    const outputName = file.name.replace(/\.[^.]+$/, `.${outputExt}`);
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      img.onload = null;
      img.onerror = null;
      URL.revokeObjectURL(objectUrl);
    };
    const finish = (value: File) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    // Image decoding and canvas encoding happen before the XHR timeout starts.
    // Some browser/format combinations never fire Image.onload/onerror or
    // canvas.toBlob's callback, which previously left every caller awaiting an
    // eternally pending Promise. Falling back to the original file lets the
    // server-side image parser make the final format decision.
    const timeout = window.setTimeout(() => finish(file), IMAGE_PREPROCESS_TIMEOUT_MS);

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        // The product limit is 15MB. When recompression is necessary, reduce
        // encoded bytes only; never silently turn a native 4K upload into a
        // smaller image.
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish(file);
          return;
        }
        ctx.drawImage(img, 0, 0, img.width, img.height);

        // 逐步降低质量直到小于限制
        let quality = 0.85;
        const tryCompress = () => {
          if (settled) return;
          canvas.toBlob(
            (blob) => {
              if (settled) return;
              if (!blob) {
                finish(file);
                return;
              }
              if (blob.size > maxSizeMB * 1024 * 1024 && quality > 0.3) {
                quality -= 0.1;
                tryCompress();
              } else {
                finish(new File([blob], outputName, { type: outputType }));
              }
            },
            outputType,
            quality
          );
        };
        tryCompress();
      } catch {
        finish(file);
      }
    };
    img.onerror = () => finish(file);
    try {
      img.src = objectUrl;
    } catch {
      finish(file);
    }
  });
}

/**
 * Agent 专用图片压缩（更激进：最大 2MB，最大边 1600px）
 */
export async function compressImageForAgent(file: File): Promise<File> {
  const MAX_AGENT_SIZE = 2 * 1024 * 1024; // 2MB
  if (file.size <= MAX_AGENT_SIZE) return file;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      const MAX_EDGE = 1600;

      if (width > MAX_EDGE || height > MAX_EDGE) {
        const scale = MAX_EDGE / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        0.82
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 上传图片到当前图片存储（通过同源服务端接口，生产环境为阿里云 OSS）
 */
export async function uploadImage(
  file: File,
  options: { onProgress?: (percent: number) => void } = {},
): Promise<UploadResult> {
  const compressed = await compressImage(file, MAX_FILE_SIZE_MB);
  let lastError: unknown;
  for (let attempt = 0; attempt < IMAGE_UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      if (IMAGE_UPLOAD_RETRY_DELAYS_MS[attempt] > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, IMAGE_UPLOAD_RETRY_DELAYS_MS[attempt]));
        options.onProgress?.(0);
      }
      const uploadResponse = await sendImageUpload(compressed, file.name, options.onProgress);
      const data = parseUploadResponse(uploadResponse.responseText);

      if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
        const error = new Error(data.error || `上传失败 (${uploadResponse.status})`);
        if (attempt < IMAGE_UPLOAD_RETRY_DELAYS_MS.length - 1 && isRetryableUploadStatus(uploadResponse.status)) {
          lastError = error;
          continue;
        }
        throw error;
      }

      if (!data.url) throw new Error("图片上传服务返回了无效结果");
      options.onProgress?.(100);
      return data as UploadResult;
    } catch (error) {
      lastError = error;
      if (attempt >= IMAGE_UPLOAD_RETRY_DELAYS_MS.length - 1 || !isRetryableUploadError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("网络连接异常，上传失败");
}

function sendImageUpload(
  file: File,
  originalName: string,
  onProgress?: (percent: number) => void,
) {
  const form = new FormData();
  form.append("image", file);
  form.append("name", originalName.replace(/\.[^.]+$/, ""));

  // XHR 上传以支持进度回调（fetch 不支持 upload progress）
  return new Promise<{ status: number; responseText: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    xhr.open("POST", "/api/upload-image");
    const cleanup = () => {
      window.clearTimeout(timeout);
      xhr.upload.onprogress = null;
      xhr.onload = null;
      xhr.onerror = null;
      xhr.onabort = null;
      xhr.ontimeout = null;
    };
    const finishResolve = (value: { status: number; responseText: string }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const timeout = window.setTimeout(() => {
      xhr.abort();
      finishReject(new Error("图片上传超时，请稍后重试"));
    }, IMAGE_UPLOAD_CLIENT_TIMEOUT_MS);
    xhr.timeout = IMAGE_UPLOAD_CLIENT_TIMEOUT_MS;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      const { status, responseText } = xhr;
      if (status < 100 || status > 599) {
        finishReject(new Error("网络连接异常，上传失败"));
        return;
      }
      finishResolve({ status, responseText });
    };
    xhr.onerror = () => finishReject(new Error("网络连接异常，上传失败"));
    xhr.onabort = () => finishReject(new Error("图片上传超时，请稍后重试"));
    xhr.ontimeout = () => finishReject(new Error("图片上传超时，请稍后重试"));
    xhr.send(form);
  });
}

function parseUploadResponse(responseText: string) {
  try {
    const parsed: unknown = JSON.parse(responseText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Partial<UploadResult> & { error?: string };
    }
  } catch {
    // Invalid gateway responses are handled as retryable status failures.
  }
  return {} as Partial<UploadResult> & { error?: string };
}

function isRetryableUploadStatus(status: number) {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRetryableUploadError(error: unknown) {
  if (!(error instanceof Error)) return true;
  return /网络连接异常|上传超时|Failed to fetch|NetworkError/i.test(error.message);
}

export async function uploadVideo(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("video", file);
  form.append("name", file.name.replace(/\.[^.]+$/, ""));

  const res = await fetch("/api/upload-video", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `上传失败 (${res.status})`);
  }

  return res.json();
}

export async function uploadAudio(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("audio", file);
  form.append("name", file.name.replace(/\.[^.]+$/, ""));

  const res = await fetch("/api/upload-audio", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `上传失败 (${res.status})`);
  }

  return res.json();
}

// ===== 通用工具函数（消除重复代码） =====

/**
 * 带超时的 Promise 包装器
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/**
 * 将错误转换为日志消息
 */
export function toLogMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "unknown error";
}

/**
 * 检查值是否为远程 URL
 */
export function isRemoteUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 类型守卫：检查值是否为普通对象
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
