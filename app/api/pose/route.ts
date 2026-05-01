import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateImage, getCreditCost, normalizeImageSize, type LingyaModel, type ImageSize } from "@/lib/api/lingya";
import { resolveImageInputs } from "@/lib/api/image-inputs.server";

const POSE_ASPECT_RATIO = "3:4" as const;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const { main_image_url, ai_model, image_size, prompt } = await request.json();
    if (!main_image_url) return NextResponse.json({ error: "缺少主图" }, { status: 400 });
    if (!prompt?.trim()) return NextResponse.json({ error: "缺少提示词" }, { status: 400 });

    const model: LingyaModel = ai_model || "gpt-image-2";
    const size: ImageSize = normalizeImageSize(model, image_size || "1K", POSE_ASPECT_RATIO);
    const totalCost = getCreditCost(model, size, POSE_ASPECT_RATIO);

    const { data: profile } = await supabase
      .from("profiles").select("credits").eq("id", user.id).single();

    if (!profile || profile.credits < totalCost) {
      return NextResponse.json({
        error: `积分不足。需要 ${totalCost}，余额 ${profile?.credits ?? 0}`,
        required: totalCost,
        balance: profile?.credits ?? 0,
      }, { status: 402 });
    }

    const newBalance = profile.credits - totalCost;
    await supabase.from("profiles").update({ credits: newBalance }).eq("id", user.id);

    const { data: gen, error: insertError } = await supabase.from("generations").insert({
      user_id: user.id,
      clothing_urls: [main_image_url],
      model_face_url: null,
      reference_url: null,
      status: "processing_tryon",
      credits_used: totalCost,
      credits_cost: totalCost,
      ai_model: model,
      image_size: size,
    }).select("id").single();

    if (insertError) {
      await supabase.from("profiles").update({ credits: profile.credits }).eq("id", user.id);
      throw new Error(`创建记录失败: ${insertError.message}`);
    }

    await supabase.from("credit_logs").insert({
      user_id: user.id,
      amount: -totalCost,
      balance: newBalance,
      reason: `姿势裂变 (${model}, ${size})`,
      generation_id: gen.id,
    });

    runPosePipeline(gen.id, main_image_url, model, size, prompt, profile.credits, user.id)
      .catch((err) => console.error("[pose] pipeline error:", err));

    return NextResponse.json({
      generation_id: gen.id,
      credits_cost: totalCost,
      credits_remaining: newBalance,
      status: "processing_tryon",
    });
  } catch (err: any) {
    console.error("[pose] POST error:", err);
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

async function runPosePipeline(
  generationId: string,
  mainImageUrl: string,
  model: LingyaModel,
  imageSize: ImageSize,
  prompt: string,
  originalCredits: number,
  userId: string,
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
    const imageInputs = await resolveImageInputs({ clothingUrls: [mainImageUrl] });

    const result = await generateImage({
      model,
      prompt,
      aspect_ratio: POSE_ASPECT_RATIO,
      image: imageInputs.clothingUrls,
      image_size: imageSize,
    });

    const resultUrl = result.url || result.b64_json;
    if (!resultUrl) throw new Error("图片生成接口未返回结果 URL");

    await update({
      status: "completed",
      result_urls: [resultUrl],
      completed_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error(`[pose] failed for ${generationId}:`, err);
    const refundAmount = getCreditCost(model, imageSize, POSE_ASPECT_RATIO);
    await supabase.from("profiles").update({ credits: originalCredits }).eq("id", userId);
    await supabase.from("credit_logs").insert({
      user_id: userId,
      amount: refundAmount,
      balance: originalCredits,
      reason: "姿势裂变失败退款",
      generation_id: generationId,
    });
    await update({ status: "failed", error_message: err.message });
  }
}
