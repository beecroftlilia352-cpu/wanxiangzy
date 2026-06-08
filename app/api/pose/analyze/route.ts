import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  enforcePosePromptRequirements,
  POSE_BODY_RULE,
  POSE_CLOTHING_RULE,
  POSE_CONSISTENCY_REQUIREMENT,
  POSE_FACE_SHAPE_RULE,
  POSE_GARMENT_PRODUCT_FIDELITY_RULE,
  POSE_GENDER_IDENTITY_LOCK_RULE,
  POSE_LAYOUT_REQUIREMENT,
  POSE_QUALITY,
  POSE_SERIES_RULE,
  POSE_SKIN_COLOR_RULE,
} from "@/lib/pose-prompt";
import { applyPoseSeriesStylePrompt, buildPoseSeriesStylePrompt, getPoseSeriesStyleLabel, normalizePoseSeriesStyle } from "@/lib/module-style-presets";

const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 30000);

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`pose-analyze:${auth.user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const llm = getLlmConfig("vision");
    if (!llm.apiKey || !llm.baseUrl) return NextResponse.json({ prompt: "" });

    const { main_image_url, prompt, pose_style } = await request.json();
    if (!main_image_url) return NextResponse.json({ prompt: "" });
    const poseStyle = normalizePoseSeriesStyle(pose_style);
    const stylePrompt = buildPoseSeriesStylePrompt(poseStyle);

    const textPrompt = `分析图1，生成 100 分商业时装姿势裂变提示词。
图1：主图，分析人物身份、性别表达、年龄感、身体骨架、脸部特征、发型、服装版型、面料纹理、服装结构、场景、构图、镜头、光影和色彩。

硬性输出规则，不能省略，不能改写成普通单人照片：
1. ${POSE_LAYOUT_REQUIREMENT}
2. ${POSE_CONSISTENCY_REQUIREMENT}
3. ${POSE_GENDER_IDENTITY_LOCK_RULE}
4. 镜头、画幅、景别和构图由当前风格与用户提示词决定；不要强制统一焦段、统一镜头距离或固定 50mm。
5. ${POSE_SERIES_RULE}
6. ${POSE_CLOTHING_RULE}
7. ${POSE_GARMENT_PRODUCT_FIDELITY_RULE}
8. ${POSE_BODY_RULE}
9. ${POSE_SKIN_COLOR_RULE}
10. ${POSE_FACE_SHAPE_RULE}
11. 只改变人物动作、克制自然但可察觉的表情眼神，以及用户允许的镜头/构图变化；不要改变人物身份、性别表达、身体骨架、身体比例、服装结构、背景光线和色调。
12. 不要套用固定姿势模板。根据当前风格、图1人物气质和服装版型，自主设计四个自然可信、彼此不同、适合商业展示的姿势。
13. 如果需要描述镜头，只写风格化方向，不要写死 consistent medium full-body framing、50mm、eye level 等固定参数；图1是全身时也不要强制四格全都全身，可按姿势选择近全身、七分身或偏半身商业构图。
14. 用中文描述，一段总述加四个姿势行，340-520字。
15. 结尾必须包含：${POSE_QUALITY}
16. 负面：不要换脸、不要换衣服、不要改变性别表达、不要把男性变成女性或女性化男性身体、不要改变场景、不要改变服装结构或固有色、不要重绘服装材质、不要生成多余人物、不要自动美白、不要雪白皮或冷白皮、不要标准鹅蛋脸或小V脸、不要AI味、不要文字水印。

当前拍摄风格档位：${getPoseSeriesStyleLabel(poseStyle)}
${stylePrompt}

用户当前提示词（只用于理解用户想要的风格和动作；必须保留上面的四宫格硬规则）：${prompt || ""}`;

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
            { type: "image_url", image_url: { url: main_image_url } },
          ],
        }],
        max_tokens: 800,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return NextResponse.json({ prompt: "" });
    const data = await res.json();
    return NextResponse.json({
      prompt: enforcePosePromptRequirements(
        applyPoseSeriesStylePrompt(data.choices?.[0]?.message?.content?.trim() || "", poseStyle),
        { poseStyle }
      ),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return NextResponse.json({ prompt: "", skipped: true });
    console.error("[pose/analyze] error:", err);
    return NextResponse.json({ prompt: "" });
  }
}
