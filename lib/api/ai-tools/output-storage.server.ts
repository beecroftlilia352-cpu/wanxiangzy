import { createHash } from "node:crypto";
import sharp from "sharp";
import type {
  AiToolCreateRequestFor,
  AiToolOutput,
  AiToolOutputMimeType,
  AiToolSubmitResult,
} from "@/lib/ai-tools/types";
import {
  getImageStorageAdapter,
  storeImage,
  type ImageStorageClass,
} from "@/lib/api/image-storage";
import { fetchRemoteImageBuffer } from "@/lib/api/remote-image-fetch";
import {
  AiToolTaskRepositoryError,
  claimAiToolOutputPersistence,
  completeAiToolOutputPersistence,
  failAiToolOutputPersistence,
  type AiToolTaskRecord,
} from "@/lib/api/ai-tools/task-repository.server";

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_OUTPUT_PIXELS = 32_000_000;
const OUTPUT_FETCH_TIMEOUT_MS = 45_000;

type PersistContext = {
  userId: string;
  /** Required for live results so persistence is bound to an owned DB task. */
  task?: AiToolTaskRecord;
};

type ValidatedOutput = {
  bytes: Buffer;
  contentType: AiToolOutputMimeType;
  width: number;
  height: number;
};

type PixelLockContext =
  | {
      kind: "mask";
      source: ValidatedOutput;
      mask: ValidatedOutput;
    }
  | {
      kind: "outpaint";
      source: ValidatedOutput;
      options: AiToolCreateRequestFor<"outpaint">["options"];
    };

export class AiToolOutputStorageError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly taskId: string;

  constructor(
    message: string,
    options: {
      code: string;
      taskId: string;
      status?: number;
      retryable?: boolean;
    },
  ) {
    super(message);
    this.name = "AiToolOutputStorageError";
    this.code = options.code;
    this.status = options.status ?? 502;
    this.retryable = options.retryable ?? true;
    this.taskId = options.taskId;
  }
}

/**
 * Turns live provider outputs into project-owned OSS assets before they cross
 * the API boundary. Mock responses intentionally remain source-image aliases.
 */
export async function persistCompletedAiToolOutputs(
  result: AiToolSubmitResult,
  context: PersistContext,
): Promise<AiToolSubmitResult> {
  if (result.status !== "completed" || result.execution_mode === "mock") return result;
  if (getImageStorageAdapter().provider !== "aliyun-oss") {
    throw outputError(result.task_id, "AI 工具结果存储尚未配置", {
      code: "AI_TOOL_OUTPUT_STORAGE_NOT_CONFIGURED",
      status: 503,
      retryable: false,
    });
  }
  if (!context.task
    || context.task.userId !== context.userId
    || context.task.providerTaskId !== result.task_id) {
    throw outputError(result.task_id, "AI 工具结果缺少可信任务归属", {
      code: "AI_TOOL_OUTPUT_TASK_CONTEXT_REQUIRED",
      status: 503,
      retryable: false,
    });
  }

  const signature = createOutputSignature(result);
  let claim: Awaited<ReturnType<typeof claimAiToolOutputPersistence>>;
  try {
    claim = await claimAiToolOutputPersistence({
      task: context.task,
      userId: context.userId,
      outputSignature: signature,
    });
  } catch (error) {
    throw translateTaskStoreError(result.task_id, error);
  }
  if (claim.state === "cached") return claim.result;
  if (claim.state === "busy") {
    throw outputError(result.task_id, "AI 工具结果正在安全转存，请稍后重试", {
      code: "AI_TOOL_OUTPUT_PERSISTENCE_BUSY",
      status: 409,
      retryable: true,
    });
  }

  try {
    const persisted = await persistLiveOutputs(result, context);
    await completeAiToolOutputPersistence({
      task: context.task,
      userId: context.userId,
      outputSignature: signature,
      leaseToken: claim.leaseToken,
      result: persisted,
    });
    return persisted;
  } catch (error) {
    try {
      await failAiToolOutputPersistence({
        task: context.task,
        userId: context.userId,
        outputSignature: signature,
        leaseToken: claim.leaseToken,
        error,
      });
    } catch (releaseError) {
      console.error("[ai-tools] failed to release output persistence lease:", releaseError);
    }
    if (error instanceof AiToolOutputStorageError) throw error;
    throw translateTaskStoreError(result.task_id, error);
  }
}

async function persistLiveOutputs(
  result: AiToolSubmitResult,
  context: PersistContext,
): Promise<AiToolSubmitResult> {
  const outputs = result.outputs.length
    ? result.outputs
    : result.result_urls.map((url) => ({
        url,
        role: "result" as const,
        kind: "image" as const,
        mime_type: null,
        dimensions: null,
      }));
  const indexed = outputs.map((output, index) => ({ output, index }));
  const primary = indexed.filter(({ output }) => output.role === "result");
  if (!primary.length) {
    throw outputError(result.task_id, "AI 工具 Provider 未返回可用结果", {
      code: "AI_TOOL_OUTPUT_RESULT_MISSING",
      retryable: false,
    });
  }

  const persisted = new Map<number, AiToolOutput>();
  const resultDimensions = new Set<string>();
  const pixelLock = await preparePixelLockContext(result.task_id, context.task || null);
  for (const entry of primary) {
    const output = await validateAndPersistOutput(
      result.task_id,
      context.userId,
      entry.output,
      entry.index,
      pixelLock,
    );
    persisted.set(entry.index, output);
    if (output.dimensions) resultDimensions.add(dimensionKey(output.dimensions.width, output.dimensions.height));
  }

  for (const entry of indexed) {
    if (entry.output.role === "result") continue;
    const output = await validateAndPersistOutput(result.task_id, context.userId, entry.output, entry.index);
    if ((output.role === "mask" || output.role === "alpha") && output.dimensions) {
      const key = dimensionKey(output.dimensions.width, output.dimensions.height);
      if (!resultDimensions.has(key)) {
        throw outputError(result.task_id, "AI 工具辅助图尺寸必须与结果图一致", {
          code: "AI_TOOL_OUTPUT_DIMENSIONS_MISMATCH",
          retryable: false,
        });
      }
    }
    persisted.set(entry.index, output);
  }

  const storedOutputs = outputs.map((output, index) => persisted.get(index) || output);
  return {
    ...result,
    outputs: storedOutputs,
    result_urls: storedOutputs
      .filter((output) => output.role === "result")
      .map((output) => output.url),
  };
}

async function validateAndPersistOutput(
  taskId: string,
  userId: string,
  output: AiToolOutput,
  index: number,
  pixelLock: PixelLockContext | null = null,
): Promise<AiToolOutput> {
  assertOutputShape(taskId, output);
  const providerOutput = await fetchAndValidateOutput(taskId, output);
  const validated = output.role === "result" && pixelLock
    ? await composePixelLockedResult(taskId, providerOutput, pixelLock)
    : providerOutput;
  const storageClass: ImageStorageClass = output.role === "result" ? "generated" : "temp";
  const userScope = createHash("sha256").update(userId).digest("hex").slice(0, 12);
  let url = output.url;

  if (pixelLock || !isStoredInExpectedOssPrefix(output.url, storageClass, userScope)) {
    try {
      const stored = await storeImage({
        bytes: validated.bytes,
        contentType: validated.contentType,
        name: `${taskId}-${userScope}-${output.role}-${index + 1}`,
        storageClass,
      }, {
        preservePixelDimensions: true,
      });
      if (!stored.url) {
        throw new Error("stored output metadata mismatch");
      }
      url = stored.url;
    } catch (error) {
      console.error("[ai-tools] completed output storage failed:", error instanceof Error ? error.message : error);
      throw outputError(taskId, "AI 工具结果转存失败，请稍后重试", {
        code: "AI_TOOL_OUTPUT_STORE_FAILED",
        retryable: true,
      });
    }
  }

  return {
    ...output,
    url,
    mime_type: validated.contentType,
    dimensions: { width: validated.width, height: validated.height },
  };
}

async function preparePixelLockContext(
  taskId: string,
  task: AiToolTaskRecord | null,
): Promise<PixelLockContext | null> {
  if (!task || ["matting", "upscale", "resize"].includes(task.operation)) return null;
  const request = task.requestPayload;
  if (!request || request.operation !== task.operation || request.source_url !== task.sourceUrl) {
    throw outputError(taskId, "局部编辑任务缺少可信原始请求，无法锁定未选区域", {
      code: "AI_TOOL_PIXEL_LOCK_CONTEXT_MISSING",
      status: 503,
      retryable: false,
    });
  }

  const source = await fetchAndValidateInput(taskId, request.source_url, "原图");
  if (request.operation === "outpaint") {
    return { kind: "outpaint", source, options: request.options };
  }
  if (!request.mask_url) {
    throw outputError(taskId, "局部编辑任务缺少目标蒙版", {
      code: "AI_TOOL_PIXEL_LOCK_MASK_MISSING",
      retryable: false,
    });
  }
  const mask = await fetchAndValidateInput(taskId, request.mask_url, "目标蒙版", true);
  if (source.width !== mask.width || source.height !== mask.height) {
    throw outputError(taskId, "目标蒙版尺寸与原图不一致", {
      code: "AI_TOOL_PIXEL_LOCK_DIMENSIONS_MISMATCH",
      retryable: false,
    });
  }
  return { kind: "mask", source, mask };
}

async function composePixelLockedResult(
  taskId: string,
  providerOutput: ValidatedOutput,
  context: PixelLockContext,
): Promise<ValidatedOutput> {
  try {
    if (context.kind === "mask") {
      const normalizedProviderBytes = providerOutput.width === context.source.width
        && providerOutput.height === context.source.height
        ? providerOutput.bytes
        : await sharp(providerOutput.bytes, {
            failOn: "warning",
            limitInputPixels: MAX_OUTPUT_PIXELS,
          }).resize({
            width: context.source.width,
            height: context.source.height,
            fit: "fill",
            kernel: sharp.kernel.lanczos3,
          }).toBuffer();
      const alpha = await sharp(context.mask.bytes, {
        failOn: "warning",
        limitInputPixels: MAX_OUTPUT_PIXELS,
      }).greyscale().removeAlpha().raw().toBuffer();
      const overlayPixels = await sharp(normalizedProviderBytes, {
        failOn: "warning",
        limitInputPixels: MAX_OUTPUT_PIXELS,
      }).ensureAlpha().raw().toBuffer();
      for (let pixel = 0; pixel < alpha.length; pixel += 1) {
        overlayPixels[pixel * 4 + 3] = alpha[pixel];
      }
      const overlay = await sharp(overlayPixels, {
        raw: { width: context.source.width, height: context.source.height, channels: 4 },
      }).png().toBuffer();
      const bytes = await sharp(context.source.bytes, {
        failOn: "warning",
        limitInputPixels: MAX_OUTPUT_PIXELS,
      }).ensureAlpha().composite([{ input: overlay, blend: "over" }]).png().toBuffer();
      return {
        bytes,
        contentType: "image/png",
        width: context.source.width,
        height: context.source.height,
      };
    }

    const targetWidth = context.options.target_width;
    const targetHeight = context.options.target_height;
    const normalizedProviderBytes = providerOutput.width === targetWidth
      && providerOutput.height === targetHeight
      ? providerOutput.bytes
      : await sharp(providerOutput.bytes, {
          failOn: "warning",
          limitInputPixels: MAX_OUTPUT_PIXELS,
        }).resize({
          width: targetWidth,
          height: targetHeight,
          fit: "fill",
          kernel: sharp.kernel.lanczos3,
        }).toBuffer();
    const scale = context.options.source_scale ?? 1;
    const width = Math.max(1, Math.round(context.source.width * scale));
    const height = Math.max(1, Math.round(context.source.height * scale));
    const freeWidth = targetWidth - width;
    const freeHeight = targetHeight - height;
    if (freeWidth < 0 || freeHeight < 0) {
      throw outputError(taskId, "扩图原图放置区域超出结果画布", {
        code: "AI_TOOL_PIXEL_LOCK_DIMENSIONS_MISMATCH",
        retryable: false,
      });
    }
    const left = Math.round(freeWidth * context.options.position_x);
    const top = Math.round(freeHeight * context.options.position_y);
    const sourceOverlay = await sharp(context.source.bytes, {
      failOn: "warning",
      limitInputPixels: MAX_OUTPUT_PIXELS,
    }).resize({ width, height, fit: "fill", kernel: sharp.kernel.lanczos3 }).png().toBuffer();
    const bytes = await sharp(normalizedProviderBytes, {
      failOn: "warning",
      limitInputPixels: MAX_OUTPUT_PIXELS,
    }).ensureAlpha().composite([{ input: sourceOverlay, left, top, blend: "over" }]).png().toBuffer();
    return {
      bytes,
      contentType: "image/png",
      width: targetWidth,
      height: targetHeight,
    };
  } catch (error) {
    if (error instanceof AiToolOutputStorageError) throw error;
    console.error("[ai-tools] pixel lock composition failed:", error instanceof Error ? error.message : error);
    throw outputError(taskId, "未选区域像素锁定失败，请稍后重试", {
      code: "AI_TOOL_PIXEL_LOCK_COMPOSE_FAILED",
      retryable: true,
    });
  }
}

async function fetchAndValidateInput(
  taskId: string,
  url: string,
  label: string,
  requirePng = false,
): Promise<ValidatedOutput> {
  assertSafeRemoteUrl(taskId, url);
  let remote: Awaited<ReturnType<typeof fetchRemoteImageBuffer>>;
  try {
    remote = await fetchRemoteImageBuffer(url, {
      maxBytes: MAX_OUTPUT_BYTES,
      timeoutMs: OUTPUT_FETCH_TIMEOUT_MS,
    });
  } catch (error) {
    console.warn(`[ai-tools] ${label} fetch rejected:`, error instanceof Error ? error.message : error);
    throw outputError(taskId, `${label}读取失败，请稍后重试`, {
      code: "AI_TOOL_PIXEL_LOCK_INPUT_FETCH_FAILED",
      retryable: true,
    });
  }
  if (hasPngAnimationControl(remote.bytes)) throw invalidOutput(taskId, `${label}不支持动画 PNG`);
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(remote.bytes, {
      animated: true,
      failOn: "warning",
      limitInputPixels: MAX_OUTPUT_PIXELS,
    }).metadata();
  } catch {
    throw invalidOutput(taskId, `${label}无法解析`);
  }
  const contentType = contentTypeFromSharpFormat(metadata.format);
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!contentType || !width || !height || (metadata.pages ?? 1) !== 1) {
    throw invalidOutput(taskId, `${label}格式无效`);
  }
  if (requirePng && contentType !== "image/png") throw invalidOutput(taskId, `${label}必须是 PNG`);
  if (width * height > MAX_OUTPUT_PIXELS) {
    throw outputError(taskId, `${label}不能超过 3200 万像素`, {
      code: "AI_TOOL_OUTPUT_PIXELS_EXCEEDED",
      status: 413,
      retryable: false,
    });
  }
  if ((metadata.orientation ?? 1) !== 1) throw invalidOutput(taskId, `${label}必须使用规范化像素方向`);
  return { bytes: remote.bytes, contentType, width, height };
}

async function fetchAndValidateOutput(
  taskId: string,
  output: AiToolOutput,
): Promise<ValidatedOutput> {
  assertDeclaredPixelLimit(taskId, output);
  assertSafeRemoteUrl(taskId, output.url);

  let remote: Awaited<ReturnType<typeof fetchRemoteImageBuffer>>;
  try {
    remote = await fetchRemoteImageBuffer(output.url, {
      maxBytes: MAX_OUTPUT_BYTES,
      timeoutMs: OUTPUT_FETCH_TIMEOUT_MS,
    });
  } catch (error) {
    console.warn("[ai-tools] completed output fetch rejected:", error instanceof Error ? error.message : error);
    throw outputError(taskId, "AI 工具结果读取失败，请稍后重试", {
      code: "AI_TOOL_OUTPUT_FETCH_FAILED",
      retryable: true,
    });
  }

  if (hasPngAnimationControl(remote.bytes)) {
    throw invalidOutput(taskId, "AI 工具结果不支持动画 PNG");
  }

  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(remote.bytes, {
      animated: true,
      failOn: "warning",
      limitInputPixels: MAX_OUTPUT_PIXELS,
    }).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/pixel limit|exceeds.*pixel/i.test(message)) {
      throw outputError(taskId, "AI 工具结果不能超过 3200 万像素", {
        code: "AI_TOOL_OUTPUT_PIXELS_EXCEEDED",
        status: 413,
        retryable: false,
      });
    }
    throw invalidOutput(taskId, "AI 工具结果图片无法解析");
  }

  const contentType = contentTypeFromSharpFormat(metadata.format);
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!contentType || !width || !height) throw invalidOutput(taskId, "AI 工具结果图片格式无效");
  if ((metadata.pages ?? 1) !== 1) throw invalidOutput(taskId, "AI 工具结果仅支持单帧图片");
  if (width * height > MAX_OUTPUT_PIXELS) {
    throw outputError(taskId, "AI 工具结果不能超过 3200 万像素", {
      code: "AI_TOOL_OUTPUT_PIXELS_EXCEEDED",
      status: 413,
      retryable: false,
    });
  }
  if ((metadata.orientation ?? 1) !== 1) {
    throw invalidOutput(taskId, "AI 工具结果必须使用规范化像素方向");
  }
  if (output.mime_type && output.mime_type !== contentType) {
    throw invalidOutput(taskId, "AI 工具结果实际格式与声明格式不一致");
  }
  if (output.dimensions && (
    output.dimensions.width !== width || output.dimensions.height !== height
  )) {
    throw outputError(taskId, "AI 工具结果实际尺寸与声明尺寸不一致", {
      code: "AI_TOOL_OUTPUT_DIMENSIONS_MISMATCH",
      retryable: false,
    });
  }
  if (output.role === "mask" && contentType !== "image/png") {
    throw invalidOutput(taskId, "AI 工具蒙版输出必须是 PNG");
  }
  if (output.role === "alpha") {
    const alphaCompatible = contentType === "image/png"
      || (contentType === "image/webp" && metadata.hasAlpha === true);
    if (!alphaCompatible) throw invalidOutput(taskId, "AI 工具 Alpha 输出必须是 PNG 或带透明通道的 WebP");
  }

  return { bytes: remote.bytes, contentType, width, height };
}

function assertOutputShape(taskId: string, output: AiToolOutput) {
  const valid = output.role === "mask"
    ? output.kind === "mask"
    : output.role === "alpha"
      ? output.kind === "alpha"
      : output.kind === "image";
  if (!valid) throw invalidOutput(taskId, "AI 工具结果角色与像素类型不匹配");
}

function assertDeclaredPixelLimit(taskId: string, output: AiToolOutput) {
  if (output.dimensions && output.dimensions.width * output.dimensions.height > MAX_OUTPUT_PIXELS) {
    throw outputError(taskId, "AI 工具结果不能超过 3200 万像素", {
      code: "AI_TOOL_OUTPUT_PIXELS_EXCEEDED",
      status: 413,
      retryable: false,
    });
  }
}

function assertSafeRemoteUrl(taskId: string, value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe URL");
  } catch {
    throw outputError(taskId, "AI 工具结果地址无效", {
      code: "AI_TOOL_OUTPUT_URL_INVALID",
      retryable: false,
    });
  }
}

function contentTypeFromSharpFormat(format?: string): AiToolOutputMimeType | null {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return null;
}

function isStoredInExpectedOssPrefix(
  urlValue: string,
  storageClass: ImageStorageClass,
  requiredUserScope: string,
) {
  const baseValue = process.env.ALIYUN_OSS_PUBLIC_BASE_URL?.trim();
  if (!baseValue) return false;
  try {
    const url = new URL(urlValue);
    const base = new URL(baseValue);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== base.hostname.toLowerCase()) return false;
    if (url.search || url.hash) return false;

    const basePath = decodePath(base.pathname).replace(/^\/+|\/+$/g, "");
    let objectPath = decodePath(url.pathname).replace(/^\/+/, "");
    if (basePath) {
      if (!objectPath.startsWith(`${basePath}/`)) return false;
      objectPath = objectPath.slice(basePath.length + 1);
    }
    const prefix = resolveStoragePrefix(storageClass);
    const inExpectedPrefix = objectPath === prefix || objectPath.startsWith(`${prefix}/`);
    const filename = objectPath.split("/").at(-1) || "";
    return inExpectedPrefix && filename.includes(requiredUserScope);
  } catch {
    return false;
  }
}

function resolveStoragePrefix(storageClass: ImageStorageClass) {
  const configured = storageClass === "generated"
    ? process.env.ALIYUN_OSS_GENERATED_PREFIX
    : process.env.ALIYUN_OSS_TEMP_PREFIX;
  if (configured?.trim()) return cleanPath(configured);
  const base = cleanPath(process.env.ALIYUN_OSS_PREFIX || "ai-tryon");
  const folder = storageClass === "generated" ? "generated-results/original" : "temp/original";
  return [base, folder].filter(Boolean).join("/");
}

function cleanPath(value: string) {
  return value.split("/").map((part) => part.trim()).filter(Boolean).join("/");
}

function decodePath(value: string) {
  try {
    return value.split("/").map((part) => decodeURIComponent(part)).join("/");
  } catch {
    return value;
  }
}

function dimensionKey(width: number, height: number) {
  return `${width}x${height}`;
}

function createOutputSignature(result: AiToolSubmitResult) {
  const payload = JSON.stringify({
    result_urls: result.result_urls,
    outputs: result.outputs.map((output) => ({
      url: output.url,
      role: output.role,
      kind: output.kind,
      mime_type: output.mime_type,
      dimensions: output.dimensions,
    })),
  });
  return createHash("sha256").update(payload).digest("hex");
}

function invalidOutput(taskId: string, message: string) {
  return outputError(taskId, message, {
    code: "AI_TOOL_OUTPUT_INVALID",
    retryable: false,
  });
}

function outputError(
  taskId: string,
  message: string,
  options: { code: string; status?: number; retryable?: boolean },
) {
  return new AiToolOutputStorageError(message, { taskId, ...options });
}

function hasPngAnimationControl(bytes: Buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < signature.length || !bytes.subarray(0, signature.length).equals(signature)) return false;
  let offset = signature.length;
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

function translateTaskStoreError(taskId: string, error: unknown) {
  if (error instanceof AiToolTaskRepositoryError) {
    return outputError(taskId, error.message, {
      code: error.code,
      status: error.status,
      retryable: error.retryable,
    });
  }
  return outputError(taskId, "AI 工具结果持久化失败，请稍后重试", {
    code: "AI_TOOL_OUTPUT_PERSISTENCE_FAILED",
    status: 503,
    retryable: true,
  });
}
