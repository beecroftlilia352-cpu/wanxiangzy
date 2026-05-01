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

    const textPrompt = `你是顶级商业时尚摄影师和 AI 换装提示词工程师。请仔细分析以下所有图片，然后生成一段高质量的结构化提示词。

图片说明：
${roleLines}

请按以下结构生成提示词（直接输出提示词内容，不要输出标题和编号，用逗号和句号自然连接）：

1. 类型：拍摄风格（如 High-end luxury fashion magazine editorial studio photography）
2. 主体：人物描述（年龄、风格、真实感、皮肤质感），${model_face_url ? `脸部特征严格保持图${faceImageNumber}模特脸的五官、肤色、发型和气质` : "自然真实的人脸，皮肤保留毛孔和轻微瑕疵"}
3. 穿着：详细描述图${clothingRefs.join("、")}的服装品类、版型、颜色、材质、图案、细节（纽扣/拉链/口袋/刺绣/印花等），搭配风格，智能匹配配饰（耳环/项链/包包/鞋子等）
4. 姿态：优雅自信的姿势描述，自然动态，与镜头的眼神交流
5. 拍摄设备：具体相机和镜头参数（如 Shot on medium format camera, 85mm f/1.4 prime lens，根据图片风格选择最合适的设备）
6. 拍摄效果：景深、焦点、画面质感（如 ultra-shallow depth of field, crisp focus on model）
7. 灯光：专业灯光设置（主光/辅光/轮廓光/背景光，${reference_url ? `根据图${referenceImageNumber}参考图的光影风格自动匹配最佳灯光方案` : "根据服装风格选择合适的灯光方案"})
8. 背景：${reference_url ? `严格保持图${referenceImageNumber}参考图的背景场景、构图角度、空间透视不变` : "背景描述（根据服装风格自动匹配）"}
9. 皮肤质感：真实皮肤描述（毛孔、纹理、自然瑕疵、不过度磨皮、真实肤色）
10. 图像质量：技术参数（photorealistic, 8K ultra-detailed, high contrast, cinematic color grade, commercial fashion catalog quality, sharp details, raw photo quality）

要求：
- 【最重要】最终提示词中必须出现图号引用（图1、图2、图3等），这是图片生成模型识别图片角色的唯一方式，缺失图号将导致生成失败
- 图号引用示例："穿着图1的白色连衣裙"、"参考图2的背景和光影"、"脸部替换为图3的模特脸"
- 所有参数必须根据输入图片智能分析，不要使用固定模板
- 拍摄设备、灯光方案、背景风格必须与参考图一致
- 服装描述必须忠实于上传的服装图，保留所有细节
- ${model_face_url ? `最终人物脸部必须替换为图${faceImageNumber}的模特脸` : "人物脸部自然真实"}
- 用英文生成摄影技术参数，用中文描述服装和风格细节
- 最终输出为一段连贯的提示词，200-300字，不要分点，不要解释
- 必须去 AI 味：强调真实摄影质感、自然光影、真实皮肤、布料褶皱、缝线纹理
- 负面约束：不要改变参考图场景，不要生成多余人物，不要扭曲身体和服装，不要塑料皮肤，不要蜡像感，不要卡通感，不要AI渲染感${style ? `\n\n用户当前提示词（仅供参考方向，不要照搬，必须基于图片分析重新生成）：\n${style}` : ""}`;

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

  return `High-end luxury fashion magazine editorial studio photography, full body portrait of a young woman with natural real-person appearance, wearing clothing from ${clothingText}. ${clothingDetail} Elegant and confident posture, natural dynamic fashion pose, subtle eye contact with camera. Shot on medium format camera, 85mm f/1.4 prime lens, ultra-shallow depth of field, crisp focus on model. Professional premium studio lighting: key light from large soft octabox, gentle fill light, delicate rim light to outline body contours, minimal shadow control. ${referenceText} ${faceText} photorealistic, 8K ultra-detailed, high contrast, cinematic color grade, commercial fashion catalog quality, sharp details, raw photo quality. No extra people, no body distortion, no plastic skin, no wax figure look, no cartoon style, no AI rendering artifacts, no fake glow. ${params.style?.trim() ? params.style.trim() : ""}`;
}
