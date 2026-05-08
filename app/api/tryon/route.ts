/**
 * POST /api/tryon — 创建生成任务，立即返回 generation_id
 * GET  /api/tryon?generation_id=xxx — 查询真实进度
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getCreditCost, normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import {
  createDebitedGeneration,
  errorToResponsePayload,
} from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { normalizeAutoDesignSettings, normalizeSceneMode } from "@/lib/tryon-scene";
import { normalizeTryOnClothingMode, normalizeTryOnClothingRole } from "@/lib/tryon-upload-rules";
import {
  TRYON_GARMENT_CATEGORY_LABELS,
  normalizeTryOnAgeGroup,
  normalizeTryOnGarmentCategory,
  normalizeTryOnGarmentAudience,
} from "@/lib/tryon-prompt";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-validated below
    let body: any;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
    const {
      clothing_urls, model_face_url, reference_url,
      ai_model, aspect_ratio, image_size, style, gen_count, raw_prompt, scene_mode, auto_design,
      clothing_mode, clothing_roles, garment_audience, age_group, garment_category, is_intimate_garment,
    } = body;

    const genCount = Math.min(Math.max(Number(gen_count) || 1, 1), 4);

    if (!Array.isArray(clothing_urls) || !clothing_urls.length) {
      return NextResponse.json({ error: "缺少 clothing_urls" }, { status: 400 });
    }
    if (clothing_urls.length > 5 || clothing_urls.some((url) => typeof url !== "string")) {
      return NextResponse.json({ error: "clothing_urls 无效" }, { status: 400 });
    }
    if (
      (model_face_url && typeof model_face_url !== "string") ||
      (reference_url && typeof reference_url !== "string")
    ) {
      return NextResponse.json({ error: "图片参数无效" }, { status: 400 });
    }

    const model: LingyaModel = normalizeLingyaModel(ai_model);
    const aspectRatio = normalizeAspectRatio(aspect_ratio);
    const size: ImageSize = normalizeImageSize(model, image_size || "1K", aspectRatio);
    const costPerImage = getCreditCost(model, size, aspectRatio);
    const totalCost = costPerImage * genCount;
    const sceneMode = normalizeSceneMode(scene_mode);
    const autoDesign = sceneMode === "auto_design" ? normalizeAutoDesignSettings(auto_design) : undefined;
    const clothingMode = normalizeTryOnClothingMode(clothing_mode || (clothing_urls.length > 1 ? "multi" : "single"));
    const clothingRoles = Array.isArray(clothing_roles)
      ? clothing_urls.map((_: string, index: number) => normalizeTryOnClothingRole(
        clothing_roles[index],
        clothingMode === "multi" ? index === 0 ? "upper" : index === 1 ? "lower" : "extra" : "single"
      ))
      : clothing_urls.map((_: string, index: number) => clothingMode === "multi" ? index === 0 ? "upper" : index === 1 ? "lower" : "extra" : "single");
    const garmentAudience = normalizeTryOnGarmentAudience(garment_audience);
    const ageGroup = normalizeTryOnAgeGroup(age_group);
    const garmentCategory = normalizeTryOnGarmentCategory(is_intimate_garment ? "intimate" : garment_category);
    if (garmentCategory === "intimate" && ageGroup !== "adult") {
      return NextResponse.json({ error: "内衣/泳衣类服装仅支持成人模特生成，请将年龄段改为成人后再提交" }, { status: 400 });
    }
    const jobPayload: GenerationJobPayload = {
      kind: "tryon",
      publicBaseUrl: getPublicBaseUrlFromRequest(request),
      clothingUrls: clothing_urls,
      clothingMode,
      clothingRoles,
      garmentAudience,
      ageGroup,
      garmentCategory,
      modelFaceUrl: model_face_url || null,
      referenceUrl: sceneMode === "auto_design" ? null : reference_url || null,
      aiModel: model,
      aspectRatio,
      imageSize: size,
      style,
      genCount,
      rawPrompt: raw_prompt,
      sceneMode,
      autoDesign,
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: clothing_urls,
      modelFaceUrl: model_face_url || null,
      referenceUrl: jobPayload.referenceUrl,
      creditsCost: totalCost,
      aiModel: model,
      imageSize: size,
      reason: `生成 ${genCount} 张，输入 ${clothing_urls.length} 件服装 (${model}, ${size}, ${TRYON_GARMENT_CATEGORY_LABELS[garmentCategory]})`,
      jobPayload,
    });

    startGenerationJob(debit.generationId);

    // 立即返回
    return NextResponse.json({
      generation_id: debit.generationId,
      credits_cost: totalCost,
      credits_remaining: debit.creditsRemaining,
      status: "processing_tryon",
    });

  } catch (err: unknown) {
    logger.error("[tryon] POST error:", err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
