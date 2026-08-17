import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import {
  AI_TOOL_MASK_MAX_BYTES,
  AiToolMaskUploadError,
  assertAiToolMaskSourcePixelLimit,
  parseAiToolMaskSourceDimension,
  validateAndStoreAiToolMask,
} from "@/lib/api/ai-tools/mask-upload.server";
import {
  AiToolAssetReferenceError,
  createAiToolMaskReference,
} from "@/lib/api/ai-tools/asset-reference.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MASK_UPLOAD_RATE_LIMIT = 30;
const MASK_UPLOAD_RATE_WINDOW_MS = 60_000;
const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const ALLOWED_FIELDS = new Set(["mask", "source_width", "source_height"]);

export async function POST(request: Request) {
  const { user, response: authResponse } = await requireApiUser();
  if (!user) return authResponse;

  const limit = await checkRateLimit(
    `ai-tool-mask-upload:${user.id}`,
    MASK_UPLOAD_RATE_LIMIT,
    MASK_UPLOAD_RATE_WINDOW_MS,
  );
  if (!limit.ok) {
    return rateLimitResponse(limit.retryAfterSeconds, {
      label: "AI 工具蒙版上传",
      limit: MASK_UPLOAD_RATE_LIMIT,
      windowMs: MASK_UPLOAD_RATE_WINDOW_MS,
    });
  }

  try {
    assertMultipartRequest(request);
    const form = await request.formData();
    assertAllowedFields(form);

    const maskEntries = form.getAll("mask");
    const widthEntries = form.getAll("source_width");
    const heightEntries = form.getAll("source_height");
    if (maskEntries.length !== 1 || !(maskEntries[0] instanceof File)) {
      throw new AiToolMaskUploadError("请上传一张 PNG 蒙版", {
        code: "AI_TOOL_MASK_FILE_REQUIRED",
      });
    }
    if (widthEntries.length !== 1 || heightEntries.length !== 1) {
      throw new AiToolMaskUploadError("source_width 与 source_height 必须各提供一次", {
        code: "AI_TOOL_MASK_SOURCE_DIMENSIONS_INVALID",
      });
    }

    const sourceWidth = parseAiToolMaskSourceDimension(widthEntries[0], "source_width");
    const sourceHeight = parseAiToolMaskSourceDimension(heightEntries[0], "source_height");
    assertAiToolMaskSourcePixelLimit(sourceWidth, sourceHeight);
    const mask = maskEntries[0];
    if (mask.size > AI_TOOL_MASK_MAX_BYTES) {
      throw new AiToolMaskUploadError("蒙版不能超过 8MB", {
        code: "AI_TOOL_MASK_FILE_TOO_LARGE",
        status: 413,
      });
    }

    const stored = await validateAndStoreAiToolMask({
      bytes: Buffer.from(await mask.arrayBuffer()),
      declaredContentType: mask.type,
      sourceWidth,
      sourceHeight,
      userId: user.id,
    });
    const reference = createAiToolMaskReference({
      userId: user.id,
      url: stored.url,
      objectKey: stored.objectKey,
      width: stored.width,
      height: stored.height,
      contentType: stored.contentType,
    });

    return NextResponse.json({
      ok: true,
      mask: {
        url: reference.referenceUrl,
        ref: reference.token,
        width: stored.width,
        height: stored.height,
        content_type: stored.contentType,
        selected_pixels: stored.selectedPixels,
        expires_at: reference.expiresAt,
      },
    }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AiToolAssetReferenceError) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        code: error.code,
        retryable: false,
      }, {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (error instanceof AiToolMaskUploadError) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        code: error.code,
        retryable: false,
      }, {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    console.error("[ai-tools/masks] upload failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({
      ok: false,
      error: "蒙版上传失败",
      code: "AI_TOOL_MASK_UPLOAD_FAILED",
      retryable: true,
    }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

function assertMultipartRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("multipart/form-data;") || !contentType.includes("boundary=")) {
    throw new AiToolMaskUploadError("蒙版上传必须使用 multipart/form-data", {
      code: "AI_TOOL_MASK_MULTIPART_REQUIRED",
      status: 415,
    });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > AI_TOOL_MASK_MAX_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
    throw new AiToolMaskUploadError("蒙版上传请求过大", {
      code: "AI_TOOL_MASK_REQUEST_TOO_LARGE",
      status: 413,
    });
  }
}

function assertAllowedFields(form: FormData) {
  for (const key of form.keys()) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw new AiToolMaskUploadError(`不支持的蒙版字段：${key}`, {
        code: "AI_TOOL_MASK_UNKNOWN_FIELD",
      });
    }
  }
}
