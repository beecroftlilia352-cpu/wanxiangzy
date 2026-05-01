import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 25000);

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
      .map((_: string, index: number) => `图${index + 1}：专属模特参考图，用于提取同一人物的脸型、五官、肤色、气质和真实身份特征。`)
      .join("\n");
    const hairReferenceIndex = reference_urls.length + 1;
    const hairColorReferenceIndex = reference_urls.length + (hair_reference_url ? 2 : 1);
    const hairReferenceLine = hair_reference_url
      ? `\n图${hairReferenceIndex}：发型参考图，只参考发型轮廓、长度、刘海/分缝、蓬松度、发丝走向，不参考身份。`
      : "";
    const hairColorReferenceLine = hair_color_reference_url
      ? `\n图${hairColorReferenceIndex}：发色参考图，只参考头发颜色、明暗层次和染发质感，不参考身份。`
      : "";

    const textPrompt = `你是商业人像摄影和 AI 模特提示词工程师。请分析输入图片并优化一段专属模特生成提示词。

图片关系：
${roleLines}${hairReferenceLine}${hairColorReferenceLine}

用户配置：
性别：${gender === "male" ? "男" : "女"}
参考发型：${hair_reference_url ? `参考图${hairReferenceIndex}` : hair_style || "不指定，自然适配"}
参考发色：${hair_color_reference_url ? `参考图${hairColorReferenceIndex}` : hair_color || "不指定，保持自然真实"}

目标：生成一张真实摄影质感的专属模特半身头像或胸像。必须融合图1到图${reference_urls.length}的共同身份特征，保持同一个人，不要平均成陌生脸。${hair_reference_url ? `发型严格参考图${hairReferenceIndex}，但不要参考图${hairReferenceIndex}的人脸身份。` : "发型按用户配置执行；如未指定则自然适配人物脸型。"}${hair_color_reference_url ? `发色严格参考图${hairColorReferenceIndex}，但不要参考图${hairColorReferenceIndex}的人脸身份。` : "发色按用户配置执行；如未指定则自然真实。"}服装保持简洁白色基础上衣，背景为干净浅灰或白色棚拍背景。

要求：真实相机拍摄，商业证件照/模特卡质感，柔和棚拍光，皮肤有自然纹理和轻微瑕疵，五官清晰自然，头肩比例准确，发丝细节真实，避免 AI 味。

负面约束：不要改变人物身份，不要生成多个人，不要过度磨皮，不要塑料皮肤，不要蜡像感，不要卡通感，不要畸形五官，不要扭曲耳朵/眼睛/嘴唇，不要文字水印。

用户当前提示词：
${prompt || ""}

只输出最终中文提示词，140-200字，不要解释。`;

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
        max_tokens: 300,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return NextResponse.json({ prompt: "" });
    const data = await res.json();
    return NextResponse.json({ prompt: data.choices?.[0]?.message?.content?.trim() || "" });
  } catch (err: any) {
    if (err?.name === "AbortError") return NextResponse.json({ prompt: "", skipped: true });
    console.error("[model/analyze] error:", err);
    return NextResponse.json({ prompt: "" });
  }
}
