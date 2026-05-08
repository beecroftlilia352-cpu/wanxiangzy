import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getCreditCost,
  normalizeAspectRatio,
  normalizeImageSize,
  normalizeLingyaModel,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import { createDebitedGeneration, errorToResponsePayload } from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 60;

type GeneralImageMode = "text-to-image" | "image-to-image";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`general-image:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
    }

    const mode = normalizeMode(body.mode);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return NextResponse.json({ error: "请输入提示词" }, { status: 400 });

    const referenceUrls = normalizeReferenceUrls(body.reference_urls);
    if (mode === "image-to-image" && referenceUrls.length === 0) {
      return NextResponse.json({ error: "请先上传参考图" }, { status: 400 });
    }

    const model: LingyaModel = normalizeLingyaModel(body.ai_model || "gpt-image-2");
    const aspectRatio = normalizeAspectRatio(body.aspect_ratio || "3:4");
    const size: ImageSize = normalizeImageSize(model, (typeof body.image_size === "string" ? body.image_size : "1K") as ImageSize, aspectRatio);
    const genCount = Math.min(Math.max(Math.floor(Number(body.gen_count) || 1), 1), 4);
    const totalCost = getCreditCost(model, size, aspectRatio) * genCount;

    const jobPayload: GenerationJobPayload = {
      kind: "generalImage",
      mode,
      referenceUrls: mode === "image-to-image" ? referenceUrls : [],
      aiModel: model,
      aspectRatio,
      imageSize: size,
      prompt,
      genCount,
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: jobPayload.referenceUrls,
      modelFaceUrl: null,
      referenceUrl: jobPayload.referenceUrls[0] || null,
      creditsCost: totalCost,
      aiModel: model,
      imageSize: size,
      reason: `${mode === "text-to-image" ? "通用文生图" : "通用图生图"} ${genCount} 张 (${model}, ${size})`,
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
    console.error("[general-image] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}

function normalizeMode(value: unknown): GeneralImageMode {
  return value === "image-to-image" ? "image-to-image" : "text-to-image";
}

function normalizeReferenceUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter((url) => /^https?:\/\//i.test(url) || /^data:image\//i.test(url))
    .slice(0, 8);
}
