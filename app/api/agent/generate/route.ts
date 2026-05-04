/**
 * POST /api/agent/generate
 * 通用文生图 / 图生图
 * 不走模块特定路由，直接调用 lingya generateImage API
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { createDebitedGeneration, errorToResponsePayload } from "@/lib/api/credits";
import { generateImage, getCreditCost, normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";

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
    } = body as {
      prompt?: string;
      images?: string[];
      model?: string;
      aspectRatio?: string;
      imageSize?: string;
    };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "缺少提示词" }, { status: 400 });
    }

    const model: LingyaModel = normalizeLingyaModel(rawModel);
    const aspectRatio: AspectRatio = normalizeAspectRatio(rawRatio || "3:4");
    const imageSize: ImageSize = normalizeImageSize(model, (rawSize as ImageSize) || "1K", aspectRatio);
    const costPerImage = getCreditCost(model, imageSize, aspectRatio);

    // 扣减积分
    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: Array.isArray(images) ? images : [],
      creditsCost: costPerImage,
      aiModel: model,
      imageSize,
      reason: `通用生图 (${model}, ${imageSize})`,
      jobPayload: { kind: "general", prompt: prompt.trim(), images: images || [], aiModel: model, aspectRatio, imageSize },
    });

    // 调用生图 API
    const result = await generateImage({
      model,
      prompt: prompt.trim(),
      aspect_ratio: aspectRatio,
      image_size: imageSize,
      image: Array.isArray(images) ? images : undefined,
    });

    if (!result.url && !result.b64_json) {
      return NextResponse.json({ error: "生图失败，未返回结果" }, { status: 502 });
    }

    const resultUrl = result.url || `data:image/png;base64,${result.b64_json}`;

    // 更新 generation 状态为完成
    await supabase
      .from("generations")
      .update({ status: "completed", result_urls: [resultUrl], completed_at: new Date().toISOString() })
      .eq("id", debit.generationId);

    return NextResponse.json({
      generation_id: debit.generationId,
      result_urls: [resultUrl],
      credits_cost: costPerImage,
      credits_remaining: debit.creditsRemaining,
      prompt: result.prompt || prompt.trim(),
    });
  } catch (err: unknown) {
    console.error("[agent-generate] error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}
