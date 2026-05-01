import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCreditCost, normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import {
  createDebitedGeneration,
  errorToResponsePayload,
} from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const { reference_urls, hair_reference_url, hair_color_reference_url, ai_model, aspect_ratio, image_size, prompt, gen_count } = await request.json();
    if (!Array.isArray(reference_urls) || !reference_urls.length) return NextResponse.json({ error: "请上传 1-3 张参考图" }, { status: 400 });
    if (reference_urls.length > 3) return NextResponse.json({ error: "参考图最多 3 张" }, { status: 400 });
    if (reference_urls.some((url) => typeof url !== "string")) return NextResponse.json({ error: "参考图无效" }, { status: 400 });
    if (
      (hair_reference_url && typeof hair_reference_url !== "string") ||
      (hair_color_reference_url && typeof hair_color_reference_url !== "string")
    ) {
      return NextResponse.json({ error: "发型或发色参考图无效" }, { status: 400 });
    }
    if (!prompt?.trim()) return NextResponse.json({ error: "缺少提示词" }, { status: 400 });

    const model: LingyaModel = normalizeLingyaModel(ai_model);
    const aspectRatio: AspectRatio = normalizeAspectRatio(aspect_ratio);
    const size: ImageSize = normalizeImageSize(model, image_size || "1K", aspectRatio);
    const genCount = Math.min(Math.max(Number(gen_count) || 1, 1), 4);
    const costPerImage = getCreditCost(model, size, aspectRatio);
    const totalCost = costPerImage * genCount;
    const jobPayload: GenerationJobPayload = {
      kind: "model",
      referenceUrls: reference_urls,
      hairReferenceUrl: hair_reference_url || null,
      hairColorReferenceUrl: hair_color_reference_url || null,
      aiModel: model,
      aspectRatio,
      imageSize: size,
      prompt,
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
    });

    startGenerationJob(debit.generationId);

    return NextResponse.json({
      generation_id: debit.generationId,
      credits_cost: totalCost,
      credits_remaining: debit.creditsRemaining,
      status: "processing_tryon",
    });
  } catch (err: any) {
    console.error("[model] POST error:", err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
