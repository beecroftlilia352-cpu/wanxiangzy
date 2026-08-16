"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Languages as LanguagesIcon,
  X,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { ImageTranslationHero } from "@/components/studio/ImageTranslationHero";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import {
  StudioModelSelector,
} from "@/components/studio/StudioFormControls";
import { PromptTextarea } from "@/components/studio/PromptTextarea";
import { ResolutionSelector } from "@/components/studio/ResolutionSelector";
import { AspectRatioSelector } from "@/components/studio/AspectRatioSelector";
import { GenerationCountField } from "@/components/studio/GenerationCountField";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { MultiImageUploadV2 } from "@/components/studio/MultiImageUploadV2";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { LanguagePickerModal } from "@/components/studio/LanguagePickerModal";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { useGenerationPolling } from "@/hooks/use-generation-polling";

import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { StudioMediaLightbox } from "@/components/studio/StudioMediaLightbox";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import {
  getCreditCost,
  getSupportedImageSizes,
  normalizeAspectRatio,
  normalizeImageSize,
  normalizeLingyaModel,
  type AspectRatio,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import { useStudioImageModelOptions } from "@/lib/studio-models";
import {
  fetchHistoryApplyDetail,
  getHistoryApplyFailureMessage,
  isHistoryApplyRowFailed,
  type HistoryJobPayload,
} from "@/lib/history-apply";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem, type TaskStatusGroup } from "@/lib/task-queue";
import { applyGenerationResponseStatus, showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import { useStudioPreview } from "@/hooks/use-studio-preview";
import { useHistoryApply } from "@/hooks/use-history-apply";
import { FAILED_RETRY_NOTICE, buildPartialFailureDetail, coerceErrorMessage, summarizeGenerationError } from "@/lib/studio-generation-feedback";
import {
  buildRetryPendingResultUrls,
  getRetryDisplayExpectedCount,
  mergeRetryResultUrls,
  normalizeRetryResultIndex,
} from "@/lib/result-slot-retry";
import {
  buildImageTranslationPrompt,
  enforceImageTranslationPromptRequirements,
  flattenImageTranslationLanguages,
  MAX_IMAGE_TRANSLATION_IMAGES,
  MAX_IMAGE_TRANSLATION_LANGUAGES,
  normalizeImageTranslationLanguageCodes,
  normalizeImageTranslationSourceUrls,
  type ImageTranslationLanguageConfig,
  type ImageTranslationLanguageCode,
} from "@/lib/image-translation";

type ImageTranslationHistoryPayload = Extract<HistoryJobPayload, { kind: "imageTranslation" }>;
type ImageTranslationGenerateOptions = {
  sourceUrlsOverride?: string[];
  genCountOverride?: number;
  expectedCountOverride?: number;
  retryResultIndex?: number;
  toastMessage?: string;
};

const DEFAULT_ASPECT_RATIO: AspectRatio = "auto";

const IMAGE_TRANSLATION_PREVIEW_ACTIONS = [
  { kind: "download" as const, label: "下载图片", labelKey: "actionDownload" },
  { kind: "copy" as const, label: "复制链接", labelKey: "actionCopy" },
  { kind: "regenerateAll" as const, label: "重新创作", labelKey: "actionRegenerateAll" },
  { kind: "feedback" as const, label: "反馈", labelKey: "actionFeedback" },
];

export default function ImageTranslationPage() {
  const router = useRouter();
  const t = useTranslations("ImageTranslation");
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const languageTriggerRef = useRef<HTMLButtonElement>(null);
  const [sourceUrls, setSourceUrls] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [languageLabels, setLanguageLabels] = useState<string[]>([]);
  const [languageConfig, setLanguageConfig] = useState<ImageTranslationLanguageConfig>([]);
  const [languageConfigLoading, setLanguageConfigLoading] = useState(true);
  const [userPrompt, setUserPrompt] = useState("");
  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const modelOptions = useStudioImageModelOptions();
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(DEFAULT_ASPECT_RATIO);
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [isSourceDragging, setIsSourceDragging] = useState(false);
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [runningExpectedCount, setRunningExpectedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);

  const { authChecked, isAuthenticated, userId, credits, setCredits, refreshCredits, refreshAuth } = useStudioAuth();

  const allLanguages = useMemo(() => flattenImageTranslationLanguages(languageConfig), [languageConfig]);
  const languageLabelMap = useMemo(() => {
    const map = new Map<string, ImageTranslationLanguageCode>();
    allLanguages.forEach((lang) => map.set(lang.code, lang));
    return map;
  }, [allLanguages]);

  const primarySourceUrl = sourceUrls[0] || "";
  const requestedResultCount = sourceUrls.length * languages.length * genCount;
  const activeResultExpectedCount = isGenerating
    ? runningExpectedCount || requestedResultCount
    : runningExpectedCount || Math.max(resultUrls.length, 1);
  const displayedResultUrls = resultUrls.filter(Boolean);
  const partialFailureMessage = buildPartialFailureDetail({
    failedCount: activeResultExpectedCount - displayedResultUrls.length,
  });
  const hasCompletedPartialResults = Boolean(
    !isGenerating
    && activeResultExpectedCount > displayedResultUrls.length
    && displayedResultUrls.length > 0
  );
  const retryDisabled = isGenerating;

  const finalPrompt = useMemo(
    () =>
      promptOverride ??
      buildImageTranslationPrompt({
        sourceCount: sourceUrls.length,
        languages,
        languageLabels,
        userPrompt,
        aiModel,
        imageSize,
      }),
    [promptOverride, sourceUrls.length, languages, languageLabels, userPrompt, aiModel, imageSize]
  );

  const unitCost = getCreditCost(aiModel, imageSize, aspectRatio);
  const cost = unitCost * requestedResultCount;
  const taskQueue = useTaskQueueGeneration({
    module: "imageTranslation",
    title: t("taskQueueTitle"),
    defaultExpectedCount: requestedResultCount,
    applyPath: "/image-translation",
  });

  // 后台轮询 generation 状态：useGenerationPolling 拿不到 attempts，所以把"transient-failed"
  // 这条小语义折到 isTerminal 决策里——只要拿到部分结果就视为终态（partial-complete），
  // 让原本的"attempts<60"近似成"任何一次响应里包含 result_urls"。
  const pollCtxRef = useRef<{
    activeTaskId: string;
    generationId: string;
    displayExpectedCount: number;
    retryPreviousResultUrls: string[];
    retryResultIndex: number | null;
    taskInputThumbnails: string[];
    hasResultsRef: { current: boolean };
    latestTaskResultUrlsRef: { current: string[] };
    setProgress: (p: number) => void;
    setResultUrls: (updater: (current: string[]) => string[]) => void;
    setIsGenerating: (b: boolean) => void;
    setError: (msg: string) => void;
    refreshCredits: () => Promise<number | null | undefined>;
    taskQueue: typeof taskQueue;
  } | null>(null);

  const { start: startImageTranslationPolling } = useGenerationPolling<{
    status: string;
    progress?: number;
    result_urls?: unknown;
    error?: string;
    partial_failure?: { message?: unknown };
  }>({
    id: "",
    buildUrl: (id) => {
      const ctx = pollCtxRef.current;
      return `/api/image-translation?generation_id=${encodeURIComponent(ctx?.generationId ?? id)}`;
    },
    isTerminal: (state) => {
      if (state.status === "completed") return true;
      if (state.status === "failed") return true; // 包含部分成功 & 真正失败，统一在 onComplete 内分支
      return false;
    },
    intervalMs: 2000,
    maxAttempts: 180,
    onTick: (state) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      // 终端态交给 onComplete，避免重复 setProgress
      if (state.status === "completed" || state.status === "failed") return;

      // 部分结果先合并 + 推 UI
      if (Array.isArray(state.result_urls) && state.result_urls.length) {
        const merged = mergeRetryResultUrls(
          ctx.retryPreviousResultUrls,
          ctx.retryResultIndex,
          state.result_urls,
          ctx.displayExpectedCount
        );
        ctx.latestTaskResultUrlsRef.current = merged;
        ctx.setResultUrls((current) => {
          const next = [...merged];
          return sameResultSlots(current, next) ? current : next;
        });
      }
      ctx.hasResultsRef.current = ctx.latestTaskResultUrlsRef.current.filter(Boolean).length > 0;

      const nextProgress = Number(state.progress);
      const runningProgress = Number.isFinite(nextProgress)
        ? Math.min(Math.max(Math.round(nextProgress), 0), 99)
        : 24; // hook 拿不到 attempts，无法再做 25 + attempts*1.2 渐进
      ctx.setProgress(runningProgress);
      ctx.taskQueue.markRunning(ctx.activeTaskId, {
        expectedCount: ctx.displayExpectedCount,
        inputThumbnails: ctx.taskInputThumbnails,
        resultThumbnails: ctx.latestTaskResultUrlsRef.current,
        progress: runningProgress,
        status: state.status,
      });
    },
    onComplete: (state) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;

      // 分支 1：完成 或 失败但有部分结果 → 部分完成路径
      if (state.status === "completed" || (state.status === "failed" && ctx.hasResultsRef.current)) {
        const finalUrls = mergeRetryResultUrls(
          ctx.retryPreviousResultUrls,
          ctx.retryResultIndex,
          Array.isArray(state.result_urls) ? state.result_urls : ctx.latestTaskResultUrlsRef.current,
          ctx.displayExpectedCount
        );
        const finalResultCount = finalUrls.filter(Boolean).length;
        const partialFailure = state.partial_failure && typeof state.partial_failure === "object"
          ? (state.partial_failure as { message?: unknown })
          : null;
        const completedError = state.error || coerceErrorMessage(partialFailure?.message);
        ctx.setProgress(100);
        ctx.setResultUrls(() => finalUrls);
        ctx.setIsGenerating(false);
        ctx.taskQueue.markCompleted(ctx.activeTaskId, {
          expectedCount: ctx.displayExpectedCount,
          inputThumbnails: ctx.taskInputThumbnails,
          resultThumbnails: finalUrls,
          resultCount: finalResultCount,
          error: completedError ? summarizeGenerationError(completedError) : "",
        });
        if (completedError || finalResultCount < ctx.displayExpectedCount) {
          void ctx.refreshCredits();
          toast.warning(t("partialComplete", { done: finalResultCount, expected: ctx.displayExpectedCount }));
        } else {
          toast.success(t("generateComplete"));
        }
        return;
      }

      // 分支 2：失败且无结果 → 真正的失败（原本 catch 处理的内容）
      if (state.status === "failed") {
        const message = summarizeGenerationError(state.error || t("generateFailed"));
        ctx.setError(message);
        ctx.taskQueue.markFailed(ctx.activeTaskId, message, {
          expectedCount: ctx.displayExpectedCount,
          inputThumbnails: ctx.taskInputThumbnails,
          resultThumbnails: ctx.latestTaskResultUrlsRef.current,
        });
        toast.error(message);
        void ctx.refreshCredits();
        ctx.setIsGenerating(false);
        return;
      }
    },
    onError: (error) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      const message = summarizeGenerationError(error.message || t("generateTimeout"));
      ctx.setError(message);
      ctx.taskQueue.markFailed(ctx.activeTaskId, message, {
        expectedCount: ctx.displayExpectedCount,
        inputThumbnails: ctx.taskInputThumbnails,
        resultThumbnails: ctx.latestTaskResultUrlsRef.current,
      });
      toast.error(message);
      void ctx.refreshCredits();
      ctx.setIsGenerating(false);
    },
  });

  // 拉取语言配置（无需鉴权，公开缓存）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/image-translation-languages", { method: "GET", cache: "no-store" });
        if (!res.ok) throw new Error("failed");
        const json = (await res.json()) as { data?: ImageTranslationLanguageConfig };
        if (cancelled) return;
        if (Array.isArray(json.data)) setLanguageConfig(json.data);
      } catch {
        if (!cancelled) setLanguageConfig([]);
      } finally {
        if (!cancelled) setLanguageConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 历史任务回填
  useHistoryApply({
    kind: "imageTranslation",
    apply: (payload, resultUrls, { row }) => {
      applyHistoryPayload(payload, resultUrls, { silent: true });
      if (isHistoryApplyRowFailed(row)) {
        setError(getHistoryApplyFailureMessage(row));
      }
      toast.success(t("historyAppliedToast"));
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  const applyHistoryPayload = (
    payload: ImageTranslationHistoryPayload,
    historyResultUrls: string[] = [],
    options?: { silent?: boolean }
  ) => {
    const known = allLanguages;
    const restoredLanguages = normalizeImageTranslationLanguageCodes(payload.languages, known);
    setSourceUrls(normalizeImageTranslationSourceUrls(payload.sourceUrls, payload.sourceUrl));
    setLanguages(restoredLanguages);
    setLanguageLabels(Array.isArray(payload.languageLabels) ? payload.languageLabels : restoredLanguages);
    setAiModel(normalizeLingyaModel(payload.aiModel));
    const restoredAspectRatio = normalizeAspectRatio(payload.aspectRatio || DEFAULT_ASPECT_RATIO, DEFAULT_ASPECT_RATIO);
    setAspectRatio(restoredAspectRatio);
    // Pass the just-restored aspect ratio explicitly — `aspectRatio` here is the
    // closure-captured old value and React state setters batch, so reading the
    // local variable avoids a transient mismatch that previously forced the
    // size to fall back to the lowest supported tier on re-apply.
    setImageSize(normalizeImageSize(payload.aiModel, payload.imageSize, restoredAspectRatio));
    setGenCount(Math.min(Math.max(Number(payload.genCount) || 1, 1), 4));
    setPromptOverride(enforceImageTranslationPromptRequirements(payload.prompt, {
      // Legacy rows may have sourceUrls=null (single-source schema) — fall back
      // to 0 so the prompt builder doesn't choke and the apply continues.
      sourceCount: (payload.sourceUrls ?? []).length,
      languages: restoredLanguages,
      languageLabels: Array.isArray(payload.languageLabels) ? payload.languageLabels : restoredLanguages,
    }));
    setRunningExpectedCount(null);
    setResultUrls(historyResultUrls);
    setIsGenerating(false);
    setProgress(historyResultUrls.length ? 100 : 0);
    setError(null);
    if (!options?.silent) toast.success(t("historyAppliedToast"));
  };

  const handleLanguageChange = (next: string[]) => {
    const labels = next.map((code) => languageLabelMap.get(code)?.label || code);
    setLanguages(next);
    setLanguageLabels(labels);
    setPromptOverride(null);
  };

  const handleSourceUpload = useCallback(
    async (files: File[]) => {
      const valid = files.filter((file) => {
        if (!file.type.startsWith("image/")) {
          toast.error(`"${file.name}" ${t("notImageFormat")}`);
          return false;
        }
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`"${file.name}" ${t("exceedsSize", { max: MAX_FILE_SIZE_MB })}`);
          return false;
        }
        return true;
      });
      if (!valid.length) return;
      const remaining = Math.max(MAX_IMAGE_TRANSLATION_IMAGES - sourceUrls.length, 0);
      if (remaining === 0) {
        toast.error(t("maxImagesReached", { max: MAX_IMAGE_TRANSLATION_IMAGES }));
        return;
      }
      const slice = valid.slice(0, remaining);
      toast.info(t("uploadingImages", { count: slice.length }));
      setIsUploadingSource(true);
      try {
        const uploads = await Promise.all(slice.map((file) => uploadImage(file)));
        setSourceUrls((prev) => {
          const merged = [...prev, ...uploads.map((item) => item.url)];
          return merged.slice(0, MAX_IMAGE_TRANSLATION_IMAGES);
        });
        setPromptOverride(null);
        toast.success(t("uploadedImages", { count: uploads.length }));
      } catch {
        toast.error(t("uploadFailed"));
      } finally {
        setIsUploadingSource(false);
      }
    },
    [sourceUrls.length, t]
  );

  const runDisabledReason = !sourceUrls.length
    ? t("needUploadFirst")
    : !languages.length
      ? t("needSelectLanguage")
      : credits !== null && credits < cost
        ? t("insufficientCredits", { cost })
        : undefined;

  function handleRetryFailedResult(index: number) {
    if (retryDisabled) return;
    const perSourceCount = Math.max(1, languages.length * Math.max(genCount, 1));
    const sourceIndex = Math.min(
      Math.max(0, Math.floor(index / perSourceCount)),
      Math.max(sourceUrls.length - 1, 0)
    );
    const retrySourceUrl = sourceUrls[sourceIndex] || sourceUrls[0];
    if (!retrySourceUrl) {
      toast.error(t("noSourceToRetry"));
      return;
    }
    void generate(undefined, {
      sourceUrlsOverride: [retrySourceUrl],
      genCountOverride: 1,
      expectedCountOverride: languages.length || 1,
      retryResultIndex: index,
      toastMessage: t("retryToast", { index: index + 1 }),
    });
  }


  const perSourceCount = languages.length * Math.max(1, Math.min(genCount || 1, 4));
  const activeSourceIdx = previewIndex !== null
    ? Math.min(sourceUrls.length - 1, Math.max(0, Math.floor(previewIndex / Math.max(1, perSourceCount))))
    : 0;
  const activeSourceUrl = sourceUrls[activeSourceIdx] || "";

  const previewSession = useStudioPreview({
    module: "imageTranslation",
    title: t("previewSessionTitle"),
    urls: resultUrls,
    expectedCount: activeResultExpectedCount,
    isGenerating,
    references: activeSourceUrl
      ? [{ url: activeSourceUrl, label: sourceUrls.length > 1 ? t("sourceImageIndexed", { index: activeSourceIdx + 1 }) : t("sourceImage"), role: "source" }]
      : [],
    promptText: userPrompt || undefined,
    metaItems: [
      { label: t("metaSourceCount"), value: sourceUrls.length },
      { label: t("metaLanguages"), value: languageLabels.length ? languageLabels.join(" / ") : languages.join(" / ") },
      { label: t("metaModel"), value: aiModel },
      { label: t("metaResolution"), value: imageSize },
      { label: t("metaPerGen"), value: genCount },
    ],
    resultTitlePrefix: t("resultTitlePrefix"),
  });

  function handleRunningTask(item: TaskQueueItem) {
    setRunningExpectedCount(clampTaskExpectedCount(item, 1, MAX_IMAGE_TRANSLATION_IMAGES * MAX_IMAGE_TRANSLATION_LANGUAGES * 4));
    setIsGenerating(true);
    setProgress(Math.min(Math.max(Math.round(Number(item.progress) || 12), 1), 99));
    setError(null);
    setResultUrls(safeTaskQueueUrls(item.resultThumbnails));
  }

  async function handleCompletedTask(item: TaskQueueItem, session: TaskSelectionSession) {
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "imageTranslation", session.signal);
      if (!session.isCurrent()) return true;
      applyHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails));
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

  function handleContinueCreate() {
    setSourceUrls([]);
    setLanguages([]);
    setLanguageLabels([]);
    setUserPrompt("");
    setAiModel("nano-banana-2");
    setAspectRatio(DEFAULT_ASPECT_RATIO);
    setImageSize("1K");
    setGenCount(1);
    setPromptOverride(null);
    setIsGenerating(false);
    setRunningExpectedCount(null);
    setProgress(0);
    setResultUrls([]);
    setError(null);
    setLightboxSrc(null);
    if (sourceInputRef.current) sourceInputRef.current.value = "";
  }

  async function generate(_promptForRun?: string, options: ImageTranslationGenerateOptions = {}) {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("pleaseLogin"));
      router.push("/login");
      return;
    }
    const runSourceUrls = options.sourceUrlsOverride?.length ? options.sourceUrlsOverride : sourceUrls;
    if (runSourceUrls.length === 0) {
      toast.error(t("needUploadFirst"));
      return;
    }
    if (languages.length === 0) {
      toast.error(t("needSelectLanguage"));
      return;
    }
    const runGenCount = Math.min(Math.max(Math.round(Number(options.genCountOverride ?? genCount) || 1), 1), 4);
    const runExpectedCount = Math.max(
      1,
      Math.round(
        Number(options.expectedCountOverride ?? runSourceUrls.length * languages.length * runGenCount) || runGenCount
      )
    );
    const retryResultIndex = normalizeRetryResultIndex(options.retryResultIndex);
    const retryPreviousResultUrls = retryResultIndex !== null ? resultUrls : [];
    const displayExpectedCount = getRetryDisplayExpectedCount({
      retryIndex: retryResultIndex,
      currentExpectedCount: activeResultExpectedCount,
      previousUrls: retryPreviousResultUrls,
      fallbackExpectedCount: runExpectedCount,
    });
    const runTotalCost = unitCost * runExpectedCount;
    if (credits !== null && credits < runTotalCost) {
      showInsufficientCreditsToast({ required: runTotalCost, balance: credits, onRecharge: () => router.push("/pricing") });
      return;
    }

    setIsGenerating(true);
    setRunningExpectedCount(displayExpectedCount);
    setProgress(10);
    setResultUrls(buildRetryPendingResultUrls(retryPreviousResultUrls, retryResultIndex, displayExpectedCount));
    setError(null);
    if (options.toastMessage) toast.info(options.toastMessage);

    const runTaskInputThumbnails = runSourceUrls.slice();
    const provisionalTask = taskQueue.startTask({
      expectedCount: displayExpectedCount,
      inputThumbnails: runTaskInputThumbnails,
      progress: 10,
    });
    let activeTaskId = provisionalTask.id;

    try {
      const res = await fetch("/api/image-translation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_url: runSourceUrls[0] || "",
          source_urls: runSourceUrls,
          languages,
          language_labels: languageLabels,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          gen_count: runGenCount,
          user_prompt: userPrompt,
          prompt: finalPrompt,
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
        applyGenerationResponseStatus({ res, data, userId, setCredits, fallbackError: t("generateFailed") });
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
          inputThumbnails: runTaskInputThumbnails,
          status: data.status || "processing_tryon",
          progress: 25,
        });
        activeTaskId = serverTask.id;
      }

      // 后台轮询：useGenerationPolling 替代原 inline for-loop + setTimeout + fetch
      pollCtxRef.current = {
        activeTaskId,
        generationId: typeof data.generation_id === "string" ? data.generation_id : "",
        displayExpectedCount,
        retryPreviousResultUrls,
        retryResultIndex,
        taskInputThumbnails: runTaskInputThumbnails,
        hasResultsRef: { current: false },
        latestTaskResultUrlsRef: { current: [] },
        setProgress,
        setResultUrls,
        setIsGenerating,
        setError,
        refreshCredits,
        taskQueue,
      };
      startImageTranslationPolling();
    } catch (err: unknown) {
      const message = summarizeGenerationError(err instanceof Error ? err.message : t("generateFailed"));
      setError(message);
      taskQueue.markFailed(activeTaskId, message, {
        expectedCount: displayExpectedCount,
        inputThumbnails: runTaskInputThumbnails,
        resultThumbnails: pollCtxRef.current?.latestTaskResultUrlsRef.current ?? [],
      });
      toast.error(message);
      void refreshCredits();
      setIsGenerating(false);
    }
  }

  function sameResultSlots(current: string[], next: string[]) {
    return current.length === next.length && current.every((url, index) => url === next[index]);
  }

  const authIsAnonymous = authChecked && !isAuthenticated;
  const summary = (() => {
    if (!sourceUrls.length) return t("waitingUploadSummary", { count: genCount });
    if (!languages.length) return t("selectLanguageSummary", { count: sourceUrls.length });
    return t("fullSummary", { sources: sourceUrls.length, langs: languages.length, gen: genCount, size: imageSize });
  })();

  let statusGroup: TaskStatusGroup | undefined;
  if (isGenerating) statusGroup = "running";
  else if (resultUrls.length > 0) statusGroup = "completed";

  return (
    <div className="studio-workbench studio-image-translation-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="imageTranslation" />
      <ModuleTaskRail module="imageTranslation" moduleLabel={t("moduleLabel")} onContinue={handleContinueCreate} onRunningTask={handleRunningTask} onCompletedTask={handleCompletedTask} />

      <div className="studio-parameters studio-image-translation-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5">
          <ModuleHeader
            title={t("title")}
            tooltip={t("tooltip")}
            actions={(
              <span className="rounded-full bg-[var(--codex-accent-10)] px-2 py-0.5 text-[11px] font-black text-[var(--codex-accent)]">
                NEW
              </span>
            )}
          />

          <StudioUploadSection
            title={t("uploadSectionTitle")}
            inputRef={sourceInputRef}
            multiple
            isDragging={isSourceDragging}
            setDragging={setIsSourceDragging}
            onFiles={handleSourceUpload}
          >
            {(openFileDialog) => (
              <MultiImageUploadV2
                urls={sourceUrls}
                maxCount={MAX_IMAGE_TRANSLATION_IMAGES}
                title={t("uploadTitle")}
                showExamples={false}
                descriptionSlot={(
                  <span>
                    {t("uploadDescriptionSlot")}{" "}
                    <a
                      href="/all-category-product-image"
                      className="inline-flex items-center gap-1"
                    >
                      {t("uploadDescriptionLink")}
                      <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </span>
                )}
                itemLabelPrefix={t("uploadItemLabelPrefix")}
                loading={isUploadingSource}
                isDragging={isSourceDragging}
                libraryLabel={t("libraryLabel")}
                footnote={t("uploadFootnote", { max: MAX_IMAGE_TRANSLATION_IMAGES })}
                tips={[
                  { label: t("tipNoteLabel"), text: t("tipNoteText") },
                  { label: t("tipRecommendLabel"), text: t("tipRecommendText") },
                ]}
                imageFit="cover"
                onUploadClick={openFileDialog}
                onLibraryClick={() => toast.info(t("libraryComingSoon"))}
                onPreview={(url) => setLightboxSrc(url)}
                onRemove={(_, index) => {
                  setSourceUrls((prev) => prev.filter((__, i) => i !== index));
                  setPromptOverride(null);
                }}
                onClear={() => {
                  setSourceUrls([]);
                  setPromptOverride(null);
                }}
              />
            )}
          </StudioUploadSection>

          <section className="studio-language-field">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="studio-control-title">
                <LanguagesIcon className="h-4 w-4 text-[var(--codex-accent)]" />
                {t("languageSectionTitle")} <span className="text-xs font-normal text-codex-faint">· {t("languageMulti")}</span>
              </h3>
              <span className="text-xs text-codex-faint">{t("languageSelectedCount", { selected: languages.length, max: MAX_IMAGE_TRANSLATION_LANGUAGES })}</span>
            </div>
            <button
              ref={languageTriggerRef}
              type="button"
              onClick={() => setLanguageModalOpen(true)}
              className="studio-language-field-trigger"
            >
              <span className="truncate">
                {languageLabels.length
                  ? languageLabels.join(" / ")
                  : t("languagePlaceholder")}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
            {languages.length ? (
              <div className="studio-language-field-values">
                {languages.map((code, index) => {
                  const label = languageLabels[index] || code;
                  return (
                    <span
                      key={code}
                      className="studio-language-field-value"
                    >
                      {label}
                      <button
                        type="button"
                        aria-label={t("removeLanguage", { label })}
                        onClick={() => {
                          setLanguages((prev) => prev.filter((item) => item !== code));
                          setLanguageLabels((prev) => prev.filter((_, i) => i !== index));
                          setPromptOverride(null);
                        }}
                        className="rounded-full p-0.5 hover:bg-[var(--codex-accent-20)]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section>
            <PromptTextarea
              title={t("extraSectionTitle")}
              badge={t("extraOptional")}
              value={userPrompt}
              onChange={(event) => {
                setUserPrompt(event.target.value);
                setPromptOverride(null);
              }}
              rows={3}
              placeholder={t("extraPlaceholder")}
              description={t("extraHint")}
              maxLength={1000}
              onClear={() => setUserPrompt("")}
            />
          </section>

          <StudioModelSelector
            models={modelOptions}
            value={aiModel}
            onChange={setAiModel}
            ariaLabel={t("modelAriaLabel")}
          />

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="studio-control-title">{t("ratioSectionTitle")}</h3>
              <span className="rounded-full bg-[var(--codex-surface-soft)] px-2 py-0.5 text-[11px] font-semibold text-codex-faint">
                {t("ratioDefaultLabel")}
              </span>
            </div>
            <AspectRatioSelector
              options={[{ value: "auto" as AspectRatio, label: t("ratioAutoLabel") }]}
              value={aspectRatio}
              onChange={(value) => setAspectRatio(normalizeAspectRatio(value, DEFAULT_ASPECT_RATIO))}
              ariaLabel={t("ratioAriaLabel")}
            />
          </section>

          <section>
            <ResolutionSelector
              title={t("resolutionSectionTitle")}
              options={getSupportedImageSizes(aiModel, aspectRatio).map((size) => ({
                value: size,
                label: size,
                description: t("resolutionCostLabel", { size, cost: getCreditCost(aiModel, size, aspectRatio) }),
              }))}
              value={imageSize}
              onChange={setImageSize}
              ariaLabel={t("resolutionAriaLabel")}
            />
          </section>

          <section>
            <GenerationCountField
              title={t("genCountSectionTitle")}
              label={t("genCountSectionTitle")}
              value={genCount}
              onChange={setGenCount}
              ariaLabel={t("genCountAriaLabel")}
            />
            <p className="mt-2 text-[12px] leading-relaxed text-codex-faint">
              {t("genTotalHint", { count: sourceUrls.length * Math.max(languages.length, 1) * genCount })}
            </p>
          </section>

          {!isGenerating && !resultUrls.length && !error && primarySourceUrl ? (
            <section className="rounded-2xl border border-[var(--codex-border)] bg-[var(--codex-surface-soft)]/70 p-3">
              <p className="mb-2 text-[12px] font-semibold text-codex-faint">{t("previewNote")}</p>
              <div className="relative overflow-hidden rounded-xl bg-codex-surface">
                <RawPreviewImage src={primarySourceUrl} alt={t("previewImageAlt")} className="aspect-[3/4] w-full object-contain" />
                <button
                  type="button"
                  onClick={() => setLightboxSrc(primarySourceUrl)}
                  className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-white/10/85 text-codex-faint shadow-sm hover:text-[var(--codex-accent)]"
                  aria-label={t("previewZoomAria")}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <CheckCircle2 className="absolute left-2 top-2 h-5 w-5 rounded-full bg-white dark:bg-white/10 text-emerald-500" />
              </div>
            </section>
          ) : null}
        </div>

        <StudioRunBar
          summary={summary}
          estimateLabel={isGenerating ? t("runBar.estimateGenerating") : t("runBar.estimateReady", { count: genCount })}
          costLabel={authIsAnonymous ? t("costLoginView") : t("costLabel", { cost, balance: credits ?? "-" })}
          disabled={isGenerating || Boolean(runDisabledReason)}
          disabledReason={runDisabledReason}
          primaryLabel={
            authIsAnonymous
              ? t("primaryLogin")
              : isGenerating
                ? t("primaryGenerating", { progress: Math.round(progress) })
                : t("primaryGenerate", { count: sourceUrls.length * Math.max(languages.length, 1) * genCount })
          }
          isLoading={isGenerating}
          onPrimaryAction={() => generate()}
        />
      </div>

      <div className="studio-canvas relative flex-1 min-h-[520px] lg:h-full overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error ? (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <ImageTranslationHero
              title={t("heroTitle")}
              description={t("heroDescription")}
            />
          </div>
        ) : null}

        {(isGenerating || resultUrls.length > 0 || error) && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col gap-6 animate-fade-in">
            {sourceUrls.length === 0 && languages.length === 0 ? null : sourceUrls.map((sourceUrl, sIndex) => {
              const start = sIndex * languages.length * Math.max(1, Math.min(genCount || 1, 4));
              const perLanguage = Math.max(1, Math.min(genCount || 1, 4));
              const expectedPerSource = languages.length * perLanguage;
              const urlsForSource: string[] = Array.from({ length: expectedPerSource }, (_, i) => resultUrls[start + i] || "");
              const labelsForSource: string[] = Array.from({ length: expectedPerSource }, (_, i) => {
                const langIndex = Math.floor(i / perLanguage);
                return languageLabels[langIndex] || languages[langIndex] || "";
              });
              return (
                <ResultImageGrid
                  key={`image-translation-group-${sIndex}-${sourceUrl}`}
                  urls={urlsForSource}
                  filenamePrefix={`image-translation-s${sIndex + 1}`}
                  expectedCount={expectedPerSource}
                  isGenerating={isGenerating}
                  statusGroup={statusGroup}
                  variant="task"
                  inputReferences={[{ url: sourceUrl, label: t("sourceImageIndexed", { index: sIndex + 1 }) }]}
                  cellLabels={labelsForSource}
                  reducePendingMotion
                  markMissingAsFailed={hasCompletedPartialResults}
                  markMissingAsCompleted={statusGroup === "completed" && !hasCompletedPartialResults}
                  missingFailureLabel={t("missingFailLabel")}
                  missingFailureDetail={partialFailureMessage ?? undefined}
                  missingFailureActionLabel={t("retryThis")}
                  onMissingFailureAction={(idx) => handleRetryFailedResult(start + idx)}
                  missingFailureActionDisabled={retryDisabled}
                  onOpen={(_, idx) => setPreviewIndex(start + idx)}
                
                  tileAspectRatio={aspectRatio}
                />
              );
            })}
            <StudioImagePreviewDialog
              open={previewIndex !== null}
              onClose={() => setPreviewIndex(null)}
              session={previewSession}
              selectedIndex={previewIndex || 0}
              onSelectedIndexChange={setPreviewIndex}
              filenamePrefix="image-translation"
              actions={IMAGE_TRANSLATION_PREVIEW_ACTIONS}
              onRegenerateAll={() => void generate()}
            />
          </div>
        )}

        {error ? (
          <ErrorStage
            error={summarizeGenerationError(error)}
            onRetry={() => {
              setError(null);
              void generate();
            }}
            isGenerating={isGenerating}
            retryDisabled={retryDisabled}
            retryLabel={t("retryGenerate")}
            notice={FAILED_RETRY_NOTICE}
          />
        ) : null}
      </div>

      <LanguagePickerModal
        open={languageModalOpen}
        onClose={() => setLanguageModalOpen(false)}
        config={languageConfig}
        selected={languages}
        onChange={handleLanguageChange}
        title={t("languagePickerTitle")}
        description={languageConfigLoading ? t("languagePickerLoading") : t("languagePickerDesc")}
        triggerRef={languageTriggerRef}
        anchorSelector=".studio-image-translation-parameters"
        maxCount={MAX_IMAGE_TRANSLATION_LANGUAGES}
      />

      <StudioMediaLightbox src={lightboxSrc} alt={t("lightboxAlt")} onClose={() => setLightboxSrc(null)} />
    </div>
  );
}
