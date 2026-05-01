import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 30000);

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`model-analyze:${auth.user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const llm = getLlmConfig("vision");
    if (!llm.apiKey) return NextResponse.json({ prompt: "" });

    const { reference_urls, hair_reference_url, hair_color_reference_url, gender, hair_style, hair_color, prompt } = await request.json();
    if (!reference_urls?.length) return NextResponse.json({ prompt: "" });

    if (!llm.baseUrl) return NextResponse.json({ prompt: "" });

    const roleLines = reference_urls
      .map((_: string, index: number) => `图${index + 1}：专属模特参考图，仔细分析该人物的脸型、五官轮廓、眼睛形状、鼻梁高度、嘴唇形态、肤色、气质、年龄感和真实身份特征。`)
      .join("\n");
    const hairReferenceIndex = reference_urls.length + 1;
    const hairColorReferenceIndex = reference_urls.length + (hair_reference_url ? 2 : 1);
    const hairReferenceLine = hair_reference_url
      ? `\n图${hairReferenceIndex}：发型参考图，只参考发型轮廓、长度、刘海/分缝、蓬松度、卷直度、发丝走向，不参考该图人物身份。`
      : "";
    const hairColorReferenceLine = hair_color_reference_url
      ? `\n图${hairColorReferenceIndex}：发色参考图，只参考头发颜色、明暗层次、染发质感和光泽度，不参考该图人物身份。`
      : "";

    const textPrompt = `你是顶级商业人像摄影师和 AI 模特提示词工程师。请仔细分析所有输入图片，生成一段高质量的专属模特生成提示词。

图片说明：
${roleLines}${hairReferenceLine}${hairColorReferenceLine}

用户配置：
- 性别：${gender === "male" ? "男" : "女"}
- 发型：${hair_reference_url ? `严格参考图${hairReferenceIndex}的发型` : hair_style || "根据脸型自然适配"}
- 发色：${hair_color_reference_url ? `严格参考图${hairColorReferenceIndex}的发色` : hair_color || "自然真实发色"}

请按以下结构生成提示词（直接输出，不要标题和编号，逗号句号自然连接）：

1. 类型：高端商业模特卡/人像摄影（如 High-end commercial model headshot, studio portrait photography）
2. 主体：${gender === "male" ? "男性" : "女性"}模特，融合图1到图${reference_urls.length}的共同身份特征——脸型、五官、肤色、气质必须是同一个人，不要平均成陌生脸。年龄感、气质风格从参考图中提取。
3. 面部细节：眼睛形状和瞳色、鼻梁高度和鼻翼宽度、嘴唇形态和颜色、眉毛形状、面部轮廓线条，所有五官必须自然协调
4. 发型：${hair_reference_url ? `严格参考图${hairReferenceIndex}的发型轮廓、长度、刘海/分缝、蓬松度、发丝走向` : hair_style ? `发型为${hair_style}` : "根据脸型自然适配的发型"}，发丝细节真实，有自然光泽和层次感
5. 发色：${hair_color_reference_url ? `严格参考图${hairColorReferenceIndex}的发色、明暗层次和染发质感` : hair_color ? `发色为${hair_color}` : "自然真实发色"}，发丝有光泽和颜色渐变
6. 服装：简洁白色基础款上衣（T恤/衬衫/针织衫，根据性别和气质选择），领口自然，面料质感真实
7. 拍摄设备：Shot on medium format camera, 85mm f/1.4 prime lens（商业人像标准配置）
8. 拍摄效果：shallow depth of field, crisp focus on eyes and facial features, natural bokeh background
9. 灯光：Professional portrait studio lighting: main key light from 45-degree soft octabox for flattering facial shadows, gentle fill light to reduce contrast, subtle rim/hair light to separate from background, natural catch light in eyes
10. 背景：Clean seamless light grey or white studio background, minimalist aesthetic, professional model card style
11. 皮肤质感：Hyper-realistic skin texture, visible natural pores, subtle skin imperfections (freckles/moles/under-eye lines), natural skin tone with micro-color variations, professional retouch that preserves natural beauty, no over-smoothing
12. 图像质量：photorealistic, 8K ultra-detailed, high contrast, cinematic color grade, commercial fashion catalog quality, sharp details on facial features, raw photo quality

要求：
- 所有参数必须根据输入图片智能分析，不要使用固定模板
- 图1到图${reference_urls.length}必须融合为同一人物身份，保持一致性
- 五官细节必须清晰自然，不能模糊或变形
- 最终输出为一段连贯的提示词，200-300字，不要分点，不要解释
- 必须去 AI 味：强调真实摄影质感、自然光影、真实皮肤

负面约束：不要改变人物身份，不要生成多个人，不要过度磨皮，不要塑料皮肤，不要蜡像感，不要卡通感，不要畸形五官，不要扭曲耳朵/眼睛/嘴唇，不要文字水印，不要AI渲染感。

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
            ...reference_urls.map((url: string) => ({ type: "image_url", image_url: { url } })),
            ...(hair_reference_url ? [{ type: "image_url", image_url: { url: hair_reference_url } }] : []),
            ...(hair_color_reference_url ? [{ type: "image_url", image_url: { url: hair_color_reference_url } }] : []),
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
    console.error("[model/analyze] error:", err);
    return NextResponse.json({ prompt: "" });
  }
}
