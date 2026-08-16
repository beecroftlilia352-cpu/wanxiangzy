"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { useRouter } from "next/navigation";
import {
  Images,
  Monitor,
  Crop,
  ImagePlus,
  Loader2,
  Trash2,
  Brush,
  X,
  Sparkles,
} from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { LoadingStage } from "@/components/studio/LoadingStage";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { PreviewGuide } from "@/components/PreviewGuide";
import { StudioModelSelector, StudioOptionGrid, StudioPromptTextarea } from "@/components/studio/StudioFormControls";
import { AspectRatioSelector } from "@/components/studio/AspectRatioSelector";
import { GenerationCountField } from "@/components/studio/GenerationCountField";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { useGenerationPolling } from "@/hooks/use-generation-polling";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { useStudioImageModelOptions } from "@/lib/studio-models";
import { fetchHistoryApplyDetail, getHistoryApplyFailureMessage, isHistoryApplyRowFailed, type HistoryJobPayload } from "@/lib/history-apply";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import { applyGenerationResponseStatus, showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import { createGenericImagePreviewSession, takeSourceImageFromLocation, type ImagePreviewAction } from "@/lib/studio-image-preview";
import { useStudioPreview } from "@/hooks/use-studio-preview";
import { useHistoryApply } from "@/hooks/use-history-apply";
import { FAILED_RETRY_NOTICE, buildFailedTaskDetail, buildPartialFailureDetail, coerceErrorMessage, summarizeGenerationError } from "@/lib/studio-generation-feedback";
import {
  buildRetryPendingResultUrls,
  getRetryDisplayExpectedCount,
  mergeRetryResultUrls,
  normalizeRetryResultIndex,
} from "@/lib/result-slot-retry";
import { ImagePromptDialog, type ImagePromptSource } from "@/features/general-image/image-prompt-dialog";

type GeneralImageMode = "text-to-image" | "image-to-image";

type ReferenceImage = {
  id: string;
  name: string;
  url: string;
  preview: string;
};

type GeneralImageHistoryPayload = Extract<HistoryJobPayload, { kind: "generalImage" }>;
type GeneralImageGenerateOptions = {
  genCountOverride?: number;
  expectedCountOverride?: number;
  retryResultIndex?: number;
  toastMessage?: string;
};

const ASPECTS: { value: AspectRatio; label: string; labelKey?: string }[] = [
  { value: "3:4", label: "3:4 竖版", labelKey: "aspect34" },
  { value: "4:3", label: "4:3 横版", labelKey: "aspect43" },
  { value: "1:1", label: "1:1 方图", labelKey: "aspect11" },
  { value: "9:16", label: "9:16 手机", labelKey: "aspect916" },
  { value: "16:9", label: "16:9 宽屏", labelKey: "aspect169" },
  { value: "4:5", label: "4:5 电商", labelKey: "aspect45" },
  { value: "auto", label: "智能", labelKey: "aspectAuto" },
];

const IMAGE_PROMPT_PLACEHOLDER_KEY = "imagePromptPlaceholder";

const GENERAL_IMAGE_PREVIEW_ACTIONS: Array<ImagePreviewAction & { labelKey: string }> = [
  { kind: "download", label: "下载图片", labelKey: "actionDownload" },
  { kind: "copy", label: "复制链接", labelKey: "actionCopy" },
  { kind: "repair", label: "AI修图", labelKey: "actionRepair" },
  { kind: "aiVideo", label: "AI视频", labelKey: "actionAiVideo" },
  { kind: "modelBackground", label: "换背景", labelKey: "actionModelBackground" },
  { kind: "pose", label: "姿势裂变", labelKey: "actionPose" },
  { kind: "productSet", label: "商品套图", labelKey: "actionProductSet" },
  { kind: "regenerateAll", label: "重新创作", labelKey: "actionRegenerateAll" },
  { kind: "feedback", label: "反馈", labelKey: "actionFeedback" },
];

export function GeneralImageExperience({ initialMode = "text-to-image" }: { initialMode?: GeneralImageMode }) {
  const router = useRouter();
  const t = useTranslations("GeneralImage");
  const { confirm, confirmDialog } = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagePromptInputRef = useRef<HTMLInputElement>(null);
  const imagePromptTriggerRef = useRef<HTMLButtonElement>(null);

  const [mode, setMode] = useState<GeneralImageMode>(initialMode);
  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);

  const {
    authChecked,
    isAuthenticated,
    userId,
    credits,
    setCredits,
    refreshCredits,
    refreshAuth,
  } = useStudioAuth();
  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const modelOptions = useStudioImageModelOptions();
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [showImagePromptModal, setShowImagePromptModal] = useState(false);
  const [imagePromptImage, setImagePromptImage] = useState<ImagePromptSource | null>(null);
  // 未保存输入离开拦截：有参考图/提示词/图片时提醒；文生图<->图生图组内切换不拦截
  const { unsavedDialog } = useUnsavedChangesGuard(
    Boolean(referenceImages.length || prompt.trim() || imagePromptImage?.url),
    { exemptPaths: ["/general-image", "/general-image/image-to-image"] },
  );
  const [imagePromptText, setImagePromptText] = useState("");
  const [isImagePromptUploading, setIsImagePromptUploading] = useState(false);
  const [isImagePromptGenerating, setIsImagePromptGenerating] = useState(false);
  const [activeQueueTask, setActiveQueueTask] = useState<TaskQueueItem | null>(null);

  const supportedSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const costPerImage = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = costPerImage * genCount;
  const isImageMode = mode === "image-to-image";
  const authIsAnonymous = authChecked && !isAuthenticated;
  const activeFeature = isImageMode ? "imageToImage" : "textToImage";
  const taskInputThumbnails = useMemo(
    () => isImageMode
      ? referenceImages.map((item) => item.preview || item.url).filter((url): url is string => Boolean(url))
      : [],
    [isImageMode, referenceImages]
  );
  const taskQueue = useTaskQueueGeneration({
    module: "generalImage",
    title: t("taskQueueTitle"),
    defaultExpectedCount: genCount,
    applyPath: isImageMode ? "/general-image/image-to-image" : "/general-image",
  });

  // 后台轮询：useGenerationPolling 替代 inline for-loop + setTimeout + fetch
  // general-image 比较直白：completed / failed 二选一，没有 transient 分支。
  const pollCtxRef = useRef<{
    activeTaskId: string;
    generationId: string;
    displayExpectedCount: number;
    retryPreviousResultUrls: string[];
    retryResultIndex: number | null;
    taskInputThumbnails: string[];
    latestTaskResultUrlsRef: { current: string[] };
    setProgress: (p: number) => void;
    setResultUrls: (urls: string[]) => void;
    setIsGenerating: (b: boolean) => void;
    setError: (msg: string) => void;
    setActiveQueueTask: (task: TaskQueueItem) => void;
    refreshCredits: () => Promise<number | null | undefined>;
    taskQueue: typeof taskQueue;
    isImageMode: boolean;
  } | null>(null);

  const { start: startGeneralImagePolling } = useGenerationPolling<{
    status: string;
    progress?: number;
    result_urls?: unknown;
    error?: string;
    partial_failure?: { message?: unknown };
  }>({
    id: "",
    buildUrl: (id) => {
      const ctx = pollCtxRef.current;
      return `/api/general-image?generation_id=${encodeURIComponent(ctx?.generationId ?? id)}`;
    },
    isTerminal: (state) => state.status === "completed" || state.status === "failed",
    intervalMs: 2000,
    maxAttempts: 150,
    onTick: (state) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      // 终端态交给 onComplete
      if (state.status === "completed" || state.status === "failed") return;

      if (Array.isArray(state.result_urls) && state.result_urls.length) {
        ctx.latestTaskResultUrlsRef.current = mergeRetryResultUrls(
          ctx.retryPreviousResultUrls,
          ctx.retryResultIndex,
          state.result_urls,
          ctx.displayExpectedCount
        );
        ctx.setResultUrls(ctx.latestTaskResultUrlsRef.current);
      }

      const nextProgress = Number(state.progress);
      if (Number.isFinite(nextProgress)) {
        const runningProgress = Math.min(Math.max(Math.round(nextProgress), 0), 99);
        ctx.setProgress(runningProgress);
      }
      const runningTask = ctx.taskQueue.markRunning(ctx.activeTaskId, {
        expectedCount: ctx.displayExpectedCount,
        inputThumbnails: ctx.taskInputThumbnails,
        resultThumbnails: ctx.latestTaskResultUrlsRef.current,
        resultCount: ctx.latestTaskResultUrlsRef.current.filter(Boolean).length,
        progress: Number.isFinite(nextProgress) ? Math.min(Math.max(Math.round(nextProgress), 0), 99) : 25,
        status: state.status || "processing",
      });
      ctx.setActiveQueueTask(runningTask);
    },
    onComplete: (state) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;

      if (state.status === "completed") {
        const finalUrls = mergeRetryResultUrls(
          ctx.retryPreviousResultUrls,
          ctx.retryResultIndex,
          Array.isArray(state.result_urls) ? state.result_urls : ctx.latestTaskResultUrlsRef.current,
          ctx.displayExpectedCount
        );
        ctx.latestTaskResultUrlsRef.current = finalUrls;
        const finalResultCount = finalUrls.filter(Boolean).length;
        const partialFailure = state.partial_failure && typeof state.partial_failure === "object"
          ? (state.partial_failure as { message?: unknown })
          : null;
        const completedError = state.error || coerceErrorMessage(partialFailure?.message);
        ctx.setProgress(100);
        ctx.setResultUrls(finalUrls);
        const completedTask = ctx.taskQueue.markCompleted(ctx.activeTaskId, {
          expectedCount: ctx.displayExpectedCount,
          inputThumbnails: ctx.taskInputThumbnails,
          resultThumbnails: finalUrls,
          resultCount: finalResultCount,
          error: completedError ? summarizeGenerationError(completedError) : "",
        });
        ctx.setActiveQueueTask(completedTask);
        ctx.setIsGenerating(false);
        if (completedError || finalResultCount < ctx.displayExpectedCount) {
          void ctx.refreshCredits();
          toast.warning(t(ctx.isImageMode ? "partialCompleteImageToImage" : "partialCompleteTextToImage", { done: finalResultCount, expected: ctx.displayExpectedCount }));
        } else {
          toast.success(t(ctx.isImageMode ? "completeImageToImage" : "completeTextToImage"));
        }
        return;
      }

      if (state.status === "failed") {
        const message = summarizeGenerationError(state.error || t("generateFailed"));
        ctx.setError(message);
        const failedTask = ctx.taskQueue.markFailed(ctx.activeTaskId, message, {
          expectedCount: ctx.displayExpectedCount,
          inputThumbnails: ctx.taskInputThumbnails,
          resultThumbnails: ctx.latestTaskResultUrlsRef.current,
          resultCount: ctx.latestTaskResultUrlsRef.current.filter(Boolean).length,
        });
        ctx.setActiveQueueTask(failedTask);
        toast.error(message);
        void ctx.refreshCredits();
        ctx.setIsGenerating(false);
      }
    },
    onError: (error) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      const message = summarizeGenerationError(error.message || t("generateTimeout"));
      ctx.setError(message);
      const failedTask = ctx.taskQueue.markFailed(ctx.activeTaskId, message, {
        expectedCount: ctx.displayExpectedCount,
        inputThumbnails: ctx.taskInputThumbnails,
        resultThumbnails: ctx.latestTaskResultUrlsRef.current,
        resultCount: ctx.latestTaskResultUrlsRef.current.filter(Boolean).length,
      });
      ctx.setActiveQueueTask(failedTask);
      toast.error(message);
      void ctx.refreshCredits();
      ctx.setIsGenerating(false);
    },
  });
  const modeMeta = isImageMode
    ? {
        title: t("modeImageToImage"),
        tooltip: t("imageToImageTooltip"),
        emptyTitle: t("imageToImageEmptyTitle"),
        emptySubtitle: t("imageToImageEmptySubtitle"),
        emptyImage: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/model-grey-tank-denim.jpg",
      }
    : {
        title: t("modeTextToImage"),
        tooltip: t("textToImageTooltip"),
        emptyTitle: t("textToImageEmptyTitle"),
        emptySubtitle: t("textToImageEmptySubtitle"),
        emptyImage: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/exclusive-model-01.png",
      };
  const previewReferenceUrls = safeTaskQueueUrls(activeQueueTask?.inputThumbnails).length
    ? safeTaskQueueUrls(activeQueueTask?.inputThumbnails)
    : referenceImages.map((item) => item.preview || item.url).filter(Boolean);
  const activeResultExpectedCount = activeQueueTask
    ? clampTaskExpectedCount(activeQueueTask, 1, 4, genCount)
    : isGenerating
      ? genCount
      : Math.max(resultUrls.length, 1);
  const displayedResultUrls = resultUrls.filter(Boolean);
  const hasCompletedPartialResults = Boolean(
    activeQueueTask?.statusGroup === "completed"
    && activeResultExpectedCount > displayedResultUrls.length
  );
  const partialFailureMessage = buildPartialFailureDetail({
    message: activeQueueTask?.error,
    failedCount: activeResultExpectedCount - displayedResultUrls.length,
  });
  const retryDisabled = isGenerating;
  function handleRetryFailedResult(index: number) {
    if (retryDisabled) return;
    void generate({
      genCountOverride: 1,
      expectedCountOverride: 1,
      retryResultIndex: index,
      toastMessage: t("retryToast", { index: index + 1 }),
    });
  }
  const previewSession = useStudioPreview({
    module: "generalImage",
    title: modeMeta.title,
    urls: resultUrls,
    expectedCount: activeResultExpectedCount,
    isGenerating,
    statusGroup: activeQueueTask?.statusGroup || (isGenerating ? "running" : undefined),
    createdAt: activeQueueTask?.createdAt,
    references: previewReferenceUrls.map((url, index) => ({
      url,
      label: t("referenceImageLabel", { index: index + 1 }),
      role: "reference" as const,
    })),
    promptText: prompt,
    metaItems: [
      { label: t("metaMode"), value: modeMeta.title },
      { label: t("metaModel"), value: aiModel },
      { label: t("metaRatio"), value: aspectRatio },
      { label: t("metaResolution"), value: imageSize },
      { label: t("metaCount"), value: genCount },
    ],
    resultTitlePrefix: isImageMode ? t("resultPrefixImageToImage") : t("resultPrefixTextToImage"),
    aspectRatio,
  });
  const canGenerate = !isGenerating && !isUploading && prompt.trim().length > 0 && (!isImageMode || referenceImages.length > 0);
  const runDisabledReason = !prompt.trim()
    ? t("needPrompt")
    : isImageMode && referenceImages.length === 0
      ? t("needReference")
      : "";

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0] || "1K");
  }, [aiModel, aspectRatio, imageSize]);

  useEffect(() => {
    setMode(initialMode);
    resetOutput();
  }, [initialMode]);

  useEffect(() => {
    const sourceImage = takeSourceImageFromLocation();
    if (sourceImage) {
      setMode("image-to-image");
      setReferenceImages([{
        id: `source-${Date.now()}`,
        name: t("fromPreview"),
        url: sourceImage,
        preview: sourceImage,
      }]);
      setPrompt((prev) => prev.trim() || t("defaultImagePrompt"));
      toast.success(t("broughtPreviewImage"));
    }
  }, []);

  function applyGeneralImageHistoryPayload(payload: GeneralImageHistoryPayload, historyResultUrls: string[] = [], options?: { silent?: boolean }) {
    const restoredAiModel = normalizeLingyaModel(payload.aiModel);
    const restoredAspectRatio = normalizeAspectRatio(payload.aspectRatio, "auto");
    const restoredImageSize = normalizeImageSize(restoredAiModel, payload.imageSize, restoredAspectRatio);
    // NOTE: do NOT change `mode` here. The page wrapper owns the mode via
    // initialMode + URL route (/general-image ↔ /general-image/image-to-image);
    // clicking a history row should restore the prompt/referenceImages/result
    // for the CURRENT route's mode, not silently switch routes underneath the
    // user. The previous behavior — setMode(payload.mode === "image-to-image"
    // ? "image-to-image" : "text-to-image") — caused two bugs:
    //   1. applying a text-to-image row while on /image-to-image flipped
    //      the right preview's filenamePrefix + applyPath to text-to-image,
    //      so the next Generate routed to /general-image ("callback to text-to-image").
    //   2. the conditional {isImageMode && <StudioUploadSection ...>} hid the
    //      reference upload UI even though the user had applied a row that
    //      included referenceUrls — making it look like the apply "did nothing".
    setPrompt(payload.prompt);
    setAiModel(restoredAiModel);
    setAspectRatio(restoredAspectRatio);
    // Restore the size AFTER aspect ratio so the validation uses the just-restored
    // ratio — passing the closure-captured `aspectRatio` here would silently force
    // the size to fall back to the lowest supported tier on re-apply.
    setImageSize(restoredImageSize);
    setGenCount(payload.genCount);
    setReferenceImages((payload.referenceUrls ?? []).map((url, index) => ({
      id: `history-general-${index}-${url}`,
      name: t("historyReferenceName", { index: index + 1 }),
      url,
      preview: url,
    })));
    setActiveQueueTask(null);
    setResultUrls(historyResultUrls);
    setIsGenerating(false);
    setError("");
    setProgress(historyResultUrls.length ? 100 : 0);
    if (!options?.silent) toast.success(t("historyAppliedToast"));
  }

  useHistoryApply({
    kind: "generalImage",
    apply: (payload, resultUrls, { row }) => {
      applyGeneralImageHistoryPayload(payload, resultUrls, { silent: true });
      if (isHistoryApplyRowFailed(row)) {
        setError(getHistoryApplyFailureMessage(row));
      }
    },
    onError: (err) => toast.error(err.message),
  });

  function resetOutput() {
    setActiveQueueTask(null);
    setIsGenerating(false);
    setResultUrls([]);
    setError("");
    setProgress(0);
  }

  function performContinueCreate() {
    setMode(initialMode);
    setPrompt("");
    setReferenceImages([]);
    setAiModel("nano-banana-2");
    setAspectRatio("auto");
    setImageSize("1K");
    setGenCount(1);
    setIsDragging(false);
    setShowImagePromptModal(false);
    setImagePromptImage(null);
    setImagePromptText("");
    setIsImagePromptGenerating(false);
    resetOutput();
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imagePromptInputRef.current) imagePromptInputRef.current.value = "";
  }

  function handleContinueCreate() {
    confirm({
      title: t("continueCreateTitle"),
      content: t("continueCreateContent"),
      okText: t("confirm"),
      cancelText: t("cancel"),
      onOk: performContinueCreate,
    });
  }

  async function handleFiles(files?: FileList | File[]) {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    const invalid = selected.find((file) => !file.type.startsWith("image/"));
    if (invalid) return toast.error(t("selectImageFile"));

    const oversized = selected.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) return toast.error(t("exceedsSize", { name: oversized.name, max: MAX_FILE_SIZE_MB }));

    const remain = Math.max(0, 8 - referenceImages.length);
    if (!remain) return toast.error(t("maxReferenceImages"));
    const limited = selected.slice(0, remain);
    if (selected.length > limited.length) toast.info(t("keptFirst8"));

    setIsUploading(true);
    toast.info(t("uploadingReferences", { count: limited.length }));
    try {
      const results = await Promise.allSettled(limited.map((file) => uploadImage(file)));
      const nextImages: ReferenceImage[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          nextImages.push({
            id: `${limited[index].name}-${Date.now()}-${index}`,
            name: limited[index].name || t("referenceImageDefaultName", { index: referenceImages.length + index + 1 }),
            url: result.value.url,
            preview: result.value.display_url || result.value.url,
          });
        } else {
          toast.error(t("uploadFailed", { name: limited[index].name }));
        }
      });
      if (nextImages.length) {
        setReferenceImages((prev) => [...prev, ...nextImages].slice(0, 8));
        toast.success(t("referenceUploaded"));
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function optimizePrompt() {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("pleaseLogin"));
      router.push("/login");
      return;
    }
    if (!prompt.trim() && referenceImages.length === 0) {
      toast.error(isImageMode ? t("needPromptOrReference") : t("needBasicIdea"));
      return;
    }

    setIsOptimizing(true);
    try {
      const res = await fetch("/api/general-image/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt,
          reference_urls: isImageMode ? referenceImages.map((item) => item.url) : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("promptOptimizeFailed"));
      if (data.prompt) {
        setPrompt(String(data.prompt).slice(0, 4000));
        toast.success(data.source === "fallback" ? t("optimizeFallback") : t("promptOptimized"));
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("promptOptimizeFailed"));
    } finally {
      setIsOptimizing(false);
    }
  }

  async function uploadImageForPrompt(files?: FileList | File[]) {
    const file = Array.from(files || [])[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error(t("selectImageFile"));
    if (file.size > MAX_FILE_SIZE) return toast.error(t("exceedsSize", { name: file.name, max: MAX_FILE_SIZE_MB }));

    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("pleaseLogin"));
      router.push("/login");
      return;
    }

    setIsImagePromptUploading(true);
    setImagePromptText("");
    try {
      const result = await uploadImage(file);
      const nextImage = {
        name: file.name,
        url: result.url,
        preview: result.display_url || result.url,
      };
      setImagePromptImage(nextImage);
      toast.success(t("imageUploadedGenerating"));
      await generateImagePrompt(nextImage.url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("imageUploadFailed"));
    } finally {
      setIsImagePromptUploading(false);
      if (imagePromptInputRef.current) imagePromptInputRef.current.value = "";
    }
  }

  async function generateImagePrompt(imageUrl = imagePromptImage?.url) {
    if (!imageUrl) return toast.error(t("needUploadImage"));
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("pleaseLogin"));
      router.push("/login");
      return;
    }

    setIsImagePromptGenerating(true);
    try {
      const res = await fetch("/api/general-image/image-to-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("imageToPromptFailed"));
      if (data.prompt) {
        setImagePromptText(String(data.prompt).slice(0, 4000));
        toast.success(data.source === "fallback" ? t("imageToPromptFallback") : t("imagePromptGenerated"));
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("imageToPromptFailed"));
    } finally {
      setIsImagePromptGenerating(false);
    }
  }

  function applyImagePromptToDescription() {
    if (!imagePromptText.trim()) return toast.error(t("needGeneratePrompt"));
    setPrompt(imagePromptText.trim().slice(0, 4000));
    setShowImagePromptModal(false);
    toast.success(t("appliedToDescription"));
  }

  async function generate(options: GeneralImageGenerateOptions = {}) {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("pleaseLogin"));
      router.push("/login");
      return;
    }
    if (!prompt.trim()) return toast.error(t("enterPrompt"));
    if (isImageMode && !referenceImages.length) return toast.error(t("needReference"));
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

    setActiveQueueTask(null);
    setIsGenerating(true);
    setProgress(8);
    setError("");
    setResultUrls(buildRetryPendingResultUrls(retryPreviousResultUrls, retryResultIndex, displayExpectedCount));
    if (options.toastMessage) toast.info(options.toastMessage);
    const provisionalTask = taskQueue.startTask({
      expectedCount: displayExpectedCount,
      inputThumbnails: taskInputThumbnails,
      progress: 8,
    });
    setActiveQueueTask(provisionalTask);
    let activeTaskId = provisionalTask.id;
    try {
      const res = await fetch("/api/general-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt,
          reference_urls: isImageMode ? referenceImages.map((item) => item.url) : [],
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          gen_count: runGenCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          taskQueue.removeTask(activeTaskId);
          setActiveQueueTask(null);
          setIsGenerating(false);
          await refreshAuth();
          router.push("/login");
          return;
        }
        // 402 仅在服务端返回数字余额时更新（?? 0 会把真实余额清零并持久化缓存）；其余非 ok 抛服务端错误
        applyGenerationResponseStatus({ res, data, userId, setCredits, fallbackError: t("generateFailed") });
      }
      if (data.credits_remaining !== undefined) {
        setCredits(data.credits_remaining);
        if (userId) setCachedProfileCredits(userId, data.credits_remaining);
      }

      if (typeof data.generation_id === "string" && data.generation_id) {
        const serverTask = taskQueue.replaceWithServerTask(activeTaskId, {
          id: data.generation_id,
          expectedCount: displayExpectedCount,
          inputThumbnails: taskInputThumbnails,
          status: data.status || "processing",
          progress: 12,
        });
        setActiveQueueTask(serverTask);
        activeTaskId = serverTask.id;
      }

      // 后台轮询：useGenerationPolling 替代原 inline for-loop
      pollCtxRef.current = {
        activeTaskId,
        generationId: typeof data.generation_id === "string" ? data.generation_id : "",
        displayExpectedCount,
        retryPreviousResultUrls,
        retryResultIndex,
        taskInputThumbnails: taskInputThumbnails,
        latestTaskResultUrlsRef: { current: [] },
        setProgress,
        setResultUrls,
        setIsGenerating,
        setError,
        setActiveQueueTask,
        refreshCredits,
        taskQueue,
        isImageMode,
      };
      startGeneralImagePolling();
    } catch (err: unknown) {
      const message = summarizeGenerationError(err instanceof Error ? err.message : t("generateFailed"));
      setError(message);
      const failedTask = taskQueue.markFailed(activeTaskId, message, {
        expectedCount: displayExpectedCount,
        inputThumbnails: taskInputThumbnails,
        resultThumbnails: pollCtxRef.current?.latestTaskResultUrlsRef.current ?? [],
        resultCount: pollCtxRef.current?.latestTaskResultUrlsRef.current.filter(Boolean).length ?? 0,
      });
      setActiveQueueTask(failedTask);
      toast.error(message);
      void refreshCredits();
      setIsGenerating(false);
    }
  }

  function handleRunningTask(item: TaskQueueItem) {
    setActiveQueueTask(item);
    setIsGenerating(true);
    setProgress(Math.min(Math.max(Math.round(Number(item.progress) || 12), 1), 99));
    setError("");
    setResultUrls(safeTaskQueueUrls(item.resultThumbnails));
  }

  async function handleCompletedTask(item: TaskQueueItem, session: TaskSelectionSession) {
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "generalImage", session.signal);
      if (!session.isCurrent()) return true;
      applyGeneralImageHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), {
        silent: session.reason === "restore",
      });
      if (item.statusGroup === "failed" || isHistoryApplyRowFailed(detail.row)) {
        setError(getHistoryApplyFailureMessage(detail.row, item.error || t("generateFailed")));
      }
      return true;
    } catch (err) {
      if (session.signal.aborted || !session.isCurrent()) return true;
      toast.error(err instanceof Error ? err.message : t("historyLoadFailed"));
      return true;
    }
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active={activeFeature} />
      <ModuleTaskRail module="generalImage" moduleLabel={t("moduleLabel")} onContinue={handleContinueCreate} onRunningTask={handleRunningTask} onCompletedTask={handleCompletedTask} />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          <ModuleHeader
            title={modeMeta.title}
            tooltip={modeMeta.tooltip}
          />

          {isImageMode && (
            <StudioUploadSection
              title={t("referenceSectionTitle")}
              inputRef={fileInputRef}
              multiple
              isDragging={isDragging}
              setDragging={setIsDragging}
              onFiles={async (files) => {
                await handleFiles(files);
              }}
              className="studio-general-reference-upload"
              actions={(
                <span className="rounded-full bg-[var(--codex-accent-10)] px-2 py-1 text-[10px] font-bold text-[var(--codex-accent)]">
                  {referenceImages.length}/8
                </span>
              )}
            >
              {(openFileDialog) => (
                <>
                  <StudioUploadTile
                    title={referenceImages.length >= 8 ? t("uploadTileFullTitle") : referenceImages.length ? t("uploadTileMoreTitle") : t("uploadTileEmptyTitle")}
                    description={t("uploadTileDescription")}
                    imageUrl={null}
                    imageAlt={t("referenceImageAlt")}
                    isDragging={isDragging}
                    loading={isUploading}
                    disabled={referenceImages.length >= 8}
                    onUploadClick={openFileDialog}
                    uploadLabel={t("uploadLabel")}
                    footnote={t("uploadFootnote")}
                  />

                  {referenceImages.length > 0 && (
                    <div className="mt-3">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-medium text-codex-faint">{t("orderMarkedAsImages")}</span>
                        <button type="button" onClick={() => { setReferenceImages([]); }} className="inline-flex items-center gap-1 text-codex-faint hover:text-red-500">
                          <Trash2 className="h-3.5 w-3.5" /> {t("clear")}
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                        {referenceImages.map((item, index) => (
                          <div key={item.id} className="studio-checkerboard group relative aspect-square overflow-hidden rounded-xl border border-white shadow-sm">
                            <RawPreviewImage src={item.preview} alt={item.name} className="h-full w-full object-contain p-1" />
                            <span className="absolute left-1 top-1 rounded bg-white/92 px-1.5 py-0.5 text-[10px] font-black text-codex-faint">{t("imageIndex", { index: index + 1 })}</span>
                            <button
                              type="button"
                              onClick={() => { setReferenceImages((prev) => prev.filter((image) => image.id !== item.id)); }}
                              className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-codex-ink/75 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 max-lg:opacity-100"
                              aria-label={t("removeImage", { index: index + 1 })}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </StudioUploadSection>
          )}

          <div>
            <StudioPromptTextarea
              title={t("textDescriptionTitle")}
              value={prompt}
              onChange={(event) => { setPrompt(event.target.value.slice(0, 4000)); }}
              placeholder={isImageMode ? t(IMAGE_PROMPT_PLACEHOLDER_KEY) : t("textPlaceholder")}
              rows={6}
              className="studio-prompt-textarea-compact"
              onSubmitOnEnter={() => { if (prompt.trim() && !isGenerating) void generate(); }}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {!isImageMode && (
                  <button
                    ref={imagePromptTriggerRef}
                    type="button"
                    onClick={() => setShowImagePromptModal(true)}
                    className="studio-button studio-button-compact"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    {t("imageToPromptButton")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={optimizePrompt}
                  disabled={isOptimizing}
                  className="studio-button studio-button-compact"
                >
                  {isOptimizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brush className="h-3.5 w-3.5" />}
                  {t("aiHelpWrite")}
                </button>
              </div>
              <span className="text-[11px] font-medium text-codex-faint">{prompt.length} / 4000</span>
            </div>
          </div>

          <section>
            <h3 className="mb-3 flex items-center gap-2 font-bold text-sm"><Sparkles className="h-4 w-4 text-[var(--codex-accent)]" /> {t("modelSectionTitle")}</h3>
            <StudioModelSelector
              models={modelOptions}
              value={aiModel}
              onChange={setAiModel}
              ariaLabel={t("modelAriaLabel")}
            />
          </section>

          <section>
            <AspectRatioSelector
              options={ASPECTS.map((item) => ({
                value: item.value,
                label: item.labelKey ? t(item.labelKey) : item.label,
              }))}
              value={aspectRatio}
              onChange={setAspectRatio}
              titleKey="ratioSectionTitle"
              ariaLabel={t("ratioAriaLabel")}
            />
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 font-bold text-sm"><Monitor className="h-4 w-4 text-[var(--codex-accent)]" /> {t("resolutionSectionTitle")}</h3>
            <StudioOptionGrid
              options={supportedSizes.map((size) => ({
                value: size,
                label: size,
                description: t("resolutionCostDescription", { cost: getCreditCost(aiModel, size, aspectRatio) }),
              }))}
              value={imageSize}
              onChange={setImageSize}
              columns={3}
              ariaLabel={t("resolutionAriaLabel")}
            />
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 font-bold text-sm"><Images className="h-4 w-4 text-[var(--codex-accent)]" /> {t("countSectionTitle")}</h3>
            <GenerationCountField
              value={genCount}
              onChange={setGenCount}
              ariaLabel={t("countAriaLabel")}
            />
          </section>
        </div>

        <StudioRunBar
          summary={`${isImageMode ? t("summaryImageToImage", { count: referenceImages.length }) : t("summaryTextToImage")} · ${costPerImage} × ${genCount}`}
          estimateLabel={isGenerating ? t("runBar.estimateGenerating") : t("runBar.estimateReady", { count: genCount })}
          costLabel={authIsAnonymous ? t("costLoginView") : t("costLabel", { cost: totalCost, balance: credits ?? "-" })}
          disabled={!canGenerate}
          disabledReason={runDisabledReason}
          primaryLabel={authIsAnonymous ? t("primaryLogin") : isGenerating ? t("primaryGenerating") : t("primaryGenerate", { count: genCount })}
          isLoading={isGenerating}
          onPrimaryAction={generate}
        />
      </div>

      <div className="studio-canvas min-h-[260px] sm:min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title={modeMeta.emptyTitle}
              subtitle={modeMeta.emptySubtitle}
              imageSrc={modeMeta.emptyImage}
              imageAlt={isImageMode ? t("guideImageAltImageToImage") : t("guideImageAltTextToImage")}
              steps={!isImageMode ? [
                { title: t("stepInputTitle"), desc: t("stepInputDesc") },
                { title: t("stepParamsTitle"), desc: t("stepParamsDesc") },
                { title: t("stepGenerateTitle"), desc: t("stepGenerateDesc") },
              ] : [
                { title: t("stepUploadRefTitle"), desc: t("stepUploadRefDesc") },
                { title: t("stepWriteIndexTitle"), desc: t("stepWriteIndexDesc") },
                { title: t("stepGenerateRefTitle"), desc: t("stepGenerateRefDesc") },
              ]}
            />
          </div>
        )}

        {isGenerating && resultUrls.length === 0 && !activeQueueTask && (
          <LoadingStage
            genCount={activeQueueTask ? clampTaskExpectedCount(activeQueueTask, 1, 4, genCount) : genCount}
            progress={progress}
            moduleName={modeMeta.title}
            referenceImages={referenceImages.map((item, index) => ({ label: item.name || t("referenceImageLabel", { index: index + 1 }), url: item.preview || item.url }))}
            metaItems={[aspectRatio, imageSize, isImageMode ? t("summaryImageToImage", { count: referenceImages.length }) : t("summaryTextToImage")]}
          />
        )}
        {((isGenerating && resultUrls.length > 0) || resultUrls.length > 0 || Boolean(activeQueueTask)) && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            <div className="flex min-h-0 flex-1 items-start justify-start">
              <ResultImageGrid
                urls={resultUrls}
                filenamePrefix={isImageMode ? "image-to-image" : "text-to-image"}
                expectedCount={activeResultExpectedCount}
                isGenerating={isGenerating}
                inputThumbnails={safeTaskQueueUrls(activeQueueTask?.inputThumbnails).length ? safeTaskQueueUrls(activeQueueTask?.inputThumbnails) : referenceImages.map((item) => item.preview || item.url)}
                createdAt={activeQueueTask?.createdAt}
                statusGroup={activeQueueTask?.statusGroup || (isGenerating ? "running" : undefined)}
                variant="task"
                failureLabel={t("failedLabel")}
                failureDetail={activeQueueTask?.statusGroup === "failed" ? buildFailedTaskDetail(activeQueueTask.error || error || undefined) : undefined}
                markMissingAsFailed={hasCompletedPartialResults}
                missingFailureLabel={t("missingFailLabel")}
                missingFailureDetail={partialFailureMessage}
                missingFailureActionLabel={t("retryThis")}
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
              filenamePrefix={isImageMode ? "image-to-image" : "text-to-image"}
              actions={GENERAL_IMAGE_PREVIEW_ACTIONS.map((action) => ({ ...action, label: action.labelKey ? t(action.labelKey) : action.label }))}
              onRegenerateAll={resetOutput}
            />
          </div>
        )}

        {error && !activeQueueTask && (
          <ErrorStage
            error={summarizeGenerationError(error)}
            onRetry={() => generate()}
            isGenerating={isGenerating}
            retryDisabled={retryDisabled}
            retryLabel={t("retryGenerate")}
            notice={FAILED_RETRY_NOTICE}
          />
        )}
      </div>

      <ImagePromptDialog
        open={showImagePromptModal}
        onOpenChange={setShowImagePromptModal}
        fileInputRef={imagePromptInputRef}
        returnFocusRef={imagePromptTriggerRef}
        image={imagePromptImage}
        text={imagePromptText}
        isUploading={isImagePromptUploading}
        isGenerating={isImagePromptGenerating}
        onUpload={uploadImageForPrompt}
        onGenerate={() => void generateImagePrompt()}
        onTextChange={setImagePromptText}
        onApply={applyImagePromptToDescription}
      />
      {confirmDialog}
    </div>
  );
}
