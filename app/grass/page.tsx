"use client";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { useRulesPopover } from "@/hooks/use-rules-popover";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Cpu, Loader2, Upload, X, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { StudioModelSelector, StudioOptionGrid, StudioPromptTextarea } from "@/components/studio/StudioFormControls";
import { AspectRatioSelector } from "@/components/studio/AspectRatioSelector";
import { GenerationCountField } from "@/components/studio/GenerationCountField";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { StudioRulesPopover } from "@/components/studio/StudioRulesPopover";
import { useStableFileDrag } from "@/components/studio/useStableFileDrag";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { useGenerationPolling } from "@/hooks/use-generation-polling";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { StudioMediaLightbox } from "@/components/studio/StudioMediaLightbox";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { useImageSizeOptions, useStudioImageModelOptions } from "@/lib/studio-models";
import {
  buildGrassPrompt,
  GRASS_PROMPT_REFERENCES,
  GRASS_TEMPLATES,
  GRASS_UPLOAD_RULE,
  getGrassTemplate,
  normalizeGrassSceneBackgroundMode,
  normalizeGrassSceneMode,
  normalizeGrassTemplate,
  type GrassSceneBackgroundMode,
  type GrassSceneMode,
  type GrassTemplateId,
} from "@/lib/grass-planting";
import { fetchHistoryApplyDetail, getHistoryApplyFailureMessage, isHistoryApplyRowFailed, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import { useHistoryApply } from "@/hooks/use-history-apply";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import { applyGenerationResponseStatus, showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import { createGenericImagePreviewSession, type ImagePreviewAction } from "@/lib/studio-image-preview";
import { useStudioPreview } from "@/hooks/use-studio-preview";
import { FAILED_RETRY_NOTICE, buildPartialFailureDetail, coerceErrorMessage, summarizeGenerationError } from "@/lib/studio-generation-feedback";
import {
  buildRetryPendingResultUrls,
  getRetryDisplayExpectedCount,
  mergeRetryResultUrls,
  normalizeRetryResultIndex,
} from "@/lib/result-slot-retry";

type GrassHistoryPayload = Extract<HistoryJobPayload, { kind: "grass" }>;
type GrassGenerateOptions = {
  genCountOverride?: number;
  expectedCountOverride?: number;
  retryResultIndex?: number;
  toastMessage?: string;
};

const ASPECTS: { value: AspectRatio; label: string; labelKey?: string }[] = [
  { value: "auto", label: "智能", labelKey: "Shared.aspect.auto" },
  { value: "4:5", label: "4:5 种草", labelKey: "Grass.aspects.plant" },
  { value: "3:4", label: "3:4 竖版", labelKey: "Shared.aspect.portrait" },
  { value: "1:1", label: "1:1 方图", labelKey: "Shared.aspect.square" },
  { value: "9:16", label: "9:16 手机", labelKey: "Shared.aspect.phone" },
  { value: "4:3", label: "4:3 横图", labelKey: "Shared.aspect.landscape" },
];

const GRASS_PREVIEW_ACTIONS: ImagePreviewAction[] = [
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

export default function GrassPage() {
  const router = useRouter();
  const t = useTranslations("Grass");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const {
    authChecked,
    isAuthenticated,
    userId,
    credits,
    setCredits,
    refreshCredits,
    refreshAuth,
  } = useStudioAuth();
  const {
    buttonRef: rulesButtonRef,
    show: showRules,
    style: rulesPopoverStyle,
    open: openRulesPopover,
    scheduleHide: scheduleRulesHide,
    close: closeRulesPopover,
    cancelHide: cancelRulesHide,
  } = useRulesPopover({ width: 720 });
  const [garmentUrl, setGarmentUrl] = useState("");
  const [garmentName, setGarmentName] = useState("");
  const [templateId, setTemplateId] = useState<GrassTemplateId>("street");
  const [sceneMode, setSceneMode] = useState<GrassSceneMode>("system_reference");
  const [sceneBackgroundMode, setSceneBackgroundMode] = useState<GrassSceneBackgroundMode>("reference_scene");
  const [uploadedReferenceUrl, setUploadedReferenceUrl] = useState("");
  const [uploadedReferenceName, setUploadedReferenceName] = useState("");
  const [changeModel, setChangeModel] = useState(true);
  const [userPrompt, setUserPrompt] = useState("");

  // 未保存输入离开拦截
  const { unsavedDialog } = useUnsavedChangesGuard(Boolean(garmentUrl || userPrompt.trim()));
  const [supplementPrompt, setSupplementPrompt] = useState("");
  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const modelOptions = useStudioImageModelOptions();
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingReference, setIsDraggingReference] = useState(false);
  const [isUploadingGarment, setIsUploadingGarment] = useState(false);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [runningExpectedCount, setRunningExpectedCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const referenceDrag = useStableFileDrag<HTMLDivElement>({
    isDragging: isDraggingReference,
    setDragging: setIsDraggingReference,
    fileFilter: (file) => file.type.startsWith("image/"),
    onFiles: (files) => handleReferenceFile(files[0]),
  });

  const selectedTemplate = useMemo(() => getGrassTemplate(templateId), [templateId]);
  const effectiveReferenceUrl = sceneMode === "system_reference"
    ? selectedTemplate.imageUrl
    : sceneMode === "upload_reference"
      ? uploadedReferenceUrl
      : "";
  const effectiveReferenceName = sceneMode === "system_reference"
    ? selectedTemplate.name
    : sceneMode === "upload_reference"
      ? uploadedReferenceName || t("sceneModeUpload")
      : t("sceneModeCustom");
  const promptImages = useMemo(() => [
    ...(garmentUrl ? [{ imageNumber: 1, url: garmentUrl, role: t("garmentHardRef") }] : []),
    ...(effectiveReferenceUrl ? [{
      imageNumber: 2,
      url: effectiveReferenceUrl,
      role: sceneMode === "system_reference"
        ? t("systemGrassRef", { template: selectedTemplate.name })
        : sceneBackgroundMode === "similar_style"
          ? t("uploadSceneStyleRef")
          : t("uploadScenePoseRef"),
    }] : []),
  ], [garmentUrl, effectiveReferenceUrl, sceneMode, sceneBackgroundMode, selectedTemplate.name, t]);
  const taskInputThumbnails = useMemo(
    () => promptImages.map((item) => item.url).filter(Boolean),
    [promptImages]
  );
  const activePrompt = sceneMode === "custom_prompt" ? userPrompt : supplementPrompt;
  const finalPrompt = useMemo(
    () => promptOverride ?? buildGrassPrompt({
      templateId,
      userPrompt: activePrompt,
      changeModel,
      sceneMode,
      hasReference: !!effectiveReferenceUrl,
      referenceName: effectiveReferenceName,
      sceneBackgroundMode,
    }),
    [promptOverride, templateId, activePrompt, changeModel, sceneMode, effectiveReferenceUrl, effectiveReferenceName, sceneBackgroundMode]
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
      toastMessage: t("retryPendingToast", { index: index + 1 }),
    });
  }
  const previewSession = useStudioPreview({
    module: "grass",
    title: t("title"),
    urls: resultUrls,
    expectedCount: activeResultExpectedCount,
    isGenerating,
    references: promptImages.map((item) => ({
      url: item.url,
      label: item.imageNumber === 1 ? t("garmentReferenceLabel") : effectiveReferenceName,
      role: item.imageNumber === 1 ? "garment" : "reference",
    })),
    promptText: activePrompt,
    metaItems: [
      { label: t("metaSceneMode"), value: sceneMode === "system_reference" ? t("sceneModeSystem") : sceneMode === "upload_reference" ? t("sceneModeUpload") : t("sceneModeCustom") },
      { label: t("metaSceneControl"), value: sceneMode === "custom_prompt" ? null : sceneBackgroundMode === "reference_scene" ? t("sceneBgReferenceScene") : t("sceneBgSimilarStyle") },
      { label: t("metaTemplate"), value: selectedTemplate.name },
      { label: t("metaModel"), value: aiModel },
      { label: t("metaRatio"), value: aspectRatio },
      { label: t("metaResolution"), value: imageSize },
      { label: t("metaGenCount"), value: genCount },
    ],
    resultTitlePrefix: t("resultTitlePrefix"),
    aspectRatio,
  });
  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const costPerImage = getCreditCost(aiModel, imageSize, aspectRatio);
  const cost = costPerImage * genCount;
  const taskQueue = useTaskQueueGeneration({
    module: "grass",
    title: t("taskQueueTitle"),
    defaultExpectedCount: genCount,
    applyPath: "/grass",
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
    latestResultUrlsRef: { current: string[] };
  } | null>(null);
  const { start: startGrassPolling } = useGenerationPolling<{
    status: string;
    progress?: number;
    result_urls?: unknown;
    error?: string;
    partial_failure?: { message?: unknown };
  }>({
    id: "",
    buildUrl: () => {
      const id = pollCtxRef.current?.generationId ?? "";
      return `/api/grass?generation_id=${encodeURIComponent(id)}`;
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
        progress: runningProgress,
        status: state.status,
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
          toast.warning(t("partialDoneToast", { done: finalResultCount, total: ctx.displayExpectedCount }));
        } else {
          toast.success(t("garmentGrassDone"));
        }
      } else {
        const message = state.error || t("generationFailed");
        setError(message);
        taskQueue.markFailed(ctx.activeTaskId, message, {
          expectedCount: ctx.displayExpectedCount,
          inputThumbnails: ctx.taskInputThumbnails,
          resultThumbnails: finalUrls,
          resultCount: finalResultCount,
        });
        toast.error(message);
        void refreshCredits();
        setIsGenerating(false);
      }
    },
    onError: (error) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      const message = error.message || t("generationTimeout");
      setError(message);
      taskQueue.markFailed(ctx.activeTaskId, message, {
        expectedCount: ctx.displayExpectedCount,
        inputThumbnails: ctx.taskInputThumbnails,
        resultThumbnails: ctx.latestResultUrlsRef.current,
      });
      toast.error(message);
      void refreshCredits();
      setIsGenerating(false);
    },
  });
  const authIsAnonymous = authChecked && !isAuthenticated;
  const runDisabledReason = !garmentUrl
    ? t("runDisabledNoGarment")
    : credits !== null && credits < cost
      ? t("runDisabledNoCredits", { cost })
      : undefined;

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  function applyGrassHistoryPayload(payload: GrassHistoryPayload, historyResultUrls: string[] = [], options?: { silent?: boolean }) {
    setGarmentUrl(payload.garmentUrl);
    setTemplateId(normalizeGrassTemplate(payload.templateId));
    const nextSceneMode = normalizeGrassSceneMode(payload.sceneMode || (payload.referenceUrl ? "upload_reference" : "system_reference"));
    setSceneMode(nextSceneMode);
    setSceneBackgroundMode(normalizeGrassSceneBackgroundMode(payload.sceneBackgroundMode));
    setUploadedReferenceUrl(payload.referenceUrl || "");
    setUploadedReferenceName(payload.referenceUrl ? t("historyReference") : "");
    setChangeModel(payload.changeModel);
    if (nextSceneMode === "custom_prompt") {
      setUserPrompt(payload.userPrompt || "");
      setSupplementPrompt("");
    } else {
      setSupplementPrompt(payload.userPrompt || "");
    }
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setGenCount(payload.genCount);
    setPromptOverride(payload.prompt);
    setRunningExpectedCount(null);
    setResultUrls(historyResultUrls);
    setIsGenerating(false);
    setProgress(historyResultUrls.length ? 100 : 0);
    setError("");
    if (!options?.silent) toast.success(t("historyParamsApplied"));
  }

  useHistoryApply({
    kind: "grass",
    apply: (payload, resultUrls) => applyGrassHistoryPayload(payload, resultUrls, { silent: true }),
    onError: (err) => toast.error(err.message),
  });

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error(t("uploadImage"));
    if (file.size > MAX_FILE_SIZE) return toast.error(t("imageTooLarge", { mb: MAX_FILE_SIZE_MB }));
    toast.info(t("uploadingGarment"));
    setIsUploadingGarment(true);
    try {
      const result = await uploadImage(file);
      setGarmentUrl(result.url);
      setGarmentName(file.name);
      setPromptOverride(null);
      toast.success(t("garmentUploaded"));
    } catch {
      toast.error(t("uploadFailedRetry"));
    } finally {
      setIsUploadingGarment(false);
    }
  }

  async function handleReferenceFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error(t("uploadImage"));
    if (file.size > MAX_FILE_SIZE) return toast.error(t("imageTooLarge", { mb: MAX_FILE_SIZE_MB }));
    toast.info(t("uploadingReference"));
    setIsUploadingReference(true);
    try {
      const result = await uploadImage(file);
      setUploadedReferenceUrl(result.url);
      setUploadedReferenceName(file.name);
      setSceneMode("upload_reference");
      setPromptOverride(null);
      toast.success(t("referenceAttached"));
    } catch {
      toast.error(t("referenceUploadFailed"));
    } finally {
      setIsUploadingReference(false);
      if (referenceInputRef.current) referenceInputRef.current.value = "";
    }
  }

  function applyDemo(demo: { title: string; imageUrl: string }) {
    setGarmentUrl(demo.imageUrl);
    setGarmentName(demo.title);
    setPromptOverride(null);
    closeRulesPopover();
    toast.success(t("demoApplied"));
  }

  function applyPromptReference(text: string) {
    setUserPrompt(text);
    setPromptOverride(null);
    setSceneMode("custom_prompt");
  }

  async function generate(promptForRun?: string, options: GrassGenerateOptions = {}) {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("loginFirst"));
      router.push("/login");
      return;
    }
    if (!garmentUrl) return toast.error(t("uploadGarmentFirst"));
    if (sceneMode === "upload_reference" && !uploadedReferenceUrl) return toast.error(t("uploadReferenceFirst"));
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
    if (credits !== null && credits < runTotalCost) {
      showInsufficientCreditsToast({ required: runTotalCost, balance: credits, onRecharge: () => router.push("/pricing") });
      return;
    }

    setIsGenerating(true);
    setRunningExpectedCount(displayExpectedCount);
    setProgress(10);
    setResultUrls(buildRetryPendingResultUrls(retryPreviousResultUrls, retryResultIndex, displayExpectedCount));
    setError("");
    if (options.toastMessage) toast.info(options.toastMessage);
    const provisionalTask = taskQueue.startTask({
      expectedCount: displayExpectedCount,
      inputThumbnails: taskInputThumbnails,
      progress: 10,
    });
    let activeTaskId = provisionalTask.id;
    let latestTaskResultUrls: string[] = [];

    try {
      const res = await fetch("/api/grass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garment_url: garmentUrl,
          template_id: templateId,
          change_model: changeModel,
          user_prompt: activePrompt,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          gen_count: runGenCount,
          reference_url: effectiveReferenceUrl || null,
          scene_mode: sceneMode,
          scene_background_mode: sceneBackgroundMode,
          prompt: typeof promptForRun === "string" ? promptForRun : finalPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          await refreshAuth();
          taskQueue.removeTask(activeTaskId);
          setIsGenerating(false);
          router.push("/login");
          return;
        }
        // 402 仅在服务端返回数字余额时更新（?? 0 会把真实余额清零并持久化缓存）；其余非 ok 抛服务端错误
        applyGenerationResponseStatus({ res, data, userId, setCredits, fallbackError: t("generationFailed") });
      }
      if (data.credits_remaining !== undefined) {
        setCredits(data.credits_remaining);
        if (userId) setCachedProfileCredits(userId, data.credits_remaining);
      }
      setProgress(25);
      if (typeof data.generation_id === "string" && data.generation_id) {
        const serverTask = taskQueue.replaceWithServerTask(activeTaskId, {
          id: data.generation_id,
          expectedCount: displayExpectedCount,
          inputThumbnails: taskInputThumbnails,
          status: data.status || "processing_tryon",
          progress: 25,
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
        latestResultUrlsRef: { current: latestTaskResultUrls },
      };
      startGrassPolling();
    } catch (err: unknown) {
      const message = summarizeGenerationError(err instanceof Error ? err.message : t("generationFailed"));
      setError(message);
      taskQueue.markFailed(activeTaskId, message, {
        expectedCount: displayExpectedCount,
        inputThumbnails: taskInputThumbnails,
        resultThumbnails: latestTaskResultUrls,
      });
      toast.error(message);
      void refreshCredits();
      setIsGenerating(false);
    }
  }

  function handleRunningTask(item: TaskQueueItem) {
    setRunningExpectedCount(clampTaskExpectedCount(item, 1, 4));
    setIsGenerating(true);
    setProgress(Math.min(Math.max(Math.round(Number(item.progress) || 12), 1), 99));
    setError("");
    setResultUrls(safeTaskQueueUrls(item.resultThumbnails));
  }

  async function handleCompletedTask(item: TaskQueueItem, session: TaskSelectionSession) {
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "grass", session.signal);
      // Apply even if the session went stale mid-fetch — swallowing silently
      // here was the root cause of "click a row, preview doesn't update". A
      // real abort would have hit the catch block via session.signal.
      applyGrassHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), {
        silent: session.reason === "restore",
      });
      if (item.statusGroup === "failed" || isHistoryApplyRowFailed(detail.row)) {
        setError(getHistoryApplyFailureMessage(detail.row, item.error || t("generationFailed")));
      }
      return true;
    } catch (err) {
      if (session.signal.aborted) return undefined;
      toast.error(err instanceof Error ? err.message : t("historyParamsLoadFailed"));
      return true;
    }
  }

  function handleContinueCreate() {
    setGarmentUrl("");
    setGarmentName("");
    setTemplateId("street");
    setSceneMode("system_reference");
    setSceneBackgroundMode("reference_scene");
    setUploadedReferenceUrl("");
    setUploadedReferenceName("");
    setChangeModel(true);
    setUserPrompt("");
    setSupplementPrompt("");
    setAiModel("nano-banana-2");
    setAspectRatio("auto");
    setImageSize("1K");
    setGenCount(1);
    setPromptOverride(null);
    setRunningExpectedCount(null);
    setIsGenerating(false);
    setProgress(0);
    setResultUrls([]);
    setError("");
    setLightboxSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (referenceInputRef.current) referenceInputRef.current.value = "";
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="grass" />
      <ModuleTaskRail module="grass" moduleLabel={t("moduleLabel")} onContinue={handleContinueCreate} onRunningTask={handleRunningTask} onCompletedTask={handleCompletedTask} />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          <ModuleHeader
            title={t("moduleHeaderTitle")}
            tooltip={t("moduleHeaderTooltip")}
            actions={(
              <button
                ref={rulesButtonRef}
                type="button"
                onMouseEnter={openRulesPopover}
                onMouseLeave={scheduleRulesHide}
                onFocus={openRulesPopover}
                onBlur={scheduleRulesHide}
                aria-expanded={showRules}
                aria-controls="grass-rules-popover"
                className="studio-upload-rule-button"
              >
                {t("imageRule")} <ChevronRight className="h-3 w-3" />
              </button>
            )}
          />

          <StudioUploadSection
            title={t("uploadSectionTitle")}
            inputRef={fileInputRef}
            isDragging={isDragging}
            setDragging={setIsDragging}
            onFiles={async (files) => {
              await handleFile(files[0]);
            }}
          >
            {(openFileDialog, dragContext) => (
              <>
                <StudioUploadTile
                  title={t("uploadTileTitle")}
                  description={t("uploadTileDescription")}
                  imageUrl={garmentUrl || null}
                  imageAlt={t("garmentImageAlt")}
                  isDragging={isDragging}
                  loading={isUploadingGarment}
                  onUploadClick={openFileDialog}
                  onLibraryClick={() => toast.info(t("libraryComingSoon"))}
                  onPreview={garmentUrl ? () => setLightboxSrc(garmentUrl) : undefined}
                  onRemove={garmentUrl ? () => setGarmentUrl("") : undefined}
                  onDropFile={(file) => handleFile(file)}
                  dragContext={dragContext}
                  uploadLabel={t("uploadFromLocal")}
                  libraryLabel={t("uploadFromWorks")}
                  footnote={garmentUrl ? garmentName || t("alreadyUploaded") : t("garmentFootnote")}
                  examples={{
                    label: t("tryIt"),
                    images: GRASS_UPLOAD_RULE.demos.map((demo) => ({ url: demo.imageUrl, title: demo.title })),
                    onSelect: (image) => applyDemo({ title: image.title, imageUrl: image.url }),
                  }}
                  />
                </>
              )}
            </StudioUploadSection>

          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-bold text-sm">{t("referenceSceneSection")}</h3>
              <span className="rounded-full bg-[var(--codex-accent-08)] px-2 py-1 text-[11px] font-bold text-[var(--codex-accent)]">
                {sceneMode === "custom_prompt" ? t("promptPriority") : effectiveReferenceName}
              </span>
            </div>

            <StudioOptionGrid
              options={[
                { value: "system_reference" as const, label: t("sceneModeSystem") },
                { value: "upload_reference" as const, label: t("sceneModeUpload") },
                { value: "custom_prompt" as const, label: t("sceneModeCustom") },
              ]}
              value={sceneMode}
              onChange={(value) => { setSceneMode(value); setPromptOverride(null); }}
              columns={3}
              ariaLabel={t("sceneModeAria")}
            />

            {sceneMode === "system_reference" && (
              <div className="mt-3 rounded-2xl border border-dashed border-[var(--codex-border)] bg-white/55 p-3">
                <div className="grid grid-cols-3 gap-2">
                  {GRASS_TEMPLATES.map((tpl) => (
                    <div
                      key={tpl.id}
                      className={`group relative overflow-hidden rounded-xl border bg-codex-surface text-center shadow-sm transition ${templateId === tpl.id ? "border-[var(--codex-accent)] ring-2 ring-[var(--codex-accent-25)]" : "border-[var(--codex-border)] hover:shadow-md"}`}
                    >
                      <button
                        type="button"
                        onClick={() => { setTemplateId(tpl.id); setPromptOverride(null); }}
                        className="block w-full text-center"
                      >
                        <div className="relative aspect-[3/4] overflow-hidden bg-[var(--codex-surface-soft)]">
                          <RawPreviewImage src={tpl.imageUrl} alt={tpl.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                        </div>
                        <p className="truncate px-1.5 py-1.5 text-[12px] font-bold text-codex-ink">{tpl.name}</p>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLightboxSrc(tpl.imageUrl); }}
                        className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-white/10/85 text-codex-muted opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 hover:bg-white hover:text-[var(--codex-accent)] max-lg:opacity-100"
                        title={t("zoomPreview")}
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                      </button>
                      <div className="pointer-events-none absolute inset-0">
                        {templateId === tpl.id && <CheckCircle2 className="absolute left-1.5 top-1.5 h-4 w-4 rounded-full bg-white dark:bg-white/10 text-emerald-500" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sceneMode === "upload_reference" && (
              <div
                {...referenceDrag.dragHandlers}
                className={`studio-stable-upload-boundary mt-3 rounded-2xl border border-dashed bg-white/70 p-3 transition ${isDraggingReference ? "border-[var(--codex-accent-48)] ring-2 ring-[var(--codex-accent-16)]" : "border-[var(--codex-border)]"}`}
              >
                <input
                  ref={referenceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const input = event.currentTarget;
                    void handleReferenceFile(input.files?.[0]).finally(() => {
                      input.value = "";
                    });
                  }}
                />
                {uploadedReferenceUrl ? (
                  <div className="group studio-fixed-upload-preview relative overflow-hidden rounded-xl bg-[var(--codex-surface-soft)]" style={{ "--studio-fixed-preview-height": "208px" } as CSSProperties}>
                    <RawPreviewImage src={uploadedReferenceUrl} alt={t("uploadedReferenceAlt")} className="h-full w-full object-contain p-2" />
                    <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-2">
                      <span className="truncate rounded-full bg-codex-surface px-2.5 py-1 text-[12px] font-medium text-codex-muted shadow-sm">{uploadedReferenceName || t("uploadedReferenceBadge")}</span>
                      <span className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setLightboxSrc(uploadedReferenceUrl)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-white/10/85 text-codex-muted opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 hover:bg-white hover:text-[var(--codex-accent)] max-lg:opacity-100"
                          title={t("zoomPreview")}
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setUploadedReferenceUrl(""); setUploadedReferenceName(""); setPromptOverride(null); }}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-white/10/90 text-codex-muted shadow-sm hover:bg-white"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </span>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => referenceInputRef.current?.click()}
                    disabled={isUploadingReference}
                    className="studio-fixed-upload-slot flex w-full flex-col items-center justify-center rounded-xl bg-[var(--codex-surface-soft)] px-4 py-6 text-center hover:bg-[var(--codex-surface-soft)]"
                    style={{ "--studio-fixed-upload-height": "160px" } as CSSProperties}
                  >
                    {isUploadingReference ? (
                      <Loader2 className="mb-3 h-7 w-7 animate-spin text-violet-400" />
                    ) : (
                      <Upload className="mb-3 h-7 w-7 text-violet-400" />
                    )}
                    <span className="text-sm font-semibold text-codex-ink">{isUploadingReference ? t("uploadingDots") : t("uploadReferenceHint")}</span>
                    <span className="mt-1 text-[12px] text-codex-faint">{t("uploadReferenceSub")}</span>
                  </button>
                )}
              </div>
            )}

            {sceneMode === "custom_prompt" ? (
              <div className="mt-3 space-y-3">
                <StudioPromptTextarea
                  value={userPrompt}
                  onChange={(e) => { setUserPrompt(e.target.value); setPromptOverride(null); }}
                  placeholder={t("customPromptPlaceholder")}
                  className="studio-prompt-textarea-compact"
                />
                <div>
                  <p className="mb-2 text-[12px] font-bold text-codex-faint">{t("referencePromptsLabel")}</p>
                  <div className="space-y-2">
                    {GRASS_PROMPT_REFERENCES.map((item) => (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => applyPromptReference(item.text)}
                        className="w-full rounded-xl border border-[var(--codex-border)] bg-white/80 px-3 py-2 text-left transition hover:bg-[var(--codex-accent-08)] hover:text-[var(--codex-accent)]"
                      >
                        <p className="text-xs font-bold text-codex-ink">{item.title}</p>
                        <p className="mt-1 text-[12px] leading-4 text-codex-faint">{item.text}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <StudioPromptTextarea
                  title={t("supplementTitle")}
                  badge={t("supplementBadge")}
                  value={supplementPrompt}
                  onChange={(e) => { setSupplementPrompt(e.target.value); setPromptOverride(null); }}
                  placeholder={t("supplementPlaceholder")}
                  rows={3}
                  description={t("supplementDescription")}
                />
              </div>
            )}
          </section>

          {sceneMode !== "custom_prompt" && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">{t("personControlTitle")}</h3>
                <span className="text-[12px] text-codex-faint">{t("personControlSub")}</span>
              </div>
              <p className="mb-3 text-[12px] leading-5 text-codex-faint">
                {t("personControlDesc")}
              </p>
              <StudioOptionGrid
                options={[
                  { value: "replace", label: t("replaceModel"), description: t("replaceModelDesc") },
                  { value: "keep", label: t("keepModel"), description: t("keepModelDesc") },
                ]}
                value={changeModel ? "replace" : "keep"}
                onChange={(value) => { setChangeModel(value === "replace"); setPromptOverride(null); }}
                columns={2}
                ariaLabel={t("personControlAria")}
              />
            </section>
          )}

          {sceneMode !== "custom_prompt" && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">{t("sceneControlTitle")}</h3>
                <span className="text-[12px] text-codex-faint">{t("sceneControlSub")}</span>
              </div>
              <p className="mb-3 text-[12px] leading-5 text-codex-faint">
                {t("sceneControlDesc")}
              </p>
              <StudioOptionGrid
                options={[
                  { value: "reference_scene" as const, label: t("sceneBgReferenceScene"), description: t("sceneReferenceDesc") },
                  { value: "similar_style" as const, label: t("sceneBgSimilarStyle"), description: t("sceneSimilarDesc") },
                ]}
                value={sceneBackgroundMode}
                onChange={(value) => { setSceneBackgroundMode(value); setPromptOverride(null); }}
                columns={2}
                ariaLabel={t("sceneControlAria")}
              />
            </section>
          )}

          <section>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-codex-ink"><Cpu className="w-4 h-4 text-[var(--codex-accent)]" /> {t("generationModelTitle")}</h3>
            <StudioModelSelector models={modelOptions} value={aiModel} onChange={setAiModel} ariaLabel={t("generationModelAria")} />
          </section>

          <section>
            <AspectRatioSelector options={ASPECTS} value={aspectRatio} onChange={setAspectRatio} ariaLabel={t("aspectRatioAria")} />
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("resolutionTitle")}</h3>
            <StudioOptionGrid
              options={useImageSizeOptions(imageSizes, (s) => getCreditCost(aiModel, s, aspectRatio), t("resolutionCreditUnit"))}
              value={imageSize}
              onChange={setImageSize}
              ariaLabel={t("resolutionAria")}
            />
          </section>
          <section>
            <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("genCountTitle")}</h3>
            <GenerationCountField
              value={genCount}
              onChange={setGenCount}
              ariaLabel={t("genCountAria")}
            />
          </section>
        </div>

        <StudioRunBar
          summary={`${garmentUrl ? t("summaryInputCount", { count: effectiveReferenceUrl ? 2 : 1 }) : t("summaryNoInput")} · ${t("summaryGenCount", { count: genCount })}`}
          estimateLabel={isGenerating ? t("runBar.estimateGenerating") : t("runBar.estimateReady", { count: genCount })}
          costLabel={authIsAnonymous ? t("costLoginView") : t("costSummary", { cost, balance: credits ?? "-" })}
          disabled={isGenerating || Boolean(runDisabledReason)}
          disabledReason={runDisabledReason}
          primaryLabel={authIsAnonymous ? t("primaryLogin") : isGenerating ? t("primaryGenerating") : t("primaryGenerate", { count: genCount })}
          isLoading={isGenerating}
          onPrimaryAction={() => generate()}
        />
      </div>

      <div className="studio-canvas relative flex-1 min-h-[520px] lg:h-full overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title={t("emptyTitle")}
              subtitle={t("emptySubtitle")}
              imageSrc="https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/model-grey-tank-denim.jpg"
              imageAlt={t("emptyImageAlt")}
              steps={[
                { title: t("stepUploadTitle"), desc: t("stepUploadDesc") },
                { title: t("stepModeTitle"), desc: t("stepModeDesc") },
                { title: t("stepResultTitle"), desc: t("stepResultDesc") },
              ]}
            />
          </div>
        )}
        {(isGenerating || resultUrls.length > 0) && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            <div className="flex min-h-0 flex-1 items-start justify-start">
              <ResultImageGrid
                urls={resultUrls}
                filenamePrefix="grass"
                extension="jpg"
                expectedCount={activeResultExpectedCount}
                isGenerating={isGenerating}
                inputThumbnails={promptImages.map((item) => item.url)}
                statusGroup={isGenerating ? "running" : undefined}
                variant="task"
                markMissingAsFailed={hasCompletedPartialResults}
                missingFailureLabel={t("missingFailureLabel")}
                missingFailureDetail={partialFailureMessage}
                missingFailureActionLabel={t("missingFailureAction")}
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
              filenamePrefix="grass"
              extension="jpg"
              actions={GRASS_PREVIEW_ACTIONS}
              onRegenerateAll={() => void generate()}
            />
          </div>
        )}
        {error && (
          <ErrorStage
            error={summarizeGenerationError(error)}
            onRetry={() => { setError(""); void generate(); }}
            isGenerating={isGenerating}
            retryDisabled={retryDisabled}
            retryLabel={t("retryLabel")}
            notice={FAILED_RETRY_NOTICE}
          />
        )}
      </div>

      <StudioRulesPopover
        open={showRules}
        style={rulesPopoverStyle}
        width={720}
        demoGridClassName="md:grid-cols-5"
        title={GRASS_UPLOAD_RULE.title}
        specText={GRASS_UPLOAD_RULE.uploadSpecText}
        tryItLabel={t("tryIt")}
        closeLabel={t("closeImageRule")}
        onClose={closeRulesPopover}
        demos={GRASS_UPLOAD_RULE.demos.map((demo) => ({
          key: demo.imageUrl,
          title: demo.title,
          description: demo.description,
          imageUrls: [demo.imageUrl],
          onApply: () => applyDemo(demo),
        }))}
        examples={GRASS_UPLOAD_RULE.badExamples.map((image) => ({
          key: image.title,
          title: image.title,
          imageUrl: image.imageUrl,
        }))}
        examplesTip={t("doNotUploadWrong")}
        onMouseEnter={cancelRulesHide}
        onMouseLeave={scheduleRulesHide}
      />

      <StudioMediaLightbox
        src={lightboxSrc}
        alt={t("lightboxAlt")}
        onClose={() => setLightboxSrc(null)}
      />
      {unsavedDialog}

    </div>
  );
}
