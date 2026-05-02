import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 30000);
const MODEL_QUALITY =
  "photorealistic, 8K ultra-detailed, commercial portrait quality, cinematic color grade, sharp facial details, sharp hair details, raw photo quality";

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
      .map((_: string, index: number) => `图${index + 1}：模特参考图，分析脸型、五官、肤色、气质。`)
      .join("\n");
    const hairReferenceIndex = reference_urls.length + 1;
    const hairColorReferenceIndex = reference_urls.length + (hair_reference_url ? 2 : 1);
    const hairReferenceLine = hair_reference_url
      ? `\n图${hairReferenceIndex}：发型参考图，只参考发型，不参考人脸。`
      : "";
    const hairColorReferenceLine = hair_color_reference_url
      ? `\n图${hairColorReferenceIndex}：发色参考图，只参考发色，不参考人脸。`
      : "";
    const expectedRefs = [
      ...reference_urls.map((_: string, index: number) => `图${index + 1}`),
      ...(hair_reference_url ? [`图${hairReferenceIndex}`] : []),
      ...(hair_color_reference_url ? [`图${hairColorReferenceIndex}`] : []),
    ];
    const roleStatement = buildRoleStatement({
      referenceCount: reference_urls.length,
      hairReferenceIndex: hair_reference_url ? hairReferenceIndex : null,
      hairColorReferenceIndex: hair_color_reference_url ? hairColorReferenceIndex : null,
    });

    const textPrompt = `分析这些图片，生成专属模特提示词。

${roleLines}${hairReferenceLine}${hairColorReferenceLine}

性别：${gender === "male" ? "男" : "女"}
发型：${hair_reference_url ? `参考图${hairReferenceIndex}` : hair_style || "自然适配"}
发色：${hair_color_reference_url ? `参考图${hairColorReferenceIndex}` : hair_color || "自然发色"}

生成规则：
1. 必须在提示词中写明图号（图1、图2等），例如"融合图1到图${reference_urls.length}的身份特征"
2. 融合所有参考图为同一人物，不要平均成陌生脸
3. 用中文描述，一段话，150-250字，不要分段，不要解释
4. 包含：拍摄风格、人物身份、五官细节、发型、发色、服装、灯光、背景、皮肤质感、图像质量
5. 结尾必须包含：${MODEL_QUALITY}
6. 负面：不要多人、不要变形、不要AI味${prompt ? `\n\n用户当前提示词（仅供参考，不要照搬）：\n${prompt}` : ""}`;

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
    return NextResponse.json({
      prompt: enforcePromptRequirements(
        data.choices?.[0]?.message?.content?.trim() || "",
        expectedRefs,
        roleStatement
      ),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return NextResponse.json({ prompt: "", skipped: true });
    console.error("[model/analyze] error:", err);
    return NextResponse.json({ prompt: "" });
  }
}

function buildRoleStatement(params: {
  referenceCount: number;
  hairReferenceIndex: number | null;
  hairColorReferenceIndex: number | null;
}) {
  const refs = Array.from({ length: params.referenceCount }, (_, index) => `图${index + 1}`).join("、");
  const extraRoles = [
    params.hairReferenceIndex ? `图${params.hairReferenceIndex}是发型参考图，只参考发型，不参考人脸身份` : "",
    params.hairColorReferenceIndex ? `图${params.hairColorReferenceIndex}是发色参考图，只参考发色，不参考人脸身份` : "",
  ].filter(Boolean);

  return `图像角色：${refs}是同一个专属模特的人物参考图，用于融合人物身份、脸型、五官比例、肤色和气质${extraRoles.length ? `；${extraRoles.join("；")}` : ""}。`;
}

function enforcePromptRequirements(prompt: string, expectedRefs: string[], roleStatement: string) {
  if (!prompt) return "";

  let nextPrompt = prompt.replace(/\s+/g, " ").trim();
  const missingRefs = expectedRefs.filter((ref) => !nextPrompt.includes(ref));
  if (missingRefs.length) {
    nextPrompt = `${roleStatement}${nextPrompt}`;
  }

  const missingQuality = MODEL_QUALITY
    .split(", ")
    .filter((dimension) => !nextPrompt.includes(dimension));
  if (missingQuality.length) {
    nextPrompt = `${nextPrompt} ${MODEL_QUALITY}`;
  }

  return nextPrompt;
}
