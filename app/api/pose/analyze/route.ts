import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

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

    const textPrompt = `分析图1，生成四宫格姿势裂变提示词。

图1：主图，分析人物、服装、场景、光影。

生成规则：
1. 必须在提示词开头写"保持图1的人物身份、服装、场景、光影一致"
2. 描述四个不同姿势，每个姿势单独一行，格式：
   姿势1：{描述}，镜头：{焦距和角度}
   姿势2：{描述}，镜头：{焦距和角度}
   姿势3：{描述}，镜头：{焦距和角度}
   姿势4：{描述}，镜头：{焦距和角度}
3. 四个姿势要不同角度（正面/侧面/俯拍/仰拍）
4. 每个姿势配不同镜头参数（35mm/50mm/85mm/24mm等）
5. 用中文描述，一段话加四个姿势行，200-300字
6. 结尾加上：photorealistic, 8K, cinematic color, sharp details
7. 负面：不要换脸、不要换衣服、不要AI味${prompt ? `\n\n用户当前提示词（仅供参考，不要照搬）：\n${prompt}` : ""}`;

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
    return NextResponse.json({ prompt: data.choices?.[0]?.message?.content?.trim() || "" });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return NextResponse.json({ prompt: "", skipped: true });
    console.error("[pose/analyze] error:", err);
    return NextResponse.json({ prompt: "" });
  }
}
