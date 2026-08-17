import { getLlmLanguageName } from "@/lib/api/llm-locale";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { fetchLlmChat, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { GARMENT_3D_QUALITY } from "@/lib/garment-3d-prompt";
import { buildGarment3dDisplayStylePrompt, getGarment3dDisplayStyleLabel, normalizeGarment3dDisplayStyle } from "@/lib/module-style-presets";

const ANALYZE_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 30000);

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`garment-3d-analyze:${auth.user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const llm = await getLlmConfig("vision");
    if (!llm.apiKey) return NextResponse.json({ prompt: "" });

    const { garment_url, garment_type, custom_garment_type, display_style, prompt } = await request.json();
    if (!garment_url) return NextResponse.json({ prompt: "" });

    if (!llm.baseUrl) return NextResponse.json({ prompt: "" });

    const finalType = garment_type === "其他"
      ? custom_garment_type?.trim() || "其他服装"
      : garment_type || "服装";
    const displayStyle = normalizeGarment3dDisplayStyle(display_style);
    const displayStylePrompt = buildGarment3dDisplayStylePrompt(displayStyle);

    const textPrompt = `你是顶级电商服装视觉设计师和 AI 图像生成提示词工程师。请仔细分析图1的服装，生成一段高质量的"服装转3D"提示词。

图片说明：
图1：用户上传的${finalType}，仔细分析服装的正面/背面视角、品类、版型、颜色、材质、图案、纹理、所有细节（纽扣/拉链/口袋/刺绣/印花/标签等）。

请按以下结构生成提示词（直接输出，不要标题和编号，逗号句号自然连接）：

1. 类型：3D立体服装展示图（如 Photorealistic 3D garment display, commercial e-commerce product photography）
2. 服装描述：忠实还原图1的${finalType}，保留品类、版型、颜色、材质、图案、文字logo位置、所有细节
3. 立体效果：根据图1判断视角——正面做微微向左旋转的立体效果，背面保留背面视角并微微向左旋转，平铺图让衣服自然撑起有厚度和袖身体积
4. 细节保留：纽扣、拉链、口袋、帽子、袖口、裤腰、裤脚、破洞/水洗/纹理、缝线、标签等所有细节必须完整保留
5. 拍摄设备：Shot on medium format camera, 100mm macro lens（产品摄影标准配置）
6. 拍摄效果：crisp focus on garment details, natural fabric texture, realistic wrinkles and folds
7. 灯光：Professional product photography lighting: soft diffused key light, gentle fill to show fabric texture, subtle rim light for edge definition, minimal harsh shadows
8. 背景：干净白色或浅灰棚拍背景，主体居中，边缘干净
9. 布料质感：真实布料体积感，自然褶皱、缝线纹理、面料光泽和厚度
10. 图像质量：${GARMENT_3D_QUALITY}

当前展示质感档位：${getGarment3dDisplayStyleLabel(displayStyle)}
${displayStylePrompt}

要求：
- 【最重要】最终提示词中必须出现"图1"引用（如"忠实还原图1的服装"、"根据图1判断正面或背面"），这是图片生成模型识别图片的唯一方式
- 所有参数必须根据输入图片智能分析
- 服装必须100%忠实于原图，不能改变任何细节
- 用英文生成摄影技术参数，用${getLlmLanguageName(request.headers.get("x-next-intl-locale"))}描述服装细节
- 最终输出为一段连贯的提示词，150-250字，不要分点，不要解释
- 必须去 AI 味

负面约束：不要生成真人身体，不要生成模特脸，不要多件衣服，不要改变服装类型，不要改变主色，不要扭曲文字和logo，不要卡通感，不要AI渲染感。

用户当前提示词（仅供参考方向，不要照搬，必须基于图片分析重新生成）：
${prompt || ""}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
    const res = await fetchLlmChat("vision", {
      method: "POST",
      headers: { Authorization: `Bearer ${llm.apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: llm.model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: textPrompt },
            { type: "image_url", image_url: { url: garment_url } },
          ],
        }],
        max_tokens: 500,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return NextResponse.json({ prompt: "" });
    const data = await res.json();
    const analyzedPrompt = data.choices?.[0]?.message?.content?.trim() || "";
    return NextResponse.json({ prompt: enforcePromptRequirements(analyzedPrompt) });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return NextResponse.json({ prompt: "", skipped: true });
    console.error("[garment-3d/analyze] error:", err);
    return NextResponse.json({ prompt: "" });
  }
}

function enforcePromptRequirements(prompt: string) {
  if (!prompt) return "";

  let nextPrompt = prompt.replace(/\s+/g, " ").trim();
  if (!nextPrompt.includes("图1")) {
    nextPrompt = `图像角色：图1是用户上传的服装图。${nextPrompt}`;
  }

  const missingQuality = GARMENT_3D_QUALITY
    .split(", ")
    .filter((dimension) => !nextPrompt.includes(dimension));
  if (missingQuality.length) {
    nextPrompt = `${nextPrompt} ${GARMENT_3D_QUALITY}`;
  }

  return nextPrompt;
}
