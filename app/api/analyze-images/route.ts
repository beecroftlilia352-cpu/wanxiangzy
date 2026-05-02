/**
 * POST /api/analyze-images
 * 用视觉模型分析图片生成结构化摄影级提示词
 */

import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 30000);
const QUALITY_DIMENSIONS =
  "photorealistic, 8K ultra-detailed, high contrast, cinematic color grade, commercial fashion catalog quality, sharp details, raw photo quality";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`analyze-images:${auth.user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json();
    const { clothing_urls, model_face_url, reference_url } = body;
    const basePrompt = typeof body.base_prompt === "string" ? body.base_prompt.trim() : "";
    const userStyle =
      typeof body.user_style === "string"
        ? body.user_style.trim()
        : typeof body.style === "string"
          ? body.style.trim()
          : "";
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

    const allImageRefs = [...clothingRefs];
    if (reference_url) allImageRefs.push(`图${referenceImageNumber}`);
    if (model_face_url) allImageRefs.push(`图${faceImageNumber}`);
    const roleStatement = buildRoleStatement({
      clothingRefs,
      referenceImageNumber,
      faceImageNumber,
      hasReference: !!reference_url,
      hasModelFace: !!model_face_url,
    });
    const poseRule = reference_url
      ? `优先保持图${referenceImageNumber}的姿势、身体角度、四肢位置、头部朝向、手部动作、背景、构图、镜头角度、光影方向和人物位置；允许为了服装真实贴合人体产生自然褶皱、遮挡关系和边缘轮廓调整。`
      : "根据服装类型、版型和目标风格选择自然、利于展示服装结构的姿势和构图。";

    const textPrompt = `你是顶级商业时尚摄影师和 AI 换装提示词工程师。请仔细分析所有图片，把系统预设提示词、用户风格补充和图片内容融合为一段最终可用的换装生成提示词。

图片说明：
${roleLines}

【图号硬约束】
${roleStatement}
- 最终输出必须包含所有图号：${allImageRefs.join("、")}。
- 图片顺序、图号含义、服装图/参考图/模特脸图的角色不得改写。
- 可以优化摄影语言和服装细节，但不能把图号换成“第一张图/参考图片/人物图”等模糊说法。

【系统预设提示词】
${basePrompt || "无"}

【用户风格补充】
${userStyle || "无"}

【输出维度】
1. 任务：说明将${clothingRefs.join("、")}的服装穿到最终人物身上，图号必须保留。
2. 服装还原：详细描述品类、版型、廓形、颜色、面料、纹理、图案、纽扣/拉链/口袋/刺绣/印花/缝线等细节，不要编造图中没有的配饰。
3. 人物主体：${model_face_url ? `脸部严格使用图${faceImageNumber}的五官、肤色、发型和气质` : "自然真实的人物，符合商业服装摄影审美"}
4. 姿态和场景：${poseRule}
5. 拍摄设备：根据风格选择合适的相机镜头参数（如 medium format camera, 85mm f/1.4）
6. 光线和质感：主光、辅光、轮廓光、景深、焦点、真实皮肤、毛孔、自然瑕疵、不过度磨皮、真实布料褶皱。
7. 图像质量：最终提示词必须原样包含英文质量维度：${QUALITY_DIMENSIONS}
8. 用户风格：如有用户风格补充，将其融入画面色调、氛围和摄影风格，不要覆盖图号硬约束。

【格式要求】
- 用中文描述服装和风格，用英文写摄影技术参数
- 一段连贯的话，350-500字，不要分段，不要解释
- 必须去AI味：强调真实摄影质感、自然光影、真实皮肤、布料褶皱

【负面约束】不要生成多余人物，不要扭曲身体和服装，不要塑料皮肤，不要蜡像感，不要卡通感，不要AI渲染感，不要改变图号含义。`;

    const fallbackPrompt = buildFallbackPrompt({
      clothingCount: clothing_urls.length,
      referenceImageNumber,
      faceImageNumber,
      hasReference: !!reference_url,
      hasModelFace: !!model_face_url,
      roleStatement,
      style: userStyle,
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
      max_tokens: 800,
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
      const checked = enforcePromptRequirements(prompt, allImageRefs, roleStatement);
      console.log("[analyze] 生成的提示词:", checked.prompt);
      return NextResponse.json({
        prompt: checked.prompt,
        source: checked.repaired ? `${llm.provider}_repaired` : llm.provider,
        missing_refs: checked.missingRefs.length ? checked.missingRefs : undefined,
      });
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

function buildRoleStatement(params: {
  clothingRefs: string[];
  referenceImageNumber: number;
  faceImageNumber: number;
  hasReference: boolean;
  hasModelFace: boolean;
}) {
  const roles = [`${params.clothingRefs.join("、")}是服装图`];
  if (params.hasReference) roles.push(`图${params.referenceImageNumber}是参考图`);
  if (params.hasModelFace) roles.push(`图${params.faceImageNumber}是模特脸图`);
  return `图像角色：${roles.join("，")}。`;
}

function enforcePromptRequirements(prompt: string, allImageRefs: string[], roleStatement: string) {
  let nextPrompt = prompt.trim().replace(/\s+/g, " ");
  let repaired = false;

  const missingRefs = allImageRefs.filter((ref) => !nextPrompt.includes(ref));
  if (missingRefs.length) {
    nextPrompt = `${roleStatement}${nextPrompt}`;
    repaired = true;
  }

  const missingQuality = QUALITY_DIMENSIONS
    .split(", ")
    .filter((dimension) => !nextPrompt.includes(dimension));
  if (missingQuality.length) {
    nextPrompt = `${nextPrompt} ${QUALITY_DIMENSIONS}`;
    repaired = true;
  }

  return { prompt: nextPrompt, repaired, missingRefs };
}

function buildFallbackPrompt(params: {
  clothingCount: number;
  referenceImageNumber: number;
  faceImageNumber: number;
  hasReference: boolean;
  hasModelFace: boolean;
  roleStatement: string;
  style?: string;
}) {
  const clothingRefs = Array.from({ length: params.clothingCount }, (_, index) => `图${index + 1}`);
  const clothingText = clothingRefs.join("、");

  const referenceText = params.hasReference
    ? `优先保持图${params.referenceImageNumber}参考图的背景场景、构图角度、光影方向、人物姿势和身体比例，允许服装为真实贴合产生自然褶皱和遮挡调整。`
    : "Clean seamless light grey studio background, minimalist aesthetic, natural single-person fashion photography composition.";
  const faceText = params.hasModelFace
    ? `最终人物脸部严格替换为图${params.faceImageNumber}的模特脸，保持五官、肤色、发型和气质一致。`
    : "Hyper-realistic skin texture, natural pores, smooth yet realistic dermis, natural skin tone with subtle imperfections.";
  const clothingDetail = params.clothingCount > 1
    ? `将${clothingText}的服装搭配成一套完整穿搭，保留每件服装的版型、颜色、材质、图案、纹理和细节（纽扣/拉链/口袋/刺绣/印花等），服装自然贴合人体，布料褶皱真实。`
    : `忠实还原${clothingText}的服装品类、版型、颜色、材质、图案和所有细节，服装自然贴合人体，布料褶皱和缝线纹理真实。`;

  return `${params.roleStatement} Fashion photography, full body portrait of a young woman with natural real-person appearance, wearing clothing from ${clothingText}. ${clothingDetail} Elegant and confident posture, natural dynamic fashion pose, subtle eye contact with camera. Shot on medium format camera, 85mm f/1.4 prime lens, ultra-shallow depth of field, crisp focus on model. Professional studio lighting: key light from soft octabox, gentle fill light, delicate rim light. ${referenceText} ${faceText} ${QUALITY_DIMENSIONS}. No extra people, no body distortion, no plastic skin, no wax figure look, no cartoon style, no AI rendering artifacts. ${params.style?.trim() ? params.style.trim() : ""}`;
}
