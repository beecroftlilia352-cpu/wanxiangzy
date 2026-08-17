import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { requireApiUser } from "@/lib/api/auth";
import { storeImage } from "@/lib/api/image-storage";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { RemoteImageFetchError } from "@/lib/api/remote-image-fetch";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  createUploadRegistrationToken,
  registerTrustedUploadedResourceAsset,
  type TrustedUploadDescriptor,
} from "@/lib/resource-library/upload-registration";

export const maxDuration = 60;

const IMAGE_UPLOAD_TIMEOUT_MS = 60_000;
// Multi-image controls allow up to 14 files and the client retries transient
// network/5xx failures. Keep enough authenticated headroom for one full batch
// plus retries so a shaky domestic connection does not turn recovery into 429s.
const IMAGE_UPLOAD_RATE_LIMIT = 60;
const IMAGE_UPLOAD_RATE_WINDOW_MS = 60_000;
const MAX_UPLOAD_MB = 15;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const MAX_BASE64_LENGTH = 21 * 1024 * 1024; // ~15MB after base64 encoding

type UploadRequestPayload = {
  image?: string;
  bytes?: Buffer;
  contentType?: string;
  name: string;
  originalFilename?: string;
  tooLarge?: boolean;
  debug?: UploadDebugInfo;
};

type UploadDebugInfo = {
  transport: "multipart" | "json";
  declaredContentType?: string;
  extension?: string;
  size?: number;
  imageLength?: number;
  hasFile?: boolean;
};

async function readUploadRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("image");
    const nameValue = form.get("name");
    if (!(file instanceof File)) {
      return { name: "", debug: { transport: "multipart", hasFile: false } } satisfies UploadRequestPayload;
    }
    const debug = {
      transport: "multipart" as const,
      hasFile: true,
      declaredContentType: file.type || "",
      extension: getFileExtension(file.name),
      size: file.size,
    };
    if (file.size > MAX_UPLOAD_BYTES) {
      return { name: "", tooLarge: true, debug } satisfies UploadRequestPayload;
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const name = typeof nameValue === "string" && nameValue.trim()
      ? nameValue.trim()
      : file.name.replace(/\.[^.]+$/, "");
    return {
      bytes,
      contentType: file.type || "",
      name,
      originalFilename: file.name,
      debug,
    } satisfies UploadRequestPayload;
  }

  const body = await request.json();
  const { image, name } = body;
  return {
    image,
    name: typeof name === "string" ? name : "",
    debug: {
      transport: "json",
      imageLength: typeof image === "string" ? image.length : undefined,
    },
  } satisfies UploadRequestPayload;
}

export async function POST(request: Request) {
  let uploadDebug: UploadDebugInfo | undefined;
  let userId = "";
  try {
    const { user, response } = await requireApiUser();
    if (!user) return response;
    userId = user.id;

    const limit = await checkRateLimit(
      `upload:${user.id}`,
      IMAGE_UPLOAD_RATE_LIMIT,
      IMAGE_UPLOAD_RATE_WINDOW_MS,
    );
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const { image, bytes, contentType, name, originalFilename, tooLarge, debug } = await readUploadRequest(request);
    uploadDebug = debug;

    if (tooLarge) {
      return NextResponse.json({ error: `图片不能超过 ${MAX_UPLOAD_MB}MB` }, { status: 400 });
    }

    if (!bytes && (!image || typeof image !== "string")) {
      return NextResponse.json({ error: "请选择图片" }, { status: 400 });
    }

    if (typeof image === "string" && image.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: `图片不能超过 ${MAX_UPLOAD_MB}MB` }, { status: 400 });
    }

    const stored = await storeImage(
      {
        image,
        bytes,
        contentType,
        name: typeof name === "string" && name.trim() ? name.trim() : "upload",
        storageClass: "upload",
      },
      { maxRemoteBytes: MAX_UPLOAD_BYTES, timeoutMs: IMAGE_UPLOAD_TIMEOUT_MS }
    );

    const registration = await registerUploadedImageBestEffort({
      userId: user.id,
      url: stored.url,
      objectKey: stored.object_key,
      title: name,
      originalFilename,
      mimeType: stored.content_type,
      byteSize: stored.byte_size,
      width: stored.width,
      height: stored.height,
    });

    return NextResponse.json({
      url: stored.url,
      display_url: stored.display_url,
      delete_url: stored.delete_url,
      width: stored.width,
      height: stored.height,
      content_type: stored.content_type,
      byte_size: stored.byte_size,
      object_key: stored.object_key,
      asset: registration.asset,
      resource_registration_token: registration.token,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload-image] error:", { message, userId, ...uploadDebug });
    if (err instanceof RemoteImageFetchError) {
      if (err.code === "timeout") {
        return NextResponse.json({ error: "远程图片下载超时，请稍后重试" }, { status: 504 });
      }
      if (err.code === "too-large") {
        return NextResponse.json({ error: `图片不能超过 ${MAX_UPLOAD_MB}MB` }, { status: 413 });
      }
      if (err.code === "bad-status") {
        return NextResponse.json({ error: "远程图片下载失败" }, { status: 502 });
      }
      return NextResponse.json({ error: "远程图片地址不被允许" }, { status: 400 });
    }
    if (message.includes("图片上传服务未配置") || message.includes("图床上传服务未配置") || message.includes("IMGBB_API_KEY") || message.includes("ALIYUN_OSS")) {
      return NextResponse.json({ error: "图片上传服务未配置" }, { status: 500 });
    }
    if (message.includes("图片像素不能超过")) {
      return NextResponse.json({ error: message }, { status: 413 });
    }
    if (message.includes("当前图片格式暂不支持") || message.includes("图片文件无法解析") || message.includes("图片内容为空") || message.includes("图片过大") || message.includes("仅支持单帧") || message.includes("实际格式与声明格式不一致") || message.includes("图片尺寸无法识别")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("图片上传失败") || message.includes("转存图床失败")) {
      return NextResponse.json({ error: message }, { status: 502 });
    }
    if (err instanceof Error && (err.name === "TimeoutError" || message.includes("timeout"))) {
      return NextResponse.json({ error: "图片上传超时，请稍后重试" }, { status: 504 });
    }
    return NextResponse.json({ error: "图片上传失败" }, { status: 500 });
  }
}

async function registerUploadedImageBestEffort(input: {
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
    mediaType: "image",
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
    console.error("[upload-image] resource registration token failed:", error);
  }
  try {
    const asset = await registerTrustedUploadedResourceAsset(getAdminClient(), input.userId, descriptor);
    return { asset, token };
  } catch (error) {
    console.error("[upload-image] resource registration failed:", error);
    return { asset: undefined, token };
  }
}

function getFileExtension(name: string) {
  return name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || "";
}
