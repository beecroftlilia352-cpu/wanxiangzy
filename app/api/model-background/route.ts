import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCreditCost, normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { createDebitedGeneration, errorToResponsePayload } from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import {
  buildModelBackgroundPrompt,
  DEFAULT_BACKGROUND_TEXT,
  enforceModelBackgroundPromptRequirements,
  normalizeBackgroundPreset,
  normalizeBackgroundSourceMode,
  normalizeModelBackgroundMode,
} from "@/lib/model-background";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`model-background:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-validated below
    let body: any;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }

    const sourceUrl = typeof body.source_url === "string" ? body.source_url : "";
    if (!sourceUrl) return NextResponse.json({ error: "请先上传原图" }, { status: 400 });

    const mode = normalizeModelBackgroundMode(body.mode);
    const backgroundSource = normalizeBackgroundSourceMode(body.background_source);
    const modelReferenceUrl = mode !== "background_only" && typeof body.model_reference_url === "string" && body.model_reference_url
      ? body.model_reference_url
      : null;
    const backgroundReferenceUrl = mode !== "model_only" && (backgroundSource === "preset" || backgroundSource === "upload") && typeof body.background_reference_url === "string" && body.background_reference_url
      ? body.background_reference_url
      : null;
    if (mode !== "background_only" && !modelReferenceUrl) {
      return NextResponse.json({ error: "请选择或上传模特参考图" }, { status: 400 });
    }
    if (mode !== "model_only" && (backgroundSource === "preset" || backgroundSource === "upload") && !backgroundReferenceUrl) {
      return NextResponse.json({ error: "请选择或上传背景参考图" }, { status: 400 });
    }

    const model: LingyaModel = normalizeLingyaModel(body.ai_model);
    const aspectRatio = normalizeAspectRatio(body.aspect_ratio || "auto");
    const size: ImageSize = normalizeImageSize(model, (typeof body.image_size === "string" ? body.image_size : "1K") as ImageSize, aspectRatio);
    const genCount = Math.min(Math.max(Number(body.gen_count) || 1, 1), 4);
    const templateId = normalizeBackgroundPreset(body.template_id);
    const backgroundText = typeof body.background_text === "string" && body.background_text.trim()
      ? body.background_text
      : DEFAULT_BACKGROUND_TEXT;
    const userPrompt = typeof body.user_prompt === "string" ? body.user_prompt.trim() : "";
    const rawPrompt = typeof body.prompt === "string" && body.prompt.trim()
      ? body.prompt
      : buildModelBackgroundPrompt({
          mode,
          backgroundSource,
          templateId,
          backgroundText,
          userPrompt,
          hasModelReference: Boolean(modelReferenceUrl),
          hasBackgroundReference: Boolean(backgroundReferenceUrl),
        });
    const prompt = enforceModelBackgroundPromptRequirements(rawPrompt, {
      mode,
      hasModelReference: Boolean(modelReferenceUrl),
      hasBackgroundReference: Boolean(backgroundReferenceUrl),
    });
    const totalCost = getCreditCost(model, size, aspectRatio) * genCount;

    const jobPayload: GenerationJobPayload = {
      kind: "modelBackground",
      publicBaseUrl: getPublicBaseUrlFromRequest(request),
      sourceUrl,
      modelReferenceUrl,
      backgroundReferenceUrl,
      mode,
      backgroundSource,
      templateId,
      backgroundText,
      userPrompt,
      aiModel: model,
      aspectRatio,
      imageSize: size,
      prompt,
      genCount,
    };

    const inputUrls = [sourceUrl, modelReferenceUrl, backgroundReferenceUrl].filter(Boolean) as string[];
    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: inputUrls,
      modelFaceUrl: modelReferenceUrl,
      referenceUrl: backgroundReferenceUrl,
      creditsCost: totalCost,
      aiModel: model,
      imageSize: size,
      reason: `换背景 ${genCount} 张 (${model}, ${size})`,
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
    console.error("[model-background] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
