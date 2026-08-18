import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import {
  admitServerFallback,
  completeDirectUpload,
  DirectUploadError,
  inspectVideoHeader,
  prepareDirectUpload,
  serverFallbackMaxBytes,
} from "@/lib/api/direct-oss-upload.server";
import { storeMedia } from "@/lib/api/media-storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const VIDEO_UPLOAD_TIMEOUT_MS = 120_000;

export async function POST(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.toLowerCase().includes("application/json")) {
      const body = await request.json().catch(() => null) as {
        action?: unknown;
        purpose?: unknown;
        file?: { name?: unknown; size?: unknown; contentType?: unknown; sha256?: unknown };
      } | null;
      if (body?.action !== "prepare" || !body.file) {
        return NextResponse.json({ error: "无效的上传签发请求" }, { status: 400 });
      }
      const result = await prepareDirectUpload({
        userId: user.id,
        kind: "video",
        purpose: typeof body.purpose === "string" ? body.purpose : undefined,
        file: {
          name: typeof body.file.name === "string" ? body.file.name : undefined,
          size: Number(body.file.size),
          contentType: typeof body.file.contentType === "string" ? body.file.contentType : "",
          sha256: typeof body.file.sha256 === "string" ? body.file.sha256 : "",
        },
      });
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json({ error: "请使用直传签发或 multipart 小文件回退" }, { status: 415 });
    }
    return uploadSmallVideoFallback(request, user.id);
  } catch (error) {
    return uploadErrorResponse(error, "视频上传失败");
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  try {
    const body = await request.json().catch(() => null) as { token?: unknown } | null;
    if (!body || typeof body.token !== "string") return NextResponse.json({ error: "缺少上传回执" }, { status: 400 });
    return NextResponse.json(await completeDirectUpload(user.id, body.token), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return uploadErrorResponse(error, "视频上传校验失败");
  }
}

async function uploadSmallVideoFallback(request: Request, userId: string) {
  const maxBytes = serverFallbackMaxBytes("video");
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes + 1024 * 1024) {
    return NextResponse.json({ error: `服务端回退仅支持 ${Math.floor(maxBytes / 1024 / 1024)}MB 以内视频` }, { status: 413 });
  }
  const form = await request.formData();
  const file = form.get("video");
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择视频" }, { status: 400 });
  if (file.size <= 0 || file.size > maxBytes) {
    return NextResponse.json({ error: `服务端回退仅支持 ${Math.floor(maxBytes / 1024 / 1024)}MB 以内视频` }, { status: 413 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = normalizeVideoType(file.type);
  inspectVideoHeader(bytes.subarray(0, 65_536), contentType);
  const admission = await admitServerFallback({ userId, kind: "video", bytes, contentType });
  try {
    try {
      const stored = await storeMedia({
        bytes,
        contentType,
        name: file.name || "upload-video",
        storageClass: "upload",
        objectKey: admission.objectKey,
        forbidOverwrite: true,
      }, { timeoutMs: VIDEO_UPLOAD_TIMEOUT_MS });
      await admission.complete({ deferValidation: true });
      return NextResponse.json({
        status: "pending_validation",
        media_asset_id: admission.mediaAssetId,
        canonical_url: `/api/media-assets/${admission.mediaAssetId}`,
        url: "",
        display_url: "",
        delete_url: "",
        width: stored.width,
        height: stored.height,
      }, { status: 202, headers: { "Cache-Control": "no-store", "Retry-After": "2" } });
    } catch (error) {
      if (!(error instanceof DirectUploadError && error.code === "ASSET_REGISTRY_UNAVAILABLE")) {
        await admission.fail("server_fallback_video_failed").catch(() => {});
      }
      throw error;
    }
  } finally {
    await admission.release();
  }
}

function normalizeVideoType(value: string) {
  const type = (value || "").split(";", 1)[0].trim().toLowerCase();
  return type === "video/mov" ? "video/quicktime" : type;
}

function uploadErrorResponse(error: unknown, fallback: string) {
  if (error instanceof DirectUploadError) {
    const status = error.code === "RATE_LIMITED" || error.code === "ACTIVE_LIMIT"
      ? 429
      : error.code === "QUOTA_EXCEEDED"
        ? 413
        : error.code === "CAPACITY_UNAVAILABLE" || error.code === "ASSET_REGISTRY_UNAVAILABLE" || error.code === "CONFIGURATION"
          ? 503
          : error.code === "UPLOAD_NOT_FOUND"
            ? 409
            : 400;
    return NextResponse.json(
      { error: localizedUploadError(error), code: error.code, retry_after_seconds: error.retryAfterSeconds },
      { status, headers: error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds), "Cache-Control": "no-store" } : { "Cache-Control": "no-store" } },
    );
  }
  console.error("[upload-video] failed", { error: error instanceof Error ? error.name : "UnknownError" });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function localizedUploadError(error: DirectUploadError) {
  if (error.code === "RATE_LIMITED") return "上传请求过于频繁，请稍后重试";
  if (error.code === "ACTIVE_LIMIT") return "同时上传的视频过多，请等待当前上传完成";
  if (error.code === "QUOTA_EXCEEDED") return "已达到 24 小时上传额度";
  if (error.code === "CAPACITY_UNAVAILABLE" || error.code === "ASSET_REGISTRY_UNAVAILABLE" || error.code === "CONFIGURATION") return "上传服务暂不可用";
  if (error.code === "INTENT_EXPIRED") return "上传凭证已过期，请重新上传";
  if (error.code === "UPLOAD_NOT_FOUND") return "尚未检测到上传文件，请重试";
  if (error.code === "UNSAFE_CONTENT" || error.code === "UPLOAD_MISMATCH") return "视频内容校验失败，请使用有效的 MP4 或 MOV";
  return "上传请求无效";
}
