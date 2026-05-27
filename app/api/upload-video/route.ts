import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { storeMedia } from "@/lib/api/media-storage";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const VIDEO_UPLOAD_TIMEOUT_MS = 120_000;
const MAX_UPLOAD_MB = 100;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const ACCEPTED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/mov"]);

async function readVideoUploadRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return { video: "", name: "", invalidType: true };
  }

  const form = await request.formData();
  const file = form.get("video");
  const nameValue = form.get("name");
  if (!(file instanceof File)) {
    return { video: "", name: "" };
  }
  const fileType = (file.type || "").toLowerCase();
  if (!ACCEPTED_VIDEO_TYPES.has(fileType) && !/\.(mp4|mov)$/i.test(file.name)) {
    return { video: "", name: "", unsupported: true };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { video: "", name: "", tooLarge: true };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const video = `data:${file.type || inferVideoType(file.name)};base64,${bytes.toString("base64")}`;
  const name = typeof nameValue === "string" && nameValue.trim()
    ? nameValue.trim()
    : file.name.replace(/\.[^.]+$/, "");
  return { video, name };
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiUser();
    if (!user) return response;

    const limit = await checkRateLimit(`upload-video:${user.id}`, 12, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const { video, name, tooLarge, unsupported, invalidType } = await readVideoUploadRequest(request);
    if (invalidType) return NextResponse.json({ error: "请使用表单上传视频" }, { status: 400 });
    if (unsupported) return NextResponse.json({ error: "仅支持 MP4 / MOV 视频" }, { status: 400 });
    if (tooLarge) return NextResponse.json({ error: `视频不能超过 ${MAX_UPLOAD_MB}MB` }, { status: 400 });
    if (!video) return NextResponse.json({ error: "请选择视频" }, { status: 400 });

    const stored = await storeMedia(
      {
        media: video,
        name: typeof name === "string" && name.trim() ? name.trim() : "upload-video",
        storageClass: "upload",
      },
      { timeoutMs: VIDEO_UPLOAD_TIMEOUT_MS }
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
    console.error("[upload-video] error:", message);
    if (message.includes("媒体上传服务未配置") || message.includes("ALIYUN_OSS")) {
      return NextResponse.json({ error: "视频上传服务未配置" }, { status: 500 });
    }
    if (message.includes("媒体上传失败")) {
      return NextResponse.json({ error: message }, { status: 502 });
    }
    if (err instanceof Error && (err.name === "TimeoutError" || message.includes("timeout"))) {
      return NextResponse.json({ error: "视频上传超时，请稍后重试" }, { status: 504 });
    }
    return NextResponse.json({ error: "视频上传失败" }, { status: 500 });
  }
}

function inferVideoType(name: string) {
  return /\.mov$/i.test(name) ? "video/quicktime" : "video/mp4";
}
