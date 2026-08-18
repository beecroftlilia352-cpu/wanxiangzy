import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { getConfiguredImageCreditCost } from "@/lib/ai-control-plane/server";
import { createDebitedGeneration, errorToResponsePayload } from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { buildGrassPrompt, enforceGrassPromptRequirements, normalizeGrassSceneBackgroundMode, normalizeGrassSceneMode, normalizeGrassTemplate } from "@/lib/grass-planting";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`grass:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-validated below
    let body: any;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }

    const garmentUrl = typeof body.garment_url === "string" ? body.garment_url : "";
    if (!garmentUrl) return NextResponse.json({ error: "请先上传服装图" }, { status: 400 });

    const model: LingyaModel = normalizeLingyaModel(body.ai_model);
    const aspectRatio = normalizeAspectRatio(body.aspect_ratio || "auto", "auto");
    const size: ImageSize = normalizeImageSize(model, (typeof body.image_size === "string" ? body.image_size : "1K") as ImageSize, aspectRatio);
    const genCount = Math.min(Math.max(Number(body.gen_count) || 1, 1), 4);
    const templateId = normalizeGrassTemplate(body.template_id);
    const userPrompt = typeof body.user_prompt === "string" ? body.user_prompt.trim() : "";
    const changeModel = body.change_model !== false;
    const sceneMode = normalizeGrassSceneMode(body.scene_mode);
    const sceneBackgroundMode = normalizeGrassSceneBackgroundMode(body.scene_background_mode);
    const requestedReferenceUrl = typeof body.reference_url === "string" ? body.reference_url.trim() : "";
    const referenceUrl = sceneMode === "custom_prompt" ? null : requestedReferenceUrl || null;
    if (sceneMode === "upload_reference" && !referenceUrl) {
      return NextResponse.json({ error: "请先上传种草参考图" }, { status: 400 });
    }
    const rawPrompt = typeof body.prompt === "string" && body.prompt.trim()
      ? body.prompt
      : buildGrassPrompt({
          templateId,
          userPrompt,
          changeModel,
          sceneMode,
          hasReference: !!referenceUrl,
          sceneBackgroundMode,
        });
    const prompt = enforceGrassPromptRequirements(rawPrompt, {
      sceneMode,
      hasReference: !!referenceUrl,
      changeModel,
      sceneBackgroundMode,
    });
    const totalCost = await getConfiguredImageCreditCost(model, size) * genCount;

    const jobPayload: GenerationJobPayload = {
      kind: "grass",
      publicBaseUrl: getPublicBaseUrlFromRequest(request),
      garmentUrl,
      referenceUrl,
      sceneMode,
      sceneBackgroundMode,
      templateId,
      changeModel,
      userPrompt,
      aiModel: model,
      aspectRatio,
      imageSize: size,
      prompt,
      genCount,
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: [garmentUrl],
      modelFaceUrl: null,
      referenceUrl,
      creditsCost: totalCost,
      aiModel: model,
      imageSize: size,
      reason: `服装种草图 ${genCount} 张 (${model}, ${size})`,
      jobPayload,
      idempotencyKey: request.headers.get("idempotency-key") || "",
    });

    startGenerationJob(debit.generationId);

    return NextResponse.json({
      generation_id: debit.generationId,
      credits_cost: totalCost,
      credits_remaining: debit.creditsRemaining,
      status: "processing_tryon",
    });
  } catch (err: unknown) {
    console.error("[grass] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
