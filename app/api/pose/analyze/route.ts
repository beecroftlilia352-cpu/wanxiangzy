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

    const textPrompt = `你是顶级商业时尚摄影师和 AI 换装提示词工程师。请仔细分析图1的人物、服装、场景、光影和构图，生成一段高质量的姿势裂变提示词。

图片说明：
图1：主图，仔细分析人物的脸部特征、发型、身材比例、服装款式和颜色、场景环境、光影方向、摄影风格。

目标：生成一张四宫格图片，每格都是同一个人物、同一套服装、同一场景、同一光影和摄影质感，但人物姿势不同。

请按以下结构生成提示词（直接输出，不要标题和编号，逗号句号自然连接）：

1. 类型：拍摄风格（根据图1自动判断，如杂志街拍/棚拍电商/户外写真等）
2. 主体：保持图1人物的脸部身份、发型、身材比例完全一致，真实皮肤质感
3. 穿着：忠实还原图1的服装款式、颜色、材质、图案、褶皱和所有细节
4. 四宫格姿势：给出四个明确且自然的姿势描述（如正面自然站立、侧身回头微笑、手扶头发、轻微行走或转身），每个姿势都要有具体的肢体语言描述
5. 拍摄设备：根据图1风格选择合适的相机和镜头参数
6. 拍摄效果：景深、焦点、画面质感
7. 灯光：根据图1的光影风格匹配灯光方案
8. 背景：严格保持图1的背景场景、透视和空间感
9. 皮肤质感：真实皮肤，毛孔可见，自然瑕疵，不过度磨皮
10. 图像质量：photorealistic, 8K ultra-detailed, cinematic color grade, sharp details

要求：
- 四宫格必须保持人物身份、服装、场景、光影的高度一致性
- 每个姿势要自然优雅，符合人体工学
- 用英文生成摄影技术参数，用中文描述姿势和风格细节
- 最终输出为一段连贯的提示词，200-300字，不要分点，不要解释
- 必须去 AI 味

负面约束：不要改变人物身份，不要换衣服，不要改变场景，不要生成多余人物，不要扭曲手指和肢体，不要塑料皮肤，不要蜡像感，不要卡通感，不要过度磨皮，不要AI渲染感。

用户当前提示词（仅供参考方向，不要照搬，必须基于图片分析重新生成）：
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
        max_tokens: 500,
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
