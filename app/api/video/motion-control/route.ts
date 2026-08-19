import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createDebitedGeneration, errorToResponsePayload } from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  normalizeAiVideoAudioMode,
  normalizeAiVideoAspectRatio,
  normalizeAiVideoDuration,
  normalizeAiVideoGenCount,
  normalizeAiVideoModelMode,
  normalizeAiVideoResolution,
} from "@/lib/ai-video";
import {
  clampVideoDuration,
  resolveUpstreamVideoModel,
  resolveVideoSelection,
  supportsVideoMotionControl,
} from "@/lib/api/video-catalog";
import { getEnabledVideoProviders } from "@/lib/api/video-provider";
import { normalizeVideoProviderName } from "@/lib/api/video-provider-registry";
import { getConfiguredVideoCreditCost } from "@/lib/ai-control-plane/server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`video-motion-control:${user.id}`, 12, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }

    const modelImageUrl = typeof body.modelImageUrl === "string" ? body.modelImageUrl.trim() : "";
    const referenceVideoUrl = typeof body.referenceVideoUrl === "string" ? body.referenceVideoUrl.trim() : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const requestedMode = normalizeAiVideoModelMode(body.modelMode, "videoMotion");
    const requestedResolution = normalizeAiVideoResolution(body.resolution, requestedMode);
    const duration = normalizeAiVideoDuration(body.duration);
    const aspectRatio = normalizeAiVideoAspectRatio(body.aspectRatio);
    const genCount = normalizeAiVideoGenCount(body.genCount);
    const audioMode = normalizeAiVideoAudioMode(body.audioMode);
    const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl.trim() : "";
    const audioPrompt = typeof body.audioPrompt === "string" ? body.audioPrompt.trim() : "";

    if (!modelImageUrl) return NextResponse.json({ error: "请先上传主体图片" }, { status: 400 });
    if (!referenceVideoUrl) return NextResponse.json({ error: "请先上传参考动作视频" }, { status: 400 });
    if (audioMode === "custom" && !audioUrl) return NextResponse.json({ error: "请先上传音频或切换为智能音效" }, { status: 400 });

    const provider = normalizeVideoProviderName(body.provider);
    if (!supportsVideoMotionControl(provider)) {
      return NextResponse.json({ error: "当前视频供应商不支持动作模仿，请切换为 Seedance 2.0 模型" }, { status: 400 });
    }
    const enabledProviders = await getEnabledVideoProviders();
    if (!enabledProviders.includes(provider)) {
      return NextResponse.json({ error: "该视频模型未启用，请到后台 /admin/providers 配置" }, { status: 400 });
    }
    const selection = resolveVideoSelection(provider, requestedMode, requestedResolution);
    const modelMode = selection.mode;
    const resolution = selection.resolution;
    const effectiveDuration = clampVideoDuration(provider, duration) as typeof duration;
    const aiModel = resolveUpstreamVideoModel(provider, modelMode, resolution);
    const totalCost = await getConfiguredVideoCreditCost({
      provider,
      modelMode,
      resolution,
      duration: effectiveDuration,
      genCount,
      audioMode,
    });
    const jobPayload: GenerationJobPayload = {
      kind: "videoMotion",
      publicBaseUrl: getPublicBaseUrlFromRequest(request),
      provider,
      modelImageUrl,
      referenceVideoUrl,
      prompt,
      modelMode,
      duration: effectiveDuration,
      resolution,
      aspectRatio,
      audioMode,
      audioUrl: audioMode === "custom" ? audioUrl : undefined,
      audioPrompt,
      generateAudio: audioMode !== "off",
      aiModel,
      genCount,
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: [modelImageUrl],
      modelFaceUrl: null,
      referenceUrl: referenceVideoUrl,
      creditsCost: totalCost,
      aiModel,
      imageSize: `${resolution} · ${aspectRatio} · ${effectiveDuration}s`,
      reason: `动作模仿视频 (${modelMode}, ${aiModel}, ${resolution}, ${aspectRatio}, ${effectiveDuration}s, ${getAudioReasonLabel(audioMode)} × ${genCount})`,
      jobPayload,
      idempotencyKey: request.headers.get("idempotency-key") || "",
      mediaInputs: [
        { url: modelImageUrl, kind: "image" as const },
        { url: referenceVideoUrl, kind: "video" as const },
        ...(audioMode === "custom" && audioUrl ? [{ url: audioUrl, kind: "audio" as const }] : []),
      ],
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
    console.error("[video:motion-control] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

function getAudioReasonLabel(audioMode: string) {
  if (audioMode === "custom") return "custom audio";
  if (audioMode === "off") return "silent";
  return "generated audio";
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
