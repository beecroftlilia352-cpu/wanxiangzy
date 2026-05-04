/**
 * POST /api/agent/generate
 * 通用文生图 / 图生图
 * 不走模块特定路由，直接调用 lingya generateImage API
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServerSupabaseAdmin } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { createDebitedGeneration, errorToResponsePayload, failGenerationWithRefund } from "@/lib/api/credits";
import { normalizeGeneratedImageUrl } from "@/lib/api/image-result";
import { generateImage, getCreditCost, normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { persistGeneratedImageUrls } from "@/lib/api/result-image-storage";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`agent-generate:${user.id}`, 10, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json().catch(() => ({}));
    const {
      prompt,
      images,
      model: rawModel,
      aspectRatio: rawRatio,
      imageSize: rawSize,
      count: rawCount,
    } = body as {
      prompt?: string;
      images?: string[];
      model?: string;
      aspectRatio?: string;
      imageSize?: string;
      count?: number;
    };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "缺少提示词" }, { status: 400 });
    }

    const model: LingyaModel = normalizeLingyaModel(rawModel);
    const aspectRatio: AspectRatio = normalizeAspectRatio(rawRatio || "3:4");
    const imageSize: ImageSize = normalizeImageSize(model, (rawSize as ImageSize) || "1K", aspectRatio);
    const count = Math.min(Math.max(Number(rawCount) || 1, 1), 4);
    const costPerImage = getCreditCost(model, imageSize, aspectRatio);
    const totalCost = costPerImage * count;

    // 扣减积分
    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: Array.isArray(images) ? images : [],
      creditsCost: totalCost,
      aiModel: model,
      imageSize,
      reason: `通用生图 (${model}, ${imageSize})`,
      jobPayload: { kind: "general", prompt: prompt.trim(), images: images || [], aiModel: model, aspectRatio, imageSize, genCount: count },
    });

    let resultUrls: string[];
    let resultPrompt = prompt.trim();
    try {
      // 调用生图 API。若上游失败或返回不可渲染图片，必须退还本次积分。
      const rawResultUrls: string[] = [];
      for (let i = 0; i < count; i++) {
        const result = await generateImage({
          model,
          prompt: prompt.trim(),
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          image: Array.isArray(images) ? images : undefined,
        });
        rawResultUrls.push(normalizeGeneratedImageUrl(result));
        resultPrompt = result.prompt || resultPrompt;
      }
      resultUrls = await persistGeneratedImageUrls(rawResultUrls, debit.generationId, {
        forceServerDownload: rawResultUrls.some((url) => url.startsWith("http")),
      });
    } catch (generationErr) {
      const message = generationErr instanceof Error ? generationErr.message : "通用生图失败";
      await failGenerationWithRefund(createServerSupabaseAdmin(), {
        userId: user.id,
        generationId: debit.generationId,
        amount: totalCost,
        reason: "通用生图失败退还",
        errorMessage: message,
      });
      throw generationErr;
    }

    // 更新 generation 状态为完成
    await supabase
      .from("generations")
      .update({ status: "completed", result_urls: resultUrls, completed_at: new Date().toISOString() })
      .eq("id", debit.generationId);

    return NextResponse.json({
      generation_id: debit.generationId,
      result_urls: resultUrls,
      credits_cost: totalCost,
      credits_remaining: debit.creditsRemaining,
      prompt: resultPrompt,
    });
  } catch (err: unknown) {
    console.error("[agent-generate] error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}
