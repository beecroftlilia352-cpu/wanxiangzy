import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { storeImage } from "@/lib/api/image-storage";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 60;

const IMAGE_UPLOAD_TIMEOUT_MS = 60_000;
const MAX_UPLOAD_MB = 15;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const MAX_BASE64_LENGTH = 21 * 1024 * 1024; // ~15MB after base64 encoding

async function readUploadRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("image");
    const nameValue = form.get("name");
    if (!(file instanceof File)) {
      return { image: "", name: "" };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { image: "", name: "", tooLarge: true };
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const image = `data:${file.type || "image/jpeg"};base64,${bytes.toString("base64")}`;
    const name = typeof nameValue === "string" && nameValue.trim()
      ? nameValue.trim()
      : file.name.replace(/\.[^.]+$/, "");
    return { image, name };
  }

  const body = await request.json();
  const { image, name } = body;
  return {
    image,
    name: typeof name === "string" ? name : "",
  };
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiUser();
    if (!user) return response;

    const limit = await checkRateLimit(`upload:${user.id}`, 30, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const { image, name, tooLarge } = await readUploadRequest(request);

    if (tooLarge) {
      return NextResponse.json({ error: `图片不能超过 ${MAX_UPLOAD_MB}MB` }, { status: 400 });
    }

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "请选择图片" }, { status: 400 });
    }

    if (image.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: `图片不能超过 ${MAX_UPLOAD_MB}MB` }, { status: 400 });
    }

    const stored = await storeImage(
      {
        image,
        name: typeof name === "string" && name.trim() ? name.trim() : "upload",
        storageClass: "upload",
      },
      { timeoutMs: IMAGE_UPLOAD_TIMEOUT_MS }
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
    console.error("[upload-image] error:", message);
    if (message.includes("图片上传服务未配置") || message.includes("图床上传服务未配置") || message.includes("IMGBB_API_KEY") || message.includes("ALIYUN_OSS")) {
      return NextResponse.json({ error: "图片上传服务未配置" }, { status: 500 });
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
