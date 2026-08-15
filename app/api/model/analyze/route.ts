import { getLlmLanguageName } from "@/lib/api/llm-locale";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  MODEL_AGE_TEXTURE_RULE,
  MODEL_FACE_SHAPE_RULE,
  MODEL_FACE_STYLE_RULE,
  MODEL_FEATURE_IDENTITY_RULE,
  MODEL_FUSION_RULE,
  MODEL_MAKEUP_RULE,
  MODEL_SKIN_TONE_RULE,
  buildModelIdentityRoleStatement,
  enforceModelPromptRequirements,
  getModelQualityPrompt,
} from "@/lib/model-prompt";
import { applyModelShootStylePrompt, buildModelShootStylePrompt, getModelShootStyleLabel, normalizeModelShootStyle } from "@/lib/module-style-presets";

const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 30000);
const MODEL_QUALITY = getModelQualityPrompt();

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`model-analyze:${auth.user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const llm = await getLlmConfig("vision");
    if (!llm.apiKey || !llm.baseUrl) return NextResponse.json({ prompt: "" });

    const {
      reference_urls,
      hair_reference_url,
      hair_color_reference_url,
      gender,
      model_style,
      hair_style,
      hair_color,
      prompt,
    } = await request.json();
    if (!reference_urls?.length) return NextResponse.json({ prompt: "" });

    const referenceCount = reference_urls.length;
    const roleLines = reference_urls
      .map((_: string, index: number) => `图${index + 1}：人脸与风格融合参考图，分析脸型、五官比例、眼鼻唇特征、肤色、年龄感、眼神气质、妆容风格、面部氛围和真实细节。`)
      .join("\n");
    const hairReferenceIndex = referenceCount + 1;
    const hairColorReferenceIndex = referenceCount + (hair_reference_url ? 2 : 1);
    const hairReferenceLine = hair_reference_url
      ? `\n图${hairReferenceIndex}：发型参考图，只参考发型轮廓、长度、刘海、分缝、蓬松度和发丝走向，不参考人脸身份。`
      : "";
    const hairColorReferenceLine = hair_color_reference_url
      ? `\n图${hairColorReferenceIndex}：发色参考图，只参考头发颜色、明暗层次和染发质感，不参考人脸身份。`
      : "";
    const roleStatement = buildModelIdentityRoleStatement({
      referenceCount,
      hairReferenceIndex: hair_reference_url ? hairReferenceIndex : null,
      hairColorReferenceIndex: hair_color_reference_url ? hairColorReferenceIndex : null,
    });
    const modelStyle = normalizeModelShootStyle(model_style);
    const stylePrompt = buildModelShootStylePrompt(modelStyle);

    const textPrompt = `分析这些图片，生成专属模特提示词。
${roleLines}${hairReferenceLine}${hairColorReferenceLine}

性别：${gender === "male" ? "男" : "女"}
发型：${hair_reference_url ? `参考图${hairReferenceIndex}` : hair_style || "自然适配"}
发色：${hair_color_reference_url ? `参考图${hairColorReferenceIndex}` : hair_color || "自然发色"}

生成规则：
1. 必须写明图号，例如“融合图1到图${referenceCount}的人脸风格与模特气质”。
2. 图1到图${referenceCount}可能是同一个人，也可能是不同人物；必须把它们作为人脸、气质、妆感和审美风格参考，生成一个新的稳定专属模特身份。
3. ${MODEL_FUSION_RULE}
4. ${MODEL_FACE_STYLE_RULE}
5. ${MODEL_MAKEUP_RULE}
6. ${MODEL_SKIN_TONE_RULE}
7. ${MODEL_FACE_SHAPE_RULE}
8. ${MODEL_FEATURE_IDENTITY_RULE}
9. ${MODEL_AGE_TEXTURE_RULE}
10. 发型参考图和发色参考图只参考对应维度，绝不能参与人脸身份融合。
11. 用${getLlmLanguageName(request.headers.get("x-next-intl-locale"))}描述，一段话，140-240字，不要分段，不要解释，不要堆砌系统规则。
12. 只输出高价值视觉分析：人脸融合逻辑、长相风格、模特气质、妆感、肤色、脸型骨相、五官辨识度、年龄感、发型、发色、服装、灯光、背景、皮肤质感。
13. 结尾必须包含：${MODEL_QUALITY}
14. 负面：不要多个人、不要随机陌生脸、不要只像单张参考图、不要无妆感、不要丢失参考图的面部氛围、不要默认美白、不要雪白皮或冷白皮、不要标准鹅蛋脸、小V脸、尖下巴、大眼高鼻网红审美、不要变形、不要AI味、不要过度磨皮、不要文字水印。

当前专属模特拍摄风格档位：${getModelShootStyleLabel(modelStyle)}
${stylePrompt}
${prompt ? `\n用户当前提示词（仅供参考，不要照抄）：\n${prompt}` : ""}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
    const res = await fetch(getChatCompletionsUrl(llm), {
      method: "POST",
      headers: { Authorization: `Bearer ${llm.apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: llm.model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: textPrompt },
            ...reference_urls.map((url: string) => ({ type: "image_url", image_url: { url } })),
            ...(hair_reference_url ? [{ type: "image_url", image_url: { url: hair_reference_url } }] : []),
            ...(hair_color_reference_url ? [{ type: "image_url", image_url: { url: hair_color_reference_url } }] : []),
          ],
        }],
        max_tokens: 850,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return NextResponse.json({ prompt: "" });
    const data = await res.json();
    const analyzedPrompt = data.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({
      prompt: enforceModelPromptRequirements({
        prompt: applyModelShootStylePrompt(analyzedPrompt ? `${roleStatement}\n${analyzedPrompt}` : roleStatement, modelStyle),
        referenceCount,
        gender,
        hairStyle: typeof hair_style === "string" ? hair_style : null,
        hairColor: typeof hair_color === "string" ? hair_color : null,
        hairReferenceIndex: hair_reference_url ? hairReferenceIndex : null,
        hairColorReferenceIndex: hair_color_reference_url ? hairColorReferenceIndex : null,
      }),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return NextResponse.json({ prompt: "", skipped: true });
    console.error("[model/analyze] error:", err);
    return NextResponse.json({ prompt: "" });
  }
}
