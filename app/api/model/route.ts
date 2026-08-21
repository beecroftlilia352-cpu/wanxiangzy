import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { getConfiguredImageCreditCost } from "@/lib/ai-control-plane/server";
import {
  createDebitedGeneration,
  errorToResponsePayload,
} from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { enforceModelPromptRequirements } from "@/lib/model-prompt";
import { applyModelShootStylePrompt, normalizeModelShootStyle } from "@/lib/module-style-presets";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { MAX_MODEL_REFERENCE_IMAGES } from "@/lib/model-upload-rules";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`model:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-validated below
    let body: any;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
    const { reference_urls, hair_reference_url, hair_color_reference_url, gender, hair_style, hair_color, model_style, ai_model, aspect_ratio, image_size, prompt, gen_count } = body;
    if (!Array.isArray(reference_urls) || !reference_urls.length) return NextResponse.json({ error: `请上传 1-${MAX_MODEL_REFERENCE_IMAGES} 张参考图` }, { status: 400 });
    if (reference_urls.length > MAX_MODEL_REFERENCE_IMAGES) return NextResponse.json({ error: `参考图最多 ${MAX_MODEL_REFERENCE_IMAGES} 张` }, { status: 400 });
    if (reference_urls.some((url) => typeof url !== "string")) return NextResponse.json({ error: "参考图无效" }, { status: 400 });
    if (
      (hair_reference_url && typeof hair_reference_url !== "string") ||
      (hair_color_reference_url && typeof hair_color_reference_url !== "string")
    ) {
      return NextResponse.json({ error: "发型或发色参考图无效" }, { status: 400 });
    }
    if (!prompt?.trim()) return NextResponse.json({ error: "缺少提示词" }, { status: 400 });

    const model: LingyaModel = normalizeLingyaModel(ai_model);
    const aspectRatio: AspectRatio = normalizeAspectRatio(aspect_ratio, "auto");
    const size: ImageSize = normalizeImageSize(model, image_size || "1K", aspectRatio);
    const genCount = Math.min(Math.max(Number(gen_count) || 1, 1), 4);
    const costPerImage = await getConfiguredImageCreditCost(model, size);
    const totalCost = costPerImage * genCount;
    const hairReferenceIndex = hair_reference_url ? reference_urls.length + 1 : null;
    const hairColorReferenceIndex = hair_color_reference_url ? reference_urls.length + (hair_reference_url ? 2 : 1) : null;
    const modelStyle = normalizeModelShootStyle(model_style);
    const finalPrompt = enforceModelPromptRequirements({
      prompt: applyModelShootStylePrompt(prompt, modelStyle),
      referenceCount: reference_urls.length,
      gender: gender === "male" ? "male" : "female",
      hairStyle: typeof hair_style === "string" ? hair_style : null,
      hairColor: typeof hair_color === "string" ? hair_color : null,
      hairReferenceIndex,
      hairColorReferenceIndex,
    });
    const jobPayload: GenerationJobPayload = {
      kind: "model",
      publicBaseUrl: getPublicBaseUrlFromRequest(request),
      referenceUrls: reference_urls,
      hairReferenceUrl: hair_reference_url || null,
      hairColorReferenceUrl: hair_color_reference_url || null,
      gender: gender === "male" ? "male" : "female",
      modelStyle,
      hairStyle: typeof hair_style === "string" ? hair_style : null,
      hairColor: typeof hair_color === "string" ? hair_color : null,
      aiModel: model,
      aspectRatio,
      imageSize: size,
      prompt: finalPrompt,
      genCount,
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: reference_urls,
      modelFaceUrl: null,
      referenceUrl: null,
      creditsCost: totalCost,
      aiModel: model,
      imageSize: size,
      reason: `专属模特 ${genCount} 张 (${model}, ${size})`,
      jobPayload,
      idempotencyKey: request.headers.get("idempotency-key") || "",
      mediaInputs: [...reference_urls, hair_reference_url, hair_color_reference_url]
        .filter((url): url is string => Boolean(url))
        .map((url) => ({ url, kind: "image" as const })),
      publicBaseUrl: jobPayload.publicBaseUrl,
    });

    // The database transaction already wrote the generation and its Outbox
    // record. Production dispatch only acknowledges that durable commit; the
    // relay publishes to BullMQ independently of this request lifecycle.
    startGenerationJob(debit.generationId);

    return NextResponse.json({
      generation_id: debit.generationId,
      credits_cost: totalCost,
      credits_remaining: debit.creditsRemaining,
      status: "processing_tryon",
    });
  } catch (err: unknown) {
    console.error("[model] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
