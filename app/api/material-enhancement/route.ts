import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { getConfiguredImageCreditCost } from "@/lib/ai-control-plane/server";
import { createDebitedGeneration, errorToResponsePayload } from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { normalizeGarmentType, resolveGarmentTypeLabel } from "@/lib/garment-types";
import {
  buildMaterialEnhancementPrompt,
  enforceMaterialEnhancementPromptRequirements,
  normalizeMaterialEnhancementLevel,
} from "@/lib/material-enhancement";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`material-enhancement:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-validated below
    let body: any;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }

    const sourceUrl = typeof body.source_url === "string" ? body.source_url : "";
    const garmentUrl = typeof body.garment_url === "string" ? body.garment_url : "";
    if (!sourceUrl) return NextResponse.json({ error: "请先上传原图" }, { status: 400 });
    if (!garmentUrl) return NextResponse.json({ error: "请先上传高清服装图" }, { status: 400 });

    const model: LingyaModel = normalizeLingyaModel(body.ai_model);
    const aspectRatio = normalizeAspectRatio(body.aspect_ratio || "auto", "auto");
    const size: ImageSize = normalizeImageSize(model, (typeof body.image_size === "string" ? body.image_size : "1K") as ImageSize, aspectRatio);
    const genCount = Math.min(Math.max(Number(body.gen_count) || 1, 1), 4);
    const garmentType = resolveGarmentTypeLabel(normalizeGarmentType(body.garment_type), body.custom_garment_type);
    const enhancementLevel = normalizeMaterialEnhancementLevel(body.enhancement_level);
    const userPrompt = typeof body.user_prompt === "string" ? body.user_prompt.trim() : "";
    const rawPrompt = typeof body.prompt === "string" && body.prompt.trim()
      ? body.prompt
      : buildMaterialEnhancementPrompt({
          garmentType,
          enhancementLevel,
          userPrompt,
        });
    const prompt = enforceMaterialEnhancementPromptRequirements(rawPrompt, {
      garmentType,
      enhancementLevel,
    });
    const totalCost = await getConfiguredImageCreditCost(model, size) * genCount;

    const jobPayload: GenerationJobPayload = {
      kind: "materialEnhancement",
      publicBaseUrl: getPublicBaseUrlFromRequest(request),
      sourceUrl,
      garmentUrl,
      garmentType,
      enhancementLevel,
      userPrompt,
      aiModel: model,
      aspectRatio,
      imageSize: size,
      prompt,
      genCount,
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: [sourceUrl, garmentUrl],
      modelFaceUrl: null,
      referenceUrl: garmentUrl,
      creditsCost: totalCost,
      aiModel: model,
      imageSize: size,
      reason: `材质增强 ${genCount} 张 (${model}, ${size})`,
      jobPayload,
      idempotencyKey: request.headers.get("idempotency-key") || "",
      mediaInputs: [sourceUrl, garmentUrl].map((url) => ({ url, kind: "image" as const })),
      publicBaseUrl: jobPayload.publicBaseUrl,
    });

    startGenerationJob(debit.generationId);

    return NextResponse.json({
      generation_id: debit.generationId,
      credits_cost: totalCost,
      credits_remaining: debit.creditsRemaining,
      status: "processing_tryon",
    });
  } catch (err: unknown) {
    console.error("[material-enhancement] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
