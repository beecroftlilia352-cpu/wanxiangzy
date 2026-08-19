import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { executeLlmChatRouted } from "@/lib/api/llm-routing.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 60;

type PromptModuleKind = "grass" | "modelBackground";

type PromptImage = {
  url: string;
  role: string;
  imageNumber?: number;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`optimize-generation-prompt:${auth.user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json().catch(() => ({}));
    const moduleKind = normalizeModuleKind(body.module_kind);
    const basePrompt = typeof body.base_prompt === "string" ? body.base_prompt.trim() : "";
    const userContext = typeof body.user_context === "string" ? body.user_context.trim() : "";
    const images = normalizeImages(body.images);

    if (!basePrompt) {
      return NextResponse.json({ error: "缺少 base_prompt" }, { status: 400 });
    }

    const imageRoleLines = images.map((image, index) => `${imageLabel(image, index)}：${image.role}`).join("\n") || "无输入图片";
    const moduleInstruction = moduleKind === "grass"
      ? "模块目标：服装种草图。图1服装/穿搭是唯一硬参考，并按商品资产保真；如有图2，图2只作为场景、姿势、背景、构图、镜头距离、光线和种草氛围参考，不得复制图2服装，不得改变或重绘图1服装材质。"
      : "模块目标：模特换背景。图1是原始人物/服装/穿搭硬参考，服装按商品资产保真；只换背景时只替换图1背景，人物、脸、发型、服装、姿势和构图保持不变；换背景换模特时图2是模特参考、图3是背景参考；只换模特时图2只用于脸部参考；背景参考图只用于场景、光线、空间透视和构图氛围，不得改变或重绘图1服装材质。换背景类提示词必须保留自然融合约束：光线方向、色温、曝光、对比度、景深、镜头距离、地面透视、人物尺度、脚下接触阴影、边缘羽化和环境反光，避免白边、硬边、漂浮和贴纸感。";
    const roleGuard = images.length
      ? `最终提示词必须显式保留这些图片编号关系：${imageRoleLines.replace(/\n/g, "；")}。不要把图号改写成“第一张图/参考图”等模糊说法。`
      : "最终提示词必须保留现有图片关系描述。";

    const textPrompt = `你是资深商业摄影 AI 提示词工程师。请基于当前完整提示词和输入图片关系，优化成可直接用于图像生成模型的高质量完整提示词。
${moduleInstruction}

图片关系：
${imageRoleLines}

硬约束：
1. ${roleGuard}
2. 保留当前提示词中的任务目标、服装还原、负面约束、预设风格和用户补充，不得删掉关键图号。
3. 可以补强摄影语言、镜头语言、光线、构图、真实皮肤和平台种草氛围；服装只能补强商品保真边界，不能把面料当作可重绘对象；换背景类必须保留人物自然融入新环境的融合约束。
4. 输出仍然是一段完整生成提示词，不要解释，不要列表标题，不要 Markdown。
5. 中文为主，可保留必要英文摄影质量词。

当前完整提示词：
${basePrompt}

用户补充上下文：
${userContext || "无"}`;

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [{ type: "text", text: textPrompt }];
    for (const image of images) {
      content.push({ type: "image_url", image_url: { url: image.url } });
    }

    const completion = await executeLlmChatRouted({
      kind: images.length ? "vision" : "text",
      context: { userId: auth.user.id },
      body: {
        messages: [{ role: "user", content }],
        max_tokens: 1200,
        temperature: 0.35,
      },
    });
    const data = completion.data;
    const prompt = extractMessageText(data).trim();
    if (!prompt) {
      return NextResponse.json({ prompt: basePrompt, source: "fallback", reason: "empty_llm_content" });
    }

    return NextResponse.json({ prompt: enforceImageRolePrefix(prompt, images), source: completion.providerId });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ prompt: "", skipped: true, reason: "timeout" });
    }
    console.error("[optimize-generation-prompt] error:", err);
    return NextResponse.json({ prompt: "", error: "提示词优化失败" }, { status: 500 });
  }
}

function normalizeModuleKind(value: unknown): PromptModuleKind {
  return value === "modelBackground" ? "modelBackground" : "grass";
}

function normalizeImages(value: unknown): PromptImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): PromptImage | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const url = typeof record.url === "string" ? record.url.trim() : "";
      const role = typeof record.role === "string" ? record.role.trim() : "";
      if (!url || !role) return null;
      const rawImageNumber = record.imageNumber ?? record.image_number;
      const imageNumber = typeof rawImageNumber === "number" && Number.isInteger(rawImageNumber) && rawImageNumber > 0 && rawImageNumber <= 12
        ? rawImageNumber
        : undefined;
      return { url, role, imageNumber };
    })
    .filter((item): item is PromptImage => Boolean(item))
    .slice(0, 4);
}

function imageLabel(image: PromptImage, fallbackIndex: number) {
  return `图${image.imageNumber ?? fallbackIndex + 1}`;
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

function enforceImageRolePrefix(prompt: string, images: PromptImage[]) {
  if (!images.length) return prompt;
  const missing = images.some((image, index) => !prompt.includes(imageLabel(image, index)));
  if (!missing) return prompt;
  const prefix = `图像角色：${images.map((image, index) => `${imageLabel(image, index)}是${image.role}`).join("；")}。`;
  return `${prefix}${prompt}`;
}
