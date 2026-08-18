import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { executeLlmChatRouted } from "@/lib/api/llm-routing.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { MAX_GENERAL_IMAGE_REFERENCE_IMAGES } from "@/lib/general-image-config";

export const maxDuration = 60;

type GeneralImageMode = "text-to-image" | "image-to-image";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`general-image-prompt:${auth.user.id}`, 30, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json().catch(() => ({}));
    const mode = normalizeMode(body.mode);
    const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const referenceUrls = normalizeReferenceUrls(body.reference_urls);

    if (!userPrompt && referenceUrls.length === 0) {
      return NextResponse.json({ error: mode === "image-to-image" ? "请先输入基本想法或上传参考图" : "请先输入基本想法" }, { status: 400 });
    }

    const imageRoleText = referenceUrls.length
      ? referenceUrls.map((_, index) => `图${index + 1}：通用参考图，可参考主体、风格、构图、材质、姿势、光线或背景，具体以用户要求为准。`).join("\n")
      : "无参考图";
    const taskText = mode === "image-to-image"
      ? "图生图任务：必须显式保留图1、图2等编号关系。根据用户要求决定每张参考图的角色，不要把参考图关系写成模糊的“参考图”。"
      : "文生图任务：把用户简短想法扩展成可直接生成图片的完整视觉提示词。";

    const textPrompt = `你是资深商业摄影 AI 提示词工程师。请把用户输入优化成一段可直接用于图片生成模型的完整提示词。
${taskText}

参考图关系：
${imageRoleText}

要求：
1. 中文为主，可以保留必要英文摄影质量词。
2. 补强主体、材质、光线、镜头、构图、色彩、氛围、画面质量和负面约束。
3. 图生图必须保留清晰图号关系，例如“图1是服装来源，图2是人物目标，图3只参考风格”。
4. 不要输出解释，不要 Markdown，不要列表标题，只输出最终提示词。
5. 不要凭空添加与用户意图冲突的元素。

用户输入：
${userPrompt || "请根据参考图生成高质量商业摄影图片。"}`;

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [{ type: "text", text: textPrompt }];
    for (const url of referenceUrls) {
      content.push({ type: "image_url", image_url: { url } });
    }

    const completion = await executeLlmChatRouted({
      kind: referenceUrls.length ? "vision" : "text",
      context: { userId: auth.user.id },
      body: {
        messages: [{ role: "user", content }],
        max_tokens: 1200,
        temperature: 0.45,
      },
    });
    const data = completion.data;
    const prompt = extractMessageText(data).trim();
    return NextResponse.json({
      prompt: prompt || buildFallbackPrompt({ mode, userPrompt, referenceUrls }),
      source: prompt ? completion.providerId : "fallback",
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ prompt: "", skipped: true, reason: "timeout" });
    }
    console.error("[general-image/optimize-prompt] error:", err);
    return NextResponse.json({ error: "提示词优化失败" }, { status: 500 });
  }
}

function normalizeMode(value: unknown): GeneralImageMode {
  return value === "image-to-image" ? "image-to-image" : "text-to-image";
}

function normalizeReferenceUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter((url) => /^https?:\/\//i.test(url) || /^data:image\//i.test(url))
    .slice(0, MAX_GENERAL_IMAGE_REFERENCE_IMAGES);
}

function extractMessageText(data: Record<string, unknown>) {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          if (typeof record.text === "string") return record.text;
          if (typeof record.content === "string") return record.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function buildFallbackPrompt(params: { mode: GeneralImageMode; userPrompt: string; referenceUrls: string[] }) {
  const base = params.userPrompt || "高质量商业摄影图片";
  const imageRoles = params.mode === "image-to-image" && params.referenceUrls.length
    ? `图像角色：${params.referenceUrls.map((_, index) => `图${index + 1}是参考图`).join("；")}。`
    : "";
  return [
    imageRoles,
    `任务：${base}。`,
    "画面真实自然，主体清晰，材质和纹理细节准确，柔和自然光线，构图干净，高级商业摄影质感，photorealistic, sharp details, commercial photography quality。",
    "负面约束：不要文字水印，不要畸形结构，不要过度磨皮，不要塑料感，不要低清晰度，不要多余主体。",
  ].filter(Boolean).join("\n");
}
