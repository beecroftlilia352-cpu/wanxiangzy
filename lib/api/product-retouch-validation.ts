import { createHash } from "node:crypto";
import sharp from "sharp";
import type { AspectRatio } from "@/lib/api/lingya";
import type {
  ProductRetouchHardValidationPolicy,
  ProductRetouchHardValidationResult,
} from "@/lib/product-retouch";
import { fetchRemoteImageBuffer } from "@/lib/api/remote-image-fetch";

export async function validateGeneratedProductImage(
  input: string,
  policy: ProductRetouchHardValidationPolicy,
  options: {
    expectedAspectRatio?: AspectRatio;
    aspectRatioTolerance?: number;
  } = {},
): Promise<ProductRetouchHardValidationResult> {
  const bytes = await readImageBytes(input, policy.maxBytes);
  const image = sharp(bytes, {
    failOn: "warning",
    limitInputPixels: policy.maxWidth * policy.maxHeight,
  });
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const format = normalizeFormat(metadata.format);

  if (!format || !policy.allowedFormats.includes(format)) {
    throw new Error(`生成结果格式不受支持: ${metadata.format || "unknown"}`);
  }
  if (width < policy.minWidth || height < policy.minHeight) {
    throw new Error(`生成结果尺寸过小: ${width}×${height}`);
  }
  if (width > policy.maxWidth || height > policy.maxHeight) {
    throw new Error(`生成结果尺寸过大: ${width}×${height}`);
  }
  assertExpectedAspectRatio(
    width,
    height,
    options.expectedAspectRatio,
    options.aspectRatioTolerance,
  );

  const statsBuffer = await image
    .clone()
    .resize(64, 64, { fit: "fill" })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer();
  const variance = calculateVariance(statsBuffer);
  if (variance < policy.blankVarianceThreshold) {
    throw new Error("生成结果疑似为空白图");
  }

  return {
    format,
    width,
    height,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    variance: Number(variance.toFixed(4)),
  };
}

function assertExpectedAspectRatio(
  width: number,
  height: number,
  expected: AspectRatio | undefined,
  tolerance = 0.04,
) {
  if (!expected || expected === "auto") return;
  const match = /^(\d+):(\d+)$/.exec(expected);
  if (!match) return;
  const target = Number(match[1]) / Number(match[2]);
  const actual = width / height;
  const relativeError = Math.abs(actual - target) / target;
  if (relativeError > Math.min(Math.max(tolerance, 0), 0.2)) {
    throw new Error(`生成结果比例不符合要求: ${width}×${height}，期望 ${expected}`);
  }
}

async function readImageBytes(input: string, maxBytes: number): Promise<Buffer> {
  if (/^data:image\//i.test(input)) {
    const separator = input.indexOf(",");
    if (separator < 0) throw new Error("生成结果 Data URL 无效");
    const bytes = Buffer.from(input.slice(separator + 1), "base64");
    assertByteSize(bytes.byteLength, maxBytes);
    return bytes;
  }

  if (!/^https?:\/\//i.test(input)) {
    const bytes = Buffer.from(input, "base64");
    if (!bytes.length) throw new Error("生成结果内容无效");
    assertByteSize(bytes.byteLength, maxBytes);
    return bytes;
  }

  const remote = await fetchRemoteImageBuffer(input, {
    maxBytes,
    timeoutMs: 20_000,
  });
  assertByteSize(remote.bytes.byteLength, maxBytes);
  return remote.bytes;
}

function assertByteSize(bytes: number, maxBytes: number) {
  if (bytes <= 0) throw new Error("生成结果为空文件");
  if (bytes > maxBytes) throw new Error(`生成结果超过 ${Math.round(maxBytes / 1024 / 1024)}MB`);
}

function normalizeFormat(value: string | undefined): ProductRetouchHardValidationResult["format"] | null {
  if (value === "jpg") return "jpeg";
  if (value === "jpeg" || value === "png" || value === "webp") return value;
  return null;
}

function calculateVariance(bytes: Buffer) {
  if (!bytes.length) return 0;
  let sum = 0;
  let squared = 0;
  for (const value of bytes) {
    sum += value;
    squared += value * value;
  }
  const mean = sum / bytes.length;
  return Math.max(0, squared / bytes.length - mean * mean);
}
