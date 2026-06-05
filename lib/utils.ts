import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

/**
 * 生成最佳实践下载文件名
 * 格式: {prefix}-{YYYYMMDD}-{HHmmss}-{序号}.{ext}
 * 示例: vastweargen-tryon-20260502-143022-01.png
 */
export function generateDownloadFilename(prefix: string, index: number, ext = "png"): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const seq = String(index + 1).padStart(2, "0");
  return `vastweargen-${prefix}-${date}-${time}-${seq}.${ext}`;
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

export async function downloadMedia(url: string, filename: string) {
  const downloadUrl = url.startsWith("http")
    ? `/api/download-image?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`
    : url;

  try {
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => a.remove(), 0);
  } catch {
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  }
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
const UPLOAD_TRANSPORT_SAFE_SIZE_MB = 8;
const IMAGE_UPLOAD_CLIENT_TIMEOUT_MS = 75_000;
export const MAX_CLOTHING_FILES = 5;

export interface UploadResult {
  url: string;
  display_url: string;
  delete_url: string;
  width: number;
  height: number;
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
    const cleanup = () => URL.revokeObjectURL(objectUrl);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      // 按比例缩小（最大边 2048px）
      const maxDim = 2048;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      // 逐步降低质量直到小于限制
      let quality = 0.85;
      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              cleanup();
              resolve(file);
              return;
            }
            if (blob.size > maxSizeMB * 1024 * 1024 && quality > 0.3) {
              quality -= 0.1;
              tryCompress();
            } else {
              cleanup();
              resolve(new File([blob], outputName, { type: outputType }));
            }
          },
          outputType,
          quality
        );
      };
      tryCompress();
    };
    img.onerror = () => {
      cleanup();
      resolve(file);
    };
    img.src = objectUrl;
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

export async function addImageGridOverlay(
  file: File,
  options: { rows?: number; columns?: number; color?: string; lineWidthRatio?: number } = {}
): Promise<File> {
  const rows = Math.max(1, Math.round(options.rows || 6));
  const columns = Math.max(1, Math.round(options.columns || 6));
  const color = options.color || "#ffffff";
  const lineWidthRatio = Number.isFinite(options.lineWidthRatio) ? Number(options.lineWidthRatio) : 0.006;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(3, Math.round(Math.max(width, height) * lineWidthRatio));
      ctx.lineCap = "butt";

      for (let col = 0; col <= columns; col += 1) {
        const x = Math.round((width * col) / columns);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let row = 0; row <= rows; row += 1) {
        const y = Math.round((height * row) / rows);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      canvas.toBlob(
        (blob) => {
          cleanup();
          if (!blob) {
            resolve(file);
            return;
          }
          const outputName = file.name.replace(/\.[^.]+$/, "_grid.png");
          resolve(new File([blob], outputName, { type: "image/png" }));
        },
        "image/png"
      );
    };

    img.onerror = () => {
      cleanup();
      resolve(file);
    };
    img.src = objectUrl;
  });
}

/**
 * 上传图片到 imgbb（通过服务端 API 代理）
 */
export async function uploadImage(file: File): Promise<UploadResult> {
  const uploadLimitMB = file.size > UPLOAD_TRANSPORT_SAFE_SIZE_MB * 1024 * 1024
    ? UPLOAD_TRANSPORT_SAFE_SIZE_MB
    : MAX_FILE_SIZE_MB;
  const compressed = await compressImage(file, uploadLimitMB);
  const form = new FormData();
  form.append("image", compressed);
  form.append("name", file.name.replace(/\.[^.]+$/, ""));

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), IMAGE_UPLOAD_CLIENT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("/api/upload-image", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("图片上传超时，请稍后重试");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `上传失败 (${res.status})`);
  }

  return res.json();
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
