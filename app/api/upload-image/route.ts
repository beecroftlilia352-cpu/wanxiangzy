import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";

const IMGBB_API_URL = "https://api.imgbb.com/1/upload";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiUser();
    if (!user) return response;

    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "图片上传服务未配置" }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json({ error: "请选择图片" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "仅支持图片格式" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "图片不能超过 10MB" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const imgbbForm = new FormData();
    imgbbForm.append("key", apiKey);
    imgbbForm.append("image", base64);
    imgbbForm.append("name", file.name.replace(/\.[^.]+$/, ""));

    const res = await fetch(IMGBB_API_URL, {
      method: "POST",
      body: imgbbForm,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[upload-image] imgbb error:", res.status, errText);
      return NextResponse.json({ error: "图片上传失败" }, { status: 502 });
    }

    const data = await res.json();

    if (!data.success) {
      console.error("[upload-image] imgbb failed:", data);
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
    const message = err instanceof Error ? err.message : "上传异常";
    console.error("[upload-image] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
