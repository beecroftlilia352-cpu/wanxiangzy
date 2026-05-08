/**
 * POST /api/analyze-images
 * 用视觉模型分析图片生成结构化摄影级提示词
 */

import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { logger } from "@/lib/logger";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  TRYON_CLOTHING_IMAGE_ROLE_RULE,
  TRYON_FIT_RULE,
  TRYON_GARMENT_RULE,
  TRYON_PHOTOGRAPHY_RULE,
  TRYON_QUALITY,
  applyTryOnAudiencePrompt,
  applyTryOnFramePrompt,
  applyTryOnGarmentCategoryPrompt,
  enforceTryOnPromptRequirements,
  normalizeTryOnAgeGroup,
  normalizeTryOnGarmentCategory,
  normalizeTryOnGarmentAudience,
  type TryOnAgeGroup,
  type TryOnGarmentCategory,
  type TryOnGarmentAudience,
} from "@/lib/tryon-prompt";
import { TRYON_CLOTHING_ROLE_LABELS, normalizeTryOnClothingMode, normalizeTryOnClothingRole } from "@/lib/tryon-upload-rules";

const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 30000);
const QUALITY_DIMENSIONS = TRYON_QUALITY;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`analyze-images:${auth.user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json();
    const { clothing_urls, model_face_url, reference_url } = body;
    const clothingMode = normalizeTryOnClothingMode(body.clothing_mode || (clothing_urls?.length > 1 ? "multi" : "single"));
    const garmentAudience = normalizeTryOnGarmentAudience(body.garment_audience);
    const ageGroup = normalizeTryOnAgeGroup(body.age_group);
    const garmentCategory = normalizeTryOnGarmentCategory(body.is_intimate_garment ? "intimate" : body.garment_category);
    const aspectRatio = typeof body.aspect_ratio === "string" ? body.aspect_ratio : undefined;
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
    const clothingRoles = clothing_urls.map((_: string, index: number) => normalizeTryOnClothingRole(
      Array.isArray(body.clothing_roles) ? body.clothing_roles[index] : undefined,
      clothingMode === "multi" ? index === 0 ? "upper" : index === 1 ? "lower" : "extra" : "single"
    ));
    const referenceImageNumber = clothing_urls.length + 1;
    const faceImageNumber = clothing_urls.length + (reference_url ? 2 : 1);

    const roleLines = [
      `${clothingRefs.map((ref: string, index: number) => `${ref}：用户上传的${TRYON_CLOTHING_ROLE_LABELS[clothingRoles[index]]}图`).join("；")}。仔细分析每件服装的品类、版型、颜色、材质、图案、纹理、细节（纽扣/拉链/口袋/刺绣/印花等）。`,
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
- ${clothingRefs.join("、")} 是服装图，只能作为服装硬参考；如果服装图是真人上身图，图中人物、脸、姿势、背景、房间、户外环境、光线、构图和镜头距离都不能作为最终画面参考。

【服装图隔离硬规则】
${TRYON_CLOTHING_IMAGE_ROLE_RULE}

【系统预设提示词】
${basePrompt || "无"}

【用户风格补充】
${userStyle || "无"}

【输出维度】
1. 任务：说明将${clothingRefs.join("、")}的服装穿到最终人物身上，图号和${clothingMode === "multi" ? "上装/下装搭配关系" : "单件服装关系"}必须保留。
2. 服装还原：详细描述品类、版型、廓形、颜色、面料、纹理、图案、纽扣/拉链/口袋/刺绣/印花/缝线等细节，不要编造图中没有的配饰。
3. 人物主体：${model_face_url ? `脸部严格使用图${faceImageNumber}的五官、肤色、发型和气质` : "自然真实的人物，符合商业服装摄影审美"}
4. 姿态和场景：${poseRule}
5. 拍摄设备：根据风格选择合适的相机镜头参数（如 medium format camera, 85mm f/1.4）
6. 光线和质感：主光、辅光、轮廓光、景深、焦点、真实皮肤、毛孔、自然瑕疵、不过度磨皮、真实布料褶皱。
7. 图像质量：最终提示词必须原样包含英文质量维度：${QUALITY_DIMENSIONS}
8. 用户风格：如有用户风格补充，将其融入画面色调、氛围和摄影风格，不要覆盖图号硬约束。
9. 敏感服装：${garmentCategory === "intimate" ? "按成人贴身/泳装类商品图处理，必须保持中性、专业、非色情，不要裸露、挑逗姿势、床上/情色场景、未成年人或未成年人外观。" : "无。"}

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
      garmentAudience,
      ageGroup,
      garmentCategory,
      aspectRatio,
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

    logger.info("[analyze] 发送图片数量:", imageContents.length, "provider:", llm.provider, "模型:", llm.model);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
    const res = await fetch(getChatCompletionsUrl(llm), {
      method: "POST",
      headers: { Authorization: `Bearer ${llm.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const resText = await res.text();
    logger.info("[analyze] 响应 status:", res.status);

    if (!res.ok) {
      logger.error("[analyze] API 错误:", res.status);
      return NextResponse.json({
        prompt: fallbackPrompt,
        source: "fallback",
        reason: `llm_http_${res.status}`,
      });
    }

    const data = JSON.parse(resText);
    logger.debug("[analyze] LLM 响应已接收");
    const prompt = extractMessageText(data).trim();

    if (prompt) {
      const checked = enforcePromptRequirements(prompt, allImageRefs, roleStatement, {
        garmentAudience,
        ageGroup,
        garmentCategory,
        aspectRatio,
        hasReference: !!reference_url,
        hasModelFace: !!model_face_url,
        referenceImageNumber,
      });
      logger.info("[analyze] 提示词生成完成, 长度:", checked.prompt.length);
      return NextResponse.json({
        prompt: checked.prompt,
        source: checked.repaired ? `${llm.provider}_repaired` : llm.provider,
        missing_refs: checked.missingRefs.length ? checked.missingRefs : undefined,
      });
    } else {
      logger.warn("[analyze] 返回空提示词");
      return NextResponse.json({ prompt: fallbackPrompt, source: "fallback", reason: "empty_llm_content" });
    }

  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.warn("[analyze] 视觉分析超时，跳过");
      return NextResponse.json({ prompt: "", skipped: true, reason: "timeout" });
    }
    logger.error("[analyze] 异常:", err);
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

function enforcePromptRequirements(
  prompt: string,
  allImageRefs: string[],
  roleStatement: string,
  audience: {
    garmentAudience?: TryOnGarmentAudience;
    ageGroup?: TryOnAgeGroup;
    garmentCategory?: TryOnGarmentCategory;
    aspectRatio?: string;
    hasReference?: boolean;
    hasModelFace?: boolean;
    referenceImageNumber?: number;
  } = {}
) {
  let nextPrompt = prompt.trim().replace(/\s+/g, " ");
  let repaired = false;

  const missingRefs = allImageRefs.filter((ref) => !nextPrompt.includes(ref));
  if (missingRefs.length) {
    nextPrompt = `${roleStatement}${nextPrompt}`;
    repaired = true;
  }

  const enforcedPrompt = enforceTryOnPromptRequirements(
    applyTryOnFramePrompt(
      applyTryOnGarmentCategoryPrompt(applyTryOnAudiencePrompt(nextPrompt, audience), audience),
      {
        aspectRatio: audience.aspectRatio,
        hasReference: audience.hasReference,
        referenceImageNumber: audience.referenceImageNumber,
      }
    ),
    allImageRefs,
    {
      garmentAudience: audience.garmentAudience,
      ageGroup: audience.ageGroup,
      garmentCategory: audience.garmentCategory,
      hasModelFace: audience.hasModelFace,
    }
  );
  if (enforcedPrompt !== nextPrompt) {
    nextPrompt = enforcedPrompt;
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
  garmentAudience?: TryOnGarmentAudience;
  ageGroup?: TryOnAgeGroup;
  garmentCategory?: TryOnGarmentCategory;
  aspectRatio?: string;
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

  return enforceTryOnPromptRequirements(
    applyTryOnFramePrompt(
      applyTryOnGarmentCategoryPrompt(
        applyTryOnAudiencePrompt(
          `${params.roleStatement} Fashion photography, full body portrait of a real fashion model with natural real-person appearance, wearing clothing from ${clothingText}. ${TRYON_CLOTHING_IMAGE_ROLE_RULE} ${clothingDetail} ${TRYON_GARMENT_RULE}${TRYON_FIT_RULE}${TRYON_PHOTOGRAPHY_RULE} Elegant and confident posture, natural dynamic fashion pose, subtle eye contact with camera. Shot on medium format camera, 85mm f/1.4 prime lens, ultra-shallow depth of field, crisp focus on model. Professional studio lighting: key light from soft octabox, gentle fill light, delicate rim light. ${referenceText} ${faceText} ${QUALITY_DIMENSIONS}. No extra people, no body distortion, no plastic skin, no wax figure look, no cartoon style, no AI rendering artifacts. ${params.style?.trim() ? params.style.trim() : ""}`,
          { garmentAudience: params.garmentAudience, ageGroup: params.ageGroup }
        ),
        { garmentCategory: params.garmentCategory, ageGroup: params.ageGroup }
      ),
      {
        aspectRatio: params.aspectRatio,
        hasReference: params.hasReference,
        referenceImageNumber: params.referenceImageNumber,
      }
    ),
    clothingRefs,
    {
      garmentAudience: params.garmentAudience,
      ageGroup: params.ageGroup,
      garmentCategory: params.garmentCategory,
      hasModelFace: params.hasModelFace,
    }
  );
}
