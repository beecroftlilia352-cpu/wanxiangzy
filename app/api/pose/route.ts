import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { getConfiguredImageCreditCost } from "@/lib/ai-control-plane/server";
import {
  createDebitedGeneration,
  errorToResponsePayload,
} from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { type PoseOutputMode } from "@/lib/pose-prompt";
import { normalizePoseVisualAnalysis } from "@/lib/pose-analysis";
import { getPoseAngleTotal, normalizePoseAngleCounts, normalizePosePlan, normalizePosePlanCount } from "@/lib/pose-plan";
import { normalizePoseSeriesStyle } from "@/lib/module-style-presets";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { normalizeGarmentDetailUrls } from "@/lib/garment-detail-references";
import { MAX_GARMENT_ANGLE_IMAGES, flattenGarmentAngleReferences, normalizeGarmentAngleReferences } from "@/lib/garment-angle-references";
import { MAX_POSE_REFERENCE_IMAGES, normalizePoseReferenceCopies, normalizePoseReferenceUrls } from "@/lib/pose-reference";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`pose:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-validated below
    let body: any;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
    const { main_image_url, ai_model, image_size, prompt, pose_style } = body;
    const garmentAngleInput = body.garment_angle_references ?? body.garmentAngleReferences;
    const garmentDetailInput = body.garment_detail_urls ?? body.garmentDetailUrls;
    const poseReferenceInput = body.pose_reference_urls ?? body.poseReferenceUrls;
    const poseReferenceCopiesInput = body.pose_reference_copies ?? body.poseReferenceCopies;
    const requestedOutputMode = body.output_mode ?? body.outputMode;
    const outputMode: PoseOutputMode = requestedOutputMode === "grid" ? "grid" : "separate";
    const angleCounts = normalizePoseAngleCounts(readAngleCountsInput(body.angle_counts ?? body.angleCounts));
    const poseCount = normalizePosePlanCount(body.pose_count ?? body.poseCount ?? getPoseAngleTotal(angleCounts));
    const genCount = outputMode === "separate" ? normalizePoseCount(body.gen_count ?? body.count ?? poseCount, poseCount) : 1;
    const poseStartIndex = normalizePoseStartIndex(body.pose_start_index ?? body.poseStartIndex ?? body.retry_pose_index, poseCount);
    if (!main_image_url || typeof main_image_url !== "string") return NextResponse.json({ error: "缺少主图" }, { status: 400 });
    if (!prompt?.trim()) return NextResponse.json({ error: "缺少提示词" }, { status: 400 });
    if (
      garmentDetailInput !== undefined &&
      (
        !Array.isArray(garmentDetailInput) ||
        garmentDetailInput.length > MAX_GARMENT_ANGLE_IMAGES ||
        garmentDetailInput.some((url) => typeof url !== "string")
      )
    ) {
      return NextResponse.json({ error: `服装角度参考最多 ${MAX_GARMENT_ANGLE_IMAGES} 张` }, { status: 400 });
    }
    if (
      garmentAngleInput !== undefined &&
      (!Array.isArray(garmentAngleInput) || garmentAngleInput.length > MAX_GARMENT_ANGLE_IMAGES)
    ) {
      return NextResponse.json({ error: `服装角度参考最多 ${MAX_GARMENT_ANGLE_IMAGES} 张` }, { status: 400 });
    }
    if (
      poseReferenceInput !== undefined &&
      (
        !Array.isArray(poseReferenceInput) ||
        poseReferenceInput.length > MAX_POSE_REFERENCE_IMAGES ||
        poseReferenceInput.some((url: unknown) => typeof url !== "string")
      )
    ) {
      return NextResponse.json({ error: `Pose references max ${MAX_POSE_REFERENCE_IMAGES} images` }, { status: 400 });
    }
    const legacyGarmentAngleReferences = normalizeGarmentAngleReferences(
      normalizeGarmentDetailUrls(garmentDetailInput, MAX_GARMENT_ANGLE_IMAGES)
        .map((url) => ({ url, target: "outfit" as const, view: "other" as const }))
    );
    const garmentAngleReferences = normalizeGarmentAngleReferences(garmentAngleInput);
    const activeGarmentAngleReferences = garmentAngleReferences.length ? garmentAngleReferences : legacyGarmentAngleReferences;
    const garmentAngleUrls = flattenGarmentAngleReferences(activeGarmentAngleReferences);
    const poseReferenceUrls = normalizePoseReferenceUrls(poseReferenceInput);
    const requestedPoseCreationMode = body.pose_creation_mode === "reference" || body.poseCreationMode === "reference" ? "reference" : "free";
    const poseCreationMode = requestedPoseCreationMode === "reference" && poseReferenceUrls.length ? "reference" : "free";
    const poseReferenceCopies = normalizePoseReferenceCopies(poseReferenceCopiesInput, Math.max(poseReferenceUrls.length, 1));
    const poseReferenceTotalCount = normalizePositiveGenerationCount(
      poseReferenceUrls.length * poseReferenceCopies,
      Math.max(poseReferenceUrls.length, 1)
    );
    const effectiveOutputMode: PoseOutputMode = poseCreationMode === "reference" ? "separate" : outputMode;
    const effectivePoseCount = poseCreationMode === "reference"
      ? poseReferenceTotalCount
      : poseCount;
    const effectiveGenCount = poseCreationMode === "reference"
      ? normalizePositiveGenerationCount(body.gen_count ?? body.count ?? effectivePoseCount, effectivePoseCount)
      : genCount;
    const effectivePoseStartIndex = poseCreationMode === "reference"
      ? normalizePoseStartIndex(body.pose_start_index ?? body.poseStartIndex ?? body.retry_pose_index, effectivePoseCount)
      : poseStartIndex;

    const model: LingyaModel = normalizeLingyaModel(ai_model);
    const aspectRatio: AspectRatio = normalizeAspectRatio(body.aspect_ratio || body.aspectRatio || "auto", "auto");
    const size: ImageSize = normalizeImageSize(model, image_size || "1K", aspectRatio);
    const unitCost = await getConfiguredImageCreditCost(model, size);
    const totalCost = unitCost * effectiveGenCount;
    const poseStyle = normalizePoseSeriesStyle(pose_style);
    const posePlanMode = body.pose_plan_mode === "ai" || body.posePlanMode === "ai" ? "ai" : "preset";
    const poseAnalysis = normalizePoseVisualAnalysis(body.pose_analysis ?? body.poseAnalysis);
    const posePlan = poseCreationMode === "reference" ? null : body.pose_plan || body.posePlan
      ? normalizePosePlan(body.pose_plan ?? body.posePlan, {
          poseAnalysis,
          poseStyle,
          outputMode: effectiveOutputMode,
          prompt: String(prompt).trim(),
          poseCount: effectivePoseCount,
          angleCounts,
        })
      : null;
    const jobPayload: GenerationJobPayload = {
      kind: "pose",
      publicBaseUrl: getPublicBaseUrlFromRequest(request),
      mainImageUrl: main_image_url,
      aiModel: model,
      aspectRatio,
      imageSize: size,
      prompt: String(prompt).trim(),
      poseStyle,
      poseCreationMode,
      poseReferenceCopies,
      posePlanMode,
      outputMode: effectiveOutputMode,
      poseCount: effectivePoseCount,
      angleCounts,
      genCount: effectiveGenCount,
      poseStartIndex: effectivePoseStartIndex,
      poseAnalysis,
      posePlan,
      poseReferenceUrls,
      garmentAngleReferences: activeGarmentAngleReferences,
      garmentDetailUrls: garmentAngleReferences.length ? [] : normalizeGarmentDetailUrls(garmentDetailInput),
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: [main_image_url, ...poseReferenceUrls, ...garmentAngleUrls],
      modelFaceUrl: null,
      referenceUrl: null,
      creditsCost: totalCost,
      aiModel: model,
      imageSize: size,
      reason: `姿势裂变 · ${effectivePoseCount} 个姿势${effectiveOutputMode === "separate" ? " · 独立图" : " · 自动宫格"}${poseCreationMode === "reference" ? " · 参考图模式" : ""}${poseReferenceUrls.length ? ` · ${poseReferenceUrls.length} 张姿势参考` : ""}${garmentAngleUrls.length ? ` · ${garmentAngleUrls.length} 张服装角度` : ""} (${model}, ${size})`,
      jobPayload,
      idempotencyKey: request.headers.get("idempotency-key") || "",
    });

    startGenerationJob(debit.generationId);

    return NextResponse.json({
      generation_id: debit.generationId,
      credits_cost: totalCost,
      credits_remaining: debit.creditsRemaining,
      status: "processing_tryon",
    });
  } catch (err: unknown) {
    console.error("[pose] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

function normalizePoseCount(value: unknown, fallback = 4) {
  const num = Number(value ?? fallback);
  if (!Number.isFinite(num)) return normalizePosePlanCount(fallback);
  return normalizePosePlanCount(num);
}

function normalizePoseStartIndex(value: unknown, maxCount = 4) {
  const num = Number(value || 1);
  if (!Number.isFinite(num)) return 1;
  const safeMaxCount = Math.max(1, Math.floor(Number(maxCount) || 1));
  return Math.min(Math.max(Math.floor(num), 1), safeMaxCount);
}

function readAngleCountsInput(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Parameters<typeof normalizePoseAngleCounts>[0]
    : undefined;
}

function normalizePositiveGenerationCount(value: unknown, fallback = 1) {
  const num = Number(value ?? fallback);
  if (!Number.isFinite(num)) return Math.max(1, Math.floor(Number(fallback) || 1));
  return Math.max(1, Math.floor(num));
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
