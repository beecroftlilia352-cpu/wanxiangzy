import { logger } from "@/lib/logger";
import {
  batchTryOn,
  generateImage,
  type AspectRatio,
  type ImageTaskProgress,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import { completeGenerationWithCreditAdjustment, failGenerationWithRefund } from "@/lib/api/credits";
import { resolveImageInputs } from "@/lib/api/image-inputs.server";
import { persistGeneratedImageUrls } from "@/lib/api/result-image-storage";
import { syncGenerationTaskQueueById } from "@/lib/task-queue-store";
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
import { buildSeparatePosePrompt, enforcePosePromptRequirements, type PoseOutputMode } from "@/lib/pose-prompt";
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
import type { TryOnAgeGroup, TryOnGarmentCategory, TryOnGarmentAudience } from "@/lib/tryon-prompt";
import type { TryOnClothingMode, TryOnClothingRole } from "@/lib/tryon-upload-rules";
import type { GrassPayloadBase } from "@/lib/grass-planting";
import type { ModelBackgroundPayloadBase } from "@/lib/model-background";
import { enforceFaceSwapPromptRequirements } from "@/lib/face-swap";
import {
  buildProductSetPrompt,
  createProductSetModuleResult,
  getProductSetModuleKey,
  getProductSetReferenceUrls,
  getProductSetResultUrlsFromModules,
  PRODUCT_SET_PROMPT_VERSION,
  normalizeProductSetCreationMode,
  normalizeProductSetImageType,
  normalizeProductSetModuleOverrides,
  normalizeProductSetModuleResults,
  normalizeProductSetProductProfile,
  normalizeProductSetSettings,
  resolveProductSetTemplates,
  type ProductSetCreationMode,
  type ProductSetCustomTemplate,
  type ProductSetImageType,
  type ProductSetModuleOverride,
  type ProductSetModuleResult,
  type ProductSetProductProfile,
  type ProductSetResolvedTemplate,
  type ProductSetSettings,
} from "@/lib/product-set";

type GenerationJobPayloadBase = {
  publicBaseUrl?: string | null;
};

export type GenerationJobPayload = GenerationJobPayloadBase & (
  | {
      kind: "tryon";
      clothingUrls: string[];
      clothingMode?: TryOnClothingMode;
      clothingRoles?: TryOnClothingRole[];
      garmentAudience?: TryOnGarmentAudience;
      ageGroup?: TryOnAgeGroup;
      garmentCategory?: TryOnGarmentCategory;
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
      kind: "generalImage";
      mode: "text-to-image" | "image-to-image";
      referenceUrls: string[];
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      prompt: string;
      genCount: number;
    }
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
      userPrompt?: string;
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
    }
  | {
      kind: "productSet";
      productImageUrls: string[];
      productInfo?: string;
      productProfile?: ProductSetProductProfile;
      mode: ProductSetCreationMode;
      imageType: ProductSetImageType;
      settings?: ProductSetSettings;
      selectedTemplateIds?: number[];
      customTemplates?: ProductSetCustomTemplate[];
      moduleOverrides?: ProductSetModuleOverride[];
      moduleResults?: ProductSetModuleResult[];
      regenerateIndex?: number;
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      prompt: string;
      genCount: number;
    }
);

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
  moduleResults?: ProductSetModuleResult[];
  progress?: number;
  externalTaskId?: string;
  externalStatus?: string;
  failedCount?: number;
  partialError?: string;
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
    await syncGenerationQueueIndex(job.id, "claim");
    const payload = parseJobPayload(job.job_payload);
    const partialResultUrls: string[] = [];
    const partialPromptTrace: PromptTraceItem[] = [];
    let partialModuleResults: ProductSetModuleResult[] = [];
    const rawModuleUrlByKey = new Map<string, string>();
    const persistedModuleUrlByKey = new Map<string, string>();
    let lastProgress = 0;
    const persistModuleResults = async (moduleResults: ProductSetModuleResult[]) => {
      const normalized = normalizeProductSetModuleResults(moduleResults);
      const persistedModules: ProductSetModuleResult[] = [];

      for (const moduleResult of normalized) {
        let resultUrl = moduleResult.resultUrl;
        if (resultUrl) {
          const previousRawUrl = rawModuleUrlByKey.get(moduleResult.moduleKey);
          if (previousRawUrl !== resultUrl) {
            const [persisted] = await persistGeneratedImageUrls([resultUrl], `${job.id}-${moduleResult.moduleKey}`, {
              forceServerDownload: isSeedreamPayload(payload),
              startIndex: moduleResult.index - 1,
            });
            rawModuleUrlByKey.set(moduleResult.moduleKey, resultUrl);
            persistedModuleUrlByKey.set(moduleResult.moduleKey, persisted || resultUrl);
            resultUrl = persisted || resultUrl;
          } else {
            resultUrl = persistedModuleUrlByKey.get(moduleResult.moduleKey) || resultUrl;
          }
        }
        persistedModules.push({ ...moduleResult, resultUrl });
      }

      partialModuleResults = persistedModules;
      partialResultUrls.splice(0, partialResultUrls.length, ...getProductSetResultUrlsFromModules(persistedModules));
      return persistedModules;
    };

    const execution = await executePayload(payload, async (update) => {
      if (update.moduleResults?.length) {
        const persistedModules = await persistModuleResults(update.moduleResults);
        const nextProgress = typeof update.progress === "number" ? update.progress : lastProgress;
        partialPromptTrace.splice(0, partialPromptTrace.length, ...update.promptTrace);
        lastProgress = Math.max(lastProgress, nextProgress);
        await writeGenerationProgress(supabase, job, payload, {
          resultUrls: partialResultUrls,
          promptTrace: partialPromptTrace,
          moduleResults: persistedModules,
          progress: lastProgress,
          externalTaskId: update.externalTaskId,
          externalStatus: update.externalStatus,
        });
        return;
      }

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
        moduleResults: partialModuleResults,
        progress: lastProgress,
        externalTaskId: update.externalTaskId,
        externalStatus: update.externalStatus,
      });
    });
    const finalModuleResults = execution.moduleResults?.length
      ? await persistModuleResults(execution.moduleResults)
      : undefined;
    const persistedResultUrls = finalModuleResults
      ? getProductSetResultUrlsFromModules(finalModuleResults)
      : partialResultUrls.length === execution.resultUrls.length
      ? partialResultUrls
      : await persistGeneratedImageUrls(execution.resultUrls, job.id, {
        forceServerDownload: isSeedreamPayload(payload),
      });
    const quality = shouldSkipVisualQualityEvaluation(payload)
      ? createSkippedVisualQualityEvaluation(payload)
      : await evaluateGeneratedImages({
        userPrompt: getPayloadPrompt(payload),
        module: payload.kind,
        resultUrls: persistedResultUrls,
        expectedCount: getExpectedResultCount(payload),
        referenceImageUrls: getPayloadReferenceImages(payload),
      });
    const repaired = !shouldSkipVisualQualityEvaluation(payload) && quality.shouldRegenerate && shouldAutoRegenerate(payload, job)
      ? await regenerateForQuality(supabase, job, payload, quality, partialPromptTrace)
      : null;
    if (quality.shouldRegenerate && !repaired && !isAutoRegenerationEnabled()) {
      logger.info(`[jobs] quality auto-regeneration disabled ${job.id}: score=${quality.score}`);
    }
    const finalUrls = repaired?.resultUrls || persistedResultUrls;
    const finalPromptTrace = repaired?.promptTrace || execution.promptTrace;
    const finalQuality = repaired?.quality || quality;
    const finalModulePayload = finalModuleResults
      ? await evaluateProductSetModuleResults({
        payload,
        moduleResults: finalModuleResults,
        promptTrace: finalPromptTrace,
        fallbackQuality: finalQuality,
      })
      : undefined;
    const expectedCount = getExpectedResultCount(payload);
    const moduleFailureSummary = finalModulePayload
      ?.filter((item) => item.status === "failed")
      .map((item) => `${item.name || item.moduleKey}: ${item.error || "failed"}`)
      .join("; ");
    const partialRefundAmount = calculatePartialRefund(Number(job.credits_cost || 0), finalUrls.length, expectedCount);
    const finalPayload = appendGenerationSettlementMetadata(appendProductSetModuleResults(
      appendPromptTrace(appendQualityMetadata(repaired?.payload || payload, finalQuality, Boolean(repaired)), finalPromptTrace),
      finalModulePayload
    ), {
      expectedCount,
      resultCount: finalUrls.length,
      failedCount: Math.max(Number(execution.failedCount || 0), Math.max(0, expectedCount - finalUrls.length)),
      refundAmount: partialRefundAmount,
      errorMessage: execution.partialError || moduleFailureSummary,
    });

    await completeGenerationRecord(supabase, job, finalUrls, finalPayload, {
      refundAmount: partialRefundAmount,
      errorMessage: execution.partialError || moduleFailureSummary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败";
    const settled = await settleFailedGenerationFromProgress(supabase, job, message);
    if (!settled) await failGenerationWithRefund(supabase, {
      userId: job.user_id,
      generationId: job.id,
      amount: Number(job.credits_cost || 0),
      reason: "生成失败退还",
      errorMessage: message,
    });
    throw err;
  }
}

async function completeGenerationRecord(
  supabase: ReturnType<typeof createAdminClient>,
  job: ClaimedJob,
  resultUrls: string[],
  jobPayload: Record<string, unknown>,
  options: { refundAmount?: number; errorMessage?: string } = {}
) {
  const totalCost = Math.max(0, Math.floor(Number(job.credits_cost || 0)));
  const refundAmount = Math.min(totalCost, Math.max(0, Math.floor(Number(options.refundAmount || 0))));
  const creditsUsed = Math.max(0, totalCost - refundAmount);
  const adjusted = await completeGenerationWithCreditAdjustment(supabase, {
    userId: job.user_id,
    generationId: job.id,
    resultUrls,
    jobPayload,
    creditsUsed,
    refundAmount,
    refundReason: refundAmount > 0 ? "部分生成失败退还" : "生成完成",
    errorMessage: options.errorMessage || null,
  });

  if (adjusted) return;
  if (refundAmount > 0) {
    logger.error(`[jobs] generation ${job.id} completed partially but credit adjustment rpc is unavailable; run supabase/atomic-credit-rpc.sql`);
  }

  const { data, error } = await supabase
    .from("generations")
    .update({
      status: "completed",
      result_urls: resultUrls,
      job_payload: jobPayload,
      processing_started_at: null,
      completed_at: new Date().toISOString(),
      credits_used: refundAmount > 0 ? totalCost : creditsUsed,
    })
    .eq("id", job.id)
    .eq("user_id", job.user_id)
    .neq("status", "failed")
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`更新任务结果失败: ${error.message}`);
  if (!data) {
    logger.warn(`[jobs] generation ${job.id} was no longer completable; skipped completion write`);
  } else {
    await syncGenerationQueueIndex(job.id, "complete-fallback");
  }
}

async function settleFailedGenerationFromProgress(
  supabase: ReturnType<typeof createAdminClient>,
  job: ClaimedJob,
  errorMessage: string
) {
  const { data, error } = await supabase
    .from("generations")
    .select("status,result_urls,job_payload,credits_cost")
    .eq("id", job.id)
    .eq("user_id", job.user_id)
    .maybeSingle();

  if (error) {
    logger.error(`[jobs] failed to inspect partial progress for ${job.id}: ${error.message}`);
    return false;
  }

  const row = data as { status?: string | null; result_urls?: string[] | null; job_payload?: unknown; credits_cost?: number | null } | null;
  if (!row) return false;
  const status = String(row.status || "").toLowerCase();
  if (status === "completed" || status === "success" || status === "succeeded") return true;

  const resultUrls = Array.isArray(row.result_urls) ? row.result_urls.filter(Boolean) : [];
  if (!resultUrls.length) return false;

  const payloadRecord = isRecord(row.job_payload) ? row.job_payload : {};
  const expectedCount = readExpectedCountFromRecord(payloadRecord, resultUrls.length);
  const refundAmount = calculatePartialRefund(Number(row.credits_cost ?? job.credits_cost ?? 0), resultUrls.length, expectedCount);
  const settledPayload = appendGenerationSettlementMetadata(payloadRecord, {
    expectedCount,
    resultCount: resultUrls.length,
    failedCount: Math.max(0, expectedCount - resultUrls.length),
    refundAmount,
    errorMessage,
  });

  await completeGenerationRecord(supabase, job, resultUrls, settledPayload, {
    refundAmount,
    errorMessage,
  });
  return true;
}

function appendGenerationSettlementMetadata<T extends Record<string, unknown>>(
  payload: T,
  params: {
    expectedCount: number;
    resultCount: number;
    failedCount: number;
    refundAmount: number;
    errorMessage?: string;
  }
): T {
  if (!params.errorMessage && params.refundAmount <= 0 && params.failedCount <= 0) return payload;
  const asyncTask = isRecord(payload.asyncTask) ? payload.asyncTask : {};
  return {
    ...payload,
    asyncTask: {
      ...asyncTask,
      status: params.resultCount > 0 ? "PARTIAL_SUCCESS" : asyncTask.status,
      progress: 100,
      updatedAt: new Date().toISOString(),
    },
    partialFailure: {
      message: params.errorMessage || "",
      expectedCount: params.expectedCount,
      resultCount: params.resultCount,
      failedCount: params.failedCount,
      refundAmount: params.refundAmount,
      settledAt: new Date().toISOString(),
    },
  } as T;
}

function calculatePartialRefund(totalCost: number, resultCount: number, expectedCount: number) {
  const cost = Math.max(0, Math.floor(Number(totalCost) || 0));
  const expected = Math.max(1, Math.floor(Number(expectedCount) || 1));
  const completed = Math.min(expected, Math.max(0, Math.floor(Number(resultCount) || 0)));
  if (cost <= 0 || completed >= expected) return 0;
  if (completed <= 0) return cost;
  const charged = Math.min(cost, Math.max(1, Math.floor((cost * completed) / expected)));
  return Math.max(0, cost - charged);
}

function readExpectedCountFromRecord(payload: Record<string, unknown>, fallback: number) {
  const moduleResults = normalizeProductSetModuleResults(payload.moduleResults);
  if (moduleResults.length) return moduleResults.length;
  const count = Number(payload.genCount);
  if (Number.isFinite(count) && count > 0) return Math.floor(count);
  return Math.max(1, fallback);
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

async function evaluateProductSetModuleResults(params: {
  payload: GenerationJobPayload;
  moduleResults: ProductSetModuleResult[];
  promptTrace: PromptTraceItem[];
  fallbackQuality: VisualQualityEvaluation;
}) {
  if (params.payload.kind !== "productSet") return params.moduleResults;
  const normalized = normalizeProductSetModuleResults(params.moduleResults);
  const referenceImageUrls = getPayloadReferenceImages(params.payload);
  const traceByKey = new Map(params.promptTrace.map((item) => [item.promptKind.split(":").pop() || "", item]));
  const evaluated = [...normalized];

  await runWithConcurrency(evaluated, Math.min(2, Math.max(1, evaluated.length)), async (moduleResult, index) => {
    if (moduleResult.status === "failed" || !moduleResult.resultUrl) {
      evaluated[index] = {
        ...moduleResult,
        qualityScore: 0,
        qualitySummary: moduleResult.error || "模块生成失败",
        qualityIssues: [moduleResult.error || "模块没有返回可用图片"],
        qualitySource: "module_status",
      };
      return;
    }

    const trace = traceByKey.get(moduleResult.moduleKey);
    const userPrompt = trace?.prompt || [
      getPayloadPrompt(params.payload),
      moduleResult.moduleRole || moduleResult.name,
      moduleResult.contentScope || "",
    ].filter(Boolean).join("\n");
    const quality = await evaluateGeneratedImages({
      userPrompt,
      module: `productSet:${moduleResult.moduleKey}`,
      resultUrls: [moduleResult.resultUrl],
      expectedCount: 1,
      referenceImageUrls,
    }).catch(() => params.fallbackQuality);

    evaluated[index] = {
      ...moduleResult,
      qualityScore: quality.score,
      qualitySummary: quality.summary,
      qualityIssues: quality.issues.slice(0, 8),
      qualitySource: quality.source,
    };
  });

  return normalizeProductSetModuleResults(evaluated);
}

async function executePayload(
  payload: GenerationJobPayload,
  onProgress?: GenerationProgressCallback
): Promise<GenerationExecutionResult> {
  const promptTrace: PromptTraceItem[] = [];
  const resolvePayloadImageInputs = (input: Parameters<typeof resolveImageInputs>[0]) =>
    resolveImageInputs(input, { publicBaseUrl: payload.publicBaseUrl });
  type ParallelImageRunResult = {
    resultUrl?: string;
    resultUrls?: string[];
    prompt: string;
    compiledPrompt: string;
    taskId?: string;
  };
  const executeParallelImageBatch = async (params: {
    count: number;
    promptKind: string | ((index: number) => string);
    run: (index: number, onTaskProgress: (progress: ImageTaskProgress) => Promise<void>) => Promise<ParallelImageRunResult>;
  }): Promise<GenerationExecutionResult> => {
    const expectedCount = Math.max(1, Math.floor(params.count || 1));
    const resultUrlSlots: string[][] = Array.from({ length: expectedCount }, () => []);
    const traceSlots: Array<PromptTraceItem | null> = Array.from({ length: expectedCount }, () => null);
    const failures: Array<{ index: number; message: string }> = [];
    const taskProgress = Array.from({ length: expectedCount }, () => 0);
    let completedCount = 0;
    let progressQueue = Promise.resolve();
    const getCompletedResultUrls = () => resultUrlSlots.flat();
    const getCompletedPromptTrace = () => traceSlots.filter((item): item is PromptTraceItem => Boolean(item));
    const emitProgress = (update: GenerationProgressUpdate) => {
      if (!onProgress) return Promise.resolve();
      progressQueue = progressQueue.then(() => onProgress(update));
      return progressQueue;
    };

    const runOne = async (index: number) => {
      try {
        const result = await params.run(index, (progress) => {
          taskProgress[index] = Math.max(taskProgress[index] || 0, clampProgress(progress.progress));
          const aggregateProgress = Math.min(
            99,
            Math.max(1, Math.round(taskProgress.reduce((sum, value) => sum + value, 0) / expectedCount))
          );
          return emitProgress({
            resultUrls: getCompletedResultUrls(),
            promptTrace: getCompletedPromptTrace(),
            progress: aggregateProgress,
            externalTaskId: progress.taskId,
            externalStatus: progress.providerStatus || progress.status,
          });
        });
        const nextUrls = (result.resultUrls?.length ? result.resultUrls : result.resultUrl ? [result.resultUrl] : [])
          .filter((url): url is string => Boolean(url));
        resultUrlSlots[index] = nextUrls;
        traceSlots[index] = createPromptTraceItem({
          index: index + 1,
          kind: payload.kind,
          model: payload.aiModel,
          promptKind: typeof params.promptKind === "function" ? params.promptKind(index) : params.promptKind,
          prompt: result.prompt,
          compiledPrompt: result.compiledPrompt,
        });
        taskProgress[index] = 100;
        completedCount += 1;
        await emitProgress(createCompletedImageProgress(
          getCompletedResultUrls(),
          getCompletedPromptTrace(),
          result.taskId,
          completedCount,
          expectedCount
        ));
      } catch (error) {
        const message = error instanceof Error ? error.message : "image task failed";
        failures.push({ index, message });
        taskProgress[index] = 100;
        await emitProgress({
          resultUrls: getCompletedResultUrls(),
          promptTrace: getCompletedPromptTrace(),
          progress: Math.min(99, Math.round(taskProgress.reduce((sum, value) => sum + value, 0) / expectedCount)),
          externalStatus: "FAILED",
        });
      }
    };

    await Promise.all(Array.from({ length: expectedCount }, async (_, index) => runOne(index)));

    await progressQueue;
    const resultUrls = getCompletedResultUrls();
    const traces = getCompletedPromptTrace();
    if (!resultUrls.length && failures.length) {
      throw new Error(failures[0]?.message || "image task failed");
    }

    return {
      resultUrls,
      promptTrace: traces,
      failedCount: failures.length,
      partialError: failures.length ? failures.map((item) => `#${item.index + 1}: ${item.message}`).join("; ") : undefined,
    };
  };

  if (payload.kind === "tryon") {
    const imageInputs = await resolvePayloadImageInputs({
      clothingUrls: payload.clothingUrls,
      modelFaceUrl: payload.modelFaceUrl || undefined,
      referenceUrl: payload.referenceUrl || undefined,
    });
    return executeParallelImageBatch({
      count: payload.genCount,
      promptKind: "tryon",
      run: async (index, onTaskProgress) => {
        const result = await batchTryOn({
          model: payload.aiModel,
          clothingUrls: imageInputs.clothingUrls,
          clothingMode: payload.clothingMode,
          clothingRoles: payload.clothingRoles,
          garmentAudience: payload.garmentAudience,
          ageGroup: payload.ageGroup,
          garmentCategory: payload.garmentCategory,
          modelFaceUrl: imageInputs.modelFaceUrl,
          referenceUrl: imageInputs.referenceUrl,
          aspect_ratio: payload.aspectRatio,
          image_size: payload.imageSize,
          style: payload.style,
          raw_prompt: payload.rawPrompt,
          candidateIndex: index,
          candidateCount: payload.genCount,
          onProgress: onTaskProgress,
        });
        return {
          resultUrls: result.resultUrls,
          prompt: result.prompt,
          compiledPrompt: result.compiledPrompt,
          taskId: result.taskId,
        };
      },
    });
  }

  if (payload.kind === "model") {
    const references = [
      ...payload.referenceUrls,
      payload.hairReferenceUrl,
      payload.hairColorReferenceUrl,
    ].filter(Boolean) as string[];
    const imageInputs = await resolvePayloadImageInputs({ clothingUrls: references });
    const modelStyle = normalizeModelShootStyle(payload.modelStyle);

    return executeParallelImageBatch({
      count: payload.genCount,
      promptKind: "model",
      run: async (_index, onTaskProgress) => {
        const prompt = enforceModelPromptRequirements({
          prompt: applyModelShootStylePrompt(payload.prompt, modelStyle),
          referenceCount: payload.referenceUrls.length,
          gender: payload.gender,
          hairStyle: payload.hairStyle,
          hairColor: payload.hairColor,
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
          onProgress: onTaskProgress,
        });
        return {
          resultUrl: getResultUrl(result),
          prompt,
          compiledPrompt: result.compiledPrompt || prompt,
          taskId: result.taskId,
        };
      },
    });
  }

  if (payload.kind === "grass") {
    const imageInputs = await resolvePayloadImageInputs({
      clothingUrls: [
        payload.garmentUrl,
        ...(payload.referenceUrl ? [payload.referenceUrl] : []),
      ],
    });

    return executeParallelImageBatch({
      count: payload.genCount,
      promptKind: "grass",
      run: async (_index, onTaskProgress) => {
        const result = await generateImage({
          model: payload.aiModel,
          prompt: payload.prompt,
          prompt_kind: "grass",
          aspect_ratio: payload.aspectRatio,
          image: imageInputs.clothingUrls,
          image_size: payload.imageSize,
          onProgress: onTaskProgress,
        });
        return {
          resultUrl: getResultUrl(result),
          prompt: payload.prompt,
          compiledPrompt: result.compiledPrompt || payload.prompt,
          taskId: result.taskId,
        };
      },
    });
  }

  if (payload.kind === "modelBackground") {
    const sourceImages = [
      payload.sourceUrl,
      payload.modelReferenceUrl,
      payload.backgroundReferenceUrl,
    ].filter(Boolean) as string[];
    const imageInputs = await resolvePayloadImageInputs({ clothingUrls: sourceImages });

    return executeParallelImageBatch({
      count: payload.genCount,
      promptKind: "modelBackground",
      run: async (_index, onTaskProgress) => {
        const result = await generateImage({
          model: payload.aiModel,
          prompt: payload.prompt,
          prompt_kind: "modelBackground",
          aspect_ratio: payload.aspectRatio,
          image: imageInputs.clothingUrls,
          image_size: payload.imageSize,
          onProgress: onTaskProgress,
        });
        return {
          resultUrl: getResultUrl(result),
          prompt: payload.prompt,
          compiledPrompt: result.compiledPrompt || payload.prompt,
          taskId: result.taskId,
        };
      },
    });
  }

  if (payload.kind === "generalImage") {
    const imageInputs = payload.mode === "image-to-image"
      ? await resolvePayloadImageInputs({ clothingUrls: payload.referenceUrls })
      : { clothingUrls: [] };

    return executeParallelImageBatch({
      count: payload.genCount,
      promptKind: payload.mode,
      run: async (_index, onTaskProgress) => {
        const result = await generateImage({
          model: payload.aiModel,
          prompt: payload.prompt,
          aspect_ratio: payload.aspectRatio,
          image: imageInputs.clothingUrls,
          image_size: payload.imageSize,
          onProgress: onTaskProgress,
        });
        return {
          resultUrl: getResultUrl(result),
          prompt: payload.prompt,
          compiledPrompt: result.compiledPrompt || payload.prompt,
          taskId: result.taskId,
        };
      },
    });
  }

  if (payload.kind === "pose") {
    const imageInputs = await resolvePayloadImageInputs({ clothingUrls: [payload.mainImageUrl] });
    const poseStyle = normalizePoseSeriesStyle(payload.poseStyle);
    const outputMode = normalizePoseOutputMode(payload.outputMode);
    const prompt = enforcePosePromptRequirements(applyPoseSeriesStylePrompt(payload.prompt, poseStyle), {
      varyExpression: payload.varyExpression !== false,
      poseStyle,
      outputMode,
    });

    if (outputMode === "separate") {
      const generationCount = getPoseGenerationCount(payload);
      return executeParallelImageBatch({
        count: generationCount,
        promptKind: "pose",
        run: async (index, onTaskProgress) => {
          const posePrompt = buildSeparatePosePrompt(prompt, index + 1);
          const result = await generateImage({
            model: payload.aiModel,
            prompt: posePrompt,
            prompt_kind: "pose",
            aspect_ratio: "3:4",
            image: imageInputs.clothingUrls,
            image_size: payload.imageSize,
            onProgress: onTaskProgress,
          });
          return {
            resultUrl: getResultUrl(result),
            prompt: posePrompt,
            compiledPrompt: result.compiledPrompt || posePrompt,
            taskId: result.taskId,
          };
        },
      });
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
    const imageInputs = await resolvePayloadImageInputs({
      clothingUrls: [payload.sourceUrl, payload.faceUrl],
    });
    const prompt = enforceFaceSwapPromptRequirements(payload.prompt);

    return executeParallelImageBatch({
      count: payload.genCount,
      promptKind: "faceSwap",
      run: async (_index, onTaskProgress) => {
        const result = await generateImage({
          model: payload.aiModel,
          prompt,
          prompt_kind: "faceSwap",
          aspect_ratio: payload.aspectRatio,
          image: imageInputs.clothingUrls,
          image_size: payload.imageSize,
          onProgress: onTaskProgress,
        });
        return {
          resultUrl: getResultUrl(result),
          prompt,
          compiledPrompt: result.compiledPrompt || prompt,
          taskId: result.taskId,
        };
      },
    });
  }

  if (payload.kind === "commerceDetail") {
    const imageInputs = await resolvePayloadImageInputs({ clothingUrls: payload.sourceUrls });
    const layout = normalizeCommerceDetailLayout(payload.layout);
    const sections = normalizeCommerceDetailSections(payload.sections, payload.genCount);
    const generationCount = sections.length;

    return executeParallelImageBatch({
      count: generationCount,
      promptKind: (index) => `commerceDetail:${sections[index]?.id || index + 1}`,
      run: async (index, onTaskProgress) => {
        const section = sections[index];
        const prompt = buildCommerceDetailSectionPrompt({
          userPrompt: payload.prompt,
          platform: payload.platform || "general",
          layout,
          mobileWidth: payload.mobileWidth || 750,
          section,
          sectionIndex: index + 1,
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
          onProgress: onTaskProgress,
        });
        return {
          resultUrl: getResultUrl(result),
          prompt,
          compiledPrompt: result.compiledPrompt || prompt,
          taskId: result.taskId,
        };
      },
    });
  }

  if (payload.kind === "productSet") {
    const imageType = normalizeProductSetImageType(payload.imageType);
    const mode = normalizeProductSetCreationMode(payload.mode);
    const settings = normalizeProductSetSettings(payload.settings);
    const productProfile = normalizeProductSetProductProfile(payload.productProfile, payload.productInfo || payload.prompt);
    const moduleOverrides = normalizeProductSetModuleOverrides(payload.moduleOverrides);
    const templates = resolveProductSetTemplates({
      mode,
      imageType,
      selectedTemplateIds: payload.selectedTemplateIds,
      customTemplates: payload.customTemplates,
      genCount: payload.genCount,
      productProfile,
      settings,
      moduleOverrides,
    });
    const fallbackTemplates = templates.length ? templates : resolveProductSetTemplates({ mode: "smart", imageType, genCount: 1, productProfile, settings, moduleOverrides });
    const rawRegenerateIndex = Number(payload.regenerateIndex);
    const regenerateIndex = Number.isFinite(rawRegenerateIndex) ? Math.floor(rawRegenerateIndex) : null;
    const targetEntries = fallbackTemplates
      .map((template, index) => ({ template, index }))
      .filter((entry) => regenerateIndex === null || entry.index === regenerateIndex);
    const moduleResults = targetEntries.map(({ template, index }) => createProductSetModuleResult(template, index, {
      promptVariant: settings.stylePackId || "auto",
      updatedAt: new Date().toISOString(),
    }));
    const moduleStartedAt = new Map<string, number>();
    const updateModule = (moduleKey: string, patch: Partial<ProductSetModuleResult>) => {
      const index = moduleResults.findIndex((item) => item.moduleKey === moduleKey);
      if (index < 0) return;
      moduleResults[index] = {
        ...moduleResults[index],
        ...patch,
        updatedAt: patch.updatedAt || new Date().toISOString(),
        progress: typeof patch.progress === "number" ? Math.min(Math.max(Math.round(patch.progress), 0), 100) : moduleResults[index].progress,
      };
    };
    const moduleProgress = () => {
      const count = Math.max(1, moduleResults.length);
      const total = moduleResults.reduce((sum, item) => sum + (item.status === "completed" || item.status === "failed" ? 100 : Math.min(item.progress, 99)), 0);
      return Math.min(99, Math.round(total / count));
    };
    const emitModuleProgress = async (externalTaskId?: string, externalStatus?: string) => {
      await onProgress?.({
        resultUrls: getProductSetResultUrlsFromModules(moduleResults),
        promptTrace,
        moduleResults: normalizeProductSetModuleResults(moduleResults),
        progress: moduleProgress(),
        externalTaskId,
        externalStatus,
      });
    };

    await emitModuleProgress();

    await runWithConcurrency(targetEntries, Math.min(3, Math.max(1, targetEntries.length)), async ({ template, index }) => {
      const moduleKey = getProductSetModuleKey(template, index);
      const outputAspectRatio = template.aspectRatio || payload.aspectRatio;
      const styleReferenceUrls = getProductSetReferenceUrls(template).slice(0, 3);
      const prompt = buildProductSetPrompt({
        productInfo: payload.productInfo || payload.prompt,
        productProfile,
        productImageCount: payload.productImageUrls.length,
        template,
        allTemplates: fallbackTemplates,
        settings,
        mode,
        aspectRatio: outputAspectRatio,
        imageSize: payload.imageSize,
        sequenceIndex: index,
        totalCount: fallbackTemplates.length,
      });

      moduleStartedAt.set(moduleKey, Date.now());
      updateModule(moduleKey, { status: "running", progress: 3, startedAt: new Date().toISOString(), attempt: 1 });
      await emitModuleProgress();

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          updateModule(moduleKey, { status: "running", attempt, error: undefined });
          const imageInputs = await resolvePayloadImageInputs({
            clothingUrls: [
              ...payload.productImageUrls,
              ...styleReferenceUrls,
            ],
          });
          const result = await generateImage({
            model: payload.aiModel,
            prompt,
            prompt_kind: "productSet",
            aspect_ratio: outputAspectRatio,
            image: imageInputs.clothingUrls,
            image_size: payload.imageSize,
            onProgress: async (progress) => {
              updateModule(moduleKey, {
                status: "running",
                progress: Math.min(clampProgress(progress.progress), 99),
                taskId: progress.taskId,
                providerStatus: progress.providerStatus || progress.status,
              });
              await emitModuleProgress(progress.taskId, progress.providerStatus || progress.status);
            },
          });
          const resultUrl = getResultUrl(result);
          promptTrace.push(createPromptTraceItem({
            index: index + 1,
            kind: payload.kind,
            model: payload.aiModel,
            promptKind: `productSet:${PRODUCT_SET_PROMPT_VERSION}:${settings.stylePackId || "auto"}:${moduleKey}`,
            prompt,
            compiledPrompt: result.compiledPrompt || prompt,
          }));
          updateModule(moduleKey, {
            status: "completed",
            progress: 100,
            resultUrl,
            taskId: result.taskId,
            providerStatus: "SUCCESS",
            promptVersion: PRODUCT_SET_PROMPT_VERSION,
            promptVariant: settings.stylePackId || "auto",
            promptHash: hashPrompt(result.compiledPrompt || prompt),
            completedAt: new Date().toISOString(),
            durationMs: Math.max(0, Date.now() - (moduleStartedAt.get(moduleKey) || Date.now())),
            error: undefined,
          });
          await emitModuleProgress(result.taskId, "SUCCESS");
          return;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "模块生成失败";
          if (attempt < 2) {
            updateModule(moduleKey, {
              status: "running",
              progress: 5,
              error: `${message}，正在自动重试`,
            });
            await emitModuleProgress();
            continue;
          }
          updateModule(moduleKey, {
            status: "failed",
            progress: 100,
            error: message,
            providerStatus: "FAILED",
            attempt,
            completedAt: new Date().toISOString(),
            durationMs: Math.max(0, Date.now() - (moduleStartedAt.get(moduleKey) || Date.now())),
          });
          await emitModuleProgress(undefined, "FAILED");
        }
      }
    });

    const resultUrls = getProductSetResultUrlsFromModules(moduleResults);
    if (!resultUrls.length) {
      const firstError = moduleResults.find((item) => item.error)?.error || "商品套图全部模块生成失败";
      throw new Error(firstError);
    }
    return {
      resultUrls,
      promptTrace: promptTrace.sort((a, b) => a.index - b.index),
      moduleResults: normalizeProductSetModuleResults(moduleResults),
    };
  }

  const imageInputs = await resolvePayloadImageInputs({
    clothingUrls: [
      payload.garmentUrl,
      ...(payload.referenceUrl ? [payload.referenceUrl] : []),
    ],
  });
  const displayStyle = normalizeGarment3dDisplayStyle(payload.displayStyle);

  return executeParallelImageBatch({
    count: payload.genCount,
    promptKind: "garment3d",
    run: async (_index, onTaskProgress) => {
      const prompt = applyGarment3dDisplayStylePrompt(payload.prompt, displayStyle);
      const result = await generateImage({
        model: payload.aiModel,
        prompt,
        prompt_kind: "garment3d",
        aspect_ratio: payload.aspectRatio,
        image: imageInputs.clothingUrls,
        image_size: payload.imageSize,
        onProgress: onTaskProgress,
      });
      return {
        resultUrl: getResultUrl(result),
        prompt,
        compiledPrompt: result.compiledPrompt || prompt,
        taskId: result.taskId,
      };
    },
  });
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

function hashPrompt(prompt: string) {
  let hash = 2166136261;
  for (let i = 0; i < prompt.length; i++) {
    hash ^= prompt.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
) {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length || 1);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  }));
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

function appendProductSetModuleResults(payload: GenerationJobPayload, moduleResults?: ProductSetModuleResult[]) {
  if (payload.kind !== "productSet" || !moduleResults?.length) return payload;
  return {
    ...payload,
    moduleResults: normalizeProductSetModuleResults(moduleResults),
  } as GenerationJobPayload;
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
  const nextPayload = {
    ...payload,
    asyncTask: {
      taskId: update.externalTaskId || existingAsyncTask.taskId,
      status: update.externalStatus || existingAsyncTask.status,
      progress: typeof update.progress === "number" ? Math.min(Math.max(Math.round(update.progress), 0), 100) : undefined,
      updatedAt: new Date().toISOString(),
    },
  } as unknown as GenerationJobPayload;
  return appendProductSetModuleResults(nextPayload, update.moduleResults);
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
      enabled: isAutoRegenerationEnabled(),
      performed: autoRegenerated,
      maxAttempts: 1,
    },
  };
}

function shouldAutoRegenerate(payload: GenerationJobPayload, job: ClaimedJob) {
  if (!isAutoRegenerationEnabled()) return false;
  if (payload.kind === "productSet") return false;
  if (job.job_attempts > 1) return false;
  const meta = payload as GenerationJobPayload & { autoRegeneration?: { performed?: boolean } };
  return meta.autoRegeneration?.performed !== true;
}

function shouldSkipVisualQualityEvaluation(payload: GenerationJobPayload) {
  return payload.kind === "tryon" || payload.kind === "pose";
}

function createSkippedVisualQualityEvaluation(payload: GenerationJobPayload): VisualQualityEvaluation {
  return {
    ok: true,
    score: 1,
    shouldRegenerate: false,
    summary: payload.kind === "tryon"
      ? "服装上身已跳过自动视觉评估。"
      : payload.kind === "pose"
        ? "姿势裂变已跳过自动视觉评估。"
        : "已跳过自动视觉评估。",
    issues: [],
    source: "deterministic",
  };
}

function isAutoRegenerationEnabled() {
  return process.env.AGENT_VISUAL_AUTO_REGENERATE_ENABLED === "true";
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
  if (payload.kind === "productSet" && payload.moduleResults?.length) return payload.moduleResults.length;
  return Math.max(1, Number((payload as { genCount?: number }).genCount || 1));
}

function getPayloadReferenceImages(payload: GenerationJobPayload) {
  if (payload.kind === "tryon") return [
    ...payload.clothingUrls,
    payload.referenceUrl,
    payload.modelFaceUrl,
  ].filter((url): url is string => typeof url === "string" && url.length > 0);
  if (payload.kind === "model") return [
    ...payload.referenceUrls,
    payload.hairReferenceUrl,
    payload.hairColorReferenceUrl,
  ].filter((url): url is string => typeof url === "string" && url.length > 0);
  if (payload.kind === "grass") return [payload.garmentUrl, payload.referenceUrl].filter((url): url is string => typeof url === "string" && url.length > 0);
  if (payload.kind === "modelBackground") return [payload.sourceUrl, payload.modelReferenceUrl, payload.backgroundReferenceUrl].filter((url): url is string => typeof url === "string" && url.length > 0);
  if (payload.kind === "generalImage") return payload.referenceUrls;
  if (payload.kind === "pose") return [payload.mainImageUrl];
  if (payload.kind === "faceSwap") return [payload.sourceUrl, payload.faceUrl];
  if (payload.kind === "commerceDetail") return payload.sourceUrls;
  if (payload.kind === "productSet") {
    const imageType = normalizeProductSetImageType(payload.imageType);
    const mode = normalizeProductSetCreationMode(payload.mode);
    const settings = normalizeProductSetSettings(payload.settings);
    const productProfile = normalizeProductSetProductProfile(payload.productProfile, payload.productInfo || payload.prompt);
    const templates = resolveProductSetTemplates({
      mode,
      imageType,
      selectedTemplateIds: payload.selectedTemplateIds,
      customTemplates: payload.customTemplates,
      genCount: payload.genCount,
      productProfile,
      settings,
      moduleOverrides: normalizeProductSetModuleOverrides(payload.moduleOverrides),
    });
    return [
      ...payload.productImageUrls,
      ...Array.from(new Set(templates.flatMap((template) => getProductSetReferenceUrls(template)))).slice(0, 8),
    ];
  }
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

  if (value.kind === "generalImage") {
    return (value.mode === "text-to-image" || value.mode === "image-to-image") &&
      hasStringArray(value.referenceUrls) &&
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

  if (value.kind === "productSet") {
    return hasStringArray(value.productImageUrls) &&
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
  await syncGenerationQueueIndex(job.id, "progress");
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

async function syncGenerationQueueIndex(generationId: string, phase: string) {
  try {
    await syncGenerationTaskQueueById(generationId);
  } catch (error) {
    logger.warn(`[task-queue-index] generation ${phase} sync skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}

import { getAdminClient } from "@/lib/supabase/admin";

function createAdminClient() {
  return getAdminClient();
}
