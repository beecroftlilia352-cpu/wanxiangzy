import { NextRequest, NextResponse } from "next/server";

const LLM_VISION_MODEL = process.env.LINGYA_VISION_MODEL || "gpt-4o-mini";
const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 25000);

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.LINGYA_API_KEY;
    if (!apiKey) return NextResponse.json({ prompt: "" });

    const { main_image_url, prompt } = await request.json();
    if (!main_image_url) return NextResponse.json({ prompt: "" });

    const baseUrl = normalizeOpenAiCompatibleBaseUrl(process.env.LINGYA_BASE_URL || "");
    if (!baseUrl) return NextResponse.json({ prompt: "" });

    const textPrompt = `你是商业摄影和图像生成提示词工程师。请分析图1主图中的人物、服装、场景、光影和构图，把下面的姿势裂变提示词优化成可直接用于图像生成模型的中文提示词。

目标：生成一张四宫格图片，每格都是同一个人物、同一套服装、同一场景、同一光影和摄影质感，但人物姿势不同。

必须强化：人物脸部身份一致，发型一致，身材比例一致，服装版型/颜色/材质/图案/褶皱一致，背景透视和光影一致，真实摄影质感，避免 AI 味。

可以给出四个明确姿势，例如：正面自然站立、侧身回头、手扶头发、轻微行走或转身。

负面约束：不要改变人物身份，不要换衣服，不要改变场景，不要生成多余人物，不要扭曲手指和肢体，不要塑料皮肤，不要蜡像感，不要卡通感，不要过度磨皮。

用户当前提示词：
${prompt || ""}

只输出最终提示词，120-180字左右，不要解释。`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: LLM_VISION_MODEL,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: textPrompt },
            { type: "image_url", image_url: { url: main_image_url } },
          ],
        }],
        max_tokens: 260,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return NextResponse.json({ prompt: "" });
    const data = await res.json();
    return NextResponse.json({ prompt: data.choices?.[0]?.message?.content?.trim() || "" });
  } catch (err: any) {
    if (err?.name === "AbortError") return NextResponse.json({ prompt: "", skipped: true });
    console.error("[pose/analyze] error:", err);
    return NextResponse.json({ prompt: "" });
  }
}

function normalizeOpenAiCompatibleBaseUrl(value: string): string {
  const baseUrl = value.replace(/\/+$/, "");
  if (!baseUrl) return "";
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}
