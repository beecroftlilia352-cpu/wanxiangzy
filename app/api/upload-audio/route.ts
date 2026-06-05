import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { storeMedia } from "@/lib/api/media-storage";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const AUDIO_UPLOAD_TIMEOUT_MS = 120_000;
const MAX_UPLOAD_MB = 30;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/aac",
  "audio/m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/wav",
  "audio/wave",
  "audio/x-m4a",
  "audio/x-wav",
]);

async function readAudioUploadRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return { audio: "", name: "", invalidType: true };
  }

  const form = await request.formData();
  const file = form.get("audio");
  const nameValue = form.get("name");
  if (!(file instanceof File)) {
    return { audio: "", name: "" };
  }
  const fileType = (file.type || "").toLowerCase();
  if (!ACCEPTED_AUDIO_TYPES.has(fileType) && !/\.(mp3|wav|m4a|aac)$/i.test(file.name)) {
    return { audio: "", name: "", unsupported: true };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { audio: "", name: "", tooLarge: true };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const audio = `data:${file.type || inferAudioType(file.name)};base64,${bytes.toString("base64")}`;
  const name = typeof nameValue === "string" && nameValue.trim()
    ? nameValue.trim()
    : file.name.replace(/\.[^.]+$/, "");
  return { audio, name };
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiUser();
    if (!user) return response;

    const limit = await checkRateLimit(`upload-audio:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const { audio, name, tooLarge, unsupported, invalidType } = await readAudioUploadRequest(request);
    if (invalidType) return NextResponse.json({ error: "请使用表单上传音频" }, { status: 400 });
    if (unsupported) return NextResponse.json({ error: "仅支持 MP3 / WAV / M4A / AAC 音频" }, { status: 400 });
    if (tooLarge) return NextResponse.json({ error: `音频不能超过 ${MAX_UPLOAD_MB}MB` }, { status: 400 });
    if (!audio) return NextResponse.json({ error: "请选择音频" }, { status: 400 });

    const stored = await storeMedia(
      {
        media: audio,
        name: typeof name === "string" && name.trim() ? name.trim() : "upload-audio",
        storageClass: "upload",
      },
      { timeoutMs: AUDIO_UPLOAD_TIMEOUT_MS }
    );

    return NextResponse.json({
      url: stored.url,
      display_url: stored.display_url,
      delete_url: stored.delete_url,
      width: stored.width,
      height: stored.height,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload-audio] error:", message);
    if (message.includes("媒体上传服务未配置") || message.includes("ALIYUN_OSS")) {
      return NextResponse.json({ error: "音频上传服务未配置" }, { status: 500 });
    }
    if (message.includes("媒体上传失败")) {
      return NextResponse.json({ error: message }, { status: 502 });
    }
    if (err instanceof Error && (err.name === "TimeoutError" || message.includes("timeout"))) {
      return NextResponse.json({ error: "音频上传超时，请稍后重试" }, { status: 504 });
    }
    return NextResponse.json({ error: "音频上传失败" }, { status: 500 });
  }
}

function inferAudioType(name: string) {
  if (/\.wav$/i.test(name)) return "audio/wav";
  if (/\.m4a$/i.test(name)) return "audio/mp4";
  if (/\.aac$/i.test(name)) return "audio/aac";
  return "audio/mpeg";
}
