import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { AiToolCreateRequest, AiToolExecutionMode } from "@/lib/ai-tools/types";
import type { AiToolMattingComposeRequest } from "@/lib/ai-tools/matting-compose";
import {
  AiToolAssetReferenceError,
  assertAiToolOwnedOssAssetUrl,
  isAiToolMaskReferenceUrl,
  verifyAiToolMaskReference,
} from "@/lib/api/ai-tools/asset-reference.server";
import { fetchRemoteImageBuffer } from "@/lib/api/remote-image-fetch";
import { verifyUploadRegistrationToken } from "@/lib/resource-library/upload-registration";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_PREFLIGHT_MAX_BYTES = 32 * 1024 * 1024;
const SOURCE_PREFLIGHT_MAX_PIXELS = 32_000_000;
const SOURCE_PREFLIGHT_TIMEOUT_MS = 20_000;
const INPUT_PROOF_KEYS = new Set([
  "source_ref",
  "source_asset_id",
  "mask_ref",
  "reference_refs",
  "reference_asset_ids",
  "reference_mask_ref",
]);
const COMPOSE_PROOF_KEYS = new Set([
  "source_ref",
  "source_asset_id",
  "base_mask_ref",
  "edit_mask_ref",
]);

export type AiToolInputProofs = {
  sourceRef?: string;
  sourceAssetId?: string;
  maskRef?: string;
  referenceRefs?: string[];
  referenceAssetIds?: string[];
  referenceMaskRef?: string;
};

export type AiToolMattingComposeProofs = {
  sourceRef?: string;
  sourceAssetId?: string;
  baseMaskRef?: string;
  editMaskRef?: string;
};

type OwnedImage = {
  assetId: string | null;
  url: string;
  width: number | null;
  height: number | null;
  proof: "upload_token" | "resource_asset";
};

export type AiToolSourceOwnership = {
  assetId: string | null;
  url: string;
  width: number | null;
  height: number | null;
  proof: "upload_token" | "resource_asset";
};

export class AiToolInputOwnershipError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { code: string; status?: number; retryable?: boolean },
  ) {
    super(message);
    this.name = "AiToolInputOwnershipError";
    this.code = options.code;
    this.status = options.status ?? 403;
    this.retryable = options.retryable ?? false;
  }
}

/** Removes only recognized proof fields so the shared strict request parser can
 * continue rejecting every other unknown property. */
export function extractAiToolInputProofs(value: unknown): {
  requestBody: unknown;
  proofs: AiToolInputProofs;
} {
  if (!isRecord(value)) return { requestBody: value, proofs: {} };
  const requestBody: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (!INPUT_PROOF_KEYS.has(key)) requestBody[key] = field;
  }
  return {
    requestBody,
    proofs: {
      sourceRef: optionalString(value.source_ref, "source_ref"),
      sourceAssetId: optionalAssetId(value.source_asset_id, "source_asset_id"),
      maskRef: optionalString(value.mask_ref, "mask_ref"),
      referenceRefs: optionalStringArray(value.reference_refs, "reference_refs"),
      referenceAssetIds: optionalAssetIdArray(value.reference_asset_ids, "reference_asset_ids"),
      referenceMaskRef: optionalString(value.reference_mask_ref, "reference_mask_ref"),
    },
  };
}

export function extractAiToolMattingComposeProofs(value: unknown): {
  requestBody: unknown;
  proofs: AiToolMattingComposeProofs;
} {
  if (!isRecord(value)) return { requestBody: value, proofs: {} };
  const requestBody: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (!COMPOSE_PROOF_KEYS.has(key)) requestBody[key] = field;
  }
  return {
    requestBody,
    proofs: {
      sourceRef: optionalString(value.source_ref, "source_ref"),
      sourceAssetId: optionalAssetId(value.source_asset_id, "source_asset_id"),
      baseMaskRef: optionalString(value.base_mask_ref, "base_mask_ref"),
      editMaskRef: optionalString(value.edit_mask_ref, "edit_mask_ref"),
    },
  };
}

export async function resolveOwnedAiToolRequest(
  request: AiToolCreateRequest,
  proofs: AiToolInputProofs,
  context: {
    userId: string;
    supabase: SupabaseClient;
    executionMode: AiToolExecutionMode;
  },
): Promise<AiToolCreateRequest> {
  const resolved = await resolveOwnedAiToolSubmission(request, proofs, context);
  return resolved.request;
}

export async function resolveOwnedAiToolSubmission(
  request: AiToolCreateRequest,
  proofs: AiToolInputProofs,
  context: {
    userId: string;
    supabase: SupabaseClient;
    executionMode: AiToolExecutionMode;
  },
): Promise<{ request: AiToolCreateRequest; sourceOwnership: AiToolSourceOwnership }> {
  if (context.executionMode === "mock") {
    return {
      request,
      sourceOwnership: {
        assetId: null,
        url: request.source_url,
        width: null,
        height: null,
        proof: "resource_asset",
      },
    };
  }
  if (proofs.sourceRef && proofs.sourceAssetId) throw conflictingProof("原图");
  if (proofs.referenceRefs && proofs.referenceAssetIds) throw conflictingProof("参考图");
  if (proofs.referenceMaskRef && !request.reference_mask_url) {
    throw invalidProof("reference_mask_ref 缺少对应的 reference_mask_url");
  }

  const source = await resolveOwnedImage(request.source_url, {
    userId: context.userId,
    supabase: context.supabase,
    registrationToken: proofs.sourceRef,
    assetId: proofs.sourceAssetId,
    label: "原图",
    requireDimensions: Boolean(request.mask_url),
  });
  const references = await resolveOwnedReferences(request.reference_urls, proofs, context, {
    requireDimensions: Boolean(request.reference_mask_url),
  });
  const maskUrl = request.mask_url
    ? resolveOwnedMask(request.mask_url, proofs.maskRef, source, context.userId)
    : undefined;
  const referenceMaskUrl = request.reference_mask_url
    ? resolveOwnedReferenceMask(
        request.reference_mask_url,
        proofs.referenceMaskRef,
        references,
        context.userId,
      )
    : undefined;

  return {
    request: {
      ...request,
      source_url: source.url,
      ...(maskUrl ? { mask_url: maskUrl } : {}),
      reference_urls: references.map((item) => item.url),
      ...(referenceMaskUrl ? { reference_mask_url: referenceMaskUrl } : {}),
    } as AiToolCreateRequest,
    sourceOwnership: {
      assetId: source.assetId,
      url: source.url,
      width: source.width,
      height: source.height,
      proof: source.proof,
    },
  };
}

export async function resolveOwnedMattingComposeRequest(
  request: AiToolMattingComposeRequest,
  proofs: AiToolMattingComposeProofs,
  context: { userId: string; supabase: SupabaseClient },
): Promise<AiToolMattingComposeRequest> {
  if (proofs.sourceRef && proofs.sourceAssetId) throw conflictingProof("原图");
  const source = await resolveOwnedImage(request.source_url, {
    userId: context.userId,
    supabase: context.supabase,
    registrationToken: proofs.sourceRef,
    assetId: proofs.sourceAssetId,
    label: "原图",
  });
  const baseMask = resolveComposeMask(request.base_mask_url, proofs.baseMaskRef, {
    userId: context.userId,
    source,
    label: "基础蒙版",
    allowOwnedOssUrl: true,
  });
  const editMask = request.edit_mask_url
    ? resolveComposeMask(request.edit_mask_url, proofs.editMaskRef, {
        userId: context.userId,
        source,
        label: "编辑蒙版",
        allowOwnedOssUrl: false,
      })
    : undefined;
  return {
    ...request,
    source_url: source.url,
    base_mask_url: baseMask,
    ...(editMask ? { edit_mask_url: editMask } : {}),
  };
}

async function resolveOwnedReferences(
  urls: string[],
  proofs: AiToolInputProofs,
  context: { userId: string; supabase: SupabaseClient },
  options: { requireDimensions?: boolean } = {},
) {
  if (proofs.referenceRefs && proofs.referenceRefs.length !== urls.length) {
    throw invalidProof("reference_refs 必须与 reference_urls 一一对应");
  }
  if (proofs.referenceAssetIds && proofs.referenceAssetIds.length !== urls.length) {
    throw invalidProof("reference_asset_ids 必须与 reference_urls 一一对应");
  }
  return Promise.all(urls.map((url, index) => resolveOwnedImage(url, {
    userId: context.userId,
    supabase: context.supabase,
    registrationToken: proofs.referenceRefs?.[index],
    assetId: proofs.referenceAssetIds?.[index],
    label: `参考图 ${index + 1}`,
    requireDimensions: options.requireDimensions,
  })));
}

function resolveOwnedReferenceMask(
  requestMaskUrl: string,
  explicitReference: string | undefined,
  references: OwnedImage[],
  userId: string,
) {
  if (references.length !== 1) {
    throw invalidProof("参考图蒙版必须且只能对应 1 张参考商品图");
  }
  return resolveOwnedMask(requestMaskUrl, explicitReference, references[0], userId, {
    imageLabel: "参考图",
    maskLabel: "参考图蒙版",
  });
}

async function resolveOwnedImage(
  expectedUrl: string,
  input: {
    userId: string;
    supabase: SupabaseClient;
    registrationToken?: string;
    assetId?: string;
    label: string;
    requireDimensions?: boolean;
  },
): Promise<OwnedImage> {
  if (input.registrationToken) {
    let descriptor: ReturnType<typeof verifyUploadRegistrationToken>;
    try {
      descriptor = verifyUploadRegistrationToken(input.registrationToken, input.userId);
    } catch {
      throw new AiToolInputOwnershipError(`${input.label}上传证明无效或已过期`, {
        code: "AI_TOOL_INPUT_REFERENCE_INVALID",
      });
    }
    if (descriptor.mediaType !== "image" || descriptor.url !== expectedUrl) {
      throw new AiToolInputOwnershipError(`${input.label}与上传证明不匹配`, {
        code: "AI_TOOL_INPUT_REFERENCE_MISMATCH",
      });
    }
    return ensureOwnedImageDimensions({
      assetId: null,
      url: descriptor.url,
      width: positiveIntegerOrNull(descriptor.width),
      height: positiveIntegerOrNull(descriptor.height),
      proof: "upload_token",
    }, input);
  }

  const asset = await findOwnedImageAsset(input.supabase, input.userId, expectedUrl, input.assetId);
  if (!asset) {
    throw new AiToolInputOwnershipError(`${input.label}不属于当前用户，请重新上传或从资源仓库选择`, {
      code: "AI_TOOL_INPUT_NOT_OWNED",
    });
  }
  if (asset.url !== expectedUrl) {
    throw new AiToolInputOwnershipError(`${input.label}与资源标识不匹配`, {
      code: "AI_TOOL_INPUT_REFERENCE_MISMATCH",
    });
  }
  return ensureOwnedImageDimensions({
    assetId: typeof asset.id === "string" ? asset.id : null,
    url: asset.url,
    width: positiveIntegerOrNull(asset.width),
    height: positiveIntegerOrNull(asset.height),
    proof: "resource_asset",
  }, input);
}

async function ensureOwnedImageDimensions(
  image: OwnedImage,
  input: { label: string; requireDimensions?: boolean },
): Promise<OwnedImage> {
  if (!input.requireDimensions || (image.width && image.height)) return image;

  let bytes: Buffer;
  try {
    const remote = await fetchRemoteImageBuffer(image.url, {
      allowedContentTypes: ["image"],
      maxBytes: SOURCE_PREFLIGHT_MAX_BYTES,
      maxRedirects: 2,
      timeoutMs: SOURCE_PREFLIGHT_TIMEOUT_MS,
    });
    bytes = remote.bytes;
  } catch (error) {
    console.warn("[ai-tools] owned source preflight fetch failed:", error instanceof Error ? error.message : error);
    throw new AiToolInputOwnershipError(`${input.label}尺寸校验暂时不可用，请稍后重试`, {
      code: "AI_TOOL_SOURCE_PREFLIGHT_FAILED",
      status: 503,
      retryable: true,
    });
  }

  if (hasPngAnimationControl(bytes)) {
    throw canonicalSourceRequired(input.label, "不支持动画 PNG");
  }

  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(bytes, {
      animated: true,
      failOn: "warning",
      limitInputPixels: SOURCE_PREFLIGHT_MAX_PIXELS,
    }).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/pixel limit|exceeds.*pixel/i.test(message)) {
      throw new AiToolInputOwnershipError(`${input.label}不能超过 3200 万像素`, {
        code: "AI_TOOL_SOURCE_PIXELS_EXCEEDED",
        status: 413,
      });
    }
    throw canonicalSourceRequired(input.label, "无法解析");
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
    throw canonicalSourceRequired(input.label, "仅支持 JPG、PNG 或 WebP");
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw canonicalSourceRequired(input.label, "仅支持单帧图片");
  }
  if (!width || !height) {
    throw canonicalSourceRequired(input.label, "尺寸无法识别");
  }
  if (width * height > SOURCE_PREFLIGHT_MAX_PIXELS) {
    throw new AiToolInputOwnershipError(`${input.label}不能超过 3200 万像素`, {
      code: "AI_TOOL_SOURCE_PIXELS_EXCEEDED",
      status: 413,
    });
  }
  if ((metadata.orientation ?? 1) !== 1) {
    throw canonicalSourceRequired(input.label, "像素方向尚未规范化");
  }
  return { ...image, width, height };
}

function canonicalSourceRequired(label: string, detail: string) {
  return new AiToolInputOwnershipError(`${label}${detail}，请重新上传原图`, {
    code: "AI_TOOL_SOURCE_CANONICAL_REQUIRED",
    status: 409,
  });
}

function hasPngAnimationControl(bytes: Buffer) {
  if (bytes.length < 16 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a") return false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) return false;
    if (bytes.toString("ascii", offset + 4, offset + 8) === "acTL") return true;
    offset = chunkEnd;
  }
  return false;
}

function resolveOwnedMask(
  requestMaskUrl: string,
  explicitReference: string | undefined,
  source: OwnedImage,
  userId: string,
  labels: { imageLabel?: string; maskLabel?: string } = {},
) {
  const imageLabel = labels.imageLabel || "原图";
  const maskLabel = labels.maskLabel || "蒙版";
  let reference: ReturnType<typeof verifyAiToolMaskReference>;
  try {
    reference = verifyAiToolMaskReference(explicitReference || requestMaskUrl, userId);
    if (explicitReference && isAiToolMaskReferenceUrl(requestMaskUrl)) {
      const urlReference = verifyAiToolMaskReference(requestMaskUrl, userId);
      if (urlReference.token !== reference.token) throw invalidProof(`${maskLabel}地址与证明不匹配`);
    }
  } catch (error) {
    if (error instanceof AiToolInputOwnershipError) throw error;
    if (error instanceof AiToolAssetReferenceError) {
      throw new AiToolInputOwnershipError(error.message, {
        code: error.code,
        status: error.status,
      });
    }
    throw invalidProof(`${maskLabel}证明无效或已过期`);
  }
  if (explicitReference) {
    if (!isAiToolMaskReferenceUrl(requestMaskUrl) && requestMaskUrl !== reference.url) {
      throw invalidProof(`${maskLabel}地址与证明不匹配`);
    }
  } else if (!isAiToolMaskReferenceUrl(requestMaskUrl)) {
    throw invalidProof(`${maskLabel}必须使用 AI 工具签发的短期引用`);
  }
  if (!source.width || !source.height) {
    throw new AiToolInputOwnershipError(`${imageLabel}缺少可信尺寸，无法验证${maskLabel}，请重新上传${imageLabel}`, {
      code: "AI_TOOL_SOURCE_DIMENSIONS_UNVERIFIED",
      status: 409,
    });
  }
  if (reference.width !== source.width || reference.height !== source.height) {
    throw new AiToolInputOwnershipError(`${maskLabel}尺寸与可信${imageLabel}尺寸不一致`, {
      code: "AI_TOOL_MASK_SOURCE_DIMENSIONS_MISMATCH",
      status: 409,
    });
  }
  return reference.url;
}

function resolveComposeMask(
  requestUrl: string,
  explicitReference: string | undefined,
  input: {
    userId: string;
    source: OwnedImage;
    label: string;
    allowOwnedOssUrl: boolean;
  },
) {
  if (!explicitReference && !isAiToolMaskReferenceUrl(requestUrl)) {
    if (!input.allowOwnedOssUrl) {
      throw invalidProof(`${input.label}必须使用 AI 工具签发的短期引用`);
    }
    try {
      return assertAiToolOwnedOssAssetUrl(requestUrl, input.userId, ["temp", "generated"]);
    } catch (error) {
      throw translateAssetReferenceError(error);
    }
  }

  let reference: ReturnType<typeof verifyAiToolMaskReference>;
  try {
    reference = verifyAiToolMaskReference(explicitReference || requestUrl, input.userId);
    if (explicitReference && isAiToolMaskReferenceUrl(requestUrl)) {
      const urlReference = verifyAiToolMaskReference(requestUrl, input.userId);
      if (urlReference.token !== reference.token) throw invalidProof(`${input.label}地址与证明不匹配`);
    }
  } catch (error) {
    if (error instanceof AiToolInputOwnershipError) throw error;
    throw translateAssetReferenceError(error);
  }
  if (explicitReference && !isAiToolMaskReferenceUrl(requestUrl) && requestUrl !== reference.url) {
    throw invalidProof(`${input.label}地址与证明不匹配`);
  }
  if (input.source.width && input.source.height
    && (reference.width !== input.source.width || reference.height !== input.source.height)) {
    throw new AiToolInputOwnershipError(`${input.label}尺寸与可信原图尺寸不一致`, {
      code: "AI_TOOL_MASK_SOURCE_DIMENSIONS_MISMATCH",
      status: 409,
    });
  }
  return reference.url;
}

function translateAssetReferenceError(error: unknown) {
  if (error instanceof AiToolAssetReferenceError) {
    return new AiToolInputOwnershipError(error.message, {
      code: error.code,
      status: error.status,
    });
  }
  return invalidProof("AI 工具图片证明无效或已过期");
}

async function findOwnedImageAsset(
  supabase: SupabaseClient,
  userId: string,
  expectedUrl: string,
  assetId?: string,
) {
  try {
    let query = supabase
      .from("resource_library_assets")
      .select("id,url,width,height")
      .eq("user_id", userId)
      .eq("media_type", "image")
      .eq("storage_state", "active")
      .eq("moderation_status", "allowed")
      .is("deleted_at", null);
    query = assetId ? query.eq("id", assetId) : query.eq("url", expectedUrl);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
      throw new AiToolInputOwnershipError("图片归属校验暂时不可用", {
        code: "AI_TOOL_INPUT_OWNERSHIP_LOOKUP_FAILED",
        status: 503,
        retryable: true,
      });
    }
    return data && isRecord(data) ? data : null;
  } catch (error) {
    if (error instanceof AiToolInputOwnershipError) throw error;
    throw new AiToolInputOwnershipError("图片归属校验暂时不可用", {
      code: "AI_TOOL_INPUT_OWNERSHIP_LOOKUP_FAILED",
      status: 503,
      retryable: true,
    });
  }
}

function optionalString(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > 4_096) {
    throw invalidProof(`${field} 格式无效`);
  }
  return value.trim();
}

function optionalAssetId(value: unknown, field: string) {
  const result = optionalString(value, field);
  if (result && !UUID_PATTERN.test(result)) throw invalidProof(`${field} 格式无效`);
  return result;
}

function optionalStringArray(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 7) throw invalidProof(`${field} 格式无效`);
  return value.map((item, index) => optionalString(item, `${field}[${index}]`) || "");
}

function optionalAssetIdArray(value: unknown, field: string) {
  const items = optionalStringArray(value, field);
  if (!items) return undefined;
  for (const item of items) {
    if (!UUID_PATTERN.test(item)) throw invalidProof(`${field} 格式无效`);
  }
  return items;
}

function conflictingProof(label: string) {
  return invalidProof(`${label}只能提供一种归属证明`);
}

function invalidProof(message: string) {
  return new AiToolInputOwnershipError(message, {
    code: "AI_TOOL_INPUT_PROOF_INVALID",
    status: 400,
  });
}

function positiveIntegerOrNull(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
