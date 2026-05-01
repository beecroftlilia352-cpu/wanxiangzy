import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCreditCost, normalizeImageSize, normalizeLingyaModel, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import {
  createDebitedGeneration,
  errorToResponsePayload,
} from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";

const POSE_ASPECT_RATIO = "3:4" as const;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
    const { main_image_url, ai_model, image_size, prompt } = body;
    if (!main_image_url || typeof main_image_url !== "string") return NextResponse.json({ error: "缺少主图" }, { status: 400 });
    if (!prompt?.trim()) return NextResponse.json({ error: "缺少提示词" }, { status: 400 });

    const model: LingyaModel = normalizeLingyaModel(ai_model);
    const size: ImageSize = normalizeImageSize(model, image_size || "1K", POSE_ASPECT_RATIO);
    const totalCost = getCreditCost(model, size, POSE_ASPECT_RATIO);
    const jobPayload: GenerationJobPayload = {
      kind: "pose",
      mainImageUrl: main_image_url,
      aiModel: model,
      imageSize: size,
      prompt,
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: [main_image_url],
      modelFaceUrl: null,
      referenceUrl: null,
      creditsCost: totalCost,
      aiModel: model,
      imageSize: size,
      reason: `姿势裂变 (${model}, ${size})`,
      jobPayload,
    });

    startGenerationJob(debit.generationId);

    return NextResponse.json({
      generation_id: debit.generationId,
      credits_cost: totalCost,
      credits_remaining: debit.creditsRemaining,
      status: "processing_tryon",
    });
  } catch (err: any) {
    console.error("[pose] POST error:", err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
