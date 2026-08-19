import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  normalizeAspectRatio,
  normalizeImageSize,
  normalizeLingyaModel,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import { getConfiguredImageCreditCost } from "@/lib/ai-control-plane/server";
import { createDebitedGeneration, errorToResponsePayload } from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { buildOutfitFusionRuntimePlan, type OutfitFusionAsset, type OutfitFusionConfig } from "@/lib/outfit-fusion";
import {
  containsInlineImageUrl,
  findDisallowedProductionImageInputs,
  isGeneralImageReferenceUrl,
  normalizeGeneralImageReferenceUrls,
} from "@/lib/api/general-image-inputs";

export const maxDuration = 60;

type GeneralImageMode = "text-to-image" | "image-to-image";
type GeneralImageModuleKind = "generalImage" | "outfitFusion";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`general-image:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
    }

    const mode = normalizeMode(body.mode);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const userPrompt = typeof body.user_prompt === "string" && body.user_prompt.trim()
      ? body.user_prompt.trim().slice(0, 1200)
      : typeof body.input_prompt === "string" && body.input_prompt.trim()
        ? body.input_prompt.trim().slice(0, 1200)
        : undefined;
    if (!prompt) return NextResponse.json({ error: "请输入提示词" }, { status: 400 });

    const normalizedReferences = normalizeGeneralImageReferenceUrls(body.reference_urls);
    const publicBaseUrl = getPublicBaseUrlFromRequest(request);
    if (process.env.NODE_ENV === "production") {
      const disallowedInputs = [
        ...findDisallowedProductionImageInputs(normalizedReferences.urls, publicBaseUrl),
        ...findDisallowedProductionImageInputs(body.input_assets, publicBaseUrl),
      ];
      if (normalizedReferences.hasInlineImage || containsInlineImageUrl(body.input_assets) || disallowedInputs.length) {
        return NextResponse.json({ error: "生产环境参考图必须使用已验证的媒体资产或站点素材" }, { status: 400 });
      }
    }
    const referenceUrls = normalizedReferences.urls;
    if (mode === "image-to-image" && referenceUrls.length === 0) {
      return NextResponse.json({ error: "请先上传参考图" }, { status: 400 });
    }

    const model: LingyaModel = normalizeLingyaModel(body.ai_model || "nano-banana-2");
    const aspectRatio = normalizeAspectRatio(body.aspect_ratio || "auto");
    const size: ImageSize = normalizeImageSize(model, (typeof body.image_size === "string" ? body.image_size : "1K") as ImageSize, aspectRatio);
    const genCount = Math.min(Math.max(Math.floor(Number(body.gen_count) || 1), 1), 4);
    const totalCost = await getConfiguredImageCreditCost(model, size) * genCount;
    const moduleKind = normalizeModuleKind(body.module_kind || body.module);
    const outfitFusionAssets = moduleKind === "outfitFusion" ? normalizeOutfitFusionAssets(body.input_assets, referenceUrls) : undefined;
    const outfitFusionAspectRatio: OutfitFusionConfig["aspectRatio"] = aspectRatio === "1:1" || aspectRatio === "3:4" ? aspectRatio : "auto";
    const outfitFusionRuntimePlan = moduleKind === "outfitFusion" && outfitFusionAssets
      ? buildOutfitFusionRuntimePlan({
          assets: outfitFusionAssets,
          prompt,
          userPrompt,
          config: {
            aspectRatio: outfitFusionAspectRatio,
            genCount,
            imageSize: size,
            aiModel: model,
            quality: "hd",
          },
        })
      : null;
    const outfitFusionModelFaceUrl = outfitFusionRuntimePlan?.modelFaceUrl || null;
    const outfitFusionReferenceUrl = outfitFusionRuntimePlan?.referenceUrl || referenceUrls[0] || null;
    const outfitFusionClothingUrls = outfitFusionRuntimePlan?.clothingUrls || [];
    const moduleLabel = moduleKind === "outfitFusion" ? "搭配融图" : "通用生图";

    const payloadBase = {
      publicBaseUrl,
      mode,
      referenceUrls: mode === "image-to-image"
        ? moduleKind === "outfitFusion"
          ? outfitFusionRuntimePlan?.referenceUrls || referenceUrls
          : referenceUrls
        : [],
      aiModel: model,
      aspectRatio,
      imageSize: size,
      prompt: moduleKind === "outfitFusion" ? outfitFusionRuntimePlan?.prompt || prompt : prompt,
      genCount,
    };
    const jobPayload: GenerationJobPayload = moduleKind === "outfitFusion"
      ? {
          kind: "outfitFusion",
          ...payloadBase,
          userPrompt,
          assets: outfitFusionRuntimePlan?.assets || outfitFusionAssets,
          clothingUrls: outfitFusionClothingUrls,
          modelFaceUrl: outfitFusionModelFaceUrl,
          referenceUrl: outfitFusionReferenceUrl,
        }
      : { kind: "generalImage", ...payloadBase };

    const onePerReference = mode === "image-to-image"
      && moduleKind === "generalImage"
      && body.one_per_reference === true
      && referenceUrls.length > 1;

    if (onePerReference) {
      const batchId = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const baseIdempotencyKey = request.headers.get("idempotency-key") || "";
      const generationIds: string[] = [];
      let creditsRemaining = 0;

      for (let index = 0; index < referenceUrls.length; index += 1) {
        const referenceUrl = referenceUrls[index];
        const singlePayload: GenerationJobPayload = {
          kind: "generalImage",
          ...payloadBase,
          referenceUrls: [referenceUrl],
          batchId,
          batchIndex: index,
        };
        const debit = await createDebitedGeneration(supabase, {
          userId: user.id,
          clothingUrls: [referenceUrl],
          modelFaceUrl: null,
          referenceUrl: referenceUrl,
          creditsCost: totalCost,
          aiModel: model,
          imageSize: size,
          reason: `${moduleLabel}图生图 ${genCount} 张 (${model}, ${size})`,
          jobPayload: singlePayload,
          idempotencyKey: `${baseIdempotencyKey || batchId}-${index}`,
          mediaInputs: [{ url: referenceUrl, kind: "image" }],
          publicBaseUrl,
        });
        generationIds.push(debit.generationId);
        creditsRemaining = debit.creditsRemaining;
        startGenerationJob(debit.generationId);
      }

      return NextResponse.json({
        generation_id: generationIds[0],
        generation_ids: generationIds,
        batch_id: batchId,
        credits_cost: totalCost * generationIds.length,
        credits_remaining: creditsRemaining,
        status: "processing_tryon",
      });
    }

    const mediaInputs = Array.from(new Set([
      ...payloadBase.referenceUrls,
      ...(moduleKind === "outfitFusion" ? outfitFusionClothingUrls : []),
      ...(moduleKind === "outfitFusion" && outfitFusionModelFaceUrl ? [outfitFusionModelFaceUrl] : []),
      ...(moduleKind === "outfitFusion" && outfitFusionReferenceUrl ? [outfitFusionReferenceUrl] : []),
      ...(moduleKind === "outfitFusion" ? (outfitFusionRuntimePlan?.assets || outfitFusionAssets || []).map((asset) => asset.url) : []),
    ])).map((url) => ({ url, kind: "image" as const }));

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: payloadBase.referenceUrls,
      modelFaceUrl: moduleKind === "outfitFusion" ? outfitFusionModelFaceUrl : null,
      referenceUrl: moduleKind === "outfitFusion" ? outfitFusionReferenceUrl : payloadBase.referenceUrls[0] || null,
      creditsCost: totalCost,
      aiModel: model,
      imageSize: size,
      reason: `${moduleLabel}${mode === "text-to-image" ? "文生图" : "图生图"} ${genCount} 张 (${model}, ${size})`,
      jobPayload,
      idempotencyKey: request.headers.get("idempotency-key") || "",
      mediaInputs,
      publicBaseUrl,
    });

    startGenerationJob(debit.generationId);

    return NextResponse.json({
      generation_id: debit.generationId,
      credits_cost: totalCost,
      credits_remaining: debit.creditsRemaining,
      status: "processing_tryon",
    });
  } catch (err: unknown) {
    console.error("[general-image] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}

function normalizeMode(value: unknown): GeneralImageMode {
  return value === "image-to-image" ? "image-to-image" : "text-to-image";
}

function normalizeModuleKind(value: unknown): GeneralImageModuleKind {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "outfitfusion" || normalized === "outfit-fusion" || normalized === "outfit_fusion") {
    return "outfitFusion";
  }
  return "generalImage";
}

function normalizeOutfitFusionAssets(value: unknown, fallbackUrls: string[]): OutfitFusionAsset[] {
  const fallback = fallbackUrls.map((url, index) => ({
    id: `input-${index}`,
    role: "outfit" as const,
    url,
  }));
  if (!Array.isArray(value)) return fallback;

  const assets = value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!isGeneralImageReferenceUrl(url)) return [];
    const role: OutfitFusionAsset["role"] = record.role === "reference" || record.role === "model" || record.role === "outfit" ? record.role : "outfit";
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 32) : undefined;
    const id = typeof record.id === "string" && record.id.trim() ? record.id.trim().slice(0, 80) : `input-${index}`;
    return [{ id, role, url, name }];
  });

  return assets.length ? assets.slice(0, 10) : fallback;
}
