import { NextRequest, NextResponse } from "next/server";

const LLM_VISION_MODEL = process.env.LINGYA_VISION_MODEL || "gpt-4o-mini";
const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 25000);

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.LINGYA_API_KEY;
    if (!apiKey) return NextResponse.json({ prompt: "" });

    const { garment_url, garment_type, custom_garment_type, prompt } = await request.json();
    if (!garment_url) return NextResponse.json({ prompt: "" });

    const baseUrl = normalizeOpenAiCompatibleBaseUrl(process.env.LINGYA_BASE_URL || "");
    if (!baseUrl) return NextResponse.json({ prompt: "" });

    const finalType = garment_type === "其他"
      ? custom_garment_type?.trim() || "其他服装"
      : garment_type || "服装";

    const textPrompt = `你是电商服装图像生成提示词工程师。请分析图1中的服装，判断它是正面、背面、平铺图还是人台图，并生成一段用于“服装转3D”的中文提示词。

图像角色：图1是用户上传的${finalType}。
目标：把图1服装变成类似穿在人身上的3D立体服装展示效果，但不要出现真人、头部、脸、手或人体皮肤。根据图1判断正面或背面：如果是正面，就做正面微微向左旋转的立体效果；如果是背面，就保留背面视角并微微向左旋转；如果是平铺图，要让衣服自然撑起，有厚度、袖身体积和真实褶皱。
必须保留：服装品类、版型、颜色、材质、图案、文字/logo位置、纽扣、拉链、口袋、帽子、袖口、裤腰、裤脚和破洞/水洗/纹理细节。
画面要求：主体居中，商业棚拍，柔和阴影，背景尽量保持图1背景不变，边缘干净，真实布料体积感。
负面约束：不要生成真人身体，不要生成模特脸，不要多件衣服，不要改变服装类型，不要改变主色，不要扭曲文字和 logo，不要卡通感。

用户当前提示词：
${prompt || ""}

只输出最终中文提示词，60-180字，不要解释。`;

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
            { type: "image_url", image_url: { url: garment_url } },
          ],
        }],
        max_tokens: 300,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return NextResponse.json({ prompt: "" });
    const data = await res.json();
    return NextResponse.json({ prompt: data.choices?.[0]?.message?.content?.trim() || "" });
  } catch (err: any) {
    if (err?.name === "AbortError") return NextResponse.json({ prompt: "", skipped: true });
    console.error("[garment-3d/analyze] error:", err);
    return NextResponse.json({ prompt: "" });
  }
}

function normalizeOpenAiCompatibleBaseUrl(value: string): string {
  const baseUrl = value.replace(/\/+$/, "");
  if (!baseUrl) return "";
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}
