import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { getImageStorageAdapter, storeImage } from "@/lib/api/image-storage";

export const AI_TOOL_MASK_CONTENT_TYPE = "image/png" as const;
export const AI_TOOL_MASK_MAX_BYTES = 8 * 1024 * 1024;
export const AI_TOOL_MASK_MAX_EDGE = 8_192;
export const AI_TOOL_MASK_MAX_PIXELS = 32_000_000;

export type AiToolMaskUploadResult = {
  url: string;
  objectKey: string;
  width: number;
  height: number;
  contentType: typeof AI_TOOL_MASK_CONTENT_TYPE;
  selectedPixels: number;
};

export class AiToolMaskUploadError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, options: { code: string; status?: number }) {
    super(message);
    this.name = "AiToolMaskUploadError";
    this.code = options.code;
    this.status = options.status ?? 400;
  }
}

export function parseAiToolMaskSourceDimension(value: FormDataEntryValue | null, field: string) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw invalidDimension(field);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > AI_TOOL_MASK_MAX_EDGE) {
    throw invalidDimension(field);
  }
  return parsed;
}

export function assertAiToolMaskSourcePixelLimit(width: number, height: number) {
  if (width * height > AI_TOOL_MASK_MAX_PIXELS) {
    throw new AiToolMaskUploadError("原图不能超过 3200 万像素", {
      code: "AI_TOOL_MASK_SOURCE_TOO_LARGE",
      status: 413,
    });
  }
}

export async function validateAndStoreAiToolMask(input: {
  bytes: Buffer;
  declaredContentType: string;
  sourceWidth: number;
  sourceHeight: number;
  userId: string;
}): Promise<AiToolMaskUploadResult> {
  if (input.declaredContentType.toLowerCase() !== AI_TOOL_MASK_CONTENT_TYPE) {
    throw new AiToolMaskUploadError("蒙版必须是 PNG 图片", {
      code: "AI_TOOL_MASK_CONTENT_TYPE_INVALID",
      status: 415,
    });
  }
  if (!input.bytes.length) {
    throw new AiToolMaskUploadError("蒙版内容为空", {
      code: "AI_TOOL_MASK_EMPTY_FILE",
    });
  }
  if (input.bytes.length > AI_TOOL_MASK_MAX_BYTES) {
    throw new AiToolMaskUploadError("蒙版不能超过 8MB", {
      code: "AI_TOOL_MASK_FILE_TOO_LARGE",
      status: 413,
    });
  }
  assertAiToolMaskSourcePixelLimit(input.sourceWidth, input.sourceHeight);
  if (hasPngAnimationControl(input.bytes)) {
    throw new AiToolMaskUploadError("蒙版不支持动画或多帧 PNG", {
      code: "AI_TOOL_MASK_ANIMATED_NOT_ALLOWED",
    });
  }

  const decoded = sharp(input.bytes, {
    animated: true,
    failOn: "warning",
    limitInputPixels: AI_TOOL_MASK_MAX_PIXELS,
  });
  let metadata: Awaited<ReturnType<typeof decoded.metadata>>;
  try {
    metadata = await decoded.metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/pixel limit|exceeds.*pixel/i.test(message)) {
      throw new AiToolMaskUploadError("蒙版不能超过 3200 万像素", {
        code: "AI_TOOL_MASK_PIXELS_EXCEEDED",
        status: 413,
      });
    }
    throw new AiToolMaskUploadError("蒙版 PNG 无法解析", {
      code: "AI_TOOL_MASK_DECODE_FAILED",
    });
  }

  if (metadata.format !== "png") {
    throw new AiToolMaskUploadError("蒙版内容必须是真实 PNG", {
      code: "AI_TOOL_MASK_FORMAT_INVALID",
      status: 415,
    });
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new AiToolMaskUploadError("蒙版不支持动画或多帧 PNG", {
      code: "AI_TOOL_MASK_ANIMATED_NOT_ALLOWED",
    });
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height || width > AI_TOOL_MASK_MAX_EDGE || height > AI_TOOL_MASK_MAX_EDGE) {
    throw new AiToolMaskUploadError("蒙版尺寸无效或超出限制", {
      code: "AI_TOOL_MASK_DIMENSIONS_INVALID",
      status: 413,
    });
  }
  if (width * height > AI_TOOL_MASK_MAX_PIXELS) {
    throw new AiToolMaskUploadError("蒙版不能超过 3200 万像素", {
      code: "AI_TOOL_MASK_PIXELS_EXCEEDED",
      status: 413,
    });
  }
  if (width !== input.sourceWidth || height !== input.sourceHeight) {
    throw new AiToolMaskUploadError(
      `蒙版尺寸必须与原图一致（原图 ${input.sourceWidth}×${input.sourceHeight}，蒙版 ${width}×${height}）`,
      { code: "AI_TOOL_MASK_DIMENSIONS_MISMATCH" },
    );
  }

  let normalized: Buffer;
  let selectedPixels: number;
  try {
    const binaryMask = decoded
      .clone()
      .flatten({ background: "#000000" })
      .greyscale()
      .threshold(127);
    const [stats, output] = await Promise.all([
      binaryMask.clone().stats(),
      binaryMask.clone().png({
        compressionLevel: 9,
        palette: true,
        colours: 2,
      }).toBuffer(),
    ]);
    const channel = stats.channels[0];
    selectedPixels = channel ? Math.round(channel.sum / 255) : 0;
    normalized = output;
  } catch {
    throw new AiToolMaskUploadError("蒙版 PNG 无法规范化", {
      code: "AI_TOOL_MASK_NORMALIZATION_FAILED",
    });
  }

  if (selectedPixels < 1) {
    throw new AiToolMaskUploadError("请先涂抹需要修改的区域", {
      code: "AI_TOOL_MASK_SELECTION_EMPTY",
    });
  }
  if (normalized.length > AI_TOOL_MASK_MAX_BYTES) {
    throw new AiToolMaskUploadError("规范化后的蒙版不能超过 8MB", {
      code: "AI_TOOL_MASK_NORMALIZED_TOO_LARGE",
      status: 413,
    });
  }

  if (getImageStorageAdapter().provider !== "aliyun-oss") {
    throw new AiToolMaskUploadError("临时蒙版存储尚未配置", {
      code: "AI_TOOL_MASK_TEMP_STORAGE_NOT_CONFIGURED",
      status: 503,
    });
  }

  const userScope = createHash("sha256").update(input.userId).digest("hex").slice(0, 12);
  const stored = await storeImage({
    bytes: normalized,
    contentType: AI_TOOL_MASK_CONTENT_TYPE,
    name: `ai-tool-mask-${userScope}-${randomUUID()}`,
    storageClass: "temp",
  });
  if (!stored.object_key) {
    throw new AiToolMaskUploadError("临时蒙版存储返回格式无效", {
      code: "AI_TOOL_MASK_TEMP_STORAGE_INVALID",
      status: 502,
    });
  }

  return {
    url: stored.url,
    objectKey: stored.object_key,
    width,
    height,
    contentType: AI_TOOL_MASK_CONTENT_TYPE,
    selectedPixels,
  };
}

function invalidDimension(field: string) {
  return new AiToolMaskUploadError(`${field} 必须是 1-${AI_TOOL_MASK_MAX_EDGE} 的整数`, {
    code: "AI_TOOL_MASK_SOURCE_DIMENSIONS_INVALID",
  });
}

function hasPngAnimationControl(bytes: Buffer) {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < pngSignature.length || !bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    return false;
  }
  let offset = pngSignature.length;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const nextOffset = typeStart + 4 + length + 4;
    if (nextOffset > bytes.length) return false;
    const type = bytes.subarray(typeStart, typeStart + 4).toString("ascii");
    if (type === "acTL") return true;
    if (type === "IEND") return false;
    offset = nextOffset;
  }
  return false;
}
