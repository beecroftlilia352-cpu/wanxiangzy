import { createHash, randomUUID } from "node:crypto";
import sharp, { type Sharp } from "sharp";
import type { AiToolOutput } from "@/lib/ai-tools/types";
import type {
  AiToolMattingComposeMask,
  AiToolMattingComposeRequest,
  AiToolMattingEditOperation,
  AiToolMattingMatteKind,
} from "@/lib/ai-tools/matting-compose";
import {
  AiToolAssetReferenceError,
  createAiToolMaskReference,
} from "@/lib/api/ai-tools/asset-reference.server";
import { getImageStorageAdapter, storeImage } from "@/lib/api/image-storage";
import {
  fetchRemoteImageBuffer,
  RemoteImageFetchError,
  type RemoteImageBuffer,
  type RemoteImageFetchOptions,
} from "@/lib/api/remote-image-fetch";

export const AI_TOOL_MATTING_SOURCE_MAX_BYTES = 32 * 1024 * 1024;
export const AI_TOOL_MATTING_MASK_MAX_BYTES = 8 * 1024 * 1024;
export const AI_TOOL_MATTING_RESULT_MAX_BYTES = 8 * 1024 * 1024;
export const AI_TOOL_MATTING_MAX_EDGE = 8_192;
export const AI_TOOL_MATTING_MAX_PIXELS = 32_000_000;
const REMOTE_FETCH_TIMEOUT_MS = 20_000;

type RuntimeEnv = Partial<Pick<NodeJS.ProcessEnv,
  | "NODE_ENV"
  | "IMAGE_STORAGE_PROVIDER"
  | "ALIYUN_OSS_ACCESS_KEY_ID"
  | "ALIYUN_OSS_ACCESS_KEY_SECRET"
  | "ALIYUN_OSS_BUCKET"
  | "ALIYUN_OSS_REGION"
  | "ALIYUN_OSS_PUBLIC_BASE_URL"
>>;

type MattingComposeDependencies = {
  fetchImage: (url: string, options: RemoteImageFetchOptions) => Promise<RemoteImageBuffer>;
  getStorageProvider: () => string;
  store: typeof storeImage;
  createMaskReference: typeof createAiToolMaskReference;
};

export type AiToolMattingComposeResult = {
  result_urls: string[];
  outputs: AiToolOutput[];
  mask: AiToolMattingComposeMask;
};

export class AiToolMattingComposeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, options: { code: string; status?: number; retryable?: boolean }) {
    super(message);
    this.name = "AiToolMattingComposeError";
    this.code = options.code;
    this.status = options.status ?? 400;
    this.retryable = options.retryable ?? false;
  }
}

export async function composeAiToolMattingResult(
  request: AiToolMattingComposeRequest,
  context: { userId: string },
  env: RuntimeEnv = process.env,
  dependencies: MattingComposeDependencies = {
    fetchImage: fetchRemoteImageBuffer,
    getStorageProvider: () => getImageStorageAdapter().provider,
    store: storeImage,
    createMaskReference: createAiToolMaskReference,
  },
): Promise<AiToolMattingComposeResult> {
  assertGeneratedOssConfigured(env, dependencies.getStorageProvider);

  let remoteAssets: RemoteImageBuffer[];
  try {
    remoteAssets = await Promise.all([
      dependencies.fetchImage(request.source_url, remoteFetchOptions(AI_TOOL_MATTING_SOURCE_MAX_BYTES)),
      dependencies.fetchImage(request.base_mask_url, remoteFetchOptions(AI_TOOL_MATTING_MASK_MAX_BYTES)),
      ...(request.edit_mask_url
        ? [dependencies.fetchImage(request.edit_mask_url, remoteFetchOptions(AI_TOOL_MATTING_MASK_MAX_BYTES))]
        : []),
    ]);
  } catch (error) {
    throw normalizeRemoteFetchError(error);
  }

  const source = await inspectSource(remoteAssets[0]!.bytes);
  const baseAlpha = await decodeMatte(
    remoteAssets[1]!.bytes,
    request.base_mask_kind,
    "基础蒙版",
  );
  assertSameDimensions(source, baseAlpha, "基础蒙版");

  let finalAlpha = baseAlpha.pixels;
  if (request.edit_mask_url && request.edit_operation) {
    const editAlpha = await decodeMatte(remoteAssets[2]!.bytes, "mask", "编辑蒙版");
    assertSameDimensions(source, editAlpha, "编辑蒙版");
    finalAlpha = mergeAlpha(baseAlpha.pixels, editAlpha.pixels, request.edit_operation);
  }
  if (!hasVisiblePixels(finalAlpha)) {
    throw new AiToolMattingComposeError("合成后的透明度蒙版为空，请至少保留一个前景像素", {
      code: "AI_TOOL_MATTING_ALPHA_EMPTY",
    });
  }

  let resultPng: Buffer;
  let alphaPng: Buffer;
  try {
    const [opaqueSourcePng, encodedAlphaPng] = await Promise.all([
      sharp(source.bytes, sharpInputOptions())
        .rotate()
        .removeAlpha()
        .png({ compressionLevel: 9, adaptiveFiltering: true, progressive: false })
        .toBuffer(),
      encodeAlphaPng(finalAlpha, source.width, source.height),
    ]);
    alphaPng = encodedAlphaPng;
    resultPng = await sharp(opaqueSourcePng, sharpInputOptions())
      .joinChannel(finalAlpha, {
        raw: { width: source.width, height: source.height, channels: 1 },
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true, progressive: false })
      .toBuffer();
  } catch {
    throw new AiToolMattingComposeError("透明 PNG 合成失败", {
      code: "AI_TOOL_MATTING_COMPOSE_FAILED",
      status: 422,
    });
  }

  if (resultPng.length > AI_TOOL_MATTING_RESULT_MAX_BYTES) {
    throw new AiToolMattingComposeError("透明 PNG 超过 8MB，请缩小原图后重试", {
      code: "AI_TOOL_MATTING_RESULT_TOO_LARGE",
      status: 413,
    });
  }
  if (alphaPng.length > AI_TOOL_MATTING_MASK_MAX_BYTES) {
    throw new AiToolMattingComposeError("透明度蒙版超过 8MB，请缩小原图后重试", {
      code: "AI_TOOL_MATTING_ALPHA_TOO_LARGE",
      status: 413,
    });
  }

  const userScope = createHash("sha256").update(context.userId).digest("hex").slice(0, 12);
  const objectScope = `${userScope}-${request.request_id}-${randomUUID()}`;
  let storedResult: Awaited<ReturnType<typeof storeImage>>;
  let storedAlpha: Awaited<ReturnType<typeof storeImage>>;
  try {
    [storedResult, storedAlpha] = await Promise.all([
      dependencies.store({
        bytes: resultPng,
        contentType: "image/png",
        name: `ai-tool-matting-result-${objectScope}`,
        storageClass: "generated",
      }),
      dependencies.store({
        bytes: alphaPng,
        contentType: "image/png",
        name: `ai-tool-matting-alpha-${objectScope}`,
        storageClass: "generated",
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notConfigured = /未配置|ALIYUN_OSS|not configured/i.test(message);
    throw new AiToolMattingComposeError(
      notConfigured ? "AI 抠图结果存储尚未配置" : "AI 抠图结果写入 OSS 失败",
      {
        code: notConfigured
          ? "AI_TOOL_MATTING_STORAGE_NOT_CONFIGURED"
          : "AI_TOOL_MATTING_STORAGE_FAILED",
        status: notConfigured ? 503 : 502,
        retryable: !notConfigured,
      },
    );
  }
  assertStoredPng(storedResult, source, "结果图");
  assertStoredPng(storedAlpha, source, "透明度蒙版");

  const mask = createComposeMaskReference({
    userId: context.userId,
    storedAlpha,
    width: source.width,
    height: source.height,
    createReference: dependencies.createMaskReference,
  });

  const resultOutput: AiToolOutput = {
    url: storedResult.url,
    role: "result",
    kind: "image",
    mime_type: "image/png",
    dimensions: { width: source.width, height: source.height },
  };
  const alphaOutput: AiToolOutput = {
    url: storedAlpha.url,
    role: "alpha",
    kind: "alpha",
    mime_type: "image/png",
    dimensions: { width: source.width, height: source.height },
  };
  return {
    result_urls: [resultOutput.url],
    outputs: [resultOutput, alphaOutput],
    mask,
  };
}

function createComposeMaskReference(input: {
  userId: string;
  storedAlpha: Awaited<ReturnType<typeof storeImage>>;
  width: number;
  height: number;
  createReference: typeof createAiToolMaskReference;
}): AiToolMattingComposeMask {
  try {
    const reference = input.createReference({
      userId: input.userId,
      url: input.storedAlpha.url,
      objectKey: input.storedAlpha.object_key!,
      width: input.width,
      height: input.height,
      contentType: "image/png",
    });
    return {
      url: reference.referenceUrl,
      ref: reference.token,
      width: reference.width,
      height: reference.height,
      content_type: reference.contentType,
      expires_at: reference.expiresAt,
    };
  } catch (error) {
    if (error instanceof AiToolAssetReferenceError) {
      throw new AiToolMattingComposeError(error.message, {
        code: error.code,
        status: error.status,
        retryable: false,
      });
    }
    throw new AiToolMattingComposeError("透明度蒙版引用创建失败", {
      code: "AI_TOOL_MATTING_MASK_REFERENCE_FAILED",
      status: 500,
      retryable: true,
    });
  }
}

function remoteFetchOptions(maxBytes: number): RemoteImageFetchOptions {
  return {
    allowedContentTypes: ["image"],
    maxBytes,
    maxRedirects: 2,
    timeoutMs: REMOTE_FETCH_TIMEOUT_MS,
  };
}

function assertGeneratedOssConfigured(env: RuntimeEnv, getStorageProvider: () => string) {
  const configured = (env.IMAGE_STORAGE_PROVIDER || "").trim().toLowerCase() === "aliyun-oss"
    && Boolean(env.ALIYUN_OSS_ACCESS_KEY_ID?.trim())
    && Boolean(env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim())
    && Boolean(env.ALIYUN_OSS_BUCKET?.trim())
    && Boolean(env.ALIYUN_OSS_REGION?.trim())
    && isHttpsBaseUrl(env.ALIYUN_OSS_PUBLIC_BASE_URL);
  if (!configured || getStorageProvider() !== "aliyun-oss") {
    throw new AiToolMattingComposeError("AI 抠图结果存储尚未配置", {
      code: "AI_TOOL_MATTING_STORAGE_NOT_CONFIGURED",
      status: 503,
    });
  }
}

function isHttpsBaseUrl(value: string | undefined) {
  try {
    const url = new URL(value || "");
    const allowLocalHttp = (process.env.ALIYUN_OSS_ENDPOINT_SCHEME || "").trim().toLowerCase() === "http";
    return (url.protocol === "https:" || (allowLocalHttp && url.protocol === "http:"))
      && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function inspectSource(bytes: Buffer) {
  let metadata: Awaited<ReturnType<Sharp["metadata"]>>;
  try {
    metadata = await sharp(bytes, sharpInputOptions()).metadata();
  } catch (error) {
    throw normalizeDecodeError(error, "原图");
  }
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
    throw new AiToolMattingComposeError("原图仅支持 JPG、PNG 或 WebP", {
      code: "AI_TOOL_MATTING_SOURCE_FORMAT_INVALID",
      status: 415,
    });
  }
  assertSingleFrame(metadata.pages, "原图");
  const rawWidth = metadata.width ?? 0;
  const rawHeight = metadata.height ?? 0;
  assertDimensions(rawWidth, rawHeight, "原图");
  const swapped = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8;
  return {
    bytes,
    width: swapped ? rawHeight : rawWidth,
    height: swapped ? rawWidth : rawHeight,
  };
}

async function decodeMatte(bytes: Buffer, kind: AiToolMattingMatteKind, label: string) {
  const image = sharp(bytes, sharpInputOptions());
  let metadata: Awaited<ReturnType<typeof image.metadata>>;
  try {
    metadata = await image.metadata();
  } catch (error) {
    throw normalizeDecodeError(error, label);
  }
  if (metadata.format !== "png") {
    throw new AiToolMattingComposeError(`${label}必须是真实 PNG`, {
      code: "AI_TOOL_MATTING_MASK_FORMAT_INVALID",
      status: 415,
    });
  }
  assertSingleFrame(metadata.pages, label);
  assertDimensions(metadata.width ?? 0, metadata.height ?? 0, label);

  try {
    const pipeline = kind === "alpha" && metadata.hasAlpha
      ? image.rotate().extractChannel("alpha")
      : image.rotate().flatten({ background: "#000000" }).greyscale();
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    return { pixels: data, width: info.width, height: info.height };
  } catch (error) {
    throw normalizeDecodeError(error, label);
  }
}

function mergeAlpha(base: Buffer, edit: Buffer, operation: AiToolMattingEditOperation) {
  if (operation === "replace") return Buffer.from(edit);
  const output = Buffer.allocUnsafe(base.length);
  for (let index = 0; index < base.length; index += 1) {
    const baseValue = base[index]!;
    const editValue = edit[index]!;
    output[index] = operation === "add"
      ? Math.max(baseValue, editValue)
      : Math.round(baseValue * (255 - editValue) / 255);
  }
  return output;
}

async function encodeAlphaPng(alpha: Buffer, width: number, height: number) {
  const white = Buffer.alloc(alpha.length, 255);
  return sharp(white, { raw: { width, height, channels: 1 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

function assertSameDimensions(
  source: { width: number; height: number },
  matte: { width: number; height: number },
  label: string,
) {
  if (source.width !== matte.width || source.height !== matte.height) {
    throw new AiToolMattingComposeError(
      `${label}尺寸必须与原图一致（原图 ${source.width}×${source.height}，${label} ${matte.width}×${matte.height}）`,
      { code: "AI_TOOL_MATTING_DIMENSIONS_MISMATCH" },
    );
  }
}

function assertDimensions(width: number, height: number, label: string) {
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 1
    || height < 1
    || width > AI_TOOL_MATTING_MAX_EDGE
    || height > AI_TOOL_MATTING_MAX_EDGE
    || width * height > AI_TOOL_MATTING_MAX_PIXELS
  ) {
    throw new AiToolMattingComposeError(`${label}尺寸无效或超过 3200 万像素`, {
      code: "AI_TOOL_MATTING_DIMENSIONS_INVALID",
      status: 413,
    });
  }
}

function assertSingleFrame(pages: number | undefined, label: string) {
  if ((pages ?? 1) !== 1) {
    throw new AiToolMattingComposeError(`${label}不支持动画或多帧图片`, {
      code: "AI_TOOL_MATTING_ANIMATED_NOT_ALLOWED",
      status: 415,
    });
  }
}

function assertStoredPng(
  stored: Awaited<ReturnType<typeof storeImage>>,
  source: { width: number; height: number },
  label: string,
) {
  let url: URL;
  try {
    url = new URL(stored.url);
  } catch {
    throw invalidStorageResponse(label);
  }
  if (
    url.protocol !== "https:"
    || !stored.object_key
    || stored.content_type !== "image/png"
    || stored.width !== source.width
    || stored.height !== source.height
  ) {
    throw invalidStorageResponse(label);
  }
}

function invalidStorageResponse(label: string) {
  return new AiToolMattingComposeError(`${label}存储返回格式无效`, {
    code: "AI_TOOL_MATTING_STORAGE_INVALID",
    status: 502,
    retryable: true,
  });
}

function hasVisiblePixels(alpha: Buffer) {
  for (const value of alpha) {
    if (value > 0) return true;
  }
  return false;
}

function sharpInputOptions() {
  return {
    animated: true,
    failOn: "warning" as const,
    limitInputPixels: AI_TOOL_MATTING_MAX_PIXELS,
  };
}

function normalizeDecodeError(error: unknown, label: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (/pixel limit|exceeds.*pixel/i.test(message)) {
    return new AiToolMattingComposeError(`${label}超过 3200 万像素`, {
      code: "AI_TOOL_MATTING_PIXELS_EXCEEDED",
      status: 413,
    });
  }
  return new AiToolMattingComposeError(`${label}无法解析`, {
    code: "AI_TOOL_MATTING_DECODE_FAILED",
    status: 415,
  });
}

function normalizeRemoteFetchError(error: unknown) {
  if (!(error instanceof RemoteImageFetchError)) {
    return new AiToolMattingComposeError("远程图片暂时无法读取", {
      code: "AI_TOOL_MATTING_REMOTE_FETCH_FAILED",
      status: 502,
      retryable: true,
    });
  }
  if (error.code === "too-large") {
    return new AiToolMattingComposeError("远程图片超过大小限制", {
      code: "AI_TOOL_MATTING_REMOTE_TOO_LARGE",
      status: 413,
    });
  }
  if (error.code === "non-image") {
    return new AiToolMattingComposeError("远程资源不是受支持的图片", {
      code: "AI_TOOL_MATTING_REMOTE_NOT_IMAGE",
      status: 415,
    });
  }
  if (["blocked-address", "blocked-host", "invalid-url", "unsupported-protocol"].includes(error.code)) {
    return new AiToolMattingComposeError("远程图片地址不安全或不受信任", {
      code: "AI_TOOL_MATTING_REMOTE_URL_BLOCKED",
    });
  }
  if (error.code === "timeout") {
    return new AiToolMattingComposeError("远程图片读取超时", {
      code: "AI_TOOL_MATTING_REMOTE_TIMEOUT",
      status: 504,
      retryable: true,
    });
  }
  return new AiToolMattingComposeError("远程图片暂时无法读取", {
    code: "AI_TOOL_MATTING_REMOTE_FETCH_FAILED",
    status: 502,
    retryable: true,
  });
}
