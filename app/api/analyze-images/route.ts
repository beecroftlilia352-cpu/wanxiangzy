/**
 * POST /api/analyze-images
 * 用视觉模型分析图片生成提示词
 */

import { NextRequest, NextResponse } from "next/server";

const LLM_VISION_MODEL = process.env.LINGYA_VISION_MODEL || "gpt-4o-mini";
const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 25000);

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.LINGYA_API_KEY;
    if (!apiKey) return NextResponse.json({ prompt: "" });
    const baseUrl = getLlmBaseUrl();
    if (!baseUrl) {
      console.error("[analyze] Base URL 未配置，请在 .env.local 设置 LINGYA_BASE_URL");
      return NextResponse.json({ prompt: "", error: "Base URL 未配置" }, { status: 500 });
    }

    const { clothing_urls, model_face_url, reference_url, style } = await request.json();
    if (!clothing_urls?.length) return NextResponse.json({ prompt: "" });

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

    const requestBody = {
      model: LLM_VISION_MODEL,
      messages: [{ role: "user", content: [{ type: "text", text: textPrompt }, ...imageContents] }],
      max_tokens: 200,
    };

    console.log("[analyze] 发送图片数量:", imageContents.length, "模型:", LLM_VISION_MODEL);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const resText = await res.text();
    console.log("[analyze] 响应 status:", res.status, "body:", resText.slice(0, 500));

    if (!res.ok) {
      console.error("[analyze] API 错误:", res.status, resText);
      return NextResponse.json({ prompt: "" });
    }

    const data = JSON.parse(resText);
    const prompt = data.choices?.[0]?.message?.content?.trim() || "";

    if (prompt) {
      console.log("[analyze] 生成的提示词:", prompt);
    } else {
      console.warn("[analyze] 返回空提示词，响应:", JSON.stringify(data).slice(0, 300));
    }

    return NextResponse.json({ prompt });

  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn(`[analyze] 超过 ${ANALYZE_TIMEOUT_MS}ms，跳过视觉提示词优化`);
      return NextResponse.json({ prompt: "", skipped: true, reason: "timeout" });
    }
    console.error("[analyze] 异常:", err.message, err.stack);
    return NextResponse.json({ prompt: "" });
  }
}

function getLlmBaseUrl(): string {
  return normalizeOpenAiCompatibleBaseUrl(process.env.LINGYA_BASE_URL || "");
}

function normalizeOpenAiCompatibleBaseUrl(value: string): string {
  const baseUrl = value.replace(/\/+$/, "");
  if (!baseUrl) return "";
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}
