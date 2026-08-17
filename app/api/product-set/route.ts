import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { getConfiguredImageCreditCost } from "@/lib/ai-control-plane/server";
import { createDebitedGeneration, errorToResponsePayload } from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  createProductSetModuleResult,
  normalizeProductSetCreationMode,
  normalizeProductSetImageType,
  normalizeProductSetModuleOverrides,
  normalizeProductSetProductProfile,
  normalizeProductSetSettings,
  resolveProductSetTemplates,
  type ProductSetCustomTemplate,
} from "@/lib/product-set";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`product-set:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
    }

    const productImageUrls = Array.isArray(body.product_image_urls)
      ? body.product_image_urls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
      : [];
    if (!productImageUrls.length) return NextResponse.json({ error: "请先上传商品图" }, { status: 400 });
    if (productImageUrls.length > 3) return NextResponse.json({ error: "商品图最多上传 3 张" }, { status: 400 });

    const model: LingyaModel = normalizeLingyaModel(body.ai_model);
    const aspectRatio = normalizeAspectRatio(body.aspect_ratio || "auto");
    const imageSize: ImageSize = normalizeImageSize(model, (typeof body.image_size === "string" ? body.image_size : "1K") as ImageSize, aspectRatio);
    const mode = normalizeProductSetCreationMode(body.mode);
    const imageType = normalizeProductSetImageType(body.image_type);
    const settings = normalizeProductSetSettings(body.settings);
    const productInfo = typeof body.product_info === "string" ? body.product_info.trim().slice(0, 2400) : "";
    const productProfile = normalizeProductSetProductProfile(body.product_profile, productInfo);
    const selectedTemplateIds = Array.isArray(body.selected_template_ids)
      ? body.selected_template_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
      : [];
    const customTemplates = Array.isArray(body.custom_templates)
      ? body.custom_templates.filter(isCustomTemplate).slice(0, 10)
      : [];
    const moduleOverrides = normalizeProductSetModuleOverrides(body.module_overrides);
    const requestedGenCount = Math.min(Math.max(Number(body.gen_count) || 1, 1), 8);
    const allTemplates = resolveProductSetTemplates({
      mode,
      imageType,
      selectedTemplateIds,
      customTemplates,
      genCount: requestedGenCount,
      productProfile,
      settings,
      moduleOverrides,
    });
    const rawRegenerateIndex = Number(body.regenerate_index);
    const regenerateIndex = Number.isFinite(rawRegenerateIndex) ? Math.floor(rawRegenerateIndex) : null;
    if (regenerateIndex !== null && (regenerateIndex < 0 || regenerateIndex >= allTemplates.length)) {
      return NextResponse.json({ error: "重生图片序号无效" }, { status: 400 });
    }
    const templates = regenerateIndex !== null ? allTemplates.slice(regenerateIndex, regenerateIndex + 1) : allTemplates;
    const initialModuleResults = (regenerateIndex !== null
      ? allTemplates.map((template, index) => ({ template, index })).filter((item) => item.index === regenerateIndex)
      : allTemplates.map((template, index) => ({ template, index }))
    ).map(({ template, index }) => createProductSetModuleResult(template, index, {
      promptVariant: settings.stylePackId || "auto",
      updatedAt: new Date().toISOString(),
    }));

    if (!templates.length) {
      return NextResponse.json({ error: "请至少选择 1 个套图样式" }, { status: 400 });
    }

    const genCount = templates.length;
    const unitCost = await getConfiguredImageCreditCost(model, imageSize);
    const totalCost = templates.length * unitCost;
    const prompt = productInfo || "根据上传商品多视角图生成商品套图。";

    const jobPayload: GenerationJobPayload = {
      kind: "productSet",
      publicBaseUrl: getPublicBaseUrlFromRequest(request),
      productImageUrls,
      productInfo,
      productProfile,
      mode,
      imageType,
      settings,
      selectedTemplateIds,
      customTemplates,
      moduleOverrides,
      moduleResults: initialModuleResults,
      regenerateIndex: regenerateIndex ?? undefined,
      aiModel: model,
      aspectRatio,
      imageSize,
      prompt,
      genCount: requestedGenCount,
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: productImageUrls,
      modelFaceUrl: null,
      referenceUrl: null,
      creditsCost: totalCost,
      aiModel: model,
      imageSize,
      reason: `商品套图 ${genCount} 张 (${regenerateIndex !== null ? "单张重生" : mode === "smart" ? "智能" : "自定义"}, ${imageType === "main" ? "主图辅图" : "详情页"}, 模板比例, ${model}, ${imageSize})`,
      jobPayload,
    });

    startGenerationJob(debit.generationId);

    return NextResponse.json({
      generation_id: debit.generationId,
      credits_cost: totalCost,
      credits_remaining: debit.creditsRemaining,
      module_results: initialModuleResults,
      status: "processing_tryon",
    });
  } catch (err: unknown) {
    console.error("[product-set] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}

function isCustomTemplate(value: unknown): value is ProductSetCustomTemplate {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" &&
    typeof item.name === "string" &&
    (item.imageType === "main" || item.imageType === "details") &&
    typeof item.typeDescription === "string";
}
