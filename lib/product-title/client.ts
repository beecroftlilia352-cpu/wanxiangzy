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
