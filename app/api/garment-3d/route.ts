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
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { applyGarment3dDisplayStylePrompt, normalizeGarment3dDisplayStyle } from "@/lib/module-style-presets";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { buildGarment3dPrompt, type Garment3dOutputMode } from "@/lib/garment-3d-prompt";

type GarmentType = "上装" | "下装" | "连体衣" | "其他";
type OutputMode = Garment3dOutputMode;

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`garment-3d:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-validated below
    let body: any;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
    const {
      garment_url,
      garment_type,
      custom_garment_type,
      output_mode,
      display_style,
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
    const aspectRatio: AspectRatio = aspect_ratio === "auto" || aspect_ratio === "1:1" ? aspect_ratio : "3:4";
    const size: ImageSize = normalizeImageSize(model, image_size || "1K", aspectRatio);
    const genCount = Math.min(Math.max(Number(gen_count) || 1, 1), 4);
    const costPerImage = getCreditCost(model, size, aspectRatio);
    const totalCost = costPerImage * genCount;

    const finalGarmentType = garment_type === "其他"
      ? custom_garment_type?.trim() || "其他服装"
      : garment_type || "服装";
    const mode: OutputMode = output_mode === "reference" ? "reference" : "prompt";
    const displayStyle = normalizeGarment3dDisplayStyle(display_style);
    const finalPrompt = applyGarment3dDisplayStylePrompt(final_prompt?.trim() || buildGarment3dPrompt({
      garmentType: finalGarmentType,
      outputMode: mode,
      hasReference: !!reference_url && mode === "reference",
      userPrompt: prompt,
    }), displayStyle);
    const jobPayload: GenerationJobPayload = {
      kind: "garment3d",
      publicBaseUrl: getPublicBaseUrlFromRequest(request),
      garmentUrl: garment_url,
      referenceUrl: mode === "reference" ? reference_url || null : null,
      garmentType: finalGarmentType,
      outputMode: mode,
      displayStyle,
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
  } catch (err: unknown) {
    console.error("[garment-3d] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
