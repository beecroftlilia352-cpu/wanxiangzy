import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createDebitedGeneration, errorToResponsePayload } from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  AI_VIDEO_DEFAULT_ASPECT_RATIO,
  OMNI_IMAGE_TO_VIDEO_MODEL,
  getAiVideoCreditCost,
  getAiVideoTemplate,
  normalizeAiVideoResolution,
} from "@/lib/ai-video";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`video-image-to-video:${user.id}`, 12, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }

    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const resolution = normalizeAiVideoResolution(body.resolution);
    const templateId = Number(body.templateId || 0) || undefined;
    const aspectRatio = body.aspectRatio === "16:9" ? "16:9" : AI_VIDEO_DEFAULT_ASPECT_RATIO;
    const template = getAiVideoTemplate(templateId);

    if (!imageUrl) return NextResponse.json({ error: "请先上传图片" }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "请输入动作描述或选择动作模板" }, { status: 400 });

    const totalCost = getAiVideoCreditCost(resolution);
    const jobPayload: GenerationJobPayload = {
      kind: "videoImageToVideo",
      publicBaseUrl: getPublicBaseUrlFromRequest(request),
      imageUrl,
      prompt,
      templateId,
      templateTitle: template?.title,
      resolution,
      aspectRatio,
      aiModel: OMNI_IMAGE_TO_VIDEO_MODEL,
      genCount: 1,
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: [imageUrl],
      modelFaceUrl: null,
      referenceUrl: null,
      creditsCost: totalCost,
      aiModel: OMNI_IMAGE_TO_VIDEO_MODEL,
      imageSize: resolution,
      reason: `图生视频 (${OMNI_IMAGE_TO_VIDEO_MODEL}, ${resolution})`,
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
    console.error("[video:image-to-video] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
