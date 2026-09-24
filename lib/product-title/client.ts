/**
 * 「商品标题」浏览器端图片预处理（新增模块，客户端可安全导入）。
 *
 * 上传的图片在浏览器侧就用 canvas 压到长边 ≤1024 / jpeg q0.8，再转成 data URL 内联进
 * POST /api/product-title 请求体（实测 5 张真实商品图 ≈1.39MB 请求体，上游 3 秒返回 200）。
 * 服务端仍会再压一次并做同样的尺寸校验，两边参数保持一致。
 */

import {
  PRODUCT_TITLE_IMAGE_JPEG_QUALITY,
  PRODUCT_TITLE_IMAGE_MAX_LONG_EDGE,
} from "./types";

export type CompressedProductTitleImage = {
  dataUrl: string;
  /** data URL 对应的字节数（base64 长度换算，用于 2MB 上限校验）。 */
  bytes: number;
};

/** 是否是浏览器能解的图片文件（非图片类型直接拒绝）。 */
export function isSupportedProductTitleImageFile(file: File): boolean {
  return typeof file?.type === "string" && file.type.toLowerCase().startsWith("image/");
}

/* -------------------------------------------------------------------------- *
 * 第三版：支持「直接 Ctrl+V 粘贴图片」（截图 / 从文件夹复制的图片文件）
 * -------------------------------------------------------------------------- */

/**
 * 结构化描述剪贴板数据：真实浏览器传进来的是 DataTransfer（结构兼容即可），
 * jsdom 里没有 DataTransfer，测试直接传普通对象即可。
 */
export type ProductTitleClipboardData = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<ProductTitleClipboardItem> | null;
  types?: ArrayLike<string> | null;
  getData?: (format: string) => string;
};

export type ProductTitleClipboardItem = {
  kind?: string;
  type?: string;
  getAsFile?: () => File | null;
};

/** 解析剪贴板后的结果：能进管道的图片文件 + 剪贴板里有没有文本。 */
export type ProductTitleClipboardPaste = {
  /** 图片文件（保持剪贴板里的原始顺序；已去掉非图片与重复项）。 */
  imageFiles: File[];
  /**
   * 剪贴板里是否有文本内容（text/plain 或 text/html 非空）。
   * 调用方据此决定：焦点在描述文本框时要不要把这次粘贴让给浏览器（文本框粘贴优先）。
   */
  hasText: boolean;
};

/** 常见图片扩展名 → MIME（只在浏览器没给出 MIME 时兜底，见 toProductTitlePastedImageFile）。 */
const PRODUCT_TITLE_IMAGE_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  jfif: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
};

function inferProductTitleImageTypeByName(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return null;
  return PRODUCT_TITLE_IMAGE_TYPE_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * 把剪贴板里的一项文件转成「现有校验/压缩管道能接受」的图片 File；不是图片则返回 null。
 *
 * 大多数平台（Chromium 截图、从资源管理器复制图片）都带完整 MIME，直接放行；
 * 少数平台给的是空 MIME 或 application/octet-stream，这时按扩展名推断并把 MIME **补回**
 * （不补的话 isSupportedProductTitleImageFile 会把截图误判成非图片而拒绝，且会报「只支持图片文件」）。
 * 非图片（PDF / txt / zip…）一律 null，调用方完全忽略，不报错、不提示。
 */
export function toProductTitlePastedImageFile(file: File | null | undefined): File | null {
  if (!file || typeof file !== "object") return null;
  if (isSupportedProductTitleImageFile(file)) return file;
  const name = typeof file.name === "string" ? file.name : "";
  const inferred = inferProductTitleImageTypeByName(name);
  if (!inferred) return null;
  try {
    return new File([file], name, {
      type: inferred,
      lastModified: typeof file.lastModified === "number" ? file.lastModified : undefined,
    });
  } catch {
    // 某些环境不支持重新构造 File：宁可忽略这一项，也不要抛错打断粘贴。
    return null;
  }
}

function readProductTitleClipboardText(data: ProductTitleClipboardData, format: string): string {
  if (typeof data.getData !== "function") return "";
  try {
    const value = data.getData(format);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function listProductTitleClipboardTypes(data: ProductTitleClipboardData): string[] {
  if (!data.types || typeof data.types.length !== "number") return [];
  return Array.from(data.types).filter((type): type is string => typeof type === "string");
}

/**
 * 解析一次剪贴板粘贴：挑出可以直接进压缩管道的图片文件，并判断这次粘贴里有没有文本。
 *
 * 剪贴板的形状在各浏览器里差别很大，所以这里同时看 items 与 files 并按 File 引用去重：
 *  · Chromium/Edge（截图、从资源管理器复制文件）：items 里有 kind="file" 的项，files 里也有同一个 File；
 *  · 部分浏览器只填 files（items 为空）；
 *  · Safari 复制多选文件时只给第一张 —— 这是平台限制，不做特殊处理。
 *
 * 文本判定优先看 getData("text/plain"/"text/html") 的实际内容（真实用户粘贴时一定拿得到）；
 * 只有环境里根本没有 getData 时才退回看 types，避免「types 里永远带 text/plain」造成误判。
 */
export function readProductTitleClipboardPaste(
  data: ProductTitleClipboardData | null | undefined,
): ProductTitleClipboardPaste {
  if (!data) return { imageFiles: [], hasText: false };

  const plain = readProductTitleClipboardText(data, "text/plain");
  const html = readProductTitleClipboardText(data, "text/html");
  let hasText = plain.trim().length > 0 || html.trim().length > 0;
  if (!hasText && typeof data.getData !== "function") {
    hasText = listProductTitleClipboardTypes(data).some(
      (type) => type === "text/plain" || type === "text/html",
    );
  }

  const seen = new Set<File>();
  const candidates: File[] = [];
  const push = (file: File | null | undefined) => {
    if (!file || seen.has(file)) return;
    seen.add(file);
    candidates.push(file);
  };

  const items = data.items;
  if (items && typeof items.length === "number") {
    for (const item of Array.from(items)) {
      if (!item || item.kind !== "file") continue;
      push(typeof item.getAsFile === "function" ? item.getAsFile() : null);
    }
  }
  const files = data.files;
  if (files && typeof files.length === "number") {
    for (const file of Array.from(files)) push(file);
  }

  const imageFiles: File[] = [];
  for (const file of candidates) {
    const image = toProductTitlePastedImageFile(file);
    if (image) imageFiles.push(image);
  }
  return { imageFiles, hasText };
}

/** 由 data URL 估算字节数（不做解码，纯长度换算）。 */
export function estimateProductTitleDataUrlBytes(dataUrl: string): number {
  const commaIndex = typeof dataUrl === "string" ? dataUrl.indexOf(",") : -1;
  if (commaIndex < 0) return 0;
  const payload = dataUrl.slice(commaIndex + 1);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

/** 按长边上限等比缩放（不放大），导出便于单测。 */
export function fitProductTitleImageSize(
  width: number,
  height: number,
  maxLongEdge: number = PRODUCT_TITLE_IMAGE_MAX_LONG_EDGE,
): { width: number; height: number } {
  const safeWidth = Number.isFinite(width) && width > 0 ? Math.round(width) : 0;
  const safeHeight = Number.isFinite(height) && height > 0 ? Math.round(height) : 0;
  if (!safeWidth || !safeHeight) return { width: safeWidth, height: safeHeight };
  const longEdge = Math.max(safeWidth, safeHeight);
  if (longEdge <= maxLongEdge) return { width: safeWidth, height: safeHeight };
  const ratio = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(safeWidth * ratio)),
    height: Math.max(1, Math.round(safeHeight * ratio)),
  };
}

/**
 * 压缩：长边 ≤1024、jpeg q0.8。
 * 浏览器不支持 canvas / 解码失败时退回原图 data URL（服务端仍会校验与压缩）。
 */
export async function compressProductTitleFile(file: File): Promise<CompressedProductTitleImage> {
  const source = await readProductTitleFileAsDataUrl(file);
  if (typeof document === "undefined") {
    return { dataUrl: source, bytes: estimateProductTitleDataUrlBytes(source) };
  }

  const decoded = await decodeProductTitleImage(source);
  try {
    const size = fitProductTitleImageSize(decoded.width, decoded.height);
    if (!size.width || !size.height) {
      return { dataUrl: source, bytes: estimateProductTitleDataUrlBytes(source) };
    }
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return { dataUrl: source, bytes: estimateProductTitleDataUrlBytes(source) };
    }
    context.drawImage(decoded.source, 0, 0, size.width, size.height);
    const dataUrl = canvas.toDataURL("image/jpeg", PRODUCT_TITLE_IMAGE_JPEG_QUALITY / 100);
    if (!dataUrl || dataUrl === "data:,") {
      return { dataUrl: source, bytes: estimateProductTitleDataUrlBytes(source) };
    }
    return { dataUrl, bytes: estimateProductTitleDataUrlBytes(dataUrl) };
  } finally {
    decoded.release();
  }
}

/** 读文件为 data URL。 */
export function readProductTitleFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("FileReader is unavailable"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result) resolve(result);
      else reject(new Error("empty file"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

type DecodedProductTitleImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function decodeProductTitleImage(dataUrl: string): Promise<DecodedProductTitleImage> {
  if (typeof createImageBitmap === "function" && typeof fetch === "function") {
    try {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close?.(),
      };
    } catch {
      // 退回 <img> 解码
    }
  }
  const image = await loadProductTitleImageElement(dataUrl);
  return {
    source: image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    release: () => undefined,
  };
}

function loadProductTitleImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Image is unavailable"));
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image decode failed"));
    image.src = dataUrl;
  });
}
