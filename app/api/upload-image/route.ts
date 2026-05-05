import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 60;

const IMGBB_API_URL = "https://api.imgbb.com/1/upload";
const IMGBB_UPLOAD_TIMEOUT_MS = 60_000;
const MAX_UPLOAD_MB = 15;
const MAX_BASE64_LENGTH = 21 * 1024 * 1024; // ~15MB after base64 encoding

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiUser();
    if (!user) return response;

    const limit = await checkRateLimit(`upload:${user.id}`, 30, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "图片上传服务未配置" }, { status: 500 });
    }

    const body = await request.json();
    const { image, name } = body;

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "请选择图片" }, { status: 400 });
    }

    if (image.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: `图片不能超过 ${MAX_UPLOAD_MB}MB` }, { status: 400 });
    }

    // 去掉 data:image/xxx;base64, 前缀
    const base64Data = image.includes(",") ? image.split(",")[1] : image;

    const imgbbForm = new FormData();
    imgbbForm.append("key", apiKey);
    imgbbForm.append("image", base64Data);
    imgbbForm.append("name", name || "upload");

    const res = await fetch(IMGBB_API_URL, {
      method: "POST",
      body: imgbbForm,
      signal: AbortSignal.timeout(IMGBB_UPLOAD_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[upload-image] imgbb error:", res.status, errBody);
      return NextResponse.json({ error: "图片上传失败" }, { status: 502 });
    }

    const data = await res.json();

    if (!data.success) {
      console.error("[upload-image] imgbb failed:", JSON.stringify(data));
      return NextResponse.json({ error: "图片上传失败" }, { status: 502 });
    }

    return NextResponse.json({
      url: data.data.url,
      display_url: data.data.display_url,
      delete_url: data.data.delete_url,
      width: data.data.width,
      height: data.data.height,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload-image] error:", message);
    if (err instanceof Error && (err.name === "TimeoutError" || message.includes("timeout"))) {
      return NextResponse.json({ error: "Image upload timed out, please try again." }, { status: 504 });
    }
    return NextResponse.json({ error: "图片上传失败" }, { status: 500 });
  }
}
