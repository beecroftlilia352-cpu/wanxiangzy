import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateImage, getCreditCost, normalizeImageSize, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { resolveImageInputs } from "@/lib/api/image-inputs.server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const { reference_urls, hair_reference_url, hair_color_reference_url, ai_model, aspect_ratio, image_size, prompt, gen_count } = await request.json();
    if (!reference_urls?.length) return NextResponse.json({ error: "请上传 1-3 张参考图" }, { status: 400 });
    if (reference_urls.length > 3) return NextResponse.json({ error: "参考图最多 3 张" }, { status: 400 });
    if (!prompt?.trim()) return NextResponse.json({ error: "缺少提示词" }, { status: 400 });

    const model: LingyaModel = ai_model || "gpt-image-2";
    const aspectRatio: AspectRatio = aspect_ratio || "3:4";
    const size: ImageSize = normalizeImageSize(model, image_size || "1K", aspectRatio);
    const genCount = Math.min(Math.max(gen_count || 1, 1), 4);
    const costPerImage = getCreditCost(model, size, aspectRatio);
    const totalCost = costPerImage * genCount;

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
      clothing_urls: reference_urls,
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
      reason: `专属模特 ${genCount} 张 (${model}, ${size})`,
      generation_id: gen.id,
    });

    runModelPipeline(gen.id, reference_urls, hair_reference_url || null, hair_color_reference_url || null, model, aspectRatio, size, prompt, profile.credits, user.id, genCount)
      .catch((err) => console.error("[model] pipeline error:", err));

    return NextResponse.json({
      generation_id: gen.id,
      credits_cost: totalCost,
      credits_remaining: newBalance,
      status: "processing_tryon",
    });
  } catch (err: any) {
    console.error("[model] POST error:", err);
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

async function runModelPipeline(
  generationId: string,
  referenceUrls: string[],
  hairReferenceUrl: string | null,
  hairColorReferenceUrl: string | null,
  model: LingyaModel,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  prompt: string,
  originalCredits: number,
  userId: string,
  genCount: number,
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
    const extraReferences = [hairReferenceUrl, hairColorReferenceUrl].filter(Boolean) as string[];
    const imageInputs = await resolveImageInputs({
      clothingUrls: [...referenceUrls, ...extraReferences],
    });
    const resultUrls: string[] = [];

    for (let i = 0; i < genCount; i++) {
      const result = await generateImage({
        model,
        prompt,
        aspect_ratio: aspectRatio,
        image: imageInputs.clothingUrls,
        image_size: imageSize,
      });

      const resultUrl = result.url || result.b64_json;
      if (!resultUrl) throw new Error("图片生成接口未返回结果 URL");
      resultUrls.push(resultUrl);
    }

    await update({
      status: "completed",
      result_urls: resultUrls,
      completed_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error(`[model] failed for ${generationId}:`, err);
    const refundAmount = getCreditCost(model, imageSize, aspectRatio) * genCount;
    await supabase.from("profiles").update({ credits: originalCredits }).eq("id", userId);
    await supabase.from("credit_logs").insert({
      user_id: userId,
      amount: refundAmount,
      balance: originalCredits,
      reason: "专属模特失败退款",
      generation_id: generationId,
    });
    await update({ status: "failed", error_message: err.message });
  }
}
