"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { StudioMediaLightbox } from "@/components/studio/StudioMediaLightbox";
import { StudioModelSelector, StudioOptionGrid } from "@/components/studio/StudioFormControls";
import { ResolutionSelector } from "@/components/studio/ResolutionSelector";
import { PromptTextarea } from "@/components/studio/PromptTextarea";
import { AspectRatioSelector } from "@/components/studio/AspectRatioSelector";
import { GenerationCountField } from "@/components/studio/GenerationCountField";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { useGenerationPolling } from "@/hooks/use-generation-polling";
import { assetUrls, useResourcePicker } from "@/features/resource-library";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { useResolutionOptions, useStudioImageModelOptions } from "@/lib/studio-models";
import { fetchHistoryApplyDetail, getHistoryApplyFailureMessage, isHistoryApplyRowFailed, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import { GARMENT_TYPE_OPTIONS, type GarmentType } from "@/lib/garment-types";
import { applyGenerationResponseStatus, showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import {
  DEFAULT_MATERIAL_ENHANCEMENT_LEVEL,
  MATERIAL_ENHANCEMENT_LEVELS,
  buildMaterialEnhancementPrompt,
  normalizeMaterialEnhancementLevel,
  type MaterialEnhancementLevel,
} from "@/lib/material-enhancement";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import { createGenericImagePreviewSession, type ImagePreviewAction } from "@/lib/studio-image-preview";
import { FAILED_RETRY_NOTICE, buildPartialFailureDetail, coerceErrorMessage, summarizeGenerationError } from "@/lib/studio-generation-feedback";
import {
  buildRetryPendingResultUrls,
  getRetryDisplayExpectedCount,
  mergeRetryResultUrls,
  normalizeRetryResultIndex,
} from "@/lib/result-slot-retry";

type MaterialEnhancementHistoryPayload = Extract<HistoryJobPayload, { kind: "materialEnhancement" }>;
type MaterialEnhancementGenerateOptions = {
  genCountOverride?: number;
  expectedCountOverride?: number;
  retryResultIndex?: number;
  toastMessage?: string;
};

const GARMENT_TYPE_LABEL_KEYS: Record<string, string> = {
  "上装": "garmentTypes.top",
  "下装": "garmentTypes.bottom",
  "连体衣": "garmentTypes.onePiece",
  "其他": "garmentTypes.other",
};

function fieldGarmentTypeLabelKey(type: string): string {
  return GARMENT_TYPE_LABEL_KEYS[type] ?? "garmentTypes.other";
}

const MATERIAL_PREVIEW_ACTIONS: ImagePreviewAction[] = [
  { kind: "download", label: "下载图片" },
  { kind: "copy", label: "复制链接" },
  { kind: "repair", label: "AI修图" },
  { kind: "aiVideo", label: "AI视频" },
  { kind: "modelBackground", label: "换背景" },
  { kind: "pose", label: "姿势裂变" },
  { kind: "productSet", label: "商品套图" },
  { kind: "regenerateAll", label: "重新创作" },
  { kind: "feedback", label: "反馈" },
];

export default function MaterialEnhancementPage() {
  const t = useTranslations("MaterialEnhancement");
  const { openResourcePicker } = useResourcePicker();
  const displayModels = useStudioImageModelOptions();
  const displayActions = useMemo(() => MATERIAL_PREVIEW_ACTIONS.map((a) => {
    const labelKeys: Record<string, string> = {
      download: "actions.download",
      copy: "actions.copy",
      repair: "actions.repair",
      aiVideo: "actions.aiVideo",
      modelBackground: "actions.modelBackground",
      pose: "actions.pose",
      productSet: "actions.productSet",
      regenerateAll: "actions.regenerateAll",
      feedback: "actions.feedback",
    };
    return { ...a, label: t(labelKeys[a.kind]) };
  }), [t]);
  const router = useRouter();
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const garmentInputRef = useRef<HTMLInputElement>(null);

  const { authChecked, isAuthenticated, userId, credits, setCredits, refreshCredits, refreshAuth } = useStudioAuth();

  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [garmentUrl, setGarmentUrl] = useState("");
  const [garmentName, setGarmentName] = useState("");
  const [garmentType, setGarmentType] = useState<GarmentType>("上装");
  const [customGarmentType, setCustomGarmentType] = useState("");
  const [enhancementLevel, setEnhancementLevel] = useState<MaterialEnhancementLevel>(DEFAULT_MATERIAL_ENHANCEMENT_LEVEL);
  const [userPrompt, setUserPrompt] = useState("");

  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const [aspectRatio, setAspectRatio] = useState<Extract<AspectRatio, "auto" | "3:4" | "4:5" | "1:1">>("auto");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);

  const [isDraggingSource, setIsDraggingSource] = useState(false);
  const [isDraggingGarment, setIsDraggingGarment] = useState(false);
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [isUploadingGarment, setIsUploadingGarment] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [, setProgress] = useState(0);
  const [runningExpectedCount, setRunningExpectedCount] = useState<number | null>(null);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  // Hoisted from JSX prop expression to satisfy Rules of Hooks (useResolutionOptions
  // calls useTranslations + useMemo).
  const resolutionOptions = useResolutionOptions(
    imageSizes,
    (size) => getCreditCost(aiModel, size, aspectRatio),
    t("common.lingpoints"),
  );
  const costPerImage = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = costPerImage * genCount;
  const authIsAnonymous = authChecked && !isAuthenticated;
  const taskInputThumbnails = useMemo(() => [sourceUrl, garmentUrl].filter(Boolean), [sourceUrl, garmentUrl]);
  const taskQueue = useTaskQueueGeneration({
    module: "materialEnhancement",
    title: t("moduleName"),
    defaultExpectedCount: genCount,
    applyPath: "/material-enhancement",
  });

  // 轮询 context：pollCtxRef.current 由调用方在 start 前赋值；
  // buildUrl / onTick / onComplete / onError 都从 ref 读 identity，绕过
  // "useGenerationPolling 的 id 字段在 render 时被冻结" 的问题。
  const pollCtxRef = useRef<{
    activeTaskId: string;
    generationId: string;
    displayExpectedCount: number;
    taskInputThumbnails: string[];
    retryPreviousResultUrls: string[];
    retryResultIndex: number | null;
    runTotalCost: number;
    latestResultUrlsRef: { current: string[] };
  } | null>(null);
  const { start: startMaterialEnhancementPolling } = useGenerationPolling<{
    status: string;
    progress?: number;
    result_urls?: unknown;
    error?: string;
    partial_failure?: { message?: unknown };
  }>({
    id: "",
    buildUrl: () => {
      const id = pollCtxRef.current?.generationId ?? "";
      return `/api/material-enhancement?generation_id=${encodeURIComponent(id)}`;
    },
    isTerminal: (state) => state.status === "completed" || state.status === "failed",
    intervalMs: 2000,
    maxAttempts: 120,
    onTick: (state) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      if (Array.isArray(state.result_urls) && state.result_urls.length) {
        const merged = mergeRetryResultUrls(
          ctx.retryPreviousResultUrls,
          ctx.retryResultIndex,
          state.result_urls,
          ctx.displayExpectedCount,
        );
        ctx.latestResultUrlsRef.current = merged;
        setResultUrls(merged);
      }
      const nextProgress = Number(state.progress);
      const runningProgress = Number.isFinite(nextProgress)
        ? Math.min(Math.max(Math.round(nextProgress), 0), 99)
        : 25;
      setProgress(runningProgress);
      taskQueue.markRunning(ctx.activeTaskId, {
        expectedCount: ctx.displayExpectedCount,
        inputThumbnails: ctx.taskInputThumbnails,
        resultThumbnails: ctx.latestResultUrlsRef.current,
        resultCount: ctx.latestResultUrlsRef.current.filter(Boolean).length,
        progress: runningProgress,
        status: state.status || "processing",
      });
    },
    onComplete: (state) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      const finalUrls = mergeRetryResultUrls(
        ctx.retryPreviousResultUrls,
        ctx.retryResultIndex,
        Array.isArray(state.result_urls) ? state.result_urls : ctx.latestResultUrlsRef.current,
        ctx.displayExpectedCount,
      );
      ctx.latestResultUrlsRef.current = finalUrls;
      const finalResultCount = finalUrls.filter(Boolean).length;
      if (state.status === "completed") {
        const partialFailure = state.partial_failure && typeof state.partial_failure === "object"
          ? (state.partial_failure as { message?: unknown })
          : null;
        const completedError = state.error || coerceErrorMessage(partialFailure?.message);
        setProgress(100);
        setResultUrls(finalUrls);
        setIsGenerating(false);
        taskQueue.markCompleted(ctx.activeTaskId, {
          expectedCount: ctx.displayExpectedCount,
          inputThumbnails: ctx.taskInputThumbnails,
          resultThumbnails: finalUrls,
          resultCount: finalResultCount,
          error: completedError ? summarizeGenerationError(completedError) : "",
        });
        if (completedError || finalResultCount < ctx.displayExpectedCount) {
          void refreshCredits();
          toast.warning(t("generation.partialComplete", { done: finalResultCount, expected: ctx.displayExpectedCount }));
        } else {
          toast.success(t("generation.completed"));
        }
      } else {
        const message = state.error || t("generation.failed");
        setError(message);
        taskQueue.markFailed(ctx.activeTaskId, message, {
          expectedCount: ctx.displayExpectedCount,
          inputThumbnails: ctx.taskInputThumbnails,
          resultThumbnails: finalUrls,
          resultCount: finalResultCount,
        });
        if (credits !== null && credits < ctx.runTotalCost) {
          showInsufficientCreditsToast({ required: ctx.runTotalCost, balance: credits, onRecharge: () => router.push("/pricing") });
        } else {
          toast.error(message);
        }
        void refreshCredits();
        setIsGenerating(false);
      }
    },
    onError: (error) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      const message = error.message || t("generation.timeout");
      setError(message);
      taskQueue.markFailed(ctx.activeTaskId, message, {
        expectedCount: ctx.displayExpectedCount,
        inputThumbnails: ctx.taskInputThumbnails,
        resultThumbnails: ctx.latestResultUrlsRef.current,
        resultCount: ctx.latestResultUrlsRef.current.filter(Boolean).length,
      });
      if (credits !== null && credits < ctx.runTotalCost) {
        showInsufficientCreditsToast({ required: ctx.runTotalCost, balance: credits, onRecharge: () => router.push("/pricing") });
      } else {
        toast.error(message);
      }
      void refreshCredits();
      setIsGenerating(false);
    },
  });

  const finalPrompt = useMemo(() => buildMaterialEnhancementPrompt({
    garmentType,
    customGarmentType,
    enhancementLevel,
    userPrompt,
  }), [customGarmentType, enhancementLevel, garmentType, userPrompt]);
  const enhancementLevelLabel = useMemo(
    () => MATERIAL_ENHANCEMENT_LEVELS.find((item) => item.value === enhancementLevel)?.label || enhancementLevel,
    [enhancementLevel]
  );
  const activeResultExpectedCount = isGenerating
    ? runningExpectedCount || genCount
    : runningExpectedCount || Math.max(resultUrls.length, 1);
  const displayedResultUrls = resultUrls.filter(Boolean);
  const hasCompletedPartialResults = Boolean(
    !isGenerating
    && activeResultExpectedCount > displayedResultUrls.length
    && displayedResultUrls.length > 0
  );
  const partialFailureMessage = buildPartialFailureDetail({
    failedCount: activeResultExpectedCount - displayedResultUrls.length,
  });
  const retryDisabled = isGenerating;
  function handleRetryFailedResult(index: number) {
    if (retryDisabled) return;
    void generate(undefined, {
      genCountOverride: 1,
      expectedCountOverride: 1,
      retryResultIndex: index,
      toastMessage: t("retry.pendingMessage", { index: index + 1 }),
    });
  }
  const previewSession = useMemo(
    () => createGenericImagePreviewSession({
      module: "materialEnhancement",
      title: t("moduleName"),
      taskId: activeGenerationId || undefined,
      urls: resultUrls,
      expectedCount: activeResultExpectedCount,
      isGenerating,
      statusGroup: isGenerating ? "running" : undefined,
      references: [
        ...(sourceUrl ? [{ url: sourceUrl, label: t("meta.sourceImage"), role: "source" as const }] : []),
        ...(garmentUrl ? [{ url: garmentUrl, label: t("meta.garmentImage"), role: "garment" as const }] : []),
      ],
      promptText: userPrompt,
      metaItems: [
        { label: t("meta.garmentType"), value: garmentType === "其他" ? customGarmentType : garmentType },
        { label: t("meta.enhanceLevel"), value: enhancementLevelLabel },
        { label: t("meta.model"), value: aiModel },
        { label: t("meta.aspectRatio"), value: aspectRatio },
        { label: t("meta.resolution"), value: imageSize },
        { label: t("meta.count"), value: genCount },
      ],
      resultTitlePrefix: t("preview.resultTitlePrefix"),
      aspectRatio,
    }),
    [activeGenerationId, activeResultExpectedCount, aiModel, aspectRatio, customGarmentType, enhancementLevelLabel, garmentType, garmentUrl, genCount, imageSize, isGenerating, resultUrls, sourceUrl, userPrompt]
  );

  const runDisabledReason = !sourceUrl
    ? t("run.needSource")
    : !garmentUrl
      ? t("run.needGarment")
      : garmentType === "其他" && !customGarmentType.trim()
        ? t("run.needCustomType")
        : credits !== null && credits < totalCost
          ? t("run.insufficientCredits", { cost: totalCost })
          : undefined;

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const detail = await takeApplyDetail("materialEnhancement");
      if (cancelled || !detail) return;
      applyHistoryPayload(detail.payload, detail.resultUrls);
      if (isHistoryApplyRowFailed(detail.row)) {
        setError(getHistoryApplyFailureMessage(detail.row));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function applyHistoryPayload(payload: MaterialEnhancementHistoryPayload, historyResultUrls: string[] = [], options?: { silent?: boolean }) {
    setSourceUrl(payload.sourceUrl);
    setSourceName(t("history.sourceName"));
    setGarmentUrl(payload.garmentUrl);
    setGarmentName(t("history.garmentName"));
    setGarmentType(GARMENT_TYPE_OPTIONS.includes(payload.garmentType as GarmentType) ? payload.garmentType as GarmentType : "其他");
    setCustomGarmentType(GARMENT_TYPE_OPTIONS.includes(payload.garmentType as GarmentType) ? "" : payload.garmentType || "");
    setEnhancementLevel(normalizeMaterialEnhancementLevel(payload.enhancementLevel));
    setUserPrompt(payload.userPrompt || "");
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio === "auto" || payload.aspectRatio === "1:1" || payload.aspectRatio === "4:5" ? payload.aspectRatio : "3:4");
    setImageSize(payload.imageSize);
    setGenCount(payload.genCount);
    setRunningExpectedCount(null);
    setResultUrls(historyResultUrls);
    setIsGenerating(false);
    setProgress(historyResultUrls.length ? 100 : 0);
    setError(null);
    if (!options?.silent) toast.success(t("history.applied"));
  }

  async function handleUpload(files: FileList | File[], kind: "source" | "garment") {
    const file = Array.from(files)[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("upload.pleaseUploadImage"));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t("upload.imageTooLarge", { mb: MAX_FILE_SIZE_MB }));
      return;
    }

    if (kind === "source") {
      setSourceName(file.name);
      setIsUploadingSource(true);
    } else {
      setGarmentName(file.name);
      setIsUploadingGarment(true);
    }

    toast.info(kind === "source" ? t("upload.uploadingSource") : t("upload.uploadingGarment"));
    try {
      const result = await uploadImage(file);
      if (kind === "source") {
        setSourceUrl(result.url);
        toast.success(t("upload.sourceReady"));
      } else {
        setGarmentUrl(result.url);
        toast.success(t("upload.garmentReady"));
      }
    } catch {
      if (kind === "source") setSourceUrl("");
      else setGarmentUrl("");
      toast.error(t("upload.uploadFailed"));
    } finally {
      if (kind === "source") setIsUploadingSource(false);
      else setIsUploadingGarment(false);
    }
  }

  async function generate(finalPromptForRun?: string, options: MaterialEnhancementGenerateOptions = {}) {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("common.pleaseLogin"));
      router.push("/login");
      return;
    }
    const runGenCount = Math.min(Math.max(Math.round(Number(options.genCountOverride ?? genCount) || 1), 1), 4);
    const runExpectedCount = Math.max(1, Math.round(Number(options.expectedCountOverride ?? runGenCount) || runGenCount));
    const retryResultIndex = normalizeRetryResultIndex(options.retryResultIndex);
    const retryPreviousResultUrls = retryResultIndex !== null ? resultUrls : [];
    const displayExpectedCount = getRetryDisplayExpectedCount({
      retryIndex: retryResultIndex,
      currentExpectedCount: activeResultExpectedCount,
      previousUrls: retryPreviousResultUrls,
      fallbackExpectedCount: runExpectedCount,
    });
    const runTotalCost = costPerImage * runExpectedCount;
    if (runDisabledReason) {
      const isCreditShort = credits !== null && credits < runTotalCost;
      if (isCreditShort && (credits === null || credits < runTotalCost)) {
        showInsufficientCreditsToast({ required: runTotalCost, balance: credits, onRecharge: () => router.push("/pricing") });
        return;
      }
      if (!isCreditShort) {
        toast.error(runDisabledReason);
        return;
      }
    }
    if (credits !== null && credits < runTotalCost) {
      showInsufficientCreditsToast({ required: runTotalCost, balance: credits, onRecharge: () => router.push("/pricing") });
      return;
    }

    setIsGenerating(true);
    setRunningExpectedCount(displayExpectedCount);
    setProgress(12);
    setResultUrls(buildRetryPendingResultUrls(retryPreviousResultUrls, retryResultIndex, displayExpectedCount));
    setError(null);
    if (options.toastMessage) toast.info(options.toastMessage);

    const provisionalTask = taskQueue.startTask({
      expectedCount: displayExpectedCount,
      inputThumbnails: taskInputThumbnails,
      progress: 12,
    });
    let activeTaskId = provisionalTask.id;
    let latestTaskResultUrls: string[] = [];

    try {
      const res = await fetch("/api/material-enhancement", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `generation-${activeTaskId}` },
        body: JSON.stringify({
          source_url: sourceUrl,
          garment_url: garmentUrl,
          garment_type: garmentType,
          custom_garment_type: customGarmentType,
          enhancement_level: enhancementLevel,
          user_prompt: userPrompt,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          prompt: finalPromptForRun || finalPrompt,
          gen_count: runGenCount,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          taskQueue.removeTask(activeTaskId);
          await refreshAuth();
          router.push("/login");
          return;
        }
        // 402 仅在服务端返回数字余额时更新（?? 0 会把真实余额清零并持久化缓存）；其余非 ok 抛服务端错误
        applyGenerationResponseStatus({ res, data, userId, setCredits, fallbackError: t("generation.failed") });
      }

      if (data.credits_remaining !== undefined) {
        setCredits(data.credits_remaining);
        if (userId) setCachedProfileCredits(userId, data.credits_remaining);
      }

      if (typeof data.generation_id === "string" && data.generation_id) {
        setActiveGenerationId(data.generation_id);
        const initialResultUrls = mergeRetryResultUrls(
          retryPreviousResultUrls,
          retryResultIndex,
          Array.isArray(data.result_urls) ? data.result_urls : [],
          displayExpectedCount
        );
        const serverTask = taskQueue.replaceWithServerTask(activeTaskId, {
          id: data.generation_id,
          expectedCount: displayExpectedCount,
          inputThumbnails: taskInputThumbnails,
          status: data.status || "processing",
          progress: data.status === "completed" ? 100 : 25,
          resultThumbnails: initialResultUrls,
          resultCount: initialResultUrls.filter(Boolean).length,
        });
        activeTaskId = serverTask.id;
      }
      // 启动后台轮询：catch 只处理 submit 错误，poll 失败由 hook 的 onError 处理。
      pollCtxRef.current = {
        activeTaskId,
        generationId: data.generation_id,
        displayExpectedCount,
        taskInputThumbnails,
        retryPreviousResultUrls,
        retryResultIndex,
        runTotalCost,
        latestResultUrlsRef: { current: latestTaskResultUrls },
      };
      startMaterialEnhancementPolling();
    } catch (err: unknown) {
      const message = summarizeGenerationError(err instanceof Error ? err.message : t("generation.operationFailed"));
      setError(message);
      taskQueue.markFailed(activeTaskId, message, {
        expectedCount: displayExpectedCount,
        inputThumbnails: taskInputThumbnails,
        resultThumbnails: latestTaskResultUrls,
        resultCount: latestTaskResultUrls.filter(Boolean).length,
      });
      if (credits !== null && credits < runTotalCost) {
        showInsufficientCreditsToast({ required: runTotalCost, balance: credits, onRecharge: () => router.push("/pricing") });
      } else {
        toast.error(message);
      }
      void refreshCredits();
    } finally {
      setIsGenerating(false);
    }
  }

  function handleRunningTask(item: TaskQueueItem) {
    setActiveGenerationId(item.id);
    const urls = safeTaskQueueUrls(item.resultThumbnails);
    const nextProgress = Number.isFinite(Number(item.progress)) ? Number(item.progress) : 8;
    setRunningExpectedCount(clampTaskExpectedCount(item, 1, 4));
    setIsGenerating(true);
    setProgress(Math.min(Math.max(Math.round(nextProgress), 1), 99));
    setResultUrls(urls);
    setError(null);
  }

  async function handleCompletedTask(item: TaskQueueItem, session: TaskSelectionSession) {
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "materialEnhancement", session.signal);
      if (!session.isCurrent()) return true;
      setActiveGenerationId(item.id);
      applyHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), {
        silent: session.reason === "restore",
      });
      if (item.statusGroup === "failed" || isHistoryApplyRowFailed(detail.row)) {
        setError(getHistoryApplyFailureMessage(detail.row, item.error || t("generation.failed")));
      }
      return true;
    } catch (err) {
      if (session.signal.aborted || !session.isCurrent()) return true;
      toast.error(err instanceof Error ? err.message : t("history.taskLoadFailed"));
      return true;
    }
  }

  function resetForm() {
    setSourceUrl("");
    setSourceName("");
    setGarmentUrl("");
    setGarmentName("");
    setGarmentType("上装");
    setCustomGarmentType("");
    setEnhancementLevel(DEFAULT_MATERIAL_ENHANCEMENT_LEVEL);
    setUserPrompt("");
    setAiModel("nano-banana-2");
    setAspectRatio("auto");
    setImageSize("1K");
    setGenCount(1);
    setIsGenerating(false);
    setRunningExpectedCount(null);
    setProgress(0);
    setResultUrls([]);
    setActiveGenerationId(null);
    setError(null);
    setLightboxSrc(null);
    if (sourceInputRef.current) sourceInputRef.current.value = "";
    if (garmentInputRef.current) garmentInputRef.current.value = "";
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="materialEnhancement" />
      <ModuleTaskRail
        module="materialEnhancement"
        moduleLabel={t("moduleName")}
        onContinue={resetForm}
        onRunningTask={handleRunningTask}
        onCompletedTask={handleCompletedTask}
      />

      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          <ModuleHeader
            title={t("moduleName")}
            tooltip={t("header.tooltip")}
          />

          <StudioUploadSection
            title={t("upload.sourceSectionTitle")}
            inputRef={sourceInputRef}
            isDragging={isDraggingSource}
            setDragging={setIsDraggingSource}
            onFiles={(files) => handleUpload(files, "source")}
          >
            {(openFileDialog, dragContext) => (
              <StudioUploadTile
                title={t("upload.sourceTileTitle")}
                description={t("upload.sourceTileDesc")}
                imageUrl={sourceUrl || null}
                imageAlt={t("upload.sourceImageAlt")}
                isDragging={isDraggingSource}
                loading={isUploadingSource}
                onUploadClick={openFileDialog}
                onLibraryClick={async () => {
                  const assets = await openResourcePicker({
                    title: t("upload.sourceSectionTitle"),
                    role: "source",
                    selectionMode: "single",
                    maxCount: 1,
                    existingCount: sourceUrl ? 1 : 0,
                    excludedUrls: sourceUrl ? [sourceUrl] : [],
                    mediaTypes: ["image"],
                    moduleKey: "materialEnhancement",
                  });
                  const [url] = assetUrls(assets);
                  if (!url) return;
                  setSourceUrl(url);
                  setSourceName(assets?.[0]?.title || t("upload.uploadedSource"));
                }}
                onPreview={sourceUrl ? () => setLightboxSrc(sourceUrl) : undefined}
                onRemove={sourceUrl ? () => {
                  setSourceUrl("");
                  setSourceName("");
                } : undefined}
                onDropFile={(file) => handleUpload(file ? [file] : [], "source")}
                dragContext={dragContext}
                uploadLabel={t("upload.localUpload")}
                libraryLabel={t("upload.fromWorks")}
                footnote={sourceUrl ? sourceName || t("upload.uploadedSource") : t("upload.sourceFootnote")}
              />
            )}
          </StudioUploadSection>

          <StudioUploadSection
            title={t("upload.garmentSectionTitle")}
            inputRef={garmentInputRef}
            isDragging={isDraggingGarment}
            setDragging={setIsDraggingGarment}
            onFiles={(files) => handleUpload(files, "garment")}
          >
            {(openFileDialog, dragContext) => (
              <StudioUploadTile
                title={t("upload.garmentTileTitle")}
                description={t("upload.garmentTileDesc")}
                imageUrl={garmentUrl || null}
                imageAlt={t("upload.garmentImageAlt")}
                isDragging={isDraggingGarment}
                loading={isUploadingGarment}
                onUploadClick={openFileDialog}
                onLibraryClick={async () => {
                  const assets = await openResourcePicker({
                    title: t("upload.garmentSectionTitle"),
                    role: "garment",
                    selectionMode: "single",
                    maxCount: 1,
                    existingCount: garmentUrl ? 1 : 0,
                    excludedUrls: garmentUrl ? [garmentUrl] : [],
                    mediaTypes: ["image"],
                    moduleKey: "materialEnhancement",
                  });
                  const [url] = assetUrls(assets);
                  if (!url) return;
                  setGarmentUrl(url);
                  setGarmentName(assets?.[0]?.title || t("upload.uploadedGarment"));
                }}
                onPreview={garmentUrl ? () => setLightboxSrc(garmentUrl) : undefined}
                onRemove={garmentUrl ? () => {
                  setGarmentUrl("");
                  setGarmentName("");
                } : undefined}
                onDropFile={(file) => handleUpload(file ? [file] : [], "garment")}
                dragContext={dragContext}
                uploadLabel={t("upload.localUpload")}
                libraryLabel={t("upload.fromWorks")}
                footnote={garmentUrl ? garmentName || t("upload.uploadedGarment") : t("upload.garmentFootnote")}
              />
            )}
          </StudioUploadSection>

          <section>
            <h3 className="studio-control-title mb-3">{t("garmentType.title")}</h3>
            <StudioOptionGrid
              options={GARMENT_TYPE_OPTIONS.map((type) => ({ value: type, label: t(fieldGarmentTypeLabelKey(type)) }))}
              value={garmentType}
              onChange={setGarmentType}
              columns={4}
              ariaLabel={t("garmentType.aria")}
            />
            {garmentType === "其他" && (
              <input
                value={customGarmentType}
                onChange={(event) => setCustomGarmentType(event.target.value)}
                placeholder={t("garmentType.customPlaceholder")}
                className="studio-text-input mt-2"
              />
            )}
          </section>

          <section>
            <h3 className="studio-control-title mb-3">{t("enhance.title")}</h3>
            <StudioOptionGrid
              options={MATERIAL_ENHANCEMENT_LEVELS.map((item) => ({
                value: item.value,
                label: item.label,
                description: item.description,
              }))}
              value={enhancementLevel}
              onChange={setEnhancementLevel}
              columns={3}
              ariaLabel={t("enhance.aria")}
            />
          </section>

          <PromptTextarea
            title={t("prompt.title")}
            badge={t("prompt.badge")}
            value={userPrompt}
            onChange={(event) => setUserPrompt(event.target.value)}
            placeholder={t("prompt.placeholder")}
            rows={4}
            description={t("prompt.desc")}
            maxLength={2000}
            onClear={() => setUserPrompt("")}
          />

          <StudioModelSelector models={displayModels} value={aiModel} onChange={setAiModel} ariaLabel={t("section.modelAria")} />

          <section>
            <h3 className="studio-control-title mb-3">{t("section.aspectRatio")}</h3>
            <AspectRatioSelector
              options={[
                { value: "auto", label: t("aspect.smart") },
                { value: "3:4" },
                { value: "4:5" },
                { value: "1:1" },
              ] as const}
              value={aspectRatio}
              onChange={setAspectRatio}
              ariaLabel={t("section.aspectRatioAria")}
            />
          </section>

          <section>
            <ResolutionSelector
              title={t("section.resolution")}
              options={resolutionOptions}
              value={imageSize}
              onChange={setImageSize}
              ariaLabel={t("section.resolutionAria")}
            />
          </section>

          <section>
            <GenerationCountField
              title={t("section.count")}
              label={t("section.count")}
              value={genCount}
              onChange={setGenCount}
              ariaLabel={t("section.countAria")}
            />
          </section>
        </div>

        <StudioRunBar
          summary={t("run.summary", { unit: costPerImage, count: genCount })}
          estimateLabel={isGenerating ? t("runBar.estimateGenerating") : t("runBar.estimateReady", { count: genCount })}
          costLabel={authIsAnonymous ? t("run.loginToView") : t("run.costLabel", { cost: totalCost, balance: credits ?? "-" })}
          disabled={isGenerating || Boolean(runDisabledReason)}
          disabledReason={runDisabledReason}
          primaryLabel={authIsAnonymous ? t("run.loginToGenerate") : isGenerating ? t("run.generating") : t("run.generateCount", { count: genCount })}
          isLoading={isGenerating}
          onPrimaryAction={() => generate()}
        />
      </div>

      <div className="studio-canvas min-h-[260px] sm:min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title={t("guide.title")}
              subtitle={t("guide.subtitle")}
              imageSrc="https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/model-white-top-denim-shorts.jpg"
              imageAlt={t("guide.imageAlt")}
              steps={[
                { title: t("guide.step1Title"), desc: t("guide.step1Desc") },
                { title: t("guide.step2Title"), desc: t("guide.step2Desc") },
                { title: t("guide.step3Title"), desc: t("guide.step3Desc") },
              ]}
            />
          </div>
        )}

        {(isGenerating || resultUrls.length > 0) && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full animate-fade-in">
            <div className="flex min-h-full items-start justify-start">
              <ResultImageGrid
                urls={resultUrls}
                filenamePrefix="material-enhancement"
                expectedCount={activeResultExpectedCount}
                isGenerating={isGenerating}
                inputThumbnails={taskInputThumbnails}
                statusGroup={isGenerating ? "running" : undefined}
                variant="task"
                resourceFavorite={{ generationId: activeGenerationId, moduleKey: "materialEnhancement", mediaType: "image" }}
                markMissingAsFailed={hasCompletedPartialResults}
                missingFailureLabel={t("result.missingLabel")}
                missingFailureDetail={partialFailureMessage}
                missingFailureActionLabel={t("result.retryAction")}
                onMissingFailureAction={handleRetryFailedResult}
                missingFailureActionDisabled={retryDisabled}
                onOpen={(_, index) => setPreviewIndex(index)}
              
                  tileAspectRatio={aspectRatio}
                />
            </div>
            <StudioImagePreviewDialog
              open={previewIndex !== null}
              onClose={() => setPreviewIndex(null)}
              session={previewSession}
              selectedIndex={previewIndex || 0}
              onSelectedIndexChange={setPreviewIndex}
              filenamePrefix="material-enhancement"
              actions={displayActions}
              onRegenerateAll={() => { setResultUrls([]); setProgress(0); }}
            />
          </div>
        )}

        {error && (
          <ErrorStage
            error={summarizeGenerationError(error)}
            onRetry={() => generate()}
            isGenerating={isGenerating}
            retryDisabled={retryDisabled}
            retryLabel={t("result.retryLabel")}
            notice={FAILED_RETRY_NOTICE}
          />
        )}
      </div>

      <StudioMediaLightbox
        src={lightboxSrc}
        alt={t("moduleName")}
        onClose={() => setLightboxSrc(null)}
      />
    </div>
  );
}
