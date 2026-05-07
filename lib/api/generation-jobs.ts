import { logger } from "@/lib/logger";
import {
  batchTryOn,
  generateImage,
  type AspectRatio,
  type ImageTaskProgress,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import { failGenerationWithRefund } from "@/lib/api/credits";
import { resolveImageInputs } from "@/lib/api/image-inputs.server";
import { persistGeneratedImageUrls } from "@/lib/api/result-image-storage";
import {
  applyQualityRepairToPrompt,
  evaluateGeneratedImages,
  type VisualQualityEvaluation,
} from "@/lib/agent/brain/visual-quality";
import {
  buildCommerceDetailSectionPrompt,
  buildCommerceDetailSections,
  normalizeCommerceDetailLayout,
  resolveCommerceDetailAspectRatio,
  type CommerceDetailLayout,
  type CommerceDetailSectionSpec,
} from "@/lib/commerce-detail-sections";
import { enforceModelPromptRequirements } from "@/lib/model-prompt";
import { enforcePosePromptRequirements, type PoseOutputMode } from "@/lib/pose-prompt";
import {
  applyGarment3dDisplayStylePrompt,
  applyModelShootStylePrompt,
  applyPoseSeriesStylePrompt,
  normalizeGarment3dDisplayStyle,
  normalizeModelShootStyle,
  normalizePoseSeriesStyle,
  type Garment3dDisplayStyle,
  type ModelShootStyle,
  type PoseSeriesStyle,
} from "@/lib/module-style-presets";
import type { AutoDesignSettings, TryOnSceneMode } from "@/lib/tryon-scene";
import type { TryOnAgeGroup, TryOnGarmentAudience } from "@/lib/tryon-prompt";
import type { TryOnClothingMode, TryOnClothingRole } from "@/lib/tryon-upload-rules";
import type { GrassPayloadBase } from "@/lib/grass-planting";
import type { ModelBackgroundPayloadBase } from "@/lib/model-background";
import { enforceFaceSwapPromptRequirements } from "@/lib/face-swap";

export type GenerationJobPayload =
  | {
      kind: "tryon";
      clothingUrls: string[];
      clothingMode?: TryOnClothingMode;
      clothingRoles?: TryOnClothingRole[];
      garmentAudience?: TryOnGarmentAudience;
      ageGroup?: TryOnAgeGroup;
      modelFaceUrl?: string | null;
      referenceUrl?: string | null;
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      style?: string;
      genCount: number;
      rawPrompt?: string;
      sceneMode?: TryOnSceneMode;
      autoDesign?: AutoDesignSettings;
    }
  | {
      kind: "model";
      referenceUrls: string[];
      hairReferenceUrl?: string | null;
      hairColorReferenceUrl?: string | null;
      gender?: "female" | "male";
      modelStyle?: ModelShootStyle;
      hairStyle?: string | null;
      hairColor?: string | null;
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      prompt: string;
      genCount: number;
    }
  | ({ kind: "grass" } & GrassPayloadBase)
  | ({ kind: "modelBackground" } & ModelBackgroundPayloadBase)
  | {
      kind: "pose";
      mainImageUrl: string;
      aiModel: LingyaModel;
      imageSize: ImageSize;
      prompt: string;
      varyExpression?: boolean;
      poseStyle?: PoseSeriesStyle;
      outputMode?: PoseOutputMode;
      genCount?: number;
    }
  | {
      kind: "garment3d";
      garmentUrl: string;
      referenceUrl?: string | null;
      garmentType?: string;
      outputMode?: "reference" | "prompt";
      displayStyle?: Garment3dDisplayStyle;
      userPrompt?: string;
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      prompt: string;
      genCount: number;
    }
  | {
      kind: "faceSwap";
      sourceUrl: string;
      faceUrl: string;
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      prompt: string;
      genCount: number;
      textureEnhance?: boolean;
    }
  | {
      kind: "commerceDetail";
      sourceUrls: string[];
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      prompt: string;
      genCount: number;
      platform?: string;
      layout?: CommerceDetailLayout;
      mobileWidth?: number;
      sections?: CommerceDetailSectionSpec[];
    };

interface ClaimedJob {
  id: string;
  user_id: string;
  job_payload: unknown;
  credits_cost: number;
  job_attempts: number;
}

interface ExhaustedJob {
  id: string;
  user_id: string;
  credits_cost: number | null;
  processing_started_at: string | null;
  error_message: string | null;
}

type PromptTraceItem = {
  index: number;
  kind: GenerationJobPayload["kind"];
  model: LingyaModel;
  promptKind: string;
  prompt: string;
  compiledPrompt: string;
  createdAt: string;
};

type GenerationExecutionResult = {
  resultUrls: string[];
  promptTrace: PromptTraceItem[];
  progress?: number;
  externalTaskId?: string;
  externalStatus?: string;
};

type GenerationProgressUpdate = GenerationExecutionResult;
type GenerationProgressCallback = (update: GenerationProgressUpdate) => Promise<void>;

export function startGenerationJob(generationId: string) {
  runGenerationJobById(generationId).catch((err) => {
    logger.error(`[jobs] background job ${generationId} failed:`, err);
  });
}

export async function runGenerationJobById(generationId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_generation_job", {
    p_generation_id: generationId,
  });

  if (error) {
    throw new Error(`任务认领失败: ${error.message}`);
  }

  const job = getFirstRow(data);
  if (!job) return { processed: 0, skipped: 1 };

  await runClaimedJob(supabase, job);
  return { processed: 1, skipped: 0 };
}

export async function runNextGenerationJobs(limit = 2) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_next_generation_jobs", {
    p_limit: limit,
  });

  if (error) {
    throw new Error(`任务批量认领失败: ${error.message}`);
  }

  const jobs = Array.isArray(data) ? (data as ClaimedJob[]) : [];
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const job of jobs) {
    try {
      await runClaimedJob(supabase, job);
      results.push({ id: job.id, ok: true });
    } catch (err) {
      results.push({
        id: job.id,
        ok: false,
        error: err instanceof Error ? err.message : "任务失败",
      });
    }
  }

  const exhaustedRefunded = await refundExhaustedJobs(supabase);
  return { claimed: jobs.length, exhausted_refunded: exhaustedRefunded, results };
}

async function runClaimedJob(
  supabase: ReturnType<typeof createAdminClient>,
  job: ClaimedJob
) {
  try {
    const payload = parseJobPayload(job.job_payload);
    const partialResultUrls: string[] = [];
    const partialPromptTrace: PromptTraceItem[] = [];
    let lastProgress = 0;
    const execution = await executePayload(payload, async (update) => {
      const newUrls = update.resultUrls.slice(partialResultUrls.length);
      const nextProgress = typeof update.progress === "number" ? update.progress : lastProgress;
      if (!newUrls.length && update.promptTrace.length === partialPromptTrace.length && nextProgress === lastProgress) return;

      const persistedNewUrls = newUrls.length
        ? await persistGeneratedImageUrls(newUrls, job.id, {
          forceServerDownload: isSeedreamPayload(payload),
          startIndex: partialResultUrls.length,
        })
        : [];
      partialResultUrls.push(...persistedNewUrls);
      partialPromptTrace.splice(0, partialPromptTrace.length, ...update.promptTrace);
      lastProgress = Math.max(lastProgress, nextProgress);

      await writeGenerationProgress(supabase, job, payload, {
        resultUrls: partialResultUrls,
        promptTrace: partialPromptTrace,
        progress: lastProgress,
        externalTaskId: update.externalTaskId,
        externalStatus: update.externalStatus,
      });
    });
    const persistedResultUrls = partialResultUrls.length === execution.resultUrls.length
      ? partialResultUrls
      : await persistGeneratedImageUrls(execution.resultUrls, job.id, {
        forceServerDownload: isSeedreamPayload(payload),
      });
    const quality = await evaluateGeneratedImages({
      userPrompt: getPayloadPrompt(payload),
      module: payload.kind,
      resultUrls: persistedResultUrls,
      expectedCount: getExpectedResultCount(payload),
      referenceImageUrls: getPayloadReferenceImages(payload),
    });
    const repaired = quality.shouldRegenerate && shouldAutoRegenerate(payload, job)
      ? await regenerateForQuality(supabase, job, payload, quality, partialPromptTrace)
      : null;
    const finalUrls = repaired?.resultUrls || persistedResultUrls;
    const finalPromptTrace = repaired?.promptTrace || execution.promptTrace;
    const finalQuality = repaired?.quality || quality;

    const { data, error } = await supabase
      .from("generations")
      .update({
        status: "completed",
        result_urls: finalUrls,
        job_payload: appendPromptTrace(appendQualityMetadata(repaired?.payload || payload, finalQuality, Boolean(repaired)), finalPromptTrace),
        processing_started_at: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("user_id", job.user_id)
      .eq("status", "processing_tryon")
      .select("id")
      .maybeSingle();

    if (error) throw new Error(`更新任务结果失败: ${error.message}`);
    if (!data) {
      logger.warn(`[jobs] generation ${job.id} was no longer processing; skipped completion write`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败";
    await failGenerationWithRefund(supabase, {
      userId: job.user_id,
      generationId: job.id,
      amount: Number(job.credits_cost || 0),
      reason: "生成失败退还",
      errorMessage: message,
    });
    throw err;
  }
}

async function regenerateForQuality(
  supabase: ReturnType<typeof createAdminClient>,
  job: ClaimedJob,
  payload: GenerationJobPayload,
  quality: VisualQualityEvaluation,
  previousPromptTrace: PromptTraceItem[]
) {
  const repairedPayload = repairPayloadPrompt(payload, quality);
  logger.warn(`[jobs] quality auto-regeneration ${job.id}: score=${quality.score} issues=${quality.issues.join(";")}`);
  const execution = await executePayload(repairedPayload, async (update) => {
    const persisted = update.resultUrls.length
      ? await persistGeneratedImageUrls(update.resultUrls, `${job.id}-quality-repair`, {
        forceServerDownload: isSeedreamPayload(repairedPayload),
      })
      : [];
    await writeGenerationProgress(supabase, job, repairedPayload, {
      resultUrls: persisted,
      promptTrace: [...previousPromptTrace, ...update.promptTrace],
    });
  });
  const persisted = await persistGeneratedImageUrls(execution.resultUrls, `${job.id}-quality-repair`, {
    forceServerDownload: isSeedreamPayload(repairedPayload),
  });
  const repairedQuality = await evaluateGeneratedImages({
    userPrompt: getPayloadPrompt(repairedPayload),
    module: repairedPayload.kind,
    resultUrls: persisted,
    expectedCount: getExpectedResultCount(repairedPayload),
    referenceImageUrls: getPayloadReferenceImages(repairedPayload),
  });
  if (repairedQuality.score + 0.02 < quality.score) {
    return null;
  }
  return {
    payload: repairedPayload,
    resultUrls: persisted,
    promptTrace: [...previousPromptTrace, ...execution.promptTrace],
    quality: repairedQuality,
  };
}

async function executePayload(
  payload: GenerationJobPayload,
  onProgress?: GenerationProgressCallback
): Promise<GenerationExecutionResult> {
  const promptTrace: PromptTraceItem[] = [];

  if (payload.kind === "tryon") {
    const resultUrls: string[] = [];

    for (let i = 0; i < payload.genCount; i++) {
      const imageInputs = await resolveImageInputs({
        clothingUrls: payload.clothingUrls,
        modelFaceUrl: payload.modelFaceUrl || undefined,
        referenceUrl: payload.referenceUrl || undefined,
      });
      const result = await batchTryOn({
        model: payload.aiModel,
        clothingUrls: imageInputs.clothingUrls,
        clothingMode: payload.clothingMode,
        clothingRoles: payload.clothingRoles,
        garmentAudience: payload.garmentAudience,
        ageGroup: payload.ageGroup,
        modelFaceUrl: imageInputs.modelFaceUrl,
        referenceUrl: imageInputs.referenceUrl,
        aspect_ratio: payload.aspectRatio,
        image_size: payload.imageSize,
        style: payload.style,
        raw_prompt: payload.rawPrompt,
        onProgress: (progress) => onProgress?.(mapImageTaskProgress(progress, resultUrls, promptTrace, i, payload.genCount)),
      });
      resultUrls.push(...result.resultUrls);
      promptTrace.push(createPromptTraceItem({
        index: i + 1,
        kind: payload.kind,
        model: payload.aiModel,
        promptKind: "tryon",
        prompt: result.prompt,
        compiledPrompt: result.compiledPrompt,
      }));
      await onProgress?.(createCompletedImageProgress(resultUrls, promptTrace, result.taskId, i + 1, payload.genCount));
    }

    return { resultUrls, promptTrace };
  }

  if (payload.kind === "model") {
    const references = [
      ...payload.referenceUrls,
      payload.hairReferenceUrl,
      payload.hairColorReferenceUrl,
    ].filter(Boolean) as string[];
    const imageInputs = await resolveImageInputs({ clothingUrls: references });
    const resultUrls: string[] = [];
    const modelStyle = normalizeModelShootStyle(payload.modelStyle);

    for (let i = 0; i < payload.genCount; i++) {
      const prompt = enforceModelPromptRequirements({
        prompt: applyModelShootStylePrompt(payload.prompt, modelStyle),
        referenceCount: payload.referenceUrls.length,
        hairReferenceIndex: payload.hairReferenceUrl ? payload.referenceUrls.length + 1 : null,
        hairColorReferenceIndex: payload.hairColorReferenceUrl ? payload.referenceUrls.length + (payload.hairReferenceUrl ? 2 : 1) : null,
      });
      const result = await generateImage({
        model: payload.aiModel,
        prompt,
        prompt_kind: "model",
        aspect_ratio: payload.aspectRatio,
        image: imageInputs.clothingUrls,
        image_size: payload.imageSize,
        onProgress: (progress) => onProgress?.(mapImageTaskProgress(progress, resultUrls, promptTrace, i, payload.genCount)),
      });
      resultUrls.push(getResultUrl(result));
      promptTrace.push(createPromptTraceItem({
        index: i + 1,
        kind: payload.kind,
        model: payload.aiModel,
        promptKind: "model",
        prompt,
        compiledPrompt: result.compiledPrompt || prompt,
      }));
      await onProgress?.(createCompletedImageProgress(resultUrls, promptTrace, result.taskId, i + 1, payload.genCount));
    }

    return { resultUrls, promptTrace };
  }

  if (payload.kind === "grass") {
    const imageInputs = await resolveImageInputs({
      clothingUrls: [
        payload.garmentUrl,
        ...(payload.referenceUrl ? [payload.referenceUrl] : []),
      ],
    });
    const resultUrls: string[] = [];

    for (let i = 0; i < payload.genCount; i++) {
      const result = await generateImage({
        model: payload.aiModel,
        prompt: payload.prompt,
        prompt_kind: "grass",
        aspect_ratio: payload.aspectRatio,
        image: imageInputs.clothingUrls,
        image_size: payload.imageSize,
        onProgress: (progress) => onProgress?.(mapImageTaskProgress(progress, resultUrls, promptTrace, i, payload.genCount)),
      });
      resultUrls.push(getResultUrl(result));
      promptTrace.push(createPromptTraceItem({
        index: i + 1,
        kind: payload.kind,
        model: payload.aiModel,
        promptKind: "grass",
        prompt: payload.prompt,
        compiledPrompt: result.compiledPrompt || payload.prompt,
      }));
      await onProgress?.(createCompletedImageProgress(resultUrls, promptTrace, result.taskId, i + 1, payload.genCount));
    }

    return { resultUrls, promptTrace };
  }

  if (payload.kind === "modelBackground") {
    const sourceImages = [
      payload.sourceUrl,
      payload.modelReferenceUrl,
      payload.backgroundReferenceUrl,
    ].filter(Boolean) as string[];
    const imageInputs = await resolveImageInputs({ clothingUrls: sourceImages });
    const resultUrls: string[] = [];

    for (let i = 0; i < payload.genCount; i++) {
      const result = await generateImage({
        model: payload.aiModel,
        prompt: payload.prompt,
        prompt_kind: "modelBackground",
        aspect_ratio: payload.aspectRatio,
        image: imageInputs.clothingUrls,
        image_size: payload.imageSize,
        onProgress: (progress) => onProgress?.(mapImageTaskProgress(progress, resultUrls, promptTrace, i, payload.genCount)),
      });
      resultUrls.push(getResultUrl(result));
      promptTrace.push(createPromptTraceItem({
        index: i + 1,
        kind: payload.kind,
        model: payload.aiModel,
        promptKind: "modelBackground",
        prompt: payload.prompt,
        compiledPrompt: result.compiledPrompt || payload.prompt,
      }));
      await onProgress?.(createCompletedImageProgress(resultUrls, promptTrace, result.taskId, i + 1, payload.genCount));
    }

    return { resultUrls, promptTrace };
  }

  if (payload.kind === "pose") {
    const imageInputs = await resolveImageInputs({ clothingUrls: [payload.mainImageUrl] });
    const poseStyle = normalizePoseSeriesStyle(payload.poseStyle);
    const outputMode = normalizePoseOutputMode(payload.outputMode);
    const prompt = enforcePosePromptRequirements(applyPoseSeriesStylePrompt(payload.prompt, poseStyle), {
      varyExpression: payload.varyExpression !== false,
      poseStyle,
      outputMode,
    });

    if (outputMode === "separate") {
      const results: string[] = [];
      const promptTrace: PromptTraceItem[] = [];
      const generationCount = getPoseGenerationCount(payload);
      for (let index = 1; index <= generationCount; index++) {
        const posePrompt = buildSeparatePosePrompt(prompt, index);
        const result = await generateImage({
          model: payload.aiModel,
          prompt: posePrompt,
          prompt_kind: "pose",
          aspect_ratio: "3:4",
          image: imageInputs.clothingUrls,
          image_size: payload.imageSize,
          onProgress: (progress) => onProgress?.(mapImageTaskProgress(progress, results, promptTrace, index - 1, generationCount)),
        });
        results.push(getResultUrl(result));
        promptTrace.push(createPromptTraceItem({
          index,
          kind: payload.kind,
          model: payload.aiModel,
          promptKind: "pose",
          prompt: posePrompt,
          compiledPrompt: result.compiledPrompt || posePrompt,
        }));
        await onProgress?.(createCompletedImageProgress(results, promptTrace, result.taskId, index, generationCount));
      }

      return { resultUrls: results, promptTrace };
    }

    const result = await generateImage({
      model: payload.aiModel,
      prompt,
      prompt_kind: "pose",
      aspect_ratio: "3:4",
      image: imageInputs.clothingUrls,
      image_size: payload.imageSize,
      onProgress: (progress) => onProgress?.(mapImageTaskProgress(progress, [], [], 0, 1)),
    });

    return {
      resultUrls: [getResultUrl(result)],
      promptTrace: [createPromptTraceItem({
        index: 1,
        kind: payload.kind,
        model: payload.aiModel,
        promptKind: "pose",
        prompt,
        compiledPrompt: result.compiledPrompt || prompt,
      })],
    };
  }

  if (payload.kind === "faceSwap") {
    const imageInputs = await resolveImageInputs({
      clothingUrls: [payload.sourceUrl, payload.faceUrl],
    });
    const resultUrls: string[] = [];
    const prompt = enforceFaceSwapPromptRequirements(payload.prompt);

    for (let i = 0; i < payload.genCount; i++) {
      const result = await generateImage({
        model: payload.aiModel,
        prompt,
        prompt_kind: "faceSwap",
        aspect_ratio: payload.aspectRatio,
        image: imageInputs.clothingUrls,
        image_size: payload.imageSize,
        onProgress: (progress) => onProgress?.(mapImageTaskProgress(progress, resultUrls, promptTrace, i, payload.genCount)),
      });
      resultUrls.push(getResultUrl(result));
      promptTrace.push(createPromptTraceItem({
        index: i + 1,
        kind: payload.kind,
        model: payload.aiModel,
        promptKind: "faceSwap",
        prompt,
        compiledPrompt: result.compiledPrompt || prompt,
      }));
      await onProgress?.(createCompletedImageProgress(resultUrls, promptTrace, result.taskId, i + 1, payload.genCount));
    }

    return { resultUrls, promptTrace };
  }

  if (payload.kind === "commerceDetail") {
    const imageInputs = await resolveImageInputs({ clothingUrls: payload.sourceUrls });
    const resultUrls: string[] = [];
    const layout = normalizeCommerceDetailLayout(payload.layout);
    const sections = normalizeCommerceDetailSections(payload.sections, payload.genCount);
    const generationCount = sections.length;

    for (let i = 0; i < generationCount; i++) {
      const section = sections[i];
      const prompt = buildCommerceDetailSectionPrompt({
        userPrompt: payload.prompt,
        platform: payload.platform || "general",
        layout,
        mobileWidth: payload.mobileWidth || 750,
        section,
        sectionIndex: i + 1,
        sectionTotal: generationCount,
        referenceCount: imageInputs.clothingUrls.length,
      });
      const result = await generateImage({
        model: payload.aiModel,
        prompt,
        prompt_kind: "commerceDetail",
        aspect_ratio: resolveCommerceDetailAspectRatio(layout, payload.aspectRatio),
        image: imageInputs.clothingUrls,
        image_size: payload.imageSize,
        onProgress: (progress) => onProgress?.(mapImageTaskProgress(progress, resultUrls, promptTrace, i, generationCount)),
      });
      resultUrls.push(getResultUrl(result));
      promptTrace.push(createPromptTraceItem({
        index: i + 1,
        kind: payload.kind,
        model: payload.aiModel,
        promptKind: `commerceDetail:${section.id}`,
        prompt,
        compiledPrompt: result.compiledPrompt || prompt,
      }));
      await onProgress?.(createCompletedImageProgress(resultUrls, promptTrace, result.taskId, i + 1, generationCount));
    }

    return { resultUrls, promptTrace };
  }

  const imageInputs = await resolveImageInputs({
    clothingUrls: [
      payload.garmentUrl,
      ...(payload.referenceUrl ? [payload.referenceUrl] : []),
    ],
  });
  const resultUrls: string[] = [];
  const displayStyle = normalizeGarment3dDisplayStyle(payload.displayStyle);

  for (let i = 0; i < payload.genCount; i++) {
    const prompt = applyGarment3dDisplayStylePrompt(payload.prompt, displayStyle);
    const result = await generateImage({
      model: payload.aiModel,
      prompt,
      prompt_kind: "garment3d",
      aspect_ratio: payload.aspectRatio,
      image: imageInputs.clothingUrls,
      image_size: payload.imageSize,
      onProgress: (progress) => onProgress?.(mapImageTaskProgress(progress, resultUrls, promptTrace, i, payload.genCount)),
    });
    resultUrls.push(getResultUrl(result));
    promptTrace.push(createPromptTraceItem({
      index: i + 1,
      kind: payload.kind,
      model: payload.aiModel,
      promptKind: "garment3d",
      prompt,
      compiledPrompt: result.compiledPrompt || prompt,
    }));
    await onProgress?.(createCompletedImageProgress(resultUrls, promptTrace, result.taskId, i + 1, payload.genCount));
  }

  return { resultUrls, promptTrace };
}

function mapImageTaskProgress(
  progress: ImageTaskProgress,
  currentResultUrls: string[],
  currentPromptTrace: PromptTraceItem[],
  completedCount: number,
  expectedCount: number
): GenerationProgressUpdate {
  const safeExpected = Math.max(1, expectedCount);
  const taskProgress = clampProgress(progress.progress);
  const overall = Math.min(99, Math.round(((completedCount + taskProgress / 100) / safeExpected) * 100));
  return {
    resultUrls: currentResultUrls,
    promptTrace: currentPromptTrace,
    progress: overall,
    externalTaskId: progress.taskId,
    externalStatus: progress.providerStatus || progress.status,
  };
}

function createCompletedImageProgress(
  resultUrls: string[],
  promptTrace: PromptTraceItem[],
  taskId: string | undefined,
  completedCount: number,
  expectedCount: number
): GenerationProgressUpdate {
  const safeExpected = Math.max(1, expectedCount);
  return {
    resultUrls,
    promptTrace,
    progress: Math.min(100, Math.round((completedCount / safeExpected) * 100)),
    externalTaskId: taskId,
    externalStatus: "SUCCESS",
  };
}

function clampProgress(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.min(Math.max(Math.round(num), 0), 100);
}

function createPromptTraceItem(params: Omit<PromptTraceItem, "createdAt">): PromptTraceItem {
  return {
    ...params,
    prompt: limitStoredPrompt(params.prompt),
    compiledPrompt: limitStoredPrompt(params.compiledPrompt),
    createdAt: new Date().toISOString(),
  };
}

function appendPromptTrace(payload: GenerationJobPayload, promptTrace: PromptTraceItem[]) {
  if (!promptTrace.length) return payload;

  return {
    ...payload,
    promptTraceVersion: 1,
    promptTrace: promptTrace.slice(-8),
  };
}

function appendAsyncProgress(payload: GenerationJobPayload, update: GenerationProgressUpdate): GenerationJobPayload {
  if (
    typeof update.progress !== "number" &&
    !update.externalTaskId &&
    !update.externalStatus
  ) {
    return payload;
  }

  const existingAsyncTask = readExistingAsyncTask(payload);
  return {
    ...payload,
    asyncTask: {
      taskId: update.externalTaskId || existingAsyncTask.taskId,
      status: update.externalStatus || existingAsyncTask.status,
      progress: typeof update.progress === "number" ? Math.min(Math.max(Math.round(update.progress), 0), 100) : undefined,
      updatedAt: new Date().toISOString(),
    },
  } as unknown as GenerationJobPayload;
}

function readExistingAsyncTask(payload: GenerationJobPayload): { taskId?: string; status?: string } {
  const maybePayload = payload as unknown as { asyncTask?: unknown };
  const asyncTask = maybePayload.asyncTask;
  if (!asyncTask || typeof asyncTask !== "object") return {};
  const task = asyncTask as { taskId?: unknown; status?: unknown };
  return {
    taskId: typeof task.taskId === "string" ? task.taskId : undefined,
    status: typeof task.status === "string" ? task.status : undefined,
  };
}

function appendQualityMetadata(
  payload: GenerationJobPayload,
  quality: VisualQualityEvaluation,
  autoRegenerated: boolean
) {
  return {
    ...payload,
    qualityEvaluation: {
      ok: quality.ok,
      score: quality.score,
      shouldRegenerate: quality.shouldRegenerate,
      summary: quality.summary,
      issues: quality.issues,
      source: quality.source,
      traceId: quality.trace?.id,
      evaluatedAt: new Date().toISOString(),
    },
    autoRegeneration: {
      enabled: true,
      performed: autoRegenerated,
      maxAttempts: 1,
    },
  };
}

function shouldAutoRegenerate(payload: GenerationJobPayload, job: ClaimedJob) {
  if (process.env.AGENT_VISUAL_AUTO_REGENERATE_ENABLED === "false") return false;
  if (job.job_attempts > 1) return false;
  const meta = payload as GenerationJobPayload & { autoRegeneration?: { performed?: boolean } };
  return meta.autoRegeneration?.performed !== true;
}

function repairPayloadPrompt(payload: GenerationJobPayload, quality: VisualQualityEvaluation): GenerationJobPayload {
  const prompt = applyQualityRepairToPrompt(getPayloadPrompt(payload), quality);
  if (payload.kind === "tryon") return { ...payload, rawPrompt: prompt };
  if (payload.kind === "garment3d") return { ...payload, prompt, userPrompt: prompt };
  return { ...payload, prompt } as GenerationJobPayload;
}

function getPayloadPrompt(payload: GenerationJobPayload) {
  if (payload.kind === "tryon") return payload.rawPrompt || payload.style || "人物换装生成";
  if (payload.kind === "garment3d") return payload.userPrompt || payload.prompt;
  return payload.prompt;
}

function getExpectedResultCount(payload: GenerationJobPayload) {
  if (payload.kind === "pose") return getPoseGenerationCount(payload);
  return Math.max(1, Number((payload as { genCount?: number }).genCount || 1));
}

function getPayloadReferenceImages(payload: GenerationJobPayload) {
  if (payload.kind === "tryon") return [
    ...payload.clothingUrls,
    payload.modelFaceUrl,
    payload.referenceUrl,
  ].filter((url): url is string => typeof url === "string" && url.length > 0);
  if (payload.kind === "model") return [
    ...payload.referenceUrls,
    payload.hairReferenceUrl,
    payload.hairColorReferenceUrl,
  ].filter((url): url is string => typeof url === "string" && url.length > 0);
  if (payload.kind === "grass") return [payload.garmentUrl, payload.referenceUrl].filter((url): url is string => typeof url === "string" && url.length > 0);
  if (payload.kind === "modelBackground") return [payload.sourceUrl, payload.modelReferenceUrl, payload.backgroundReferenceUrl].filter((url): url is string => typeof url === "string" && url.length > 0);
  if (payload.kind === "pose") return [payload.mainImageUrl];
  if (payload.kind === "faceSwap") return [payload.sourceUrl, payload.faceUrl];
  if (payload.kind === "commerceDetail") return payload.sourceUrls;
  return [payload.garmentUrl, payload.referenceUrl].filter((url): url is string => typeof url === "string" && url.length > 0);
}

function limitStoredPrompt(prompt: string) {
  const normalized = prompt.replace(/\r\n/g, "\n").trim();
  return normalized.length > 12_000 ? `${normalized.slice(0, 12_000)}\n[truncated]` : normalized;
}

function getResultUrl(result: { url?: string; b64_json?: string }) {
  const resultUrl = result.url || result.b64_json;
  if (!resultUrl) throw new Error("图片生成接口未返回结果 URL");
  return resultUrl;
}

function parseJobPayload(value: unknown): GenerationJobPayload {
  if (!isJobPayload(value)) {
    throw new Error("任务 payload 无效，请重新提交生成");
  }

  return value;
}

function isJobPayload(value: unknown): value is GenerationJobPayload {
  if (!isRecord(value) || typeof value.kind !== "string") return false;

  if (value.kind === "tryon") {
    return hasStringArray(value.clothingUrls) &&
      typeof value.aiModel === "string" &&
      typeof value.aspectRatio === "string" &&
      typeof value.imageSize === "string" &&
      typeof value.genCount === "number";
  }

  if (value.kind === "model") {
    return hasStringArray(value.referenceUrls) &&
      typeof value.aiModel === "string" &&
      typeof value.aspectRatio === "string" &&
      typeof value.imageSize === "string" &&
      typeof value.prompt === "string" &&
      typeof value.genCount === "number";
  }

  if (value.kind === "grass") {
    return typeof value.garmentUrl === "string" &&
      typeof value.aiModel === "string" &&
      typeof value.aspectRatio === "string" &&
      typeof value.imageSize === "string" &&
      typeof value.prompt === "string" &&
      typeof value.genCount === "number";
  }

  if (value.kind === "modelBackground") {
    return typeof value.sourceUrl === "string" &&
      typeof value.aiModel === "string" &&
      typeof value.aspectRatio === "string" &&
      typeof value.imageSize === "string" &&
      typeof value.prompt === "string" &&
      typeof value.genCount === "number";
  }

  if (value.kind === "pose") {
    return typeof value.mainImageUrl === "string" &&
      typeof value.aiModel === "string" &&
      typeof value.imageSize === "string" &&
      typeof value.prompt === "string";
  }

  if (value.kind === "garment3d") {
    return typeof value.garmentUrl === "string" &&
      typeof value.aiModel === "string" &&
      typeof value.aspectRatio === "string" &&
      typeof value.imageSize === "string" &&
      typeof value.prompt === "string" &&
      typeof value.genCount === "number";
  }

  if (value.kind === "faceSwap") {
    return typeof value.sourceUrl === "string" &&
      typeof value.faceUrl === "string" &&
      typeof value.aiModel === "string" &&
      typeof value.aspectRatio === "string" &&
      typeof value.imageSize === "string" &&
      typeof value.prompt === "string" &&
      typeof value.genCount === "number";
  }

  if (value.kind === "commerceDetail") {
    return hasStringArray(value.sourceUrls) &&
      typeof value.aiModel === "string" &&
      typeof value.aspectRatio === "string" &&
      typeof value.imageSize === "string" &&
      typeof value.prompt === "string" &&
      typeof value.genCount === "number";
  }

  return false;
}

async function writeGenerationProgress(
  supabase: ReturnType<typeof createAdminClient>,
  job: ClaimedJob,
  payload: GenerationJobPayload,
  update: GenerationProgressUpdate
) {
  const { error } = await supabase
    .from("generations")
    .update({
      result_urls: update.resultUrls,
      job_payload: appendAsyncProgress(appendPromptTrace(payload, update.promptTrace), update),
    })
    .eq("id", job.id)
    .eq("user_id", job.user_id)
    .eq("status", "processing_tryon");

  if (error) throw new Error(`更新任务进度失败: ${error.message}`);
}

function normalizePoseOutputMode(value: unknown): PoseOutputMode {
  return value === "separate" ? "separate" : "grid";
}

function getPoseGenerationCount(payload: Extract<GenerationJobPayload, { kind: "pose" }>) {
  if (normalizePoseOutputMode(payload.outputMode) !== "separate") return 1;
  const num = Number(payload.genCount || 4);
  if (!Number.isFinite(num)) return 4;
  return Math.min(Math.max(Math.floor(num), 1), 4);
}

function normalizeCommerceDetailSections(
  sections: CommerceDetailSectionSpec[] | undefined,
  count: number
): CommerceDetailSectionSpec[] {
  const safeCount = Math.min(Math.max(Math.floor(Number(count) || 1), 1), 8);
  const defaults = buildCommerceDetailSections(safeCount);
  return Array.from({ length: safeCount }, (_, index) => {
    const section = sections?.[index];
    return {
      ...defaults[index],
      ...(section || {}),
      title: section?.title || defaults[index].title,
      purpose: section?.purpose || defaults[index].purpose,
      template: section?.template || defaults[index].template,
      avoid: Array.isArray(section?.avoid) && section.avoid.length ? section.avoid : defaults[index].avoid,
    };
  });
}

function buildSeparatePosePrompt(prompt: string, poseIndex: number) {
  const scopedPrompt = prompt
    .split("\n")
    .filter((line) => {
      const match = line.trim().match(/^姿势\s*([1-4])[：:]/);
      return !match || Number(match[1]) === poseIndex;
    })
    .join("\n")
    .trim();

  return [
    scopedPrompt,
    `本次单图任务：只生成姿势${poseIndex}这一张完整图片。`,
    `如果用户提示词里有“姿势${poseIndex}：”，严格执行该条姿势；如果没有逐条指定，则根据所选风格自主设计第${poseIndex}个自然姿势，并确保它与同组其它姿势有明显变化。`,
    "不要生成四宫格、拼图、分屏、边框、编号文字或 contact sheet。",
  ].join("\n");
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getFirstRow(data: unknown): ClaimedJob | null {
  return Array.isArray(data) && data.length > 0 ? (data[0] as ClaimedJob) : null;
}

function isSeedreamPayload(payload: GenerationJobPayload) {
  return payload.aiModel.startsWith("doubao-seedream-");
}

async function refundExhaustedJobs(supabase: ReturnType<typeof createAdminClient>) {
  const cutoffMs = Date.now() - getStaleMinutes() * 60 * 1000;
  const { data, error } = await supabase
    .from("generations")
    .select("id,user_id,credits_cost,processing_started_at,error_message")
    .eq("status", "processing_tryon")
    .gte("job_attempts", 3)
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    logger.error("[jobs] query exhausted jobs failed:", error.message);
    return 0;
  }

  const jobs = (Array.isArray(data) ? data : []) as ExhaustedJob[];
  const staleJobs = jobs.filter((job) => {
    if (!job.processing_started_at) return true;
    return Date.parse(job.processing_started_at) < cutoffMs;
  });

  for (const job of staleJobs) {
    await failGenerationWithRefund(supabase, {
      userId: job.user_id,
      generationId: job.id,
      amount: Number(job.credits_cost || 0),
      reason: "生成多次失败退还",
      errorMessage: job.error_message || "任务多次重试后仍未完成",
    });
  }

  return staleJobs.length;
}

function getStaleMinutes() {
  const value = Number(process.env.GENERATION_JOB_STALE_MINUTES || 8);
  if (!Number.isFinite(value)) return 8;
  return Math.min(Math.max(value, 1), 60);
}

import { getAdminClient } from "@/lib/supabase/admin";

function createAdminClient() {
  return getAdminClient();
}
