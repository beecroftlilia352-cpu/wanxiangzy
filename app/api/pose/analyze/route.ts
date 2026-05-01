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

请严格按以下格式输出提示词：

第一段（全局描述）：类型、主体、穿着、灯光、背景、皮肤质感、图像质量，逗号句号自然连接。

第二段起（四个姿势，每个姿势单独一行，格式为"姿势N：{姿势描述}，{镜头参数}"）：
- 姿势1：正面自然站立，双手自然下垂或轻触口袋，眼神直视镜头。镜头：medium shot, 35mm lens, eye level angle
- 姿势2：侧身45度，回头微笑看向镜头，一手轻抚头发。镜头：medium close-up, 50mm lens, slight low angle
- 姿势3：正面微微弯腰或前倾，双手交叉或撑在膝盖上，俏皮表情。镜头：close-up, 85mm lens, eye level angle
- 姿势4：行走或转身的动态姿势，衣服随风飘动，自然抓拍感。镜头：full body, 24mm lens, slight high angle

要求：
- 【最重要】全局描述中必须出现"图1"引用（如"保持图1的人物身份、服装、场景"），这是图片生成模型识别图片的唯一方式
- 四个姿势必须各不相同，涵盖正面/侧面/俯拍/仰拍等不同角度
- 每个姿势的镜头参数（焦距、机位、景别）必须根据姿势特点选择最佳配置
- 全局描述用英文摄影技术参数，姿势描述用中文
- 全局描述150-200字，每个姿势描述30-50字
- 必须去 AI 味：强调真实摄影质感、自然光影、真实皮肤

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
