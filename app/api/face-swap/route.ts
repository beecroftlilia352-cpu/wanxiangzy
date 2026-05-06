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
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  buildFaceSwapPrompt,
  enforceFaceSwapPromptRequirements,
  normalizeFaceSwapCount,
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
    const prompt = enforceFaceSwapPromptRequirements(buildFaceSwapPrompt(
      typeof body.prompt === "string" ? body.prompt : ""
    ));
    const costPerImage = getCreditCost(model, imageSize, aspectRatio);
    const totalCost = costPerImage * genCount;

    const jobPayload: GenerationJobPayload = {
      kind: "faceSwap",
      sourceUrl,
      faceUrl,
      aiModel: model,
      aspectRatio,
      imageSize,
      prompt,
      genCount,
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
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
