import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { storeMedia } from "@/lib/api/media-storage";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  createUploadRegistrationToken,
  registerTrustedUploadedResourceAsset,
  type TrustedUploadDescriptor,
} from "@/lib/resource-library/upload-registration";

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
  return {
    video,
    name,
    originalFilename: file.name,
    mimeType: file.type || inferVideoType(file.name),
    byteSize: file.size,
  };
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiUser();
    if (!user) return response;

    const limit = await checkRateLimit(`upload-video:${user.id}`, 12, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const { video, name, originalFilename, mimeType, byteSize, tooLarge, unsupported, invalidType } = await readVideoUploadRequest(request);
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

    const registration = await registerUploadedVideoBestEffort({
      userId: user.id,
      url: stored.url,
      objectKey: stored.object_key,
      title: name,
      originalFilename,
      mimeType,
      byteSize,
      width: stored.width,
      height: stored.height,
    });

    return NextResponse.json({
      url: stored.url,
      display_url: stored.display_url,
      delete_url: stored.delete_url,
      width: stored.width,
      height: stored.height,
      object_key: stored.object_key,
      asset: registration.asset,
      resource_registration_token: registration.token,
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

async function registerUploadedVideoBestEffort(input: {
  userId: string;
  url: string;
  objectKey?: string;
  title?: string;
  originalFilename?: string;
  mimeType?: string;
  byteSize?: number;
  width?: number;
  height?: number;
}) {
  if (!input.objectKey) return { asset: undefined, token: undefined };
  const descriptor: TrustedUploadDescriptor = {
    url: input.url,
    objectKey: input.objectKey,
    mediaType: "video",
    title: input.title,
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    width: input.width,
    height: input.height,
  };
  let token: string | undefined;
  try {
    token = createUploadRegistrationToken(input.userId, descriptor);
  } catch (error) {
    console.error("[upload-video] resource registration token failed:", error);
  }
  try {
    const asset = await registerTrustedUploadedResourceAsset(getAdminClient(), input.userId, descriptor);
    return { asset, token };
  } catch (error) {
    console.error("[upload-video] resource registration failed:", error);
    return { asset: undefined, token };
  }
}

function inferVideoType(name: string) {
  return /\.mov$/i.test(name) ? "video/quicktime" : "video/mp4";
}
