import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import {
  AudioUploadError,
  audioUploadMaxBytes,
  uploadCanonicalAudio,
} from "@/lib/api/audio-upload.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const AUDIO_UPLOAD_TIMEOUT_MS = 120_000;

async function readAudioUploadRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new AudioUploadError("INVALID_AUDIO", "multipart/form-data is required");
  }

  const form = await request.formData();
  const file = form.get("audio");
  if (!(file instanceof File)) throw new AudioUploadError("INVALID_AUDIO", "audio file is required");
  if (file.size <= 0) throw new AudioUploadError("INVALID_AUDIO", "audio file is empty");
  if (file.size > audioUploadMaxBytes()) throw new AudioUploadError("TOO_LARGE", "audio exceeds the configured size limit");
  const bytes = Buffer.from(await file.arrayBuffer());
  return { bytes, declaredContentType: file.type };
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiUser();
    if (!user) return response;

    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > audioUploadMaxBytes() + 1024 * 1024) {
      throw new AudioUploadError("TOO_LARGE", "audio request exceeds the configured size limit");
    }

    const limit = await checkRateLimit(`upload-audio:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const upload = await readAudioUploadRequest(request);
    const stored = await withAudioUploadTimeout(
      uploadCanonicalAudio({ userId: user.id, ...upload }),
    );
    return NextResponse.json(stored, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: unknown) {
    return audioUploadErrorResponse(err);
  }
}

function audioUploadErrorResponse(error: unknown) {
  if (error instanceof AudioUploadError) {
    const status = error.code === "TOO_LARGE"
      ? 413
      : error.code === "INVALID_AUDIO" || error.code === "UPLOAD_MISMATCH"
        ? 422
        : error.code === "STORAGE_UNAVAILABLE"
          ? 502
          : 503;
    const message = error.code === "TOO_LARGE"
      ? `音频不能超过 ${Math.floor(audioUploadMaxBytes() / 1024 / 1024)}MB`
      : error.code === "INVALID_AUDIO" || error.code === "UPLOAD_MISMATCH"
        ? "音频内容校验失败，请使用有效的 MP3、WAV、M4A 或 AAC 文件"
        : "音频上传服务暂不可用，请稍后重试";
    return NextResponse.json({
      error: message,
      code: error.code,
      retry_after_seconds: error.retryAfterSeconds,
    }, {
      status,
      headers: error.retryAfterSeconds
        ? { "Cache-Control": "private, no-store", "Retry-After": String(error.retryAfterSeconds) }
        : { "Cache-Control": "private, no-store" },
    });
  }
  const timeout = error instanceof Error && error.name === "TimeoutError";
  console.error("[upload-audio] failed", { error: error instanceof Error ? error.name : "UnknownError" });
  return NextResponse.json({ error: timeout ? "音频上传超时，请稍后重试" : "音频上传失败" }, {
    status: timeout ? 504 : 500,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function withAudioUploadTimeout<T>(operation: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const error = new Error("audio upload timeout");
      error.name = "TimeoutError";
      reject(error);
    }, AUDIO_UPLOAD_TIMEOUT_MS);
    operation.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}
