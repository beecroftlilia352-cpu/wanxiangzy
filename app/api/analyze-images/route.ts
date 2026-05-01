/**
 * POST /api/analyze-images
 * 用视觉模型分析图片生成提示词
 */

import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 25000);

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`analyze-images:${auth.user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const { clothing_urls, model_face_url, reference_url, style } = await request.json();
    if (!clothing_urls?.length) return NextResponse.json({ prompt: "" });
    if (!Array.isArray(clothing_urls) || clothing_urls.some((url) => typeof url !== "string")) {
      return NextResponse.json({ prompt: "" });
    }

    // 构建图片内容。顺序必须与提示词里的图号完全一致。
    const imageContents: any[] = [];
    for (const url of clothing_urls) {
      imageContents.push({ type: "image_url", image_url: { url } });
    }
    if (reference_url) imageContents.push({ type: "image_url", image_url: { url: reference_url } });
    if (model_face_url) imageContents.push({ type: "image_url", image_url: { url: model_face_url } });

    const clothingRefs = clothing_urls.map((_: string, index: number) => `图${index + 1}`);
    const referenceImageNumber = clothing_urls.length + 1;
    const faceImageNumber = clothing_urls.length + (reference_url ? 2 : 1);
    const roleLines = [
      `${clothingRefs.join("、")}：服装图，用于提取衣服的版型、颜色、材质、图案和细节。`,
      reference_url
        ? `图${referenceImageNumber}：参考图，用于锁定最终画面的背景、构图、镜头角度、光影、姿势、身体比例和人物位置。`
        : "",
      model_face_url
        ? `图${faceImageNumber}：模特脸图，用于替换最终人物的脸部身份。`
        : "",
    ].filter(Boolean).join("\n");

    const textPrompt = `你是商业时尚摄影修图指导和 AI 换装提示词工程师。请严格按下面的图像编号理解输入，不要重新猜测图片角色。

${roleLines}

请输出一段可直接用于图像生成模型的中文提示词，目标是“真实摄影感、自然商业大片质感、去 AI 味”。要求：
1. 明确写出图号和任务关系。
2. ${reference_url ? `要求保持图${referenceImageNumber}参考图的背景、构图、镜头角度、光影、姿势、身体比例和人物位置不变。` : "要求生成自然的单人时尚摄影构图。"}
3. ${model_face_url ? `要求将最终人物脸部替换为图${faceImageNumber}的模特脸。` : "要求保持人物脸部自然真实。"}
4. 保留服装的版型、颜色、材质、图案和细节，使服装自然贴合人体。
5. 加入摄影真实感描述：真实相机拍摄、自然环境光或棚拍柔光、真实阴影、布料褶皱、缝线纹理、皮肤毛孔和轻微瑕疵、不过度磨皮、颜色不过饱和。
6. 加入负面约束：不要改变参考图场景，不要生成多余人物，不要扭曲身体和服装，不要塑料皮肤，不要蜡像感，不要过度锐化，不要卡通感，不要 AI 渲染感，不要虚假光晕。
7. 语言要像专业摄影执行指令，简洁但具体，80-140字，只输出最终提示词，不要解释，不要分点。${style ? `\n用户风格补充：${style}` : ""}`;
    const fallbackPrompt = buildFallbackPrompt({
      clothingCount: clothing_urls.length,
      referenceImageNumber,
      faceImageNumber,
      hasReference: !!reference_url,
      hasModelFace: !!model_face_url,
      style,
    });

    const llm = getLlmConfig("vision");
    if (!llm.apiKey) {
      return NextResponse.json({ prompt: fallbackPrompt, source: "fallback", reason: "missing_api_key" });
    }
    if (!llm.baseUrl) {
      console.error("[analyze] Base URL 未配置");
      return NextResponse.json({ prompt: fallbackPrompt, source: "fallback", reason: "missing_base_url" });
    }

    const requestBody = {
      model: llm.model,
      messages: [{ role: "user", content: [{ type: "text", text: textPrompt }, ...imageContents] }],
      max_tokens: 200,
    };

    console.log("[analyze] 发送图片数量:", imageContents.length, "provider:", llm.provider, "模型:", llm.model);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
    const res = await fetch(getChatCompletionsUrl(llm), {
      method: "POST",
      headers: { Authorization: `Bearer ${llm.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const resText = await res.text();
    console.log("[analyze] 响应 status:", res.status, "body:", resText.slice(0, 500));

    if (!res.ok) {
      console.error("[analyze] API 错误:", res.status, resText);
      return NextResponse.json({
        prompt: fallbackPrompt,
        source: "fallback",
        reason: `llm_http_${res.status}`,
      });
    }

    const data = JSON.parse(resText);
    const prompt = extractMessageText(data).trim();

    if (prompt) {
      console.log("[analyze] 生成的提示词:", prompt);
      return NextResponse.json({ prompt, source: llm.provider });
    } else {
      console.warn("[analyze] 返回空提示词，响应:", JSON.stringify(data).slice(0, 300));
      return NextResponse.json({ prompt: fallbackPrompt, source: "fallback", reason: "empty_llm_content" });
    }

  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn(`[analyze] 超过 ${ANALYZE_TIMEOUT_MS}ms，跳过视觉提示词优化`);
      return NextResponse.json({ prompt: "", skipped: true, reason: "timeout" });
    }
    console.error("[analyze] 异常:", err.message, err.stack);
    return NextResponse.json({ prompt: "" });
  }
}

function extractMessageText(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item?.text === "string") return item.text;
        if (typeof item?.content === "string") return item.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function buildFallbackPrompt(params: {
  clothingCount: number;
  referenceImageNumber: number;
  faceImageNumber: number;
  hasReference: boolean;
  hasModelFace: boolean;
  style?: string;
}) {
  const clothingRefs = Array.from({ length: params.clothingCount }, (_, index) => `图${index + 1}`);
  const clothingText = params.clothingCount > 1
    ? `${clothingRefs.join("、")}的服装搭配成一套完整穿搭`
    : "图1的服装";
  const referenceText = params.hasReference
    ? `严格保持图${params.referenceImageNumber}参考图的背景、构图、镜头角度、光影、姿势、身体比例和人物位置不变。`
    : "生成自然的单人时尚摄影构图，主体清晰，姿势自然。";
  const faceText = params.hasModelFace
    ? `将最终人物脸部替换为图${params.faceImageNumber}的模特脸，身份自然一致。`
    : "人物脸部自然真实，皮肤保留自然纹理。";
  const styleText = params.style?.trim() ? ` ${params.style.trim()}` : "";

  return `图像角色：${clothingRefs.join("、")}是服装图。任务：让人物穿上${clothingText}。${referenceText}${faceText}保留服装版型、颜色、材质、图案和细节，布料褶皱自然贴合人体，真实相机拍摄，柔和光影，皮肤不过度磨皮，不要多余人物、身体扭曲、塑料皮肤、蜡像感、卡通感或 AI 渲染感。${styleText}`;
}
