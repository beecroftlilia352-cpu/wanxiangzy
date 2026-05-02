import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getCreditCost,
  normalizeImageSize,
  normalizeLingyaModel,
  type AspectRatio,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import {
  createDebitedGeneration,
  errorToResponsePayload,
} from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";

type GarmentType = "上装" | "下装" | "连体衣" | "其他";
type OutputMode = "reference" | "prompt";

const GARMENT_3D_QUALITY =
  "photorealistic, 8K ultra-detailed, high contrast, commercial e-commerce catalog quality, sharp fabric details, raw photo quality";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
    const {
      garment_url,
      garment_type,
      custom_garment_type,
      output_mode,
      reference_url,
      ai_model,
      aspect_ratio,
      image_size,
      prompt,
      final_prompt,
      gen_count,
    } = body;

    if (!garment_url || typeof garment_url !== "string") return NextResponse.json({ error: "请上传服装图" }, { status: 400 });
    if (reference_url && typeof reference_url !== "string") return NextResponse.json({ error: "参考图无效" }, { status: 400 });
    if (!prompt?.trim() && !final_prompt?.trim()) return NextResponse.json({ error: "缺少提示词" }, { status: 400 });

    const model: LingyaModel = normalizeLingyaModel(ai_model);
    const aspectRatio: AspectRatio = aspect_ratio === "1:1" ? "1:1" : "3:4";
    const size: ImageSize = normalizeImageSize(model, image_size || "1K", aspectRatio);
    const genCount = Math.min(Math.max(Number(gen_count) || 1, 1), 4);
    const costPerImage = getCreditCost(model, size, aspectRatio);
    const totalCost = costPerImage * genCount;

    const finalGarmentType = garment_type === "其他"
      ? custom_garment_type?.trim() || "其他服装"
      : garment_type || "服装";
    const mode: OutputMode = output_mode === "reference" ? "reference" : "prompt";
    const finalPrompt = final_prompt?.trim() || buildServerPrompt({
      garmentType: finalGarmentType,
      outputMode: mode,
      hasReference: !!reference_url && mode === "reference",
      userPrompt: prompt,
    });
    const jobPayload: GenerationJobPayload = {
      kind: "garment3d",
      garmentUrl: garment_url,
      referenceUrl: mode === "reference" ? reference_url || null : null,
      garmentType: finalGarmentType,
      outputMode: mode,
      userPrompt: prompt,
      aiModel: model,
      aspectRatio,
      imageSize: size,
      prompt: finalPrompt,
      genCount,
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: [garment_url],
      modelFaceUrl: null,
      referenceUrl: mode === "reference" ? reference_url || null : null,
      creditsCost: totalCost,
      aiModel: model,
      imageSize: size,
      reason: `服装转3D ${genCount} 张(${model}, ${size})`,
      jobPayload,
    });

    startGenerationJob(debit.generationId);

    return NextResponse.json({
      generation_id: debit.generationId,
      credits_cost: totalCost,
      credits_remaining: debit.creditsRemaining,
      status: "processing_tryon",
    });
  } catch (err: any) {
    console.error("[garment-3d] POST error:", err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}

function buildServerPrompt(params: {
  garmentType: string;
  outputMode: OutputMode;
  hasReference: boolean;
  userPrompt: string;
}) {
  const roles = params.hasReference
    ? "图像角色：图1是用户上传的服装图，图2是3D立体服装参考图。"
    : "图像角色：图1是用户上传的服装图。";
  const referenceLine = params.hasReference
    ? "参考图2只用于学习服装立体感、袖身厚度、支撑形态、阴影结构、空间角度和棚拍光影，不参考图2的背景元素、颜色、图案、文字或具体款式。"
    : "根据用户提示生成类似穿在人身上的立体效果，使用干净白色背景。";
  const backgroundLine = "背景使用干净白色或浅灰棚拍背景，主体居中，边缘干净，真实商业棚拍质感。";
  const userRequirement = params.userPrompt.trim()
    ? `用户补充要求：${params.userPrompt.trim()}`
    : params.hasReference
      ? "用户补充要求：无，优先按照图2的立体感、厚度、支撑形态、空间角度和棚拍光影生成。"
      : "用户要求：衣服变为类似穿在人身上的立体效果，微微向左旋转，保留原始版型、面料厚度、纹理和所有细节。";

  return `${roles} 任务：将图1的${params.garmentType}从平面图或人台图转换为无真人、无头部、无脸、无手的3D立体服装展示图。${referenceLine} 严格保留图1服装的版型、颜色、材质、纹理、图案、纽扣、拉链、口袋、帽绳、袖口、裤腰、裤脚等细节。${backgroundLine} ${userRequirement} 图像质量：${GARMENT_3D_QUALITY}。负面约束：不要生成真人身体、不要生成模特脸、不要多件衣服、不要改变衣服品类、不要扭曲文字和 logo、不要改变主要颜色。`;
}
