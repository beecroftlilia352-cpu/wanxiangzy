import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getCreditCost,
  normalizeAspectRatio,
  normalizeImageSize,
  normalizeLingyaModel,
  type AspectRatio,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import { createDebitedGeneration, errorToResponsePayload } from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { normalizeGenerationState } from "@/lib/api/generation-state";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  buildFaceSwapPrompt,
  enforceFaceSwapPromptRequirements,
  getFaceSwapUserPromptFromPayload,
  normalizeFaceSwapCount,
  normalizeFaceSwapTextureEnhance,
} from "@/lib/face-swap";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`face-swap:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
    }

    const sourceUrl = typeof body.source_url === "string" ? body.source_url.trim() : "";
    const faceUrl = typeof body.face_url === "string" ? body.face_url.trim() : "";
    if (!sourceUrl) return NextResponse.json({ error: "请先上传或选择原始模特图" }, { status: 400 });
    if (!faceUrl) return NextResponse.json({ error: "请先上传或选择目标脸图" }, { status: 400 });
    if (sourceUrl === faceUrl) return NextResponse.json({ error: "原始模特图和目标脸图不能是同一张" }, { status: 400 });

    const model: LingyaModel = normalizeLingyaModel(body.ai_model);
    const aspectRatio: AspectRatio = normalizeAspectRatio(body.aspect_ratio, "auto");
    const imageSize: ImageSize = normalizeImageSize(model, body.image_size as ImageSize | undefined, aspectRatio);
    const genCount = normalizeFaceSwapCount(body.gen_count);
    const textureEnhance = normalizeFaceSwapTextureEnhance(body.texture_enhance);
    const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const prompt = enforceFaceSwapPromptRequirements(buildFaceSwapPrompt(
      userPrompt,
      textureEnhance,
    ));
    const costPerImage = getCreditCost(model, imageSize, aspectRatio);
    const totalCost = costPerImage * genCount;

    const jobPayload: GenerationJobPayload = {
      kind: "faceSwap",
      publicBaseUrl: getPublicBaseUrlFromRequest(request),
      sourceUrl,
      faceUrl,
      aiModel: model,
      aspectRatio,
      imageSize,
      userPrompt,
      prompt,
      genCount,
      textureEnhance,
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: [sourceUrl],
      modelFaceUrl: faceUrl,
      referenceUrl: null,
      creditsCost: totalCost,
      aiModel: model,
      imageSize,
      reason: `AI 换脸 ${genCount} 张 (${model}, ${imageSize})`,
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
    console.error("[face-swap] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("active") === "1") {
    return handleActiveFaceSwapGet();
  }

  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}

async function handleActiveFaceSwapGet() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const { data, error } = await supabase
      .from("generations")
      .select("id,status,result_urls,error_message,job_payload,completed_at,created_at")
      .eq("user_id", user.id)
      .eq("job_payload->>kind", "faceSwap")
      .in("status", ["queued", "processing_tryon", "processing_face_swap", "processing", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ job: null });
    }

    const payload = data.job_payload as Record<string, unknown> | null;
    const resultUrls = Array.isArray(data.result_urls) ? data.result_urls : [];
    const state = normalizeGenerationState({
      status: data.status,
      resultUrls,
      payload: data.job_payload,
      completedAt: data.completed_at,
    });

    return NextResponse.json({
      job: {
        generationId: data.id,
        status: state.status === "completed" ? "completed" : state.status === "failed" ? "failed" : "running",
        resultUrls,
        progress: state.progress,
        error: data.error_message,
        sourceUrl: typeof payload?.sourceUrl === "string" ? payload.sourceUrl : "",
        faceUrl: typeof payload?.faceUrl === "string" ? payload.faceUrl : "",
        userPrompt: getFaceSwapUserPromptFromPayload(payload || {}),
        textureEnhance: payload?.textureEnhance === true,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "查询进行中任务失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
