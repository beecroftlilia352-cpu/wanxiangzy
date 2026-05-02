import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  enforcePosePromptRequirements,
  POSE_CAMERA_REQUIREMENT,
  POSE_CONSISTENCY_REQUIREMENT,
  POSE_LAYOUT_REQUIREMENT,
  POSE_QUALITY,
} from "@/lib/pose-prompt";

const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 30000);

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`pose-analyze:${auth.user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const llm = getLlmConfig("vision");
    if (!llm.apiKey) return NextResponse.json({ prompt: "" });

    const { main_image_url, prompt } = await request.json();
    if (!main_image_url) return NextResponse.json({ prompt: "" });

    if (!llm.baseUrl) return NextResponse.json({ prompt: "" });

    const textPrompt = `分析图1，生成稳定的姿势裂变提示词。

图1：主图，分析人物、服装、场景、光影。

硬性输出规则，不能省略，不能改写成普通单人照片：
1. ${POSE_LAYOUT_REQUIREMENT}
2. ${POSE_CONSISTENCY_REQUIREMENT}
3. ${POSE_CAMERA_REQUIREMENT}
4. 只改变四个分格中的人物动作；不要改变景别、焦段风格、背景、光线、色调、服装结构和服装展示范围。
5. 描述四个不同姿势，每个姿势必须单独一行，格式：
   姿势1：{描述}，镜头：{焦距和角度}
   姿势2：{描述}，镜头：{焦距和角度}
   姿势3：{描述}，镜头：{焦距和角度}
   姿势4：{描述}，镜头：{焦距和角度}
6. 姿势建议：正面自然站立、轻微侧身30度、重心偏移展示腰线、轻微迈步或转身的自然动态。
7. 用中文描述，一段总述加四个姿势行，200-350字。
8. 结尾必须包含：${POSE_QUALITY}
9. 负面：不要换脸、不要换衣服、不要改变场景、不要改变服装结构、不要生成多余人物、不要AI味。

用户当前提示词（只用于理解用户想要的风格和动作；必须保留上面的四宫格硬规则）：
${prompt || ""}`;

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
        max_tokens: 600,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return NextResponse.json({ prompt: "" });
    const data = await res.json();
    return NextResponse.json({
      prompt: enforcePosePromptRequirements(data.choices?.[0]?.message?.content?.trim() || ""),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return NextResponse.json({ prompt: "", skipped: true });
    console.error("[pose/analyze] error:", err);
    return NextResponse.json({ prompt: "" });
  }
}
