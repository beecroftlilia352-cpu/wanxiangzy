/**
 * POST /api/tryon — 创建生成任务，立即返回 generation_id
 * GET  /api/tryon?generation_id=xxx — 查询真实进度
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { batchTryOn, getCreditCost, normalizeImageSize, type LingyaModel, type AspectRatio, type ImageSize } from "@/lib/api/lingya";
import { resolveImageInputs } from "@/lib/api/image-inputs.server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const body = await request.json();
    const {
      clothing_urls, model_face_url, reference_url,
      ai_model, aspect_ratio, image_size, style, gen_count, raw_prompt,
    } = body;

    const genCount = Math.min(Math.max(gen_count || 1, 1), 4);

    if (!clothing_urls?.length) {
      return NextResponse.json({ error: "缺少 clothing_urls" }, { status: 400 });
    }

    const model: LingyaModel = ai_model || "gpt-image-2";
    const size: ImageSize = normalizeImageSize(model, image_size || "1K", aspect_ratio || "3:4");
    const costPerImage = getCreditCost(model, size);
    const totalCost = costPerImage * clothing_urls.length * genCount;

    // 检查积分
    const { data: profile } = await supabase
      .from("profiles").select("credits").eq("id", user.id).single();

    if (!profile || profile.credits < totalCost) {
      return NextResponse.json({
        error: `积分不足。需要 ${totalCost}，余额 ${profile?.credits ?? 0}`,
        required: totalCost,
        balance: profile?.credits ?? 0,
      }, { status: 402 });
    }

    // 扣除积分
    const newBalance = profile.credits - totalCost;
    await supabase.from("profiles").update({ credits: newBalance }).eq("id", user.id);

    // 创建记录
    const { data: gen, error: insertError } = await supabase.from("generations").insert({
      user_id: user.id, clothing_urls, model_face_url: model_face_url || null,
      reference_url: reference_url || null, status: "processing_tryon",
      credits_used: totalCost, credits_cost: totalCost, ai_model: model, image_size: size,
    }).select("id").single();

    if (insertError) {
      // 创建记录失败，退还积分
      await supabase.from("profiles").update({ credits: profile.credits }).eq("id", user.id);
      throw new Error(`创建记录失败: ${insertError.message}`);
    }

    await supabase.from("credit_logs").insert({
      user_id: user.id, amount: -totalCost, balance: newBalance,
      reason: `生成 ${clothing_urls.length} 张 (${model}, ${size})`,
      generation_id: gen.id,
    });

    // 启动后台任务（不等待完成）
    runPipeline(
      gen.id, clothing_urls, model_face_url, reference_url,
      model, aspect_ratio, size, style, profile.credits, user.id, genCount, raw_prompt
    ).catch((err) => {
      console.error("[tryon] pipeline error:", err);
    });

    // 立即返回
    return NextResponse.json({
      generation_id: gen!.id,
      credits_cost: totalCost,
      credits_remaining: newBalance,
      status: "processing_tryon",
    });

  } catch (err: any) {
    console.error("[tryon] POST error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const generationId = request.nextUrl.searchParams.get("generation_id");
    if (!generationId) return NextResponse.json({ error: "Missing generation_id" }, { status: 400 });

    const { data: gen } = await supabase
      .from("generations").select("*").eq("id", generationId).eq("user_id", user.id).single();

    if (!gen) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      status: gen.status,
      result_urls: gen.result_urls || [],
      error: gen.error_message,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ---- 后台 Pipeline ----
async function runPipeline(
  generationId: string,
  clothingUrls: string[],
  modelFaceUrl: string | undefined,
  referenceUrl: string | undefined,
  aiModel: LingyaModel,
  aspectRatio: AspectRatio | undefined,
  imageSize: ImageSize,
  style: string | undefined,
  originalCredits: number,
  userId: string,
  genCount: number = 1,
  rawPrompt?: string,
) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const update = (data: Record<string, any>) =>
    supabase.from("generations").update(data).eq("id", generationId);

  try {
    await update({ status: "processing_tryon" });

    // 生成 genCount 次，每次独立调用
    const allResultUrls: string[] = [];

    for (let i = 0; i < genCount; i++) {
      const imageInputs = await resolveImageInputs({ clothingUrls, modelFaceUrl, referenceUrl });
      const { resultUrls } = await batchTryOn({
        model: aiModel,
        clothingUrls: imageInputs.clothingUrls,
        modelFaceUrl: imageInputs.modelFaceUrl,
        referenceUrl: imageInputs.referenceUrl,
        aspect_ratio: aspectRatio || "3:4",
        image_size: imageSize,
        style,
        raw_prompt: rawPrompt,
      });
      allResultUrls.push(...resultUrls);
    }

    await update({
      status: "completed",
      result_urls: allResultUrls,
      completed_at: new Date().toISOString(),
    });

  } catch (err: any) {
    console.error(`[pipeline] failed for ${generationId}:`, err);

    const refundAmount = clothingUrls.length * getCreditCost(aiModel, imageSize) * genCount;
    await supabase.from("profiles").update({ credits: originalCredits }).eq("id", userId);
    await supabase.from("credit_logs").insert({
      user_id: userId, amount: refundAmount, balance: originalCredits,
      reason: "生成失败退还", generation_id: generationId,
    });

    await update({ status: "failed", error_message: err.message });
  }
}
