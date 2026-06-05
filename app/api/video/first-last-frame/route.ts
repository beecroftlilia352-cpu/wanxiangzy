import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createDebitedGeneration, errorToResponsePayload } from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  AI_VIDEO_SEEDANCE_FIRST_LAST_FRAME_MODEL,
  getAiVideoCreditCost,
  normalizeAiVideoDuration,
  normalizeAiVideoResolution,
} from "@/lib/ai-video";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`video-first-last-frame:${user.id}`, 12, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }

    const firstFrameUrl = typeof body.firstFrameUrl === "string" ? body.firstFrameUrl.trim() : "";
    const lastFrameUrl = typeof body.lastFrameUrl === "string" ? body.lastFrameUrl.trim() : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
    const duration = normalizeAiVideoDuration(body.duration);
    const resolution = normalizeAiVideoResolution(body.resolution);

    if (!firstFrameUrl) return NextResponse.json({ error: "请先上传首帧图片" }, { status: 400 });
    if (!lastFrameUrl) return NextResponse.json({ error: "请先上传尾帧图片" }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "请描述首尾帧之间的动态衔接过程" }, { status: 400 });

    const totalCost = getAiVideoCreditCost(resolution, duration);
    const jobPayload: GenerationJobPayload = {
      kind: "videoFirstLastFrame",
      publicBaseUrl: getPublicBaseUrlFromRequest(request),
      firstFrameUrl,
      lastFrameUrl,
      prompt,
      title,
      duration,
      resolution,
      aiModel: AI_VIDEO_SEEDANCE_FIRST_LAST_FRAME_MODEL,
      genCount: 1,
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: [firstFrameUrl, lastFrameUrl],
      modelFaceUrl: null,
      referenceUrl: null,
      creditsCost: totalCost,
      aiModel: AI_VIDEO_SEEDANCE_FIRST_LAST_FRAME_MODEL,
      imageSize: `${duration}s`,
      reason: `首尾帧视频 (${AI_VIDEO_SEEDANCE_FIRST_LAST_FRAME_MODEL}, ${duration}s)`,
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
    console.error("[video:first-last-frame] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
