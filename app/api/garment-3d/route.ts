import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  generateImage,
  getCreditCost,
  normalizeImageSize,
  type AspectRatio,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import { resolveImageInputs } from "@/lib/api/image-inputs.server";

type GarmentType = "上装" | "下装" | "连体衣" | "其他";
type OutputMode = "reference" | "prompt";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const {
      garment_url,
      garment_type,
      custom_garment_type,
      output_mode,
      reference_url,
      ai_model,
      aspect_ratio,
      image_size,
      prompt,
      final_prompt,
      gen_count,
    } = await request.json();

    if (!garment_url) return NextResponse.json({ error: "请上传服装图" }, { status: 400 });
    if (!prompt?.trim() && !final_prompt?.trim()) return NextResponse.json({ error: "缺少提示词" }, { status: 400 });

    const model: LingyaModel = ai_model || "gpt-image-2";
    const aspectRatio: AspectRatio = aspect_ratio === "1:1" ? "1:1" : "3:4";
    const size: ImageSize = normalizeImageSize(model, image_size || "1K", aspectRatio);
    const genCount = Math.min(Math.max(Number(gen_count) || 1, 1), 4);
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

    const finalGarmentType = garment_type === "其他"
      ? custom_garment_type?.trim() || "其他服装"
      : garment_type || "服装";
    const mode: OutputMode = output_mode === "reference" ? "reference" : "prompt";

    const { data: gen, error: insertError } = await supabase.from("generations").insert({
      user_id: user.id,
      clothing_urls: [garment_url],
      model_face_url: null,
      reference_url: mode === "reference" ? reference_url || null : null,
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
      reason: `服装转3D ${genCount} 张(${model}, ${size})`,
      generation_id: gen.id,
    });

    const resultUrls = await runGarment3dPipeline({
      generationId: gen.id,
      garmentUrl: garment_url,
      referenceUrl: mode === "reference" ? reference_url || null : null,
      model,
      aspectRatio,
      imageSize: size,
      prompt: final_prompt?.trim() || buildServerPrompt({
        garmentType: finalGarmentType,
        outputMode: mode,
        hasReference: !!reference_url && mode === "reference",
        userPrompt: prompt,
      }),
      originalCredits: profile.credits,
      userId: user.id,
      genCount,
    });

    return NextResponse.json({
      generation_id: gen.id,
      credits_cost: totalCost,
      credits_remaining: newBalance,
      status: "completed",
      result_urls: resultUrls,
    });
  } catch (err: any) {
    console.error("[garment-3d] POST error:", err);
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

async function runGarment3dPipeline(params: {
  generationId: string;
  garmentUrl: string;
  referenceUrl: string | null;
  model: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  prompt: string;
  originalCredits: number;
  userId: string;
  genCount: number;
}) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const update = (data: Record<string, any>) =>
    supabase.from("generations").update(data).eq("id", params.generationId);

  try {
    await update({ status: "processing_tryon" });
    const imageInputs = await resolveImageInputs({
      clothingUrls: [params.garmentUrl, ...(params.referenceUrl ? [params.referenceUrl] : [])],
    });
    const resultUrls: string[] = [];

    for (let i = 0; i < params.genCount; i++) {
      const result = await generateImage({
        model: params.model,
        prompt: params.prompt,
        aspect_ratio: params.aspectRatio,
        image: imageInputs.clothingUrls,
        image_size: params.imageSize,
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
    return resultUrls;
  } catch (err: any) {
    console.error(`[garment-3d] failed for ${params.generationId}:`, err);
    const refundAmount = getCreditCost(params.model, params.imageSize, params.aspectRatio) * params.genCount;
    await supabase.from("profiles").update({ credits: params.originalCredits }).eq("id", params.userId);
    await supabase.from("credit_logs").insert({
      user_id: params.userId,
      amount: refundAmount,
      balance: params.originalCredits,
      reason: "服装转3D失败退款",
      generation_id: params.generationId,
    });
    await update({ status: "failed", error_message: err.message });
    throw err;
  }
}

function buildServerPrompt(params: {
  garmentType: string;
  outputMode: OutputMode;
  hasReference: boolean;
  userPrompt: string;
}) {
  const roles = params.hasReference
    ? "图像角色：图1是用户上传的服装图，图2是3D立体服装参考图。"
    : "图像角色：图1是用户上传的服装图。";
  const referenceLine = params.hasReference
    ? "参考图2的服装立体感、袖身厚度、阴影结构、空间角度、背景风格和棚拍质感，但不要复制图2的颜色、图案、文字或具体款式。"
    : "根据用户提示生成类似穿在人身上的立体效果，使用干净白色背景。";
  const backgroundLine = params.hasReference
    ? "背景参考图2的背景风格、明暗和空间感。"
    : "背景使用干净白色棚拍背景。";

  return `${roles} 任务：将图1的${params.garmentType}从平面图或人台图转换为无真人、无头部、无脸、无手的3D立体服装展示图。${referenceLine} 严格保留图1服装的版型、颜色、材质、纹理、图案、纽扣、拉链、口袋、帽绳、袖口、裤腰、裤脚等细节。${backgroundLine} 主体居中，边缘干净，真实商业棚拍质感。${params.userPrompt.trim()} 负面约束：不要生成真人身体、不要生成模特脸、不要多件衣服、不要改变衣服品类、不要扭曲文字和 logo、不要改变主要颜色。`;
}
