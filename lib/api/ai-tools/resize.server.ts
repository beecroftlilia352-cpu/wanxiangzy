import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  calculateFrameLayout,
  positionCoverFrameLayout,
  type FrameRect,
} from "@/components/studio/image-editor/frame-geometry";
import type {
  AiToolCreateRequestFor,
  AiToolOutputMimeType,
  AiToolSubmitResult,
} from "@/lib/ai-tools/types";
import {
  getImageStorageAdapter,
  storeImage,
  type ImageStorageAdapter,
  type StoredImage,
} from "@/lib/api/image-storage";
import {
  fetchRemoteImageBuffer,
  RemoteImageFetchError,
  type RemoteImageBuffer,
} from "@/lib/api/remote-image-fetch";

const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 32_000_000;
const MAX_TARGET_EDGE = 8_192;
const SOURCE_FETCH_TIMEOUT_MS = 45_000;
const SUPPORTED_SOURCE_FORMATS = new Set(["jpeg", "png", "webp"]);

type ResizeStorageAdapter = Pick<ImageStorageAdapter, "provider" | "isStableUrl">;

type LocalResizeDependencies = {
  fetchSource?: (url: string) => Promise<RemoteImageBuffer>;
  getStorageAdapter?: () => ResizeStorageAdapter;
  storeOutput?: (input: Parameters<typeof storeImage>[0], options: Parameters<typeof storeImage>[1]) => Promise<StoredImage>;
};

export class AiToolLocalResizeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { code: string; status?: number; retryable?: boolean },
  ) {
    super(message);
    this.name = "AiToolLocalResizeError";
    this.code = options.code;
    this.status = options.status ?? 422;
    this.retryable = options.retryable ?? false;
  }
}

/** Executes deterministic resize locally and returns only a project-owned OSS URL. */
export async function executeLocalResizeTask(
  request: AiToolCreateRequestFor<"resize">,
  context: { userId: string },
  dependencies: LocalResizeDependencies = {},
): Promise<AiToolSubmitResult> {
  const storage = dependencies.getStorageAdapter?.() ?? getImageStorageAdapter();
  if (storage.provider !== "aliyun-oss") {
    throw resizeError("无损改尺寸结果存储尚未配置", "AI_TOOL_RESIZE_STORAGE_NOT_CONFIGURED", 503);
  }
  if (!storage.isStableUrl(request.source_url)) {
    throw resizeError("无损改尺寸仅接受已规范化的项目图片", "AI_TOOL_RESIZE_SOURCE_NOT_CANONICAL", 400);
  }
  assertTargetOptions(request.options);

  const remote = await fetchResizeSource(request.source_url, dependencies.fetchSource);
  const source = await readSourceMetadata(remote);
  const processed = await processResize(source, request.options);
  const taskId = `resize-${randomUUID()}`;
  const userScope = createHash("sha256").update(context.userId).digest("hex").slice(0, 12);

  let stored: StoredImage;
  try {
    stored = await (dependencies.storeOutput ?? storeImage)({
      bytes: processed.bytes,
      contentType: processed.contentType,
      name: `${taskId}-${userScope}-${request.request_id}`,
      storageClass: "generated",
    }, {
      preservePixelDimensions: true,
    });
  } catch (error) {
    console.error("[ai-tools/resize] generated output storage failed:", error instanceof Error ? error.message : error);
    throw resizeError("无损改尺寸结果存储失败，请稍后重试", "AI_TOOL_RESIZE_STORE_FAILED", 502, true);
  }

  if (
    !stored.object_key
    || !storage.isStableUrl(stored.url)
    || stored.width !== processed.width
    || stored.height !== processed.height
    || stored.content_type !== processed.contentType
  ) {
    throw resizeError("无损改尺寸结果存储校验失败", "AI_TOOL_RESIZE_STORE_INVALID", 502, true);
  }

  return {
    task_id: taskId,
    request_id: request.request_id,
    operation: "resize",
    status: "completed",
    stage: "local_resize_completed",
    progress: 100,
    expected_count: 1,
    result_urls: [stored.url],
    outputs: [{
      url: stored.url,
      role: "result",
      kind: "image",
      mime_type: processed.contentType,
      dimensions: { width: processed.width, height: processed.height },
    }],
    warnings: [],
    error: null,
    execution_mode: "live",
    provider: "sharp",
    capability: "resize",
    provider_status: "LOCAL_COMPLETED",
  };
}

async function fetchResizeSource(
  url: string,
  fetchSource?: LocalResizeDependencies["fetchSource"],
) {
  try {
    return await (fetchSource
      ? fetchSource(url)
      : fetchRemoteImageBuffer(url, {
          maxBytes: MAX_SOURCE_BYTES,
          timeoutMs: SOURCE_FETCH_TIMEOUT_MS,
        }));
  } catch (error) {
    if (error instanceof RemoteImageFetchError) {
      if (error.code === "too-large") {
        throw resizeError("原图文件不能超过 32MB", "AI_TOOL_RESIZE_SOURCE_TOO_LARGE", 413);
      }
      const unsafe = error.code === "blocked-address"
        || error.code === "blocked-host"
        || error.code === "invalid-url"
        || error.code === "unsupported-protocol";
      throw resizeError(
        unsafe ? "原图地址不被允许" : "原图读取失败，请稍后重试",
        unsafe ? "AI_TOOL_RESIZE_SOURCE_URL_INVALID" : "AI_TOOL_RESIZE_SOURCE_FETCH_FAILED",
        unsafe ? 400 : 502,
        !unsafe,
      );
    }
    throw resizeError("原图读取失败，请稍后重试", "AI_TOOL_RESIZE_SOURCE_FETCH_FAILED", 502, true);
  }
}

async function readSourceMetadata(remote: RemoteImageBuffer) {
  if (!remote.bytes.length) {
    throw resizeError("原图内容为空", "AI_TOOL_RESIZE_SOURCE_INVALID", 400);
  }
  if (remote.bytes.length > MAX_SOURCE_BYTES) {
    throw resizeError("原图文件不能超过 32MB", "AI_TOOL_RESIZE_SOURCE_TOO_LARGE", 413);
  }

  const image = sharp(remote.bytes, {
    animated: true,
    failOn: "warning",
    limitInputPixels: MAX_IMAGE_PIXELS,
  });
  let metadata: Awaited<ReturnType<typeof image.metadata>>;
  try {
    metadata = await image.metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/pixel limit|exceeds.*pixel/i.test(message)) {
      throw resizeError("原图不能超过 3200 万像素", "AI_TOOL_RESIZE_SOURCE_PIXELS_EXCEEDED", 413);
    }
    throw resizeError("原图无法解析", "AI_TOOL_RESIZE_SOURCE_INVALID", 400);
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if ((metadata.pages ?? 1) !== 1) {
    throw resizeError("原图仅支持单帧图片", "AI_TOOL_RESIZE_SOURCE_ANIMATED", 400);
  }
  if (!SUPPORTED_SOURCE_FORMATS.has(metadata.format || "") || !width || !height) {
    throw resizeError("原图必须是 JPG、PNG 或 WebP", "AI_TOOL_RESIZE_SOURCE_FORMAT_INVALID", 415);
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw resizeError("原图不能超过 3200 万像素", "AI_TOOL_RESIZE_SOURCE_PIXELS_EXCEEDED", 413);
  }

  const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
  return {
    bytes: remote.bytes,
    width: swapsAxes ? height : width,
    height: swapsAxes ? width : height,
  };
}

async function processResize(
  source: { bytes: Buffer; width: number; height: number },
  options: AiToolCreateRequestFor<"resize">["options"],
) {
  const background = options.background_color
    || (options.output_format === "jpeg" ? "#ffffff" : "#00000000");
  let pipeline = sharp(source.bytes, {
    failOn: "warning",
    limitInputPixels: MAX_IMAGE_PIXELS,
  }).rotate();

  const explicitCrop = readExplicitCrop(options);
  if (explicitCrop || options.fit === "cover") {
    const crop = explicitCrop || positionCoverFrameLayout(
      calculateFrameLayout(
        { width: source.width, height: source.height },
        { width: options.width, height: options.height },
        "cover",
      ),
      { x: options.position_x ?? 0.5, y: options.position_y ?? 0.5 },
    ).sourceRect;
    assertCropRect(crop, source, options.width / options.height);
    pipeline = pipeline
      .extract(integerCropRect(crop, source))
      .resize({
        width: options.width,
        height: options.height,
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: options.without_enlargement,
      });
  } else {
    pipeline = pipeline.resize({
      width: options.width,
      height: options.height,
      fit: options.fit,
      position: "centre",
      background,
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: options.without_enlargement,
    });
  }

  const contentType = outputContentType(options.output_format);
  if (options.output_format === "jpeg") {
    pipeline = pipeline.flatten({ background }).jpeg({ quality: options.quality, mozjpeg: true });
  } else if (options.output_format === "webp") {
    pipeline = pipeline.webp({ quality: options.quality });
  } else {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  }

  let encoded: Awaited<ReturnType<typeof pipeline.toBuffer>>;
  try {
    encoded = await pipeline.toBuffer({ resolveWithObject: true });
  } catch {
    throw resizeError("图片改尺寸失败", "AI_TOOL_RESIZE_PROCESS_FAILED", 422);
  }
  if (
    !encoded.info.width
    || !encoded.info.height
    || encoded.info.width * encoded.info.height > MAX_IMAGE_PIXELS
  ) {
    throw resizeError("输出图片尺寸无效", "AI_TOOL_RESIZE_OUTPUT_INVALID", 422);
  }
  return {
    bytes: encoded.data,
    contentType,
    width: encoded.info.width,
    height: encoded.info.height,
  };
}

function readExplicitCrop(options: AiToolCreateRequestFor<"resize">["options"]): FrameRect | null {
  if (
    options.crop_x === undefined
    || options.crop_y === undefined
    || options.crop_width === undefined
    || options.crop_height === undefined
  ) return null;
  return {
    x: options.crop_x,
    y: options.crop_y,
    width: options.crop_width,
    height: options.crop_height,
  };
}

function assertCropRect(
  crop: FrameRect,
  source: { width: number; height: number },
  targetAspect: number,
) {
  const values = [crop.x, crop.y, crop.width, crop.height];
  const inBounds = values.every(Number.isFinite)
    && crop.x >= 0
    && crop.y >= 0
    && crop.width >= 1
    && crop.height >= 1
    && crop.x + crop.width <= source.width + 0.5
    && crop.y + crop.height <= source.height + 0.5;
  const cropAspect = crop.width / crop.height;
  if (!inBounds || !Number.isFinite(cropAspect) || Math.abs(cropAspect - targetAspect) > 0.02) {
    throw resizeError("裁剪区域无效，请重新调整", "AI_TOOL_RESIZE_CROP_INVALID", 400);
  }
}

function integerCropRect(
  crop: FrameRect,
  source: { width: number; height: number },
) {
  const left = clamp(Math.round(crop.x), 0, source.width - 1);
  const top = clamp(Math.round(crop.y), 0, source.height - 1);
  return {
    left,
    top,
    width: clamp(Math.round(crop.width), 1, source.width - left),
    height: clamp(Math.round(crop.height), 1, source.height - top),
  };
}

function assertTargetOptions(options: AiToolCreateRequestFor<"resize">["options"]) {
  if (
    !Number.isSafeInteger(options.width)
    || !Number.isSafeInteger(options.height)
    || options.width < 1
    || options.height < 1
    || options.width > MAX_TARGET_EDGE
    || options.height > MAX_TARGET_EDGE
    || options.width * options.height > MAX_IMAGE_PIXELS
  ) {
    throw resizeError("目标图片尺寸无效", "AI_TOOL_RESIZE_TARGET_INVALID", 400);
  }
  if (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100) {
    throw resizeError("输出质量必须是 1-100 的整数", "AI_TOOL_RESIZE_QUALITY_INVALID", 400);
  }
  for (const position of [options.position_x ?? 0.5, options.position_y ?? 0.5]) {
    if (!Number.isFinite(position) || position < 0 || position > 1) {
      throw resizeError("裁剪位置必须在 0-1 之间", "AI_TOOL_RESIZE_POSITION_INVALID", 400);
    }
  }
}

function outputContentType(format: AiToolCreateRequestFor<"resize">["options"]["output_format"]): AiToolOutputMimeType {
  if (format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

function resizeError(
  message: string,
  code: string,
  status: number,
  retryable = false,
) {
  return new AiToolLocalResizeError(message, { code, status, retryable });
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
