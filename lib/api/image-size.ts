export type ImageResolutionSize = "1K" | "2K" | "4K";
export type FixedImageAspectRatio = "1:1" | "9:16" | "16:9" | "4:3" | "3:4" | "2:3" | "3:2" | "4:5" | "5:4" | "21:9";

export const IMAGE_ASPECT_RATIOS: readonly FixedImageAspectRatio[] = [
  "1:1",
  "9:16",
  "16:9",
  "4:3",
  "3:4",
  "2:3",
  "3:2",
  "4:5",
  "5:4",
  "21:9",
];

const MAX_GPT_IMAGE_PIXELS = 3840 * 2160;
const MAX_GPT_IMAGE_EDGE = 3840;
const IMAGE_DIMENSION_FETCH_TIMEOUT_MS = 15_000;

export function resolveExactAspectPixelSize(imageSize: ImageResolutionSize, aspectRatio: string): string {
  if (aspectRatio === "auto") return getDefaultPixelSize(imageSize);

  const base = getDivisibleAspectBase(aspectRatio);
  if (base.width === base.height) {
    if (imageSize === "1K") return "1024x1024";
    if (imageSize === "2K") return "2048x2048";
  }

  if (imageSize === "1K") return resolveLongEdgeExactAspectPixelSize(base, 1536);
  if (imageSize === "2K") return resolveLongEdgeExactAspectPixelSize(base, 2048);
  return resolvePixelLimitedExactAspectPixelSize(base, MAX_GPT_IMAGE_PIXELS, MAX_GPT_IMAGE_EDGE);
}

export function getDefaultPixelSize(imageSize: ImageResolutionSize): string {
  if (imageSize === "1K") return "1024x1024";
  if (imageSize === "2K") return "2048x2048";
  return "3840x2160";
}

export async function resolveSmartImageAspectRatio(params: {
  aspectRatio?: string;
  image?: string;
  fallback?: FixedImageAspectRatio;
  candidates?: readonly FixedImageAspectRatio[];
}): Promise<string> {
  if (params.aspectRatio && params.aspectRatio !== "auto") return params.aspectRatio;

  const fallback = params.fallback || "3:4";
  if (!params.image) return fallback;

  const dimensions = await readImageDimensions(params.image).catch(() => null);
  if (!dimensions) return fallback;
  return resolveClosestImageAspectRatio(dimensions.width, dimensions.height, params.candidates);
}

export function resolveClosestImageAspectRatio(
  width: number,
  height: number,
  candidates: readonly FixedImageAspectRatio[] = IMAGE_ASPECT_RATIOS,
): FixedImageAspectRatio {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "3:4";

  const sourceRatio = width / height;
  return candidates.reduce<{ value: FixedImageAspectRatio; distance: number }>((closest, candidate) => {
    const candidateRatio = getAspectRatioValue(candidate);
    const distance = Math.abs(Math.log(sourceRatio / candidateRatio));
    return distance < closest.distance ? { value: candidate, distance } : closest;
  }, { value: "3:4", distance: Number.POSITIVE_INFINITY }).value;
}

export async function readImageDimensions(src: string): Promise<{ width: number; height: number } | null> {
  const dataBytes = decodeDataUrlBytes(src);
  if (dataBytes) return parseImageDimensions(dataBytes);

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(IMAGE_DIMENSION_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;

  const bytes = new Uint8Array(await response.arrayBuffer());
  return parseImageDimensions(bytes);
}

export function parseImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  return parsePngDimensions(bytes) || parseJpegDimensions(bytes) || parseWebpDimensions(bytes);
}

function resolveLongEdgeExactAspectPixelSize(base: { width: number; height: number }, longEdge: number): string {
  const multiplier = Math.max(1, Math.floor(longEdge / Math.max(base.width, base.height)));
  return `${base.width * multiplier}x${base.height * multiplier}`;
}

function resolvePixelLimitedExactAspectPixelSize(
  base: { width: number; height: number },
  maxPixels: number,
  maxEdge: number,
): string {
  const maxByEdge = Math.floor(maxEdge / Math.max(base.width, base.height));
  const maxByPixels = Math.floor(Math.sqrt(maxPixels / (base.width * base.height)));
  const multiplier = Math.max(1, Math.min(maxByEdge, maxByPixels));
  return `${base.width * multiplier}x${base.height * multiplier}`;
}

function getAspectRatioValue(aspectRatio: string): number {
  const [width, height] = aspectRatio.split(":").map(Number);
  if (!width || !height) return 3 / 4;
  return width / height;
}

function getDivisibleAspectBase(aspectRatio: string): { width: number; height: number } {
  const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number);
  const width = rawWidth || 3;
  const height = rawHeight || 4;
  const divisor = greatestCommonDivisor(width, height);
  const reducedWidth = width / divisor;
  const reducedHeight = height / divisor;
  const multiplier = leastCommonMultiple(
    16 / greatestCommonDivisor(reducedWidth, 16),
    16 / greatestCommonDivisor(reducedHeight, 16),
  );

  return {
    width: reducedWidth * multiplier,
    height: reducedHeight * multiplier,
  };
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function leastCommonMultiple(a: number, b: number): number {
  return Math.abs(a * b) / greatestCommonDivisor(a, b);
}

function decodeDataUrlBytes(src: string): Uint8Array | null {
  const match = src.match(/^data:[^;,]+(?:;[^,]*)?,(.*)$/i);
  if (!match) return null;

  const isBase64 = /^data:[^;,]+(?:;[^,]*)?;base64,/i.test(src);
  try {
    const raw = isBase64 ? Buffer.from(match[1], "base64") : Buffer.from(decodeURIComponent(match[1]), "utf8");
    return new Uint8Array(raw);
  } catch {
    return null;
  }
}

function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return null;
  }

  return {
    width: readUInt32BE(bytes, 16),
    height: readUInt32BE(bytes, 20),
  };
}

function parseJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xda || marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;

    const segmentLength = readUInt16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;

    if (isJpegStartOfFrame(marker)) {
      return {
        height: readUInt16BE(bytes, offset + 3),
        width: readUInt16BE(bytes, offset + 5),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function parseWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length < 30 ||
    bytesToAscii(bytes, 0, 4) !== "RIFF" ||
    bytesToAscii(bytes, 8, 12) !== "WEBP"
  ) {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytesToAscii(bytes, offset, offset + 4);
    const chunkSize = readUInt32LE(bytes, offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > bytes.length) return null;

    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        width: 1 + readUInt24LE(bytes, dataOffset + 4),
        height: 1 + readUInt24LE(bytes, dataOffset + 7),
      };
    }

    if (chunkType === "VP8L" && chunkSize >= 5 && bytes[dataOffset] === 0x2f) {
      const b1 = bytes[dataOffset + 1];
      const b2 = bytes[dataOffset + 2];
      const b3 = bytes[dataOffset + 3];
      const b4 = bytes[dataOffset + 4];
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
      };
    }

    if (
      chunkType === "VP8 " &&
      chunkSize >= 10 &&
      bytes[dataOffset + 3] === 0x9d &&
      bytes[dataOffset + 4] === 0x01 &&
      bytes[dataOffset + 5] === 0x2a
    ) {
      return {
        width: readUInt16LE(bytes, dataOffset + 6) & 0x3fff,
        height: readUInt16LE(bytes, dataOffset + 8) & 0x3fff,
      };
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  return null;
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readUInt16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function bytesToAscii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
