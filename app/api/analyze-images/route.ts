/**
 * POST /api/analyze-images
 * 用视觉模型分析图片生成结构化摄影级提示词
 */

import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 30000);

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`analyze-images:${auth.user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const { clothing_urls, model_face_url, reference_url, style } = await request.json();
    if (!clothing_urls?.length) return NextResponse.json({ prompt: "" });
    if (!Array.isArray(clothing_urls) || clothing_urls.some((url: unknown) => typeof url !== "string")) {
      return NextResponse.json({ prompt: "" });
    }

    // 构建图片内容
    const imageContents: Array<{ type: string; image_url: { url: string } }> = [];
    for (const url of clothing_urls) {
      imageContents.push({ type: "image_url", image_url: { url } });
    }
    if (reference_url) imageContents.push({ type: "image_url", image_url: { url: reference_url } });
    if (model_face_url) imageContents.push({ type: "image_url", image_url: { url: model_face_url } });

    const clothingRefs = clothing_urls.map((_: string, index: number) => `图${index + 1}`);
    const referenceImageNumber = clothing_urls.length + 1;
    const faceImageNumber = clothing_urls.length + (reference_url ? 2 : 1);

    const roleLines = [
      `${clothingRefs.join("、")}：用户上传的服装图，仔细分析服装的品类、版型、颜色、材质、图案、纹理、细节（纽扣/拉链/口袋/刺绣/印花等）。`,
      reference_url
        ? `图${referenceImageNumber}：参考图，分析并提取人物姿势、身体比例、构图角度、背景场景、光影方向、摄影风格。`
        : "",
      model_face_url
        ? `图${faceImageNumber}：模特脸图，分析五官特征、肤色、发型、气质风格。`
        : "",
    ].filter(Boolean).join("\n");

    const textPrompt = `分析这些图片，生成一段AI换装提示词。

${roleLines}

生成规则：
1. 必须在提示词中写明图号（图1、图2等），例如"穿着图1的外套"、"参考图2的背景"、"脸部使用图3"
2. 【最重要】必须在提示词开头强调：100%保持参考图的姿势、身体角度、四肢位置、头部朝向、手部动作、背景、构图、镜头角度、光影、人物位置完全不变
3. 根据参考图判断拍摄风格（街拍/棚拍/户外/电商等），不要固定用同一种
4. 用中文描述服装和风格，用英文写摄影参数
5. 一段话，150-250字，不要分段，不要解释
6. 包含：姿势锁定声明、拍摄风格、人物描述、服装细节、相机镜头、灯光、背景、皮肤质感、图像质量
7. 结尾加上：photorealistic, 8K, cinematic color, sharp details
8. 不要编造图中没有的配饰或元素
9. 负面：不要AI味、不要塑料皮肤、不要蜡像感、不要卡通、不要改变姿势${style ? `\n\n用户当前提示词（仅供参考，不要照搬）：\n${style}` : ""}`;

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
      max_tokens: 500,
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
    console.log("[analyze] LLM 完整响应:", JSON.stringify(data).slice(0, 1000));
    const prompt = extractMessageText(data).trim();

    if (prompt) {
      console.log("[analyze] 生成的提示词:", prompt);
      return NextResponse.json({ prompt, source: llm.provider });
    } else {
      console.warn("[analyze] 返回空提示词，响应:", JSON.stringify(data).slice(0, 300));
      return NextResponse.json({ prompt: fallbackPrompt, source: "fallback", reason: "empty_llm_content" });
    }

  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[analyze] 超过 ${ANALYZE_TIMEOUT_MS}ms，跳过视觉提示词优化`);
      return NextResponse.json({ prompt: "", skipped: true, reason: "timeout" });
    }
    console.error("[analyze] 异常:", err);
    return NextResponse.json({ prompt: "" });
  }
}

function extractMessageText(data: Record<string, unknown>): string {
  const choices = data?.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          if (typeof obj.text === "string") return obj.text;
          if (typeof obj.content === "string") return obj.content;
        }
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
  const clothingText = clothingRefs.join("、");

  const referenceText = params.hasReference
    ? `严格保持图${params.referenceImageNumber}参考图的背景场景、构图角度、光影方向、人物姿势和身体比例不变。`
    : "Clean seamless light grey studio background, minimalist aesthetic, natural single-person fashion photography composition.";
  const faceText = params.hasModelFace
    ? `最终人物脸部严格替换为图${params.faceImageNumber}的模特脸，保持五官、肤色、发型和气质一致。`
    : "Hyper-realistic skin texture, natural pores, smooth yet realistic dermis, natural skin tone with subtle imperfections.";
  const clothingDetail = params.clothingCount > 1
    ? `将${clothingText}的服装搭配成一套完整穿搭，保留每件服装的版型、颜色、材质、图案、纹理和细节（纽扣/拉链/口袋/刺绣/印花等），服装自然贴合人体，布料褶皱真实。`
    : `忠实还原${clothingText}的服装品类、版型、颜色、材质、图案和所有细节，服装自然贴合人体，布料褶皱和缝线纹理真实。`;

  return `Fashion photography, full body portrait of a young woman with natural real-person appearance, wearing clothing from ${clothingText}. ${clothingDetail} Elegant and confident posture, natural dynamic fashion pose, subtle eye contact with camera. Shot on medium format camera, 85mm f/1.4 prime lens, ultra-shallow depth of field, crisp focus on model. Professional studio lighting: key light from soft octabox, gentle fill light, delicate rim light. ${referenceText} ${faceText} photorealistic, 8K ultra-detailed, high contrast, cinematic color grade, commercial fashion catalog quality, sharp details, raw photo quality. No extra people, no body distortion, no plastic skin, no wax figure look, no cartoon style, no AI rendering artifacts. ${params.style?.trim() ? params.style.trim() : ""}`;
}
