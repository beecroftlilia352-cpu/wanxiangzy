"use client";
import { useTranslations } from "next-intl";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRulesPopover } from "@/hooks/use-rules-popover";
import { useRouter } from "next/navigation";
import {
  Crop,
  Layers,
  Camera,
  CheckCircle2,
  ChevronRight,
  Images,
  Sparkles,
  UserRound,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { StudioModelSelector, StudioOptionGrid } from "@/components/studio/StudioFormControls";
import { ResolutionSelector } from "@/components/studio/ResolutionSelector";
import { PromptTextarea } from "@/components/studio/PromptTextarea";
import { AspectRatioSelector } from "@/components/studio/AspectRatioSelector";
import { GenerationCountField } from "@/components/studio/GenerationCountField";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { MultiImageUploadV2 } from "@/components/studio/MultiImageUploadV2";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { StudioRulesPopover } from "@/components/studio/StudioRulesPopover";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { useGenerationPolling } from "@/hooks/use-generation-polling";
import { ResultImageGrid } from "@/components/ResultImageGrid";

import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { StudioMediaLightbox } from "@/components/studio/StudioMediaLightbox";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { useStudioImageModelOptions } from "@/lib/studio-models";
import { fetchHistoryApplyDetail, getHistoryApplyFailureMessage, isHistoryApplyRowFailed, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem, type TaskStatusGroup } from "@/lib/task-queue";
import { showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import { applyGenerationResponseStatus } from "@/lib/ui/credit-copy";
import { createGenericImagePreviewSession, takeSourceImageFromLocation, type ImagePreviewAction } from "@/lib/studio-image-preview";
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
  BACKGROUND_PRESETS,
  BACKGROUND_TEXT_PRESETS,
  DEFAULT_BACKGROUND_TEXT,
  MAX_MODEL_BACKGROUND_SOURCE_IMAGES,
  MODEL_BACKGROUND_USER_PROMPT_PLACEHOLDER,
  MODEL_BACKGROUND_UPLOAD_RULE,
  PRESET_BACKGROUND_MODELS,
  buildModelBackgroundPrompt,
  getBackgroundPreset,
  normalizeBackgroundPreset,
  normalizeBackgroundSourceMode,
  normalizeModelBackgroundMode,
  normalizeModelBackgroundSourceUrls,
  type BackgroundPresetId,
  type BackgroundSourceMode,
  type ModelBackgroundMode,
} from "@/lib/model-background";

type ModelBackgroundHistoryPayload = Extract<HistoryJobPayload, { kind: "modelBackground" }>;
type ModelBackgroundGenerateOptions = {
  sourceUrlsOverride?: string[];
  genCountOverride?: number;
  expectedCountOverride?: number;
  retryResultIndex?: number;
  toastMessage?: string;
};

const ASPECTS: { value: AspectRatio; label: string; labelKey?: string }[] = [
  { value: "auto", label: "智能", labelKey: "Shared.aspect.auto" },
  { value: "3:4", label: "3:4 竖版", labelKey: "Shared.aspect.portrait" },
  { value: "4:5", label: "4:5 种草", labelKey: "ModelBackground.aspects.social45" },
  { value: "1:1", label: "1:1 方图", labelKey: "Shared.aspect.square" },
  { value: "9:16", label: "9:16 手机", labelKey: "Shared.aspect.phone" },
  { value: "4:3", label: "4:3 横图", labelKey: "Shared.aspect.landscape" },
];

const MODE_OPTIONS: { value: ModelBackgroundMode; desc: string; descKey?: string }[] = [
  { value: "background_only", desc: "默认", descKey: "modes.backgroundOnly" },
  { value: "model_background", desc: "换人+景", descKey: "modes.modelBackground" },
  { value: "model_only", desc: "只换脸", descKey: "modes.modelOnly" },
];

const BACKGROUND_SOURCE_OPTIONS: BackgroundSourceMode[] = ["preset", "upload", "text"];
const CARD_ZOOM_BUTTON_CLASS =
  "absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-white/10/85 text-codex-muted opacity-0 shadow-sm transition-opacity hover:bg-white hover:text-[var(--codex-accent)] focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 max-lg:opacity-100";

type ModelBackgroundPreviewAction = ImagePreviewAction & { labelKey?: string };

const MODEL_BACKGROUND_PREVIEW_ACTIONS: ModelBackgroundPreviewAction[] = [
  { kind: "download", label: "下载图片", labelKey: "ModelBackground.previewActions.download" },
  { kind: "copy", label: "复制链接", labelKey: "ModelBackground.previewActions.copy" },
  { kind: "repair", label: "AI修图", labelKey: "ModelBackground.previewActions.repair" },
  { kind: "aiVideo", label: "AI视频", labelKey: "ModelBackground.previewActions.aiVideo" },
  { kind: "pose", label: "姿势裂变", labelKey: "ModelBackground.previewActions.pose" },
  { kind: "productSet", label: "商品套图", labelKey: "ModelBackground.previewActions.productSet" },
  { kind: "regenerateAll", label: "重新创作", labelKey: "ModelBackground.previewActions.regenerateAll" },
  { kind: "feedback", label: "反馈", labelKey: "ModelBackground.previewActions.feedback" },
];

type UploadTarget = "source" | "model" | "background";

export default function ModelBackgroundPage() {
  const t = useTranslations("ModelBackground");
  const router = useRouter();
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

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
  } = useRulesPopover({ width: 760 });
  const [sourceUrls, setSourceUrls] = useState<string[]>([]);
  const [mode, setMode] = useState<ModelBackgroundMode>("background_only");
  const [modelReferenceUrl, setModelReferenceUrl] = useState("");
  const [modelReferenceName, setModelReferenceName] = useState("");
  const [backgroundSource, setBackgroundSource] = useState<BackgroundSourceMode>("preset");
  const [backgroundPresetId, setBackgroundPresetId] = useState<BackgroundPresetId>("cafe-courtyard");
  const [backgroundReferenceUrl, setBackgroundReferenceUrl] = useState(BACKGROUND_PRESETS[0].imageUrl);
  const [backgroundText, setBackgroundText] = useState(DEFAULT_BACKGROUND_TEXT);

  const [userPrompt, setUserPrompt] = useState("");
  // 未保存输入离开拦截：backgroundText 初始即默认文案，需排除（否则进页面就误判为脏）
  const { unsavedDialog } = useUnsavedChangesGuard(
    Boolean(sourceUrls.length || userPrompt.trim() || (backgroundText.trim() && backgroundText !== DEFAULT_BACKGROUND_TEXT)),
  );
  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const modelOptions = useStudioImageModelOptions();
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [isSourceDragging, setIsSourceDragging] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<UploadTarget | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [runningExpectedCount, setRunningExpectedCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const hasModelReference = mode !== "background_only" && Boolean(modelReferenceUrl);
  const hasBackgroundReference = mode !== "model_only" && (backgroundSource === "preset" || backgroundSource === "upload") && Boolean(backgroundReferenceUrl);
  const selectedBackgroundPreset = useMemo(() => getBackgroundPreset(backgroundPresetId), [backgroundPresetId]);
  const primarySourceUrl = sourceUrls[0] || "";
  const promptImages = useMemo(() => [
    ...(primarySourceUrl ? [{ imageNumber: 1, url: primarySourceUrl, role: "原始人物/服装/穿搭硬参考" }] : []),
    ...(hasModelReference ? [{ imageNumber: 2, url: modelReferenceUrl, role: mode === "model_only" ? "脸部参考图 / 只替换主图脸部" : "必选模特参考图 / 人物气质身份参考" }] : []),
    ...(hasBackgroundReference ? [{ imageNumber: mode === "model_background" ? 3 : 2, url: backgroundReferenceUrl, role: "背景参考图 / 场景光线构图参考" }] : []),
  ], [primarySourceUrl, hasModelReference, modelReferenceUrl, mode, hasBackgroundReference, backgroundReferenceUrl]);
  const finalPrompt = useMemo(() => promptOverride ?? buildModelBackgroundPrompt({
    mode,
    backgroundSource,
    templateId: backgroundPresetId,
    backgroundText,
    userPrompt,
    hasModelReference,
    hasBackgroundReference,
  }), [promptOverride, mode, backgroundSource, backgroundPresetId, backgroundText, userPrompt, hasModelReference, hasBackgroundReference]);
  const requestedResultCount = genCount * Math.max(sourceUrls.length, 1);
  const perSourceCount = Math.max(
    1,
    Math.min(Math.round(requestedResultCount / Math.max(sourceUrls.length || 1, 1)), 4)
  );
  const activeResultExpectedCount = isGenerating
    ? runningExpectedCount || requestedResultCount
    : runningExpectedCount || Math.max(resultUrls.length, 1);

  const statusGroup: TaskStatusGroup | undefined = isGenerating
    ? "running"
    : resultUrls.length > 0
      ? "completed"
      : undefined;
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
    const perSourceCount = Math.max(1, Math.min(Math.max(Math.round(Number(genCount) || 1), 1), 4));
    const sourceIndex = Math.min(Math.max(0, Math.floor(index / perSourceCount)), Math.max(sourceUrls.length - 1, 0));
    const retrySourceUrl = sourceUrls[sourceIndex] || sourceUrls[0];
    if (!retrySourceUrl) {
      toast.error(t("retrySourceNotFound"));
      return;
    }
    void generate(undefined, {
      sourceUrlsOverride: [retrySourceUrl],
      genCountOverride: 1,
      expectedCountOverride: 1,
      retryResultIndex: index,
      toastMessage: t("retryBackfillToast", { index: index + 1 }),
    });
  }
  const activeSourceIdx = previewIndex !== null
    ? Math.min(sourceUrls.length - 1, Math.max(0, Math.floor(previewIndex / Math.max(1, perSourceCount))))
    : 0;
  const activeSourceUrl = sourceUrls[activeSourceIdx] || "";

  const previewSession = useStudioPreview({
    module: "modelBackground",
    title: t("title"),
    urls: resultUrls,
    expectedCount: activeResultExpectedCount,
    isGenerating,
    references: [
      ...(activeSourceUrl ? [{ url: activeSourceUrl, label: sourceUrls.length > 1 ? t("sourceIndexed", { index: activeSourceIdx + 1 }) : t("source"), role: "source" as const }] : []),
      ...(hasModelReference && modelReferenceUrl ? [{ url: modelReferenceUrl, label: t("modelReference"), role: "model" as const }] : []),
      ...(hasBackgroundReference && backgroundReferenceUrl ? [{ url: backgroundReferenceUrl, label: t("backgroundReference"), role: "background" as const }] : []),
    ],
    promptText: [
      mode !== "model_only" && backgroundSource === "text" && backgroundText.trim() !== DEFAULT_BACKGROUND_TEXT
        ? t("backgroundDescription", { text: backgroundText })
        : "",
      userPrompt,
    ].map((item) => item.trim()).filter(Boolean).join("\n\n"),
    metaItems: [
      { label: t("meta.mode"), value: t(`mode.${mode}`) },
      { label: t("meta.backgroundSource"), value: mode === "model_only" ? null : t(`sourceMode.${backgroundSource}`) },
      { label: t("meta.backgroundTemplate"), value: backgroundSource === "preset" && mode !== "model_only" ? selectedBackgroundPreset.name : null },
      { label: t("meta.model"), value: aiModel },
      { label: t("meta.aspectRatio"), value: aspectRatio },
      { label: t("meta.resolution"), value: imageSize },
      { label: t("meta.genCount"), value: genCount },
    ],
    resultTitlePrefix: t("resultTitlePrefix"),
    aspectRatio,
  });
  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const unitCost = getCreditCost(aiModel, imageSize, aspectRatio);
  const cost = unitCost * requestedResultCount;
  const taskQueue = useTaskQueueGeneration({
    module: "modelBackground",
    title: t("title"),
    defaultExpectedCount: requestedResultCount,
    applyPath: "/model-background",
  });

  // 后台轮询：useGenerationPolling 替代 inline for-loop + setTimeout + fetch
  // 关键 trick：服务端 status="completed" 但 result_urls 仍 < expectedCount 时
  // 原逻辑是 continue（让后台继续投递），所以 isTerminal 里要核对该条件 + partialFailure.failedCount
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
    refreshCredits: () => Promise<number | null | undefined>;
    taskQueue: typeof taskQueue;
  } | null>(null);

  const { start: startModelBackgroundPolling } = useGenerationPolling<{
    status: string;
    progress?: number;
    result_urls?: unknown;
    error?: string;
    partial_failure?: { message?: unknown; expectedCount?: number; resultCount?: number; failedCount?: number };
  }>({
    id: "",
    buildUrl: (id) => {
      const ctx = pollCtxRef.current;
      return `/api/model-background?generation_id=${encodeURIComponent(ctx?.generationId ?? id)}`;
    },
    isTerminal: (state) => {
      const ctx = pollCtxRef.current;
      if (state.status === "failed") return true;
      if (state.status === "completed") {
        const count = Array.isArray(state.result_urls) ? state.result_urls.length : 0;
        const partialFailure = state.partial_failure && typeof state.partial_failure === "object"
          ? (state.partial_failure as { failedCount?: number })
          : null;
        const serverReportedPartialFailure = Boolean(
          state.error || (partialFailure && (partialFailure.failedCount || 0) > 0)
        );
        if (serverReportedPartialFailure) return true;
        if (!ctx) return count > 0; // 兜底
        return count >= ctx.displayExpectedCount;
      }
      return false;
    },
    intervalMs: 2000,
    maxAttempts: 120,
    onTick: (state) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;

      // 先把 result_urls 推到 UI（即便后面要走"继续 running"分支，也要先展示）
      if (Array.isArray(state.result_urls) && state.result_urls.length) {
        ctx.latestTaskResultUrlsRef.current = mergeRetryResultUrls(
          ctx.retryPreviousResultUrls,
          ctx.retryResultIndex,
          state.result_urls,
          ctx.displayExpectedCount
        );
        ctx.setResultUrls(ctx.latestTaskResultUrlsRef.current);
      }

      // 终端态交给 onComplete
      if (state.status === "completed" || state.status === "failed") return;

      const nextProgress = Number(state.progress);
      const runningProgress = Number.isFinite(nextProgress)
        ? Math.min(Math.max(Math.round(nextProgress), 0), 99)
        : 24; // hook 拿不到 attempts，原 25 + attempts*1.5 渐进 fallback 改为 24
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

      const finalUrls = mergeRetryResultUrls(
        ctx.retryPreviousResultUrls,
        ctx.retryResultIndex,
        Array.isArray(state.result_urls) ? state.result_urls : ctx.latestTaskResultUrlsRef.current,
        ctx.displayExpectedCount
      );
      const finalResultCount = finalUrls.filter(Boolean).length;
      const partialFailure = state.partial_failure && typeof state.partial_failure === "object"
        ? (state.partial_failure as { message?: unknown; expectedCount?: number; resultCount?: number; failedCount?: number })
        : null;
      const completedError = state.error || coerceErrorMessage(partialFailure?.message);

      // "completed 但 result_count < expected 且服务端没明确说失败" 的情况不会走到这里
      // （isTerminal 已把它判为 false，等下一轮结果补齐才会 isTerminal=true）。
      ctx.latestTaskResultUrlsRef.current = finalUrls;
      ctx.setResultUrls(finalUrls);
      ctx.setProgress(100);
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
        toast.warning(t("partialComplete", { count: finalResultCount, expected: ctx.displayExpectedCount }));
      } else {
        toast.success(t("generateComplete"));
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
  const authIsAnonymous = authChecked && !isAuthenticated;
  const runDisabledReason = sourceUrls.length === 0
    ? t("uploadSourceFirst")
    : mode !== "background_only" && !modelReferenceUrl
      ? t("selectModelReference")
      : mode !== "model_only" && (backgroundSource === "preset" || backgroundSource === "upload") && !backgroundReferenceUrl
        ? t("selectBackgroundReference")
        : credits !== null && credits < cost
          ? t("insufficientCredits", { cost })
          : undefined;
  useEffect(() => {
    const sourceImage = takeSourceImageFromLocation();
    if (sourceImage) {
      setSourceUrls([sourceImage]);
      toast.success(t("previewImageImported"));
    }
  }, []);

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  function applyModelBackgroundHistoryPayload(payload: ModelBackgroundHistoryPayload, historyResultUrls: string[] = [], options?: { silent?: boolean }) {
    const nextSource = normalizeBackgroundSourceMode(payload.backgroundSource);
    const nextPreset = normalizeBackgroundPreset(payload.templateId);
    setSourceUrls(normalizeModelBackgroundSourceUrls(payload.sourceUrls, payload.sourceUrl));
    setModelReferenceUrl(payload.modelReferenceUrl || "");
    setModelReferenceName(payload.modelReferenceUrl ? t("historyModel") : "");
    setBackgroundReferenceUrl(payload.backgroundReferenceUrl || getBackgroundPreset(nextPreset).imageUrl);
    setMode(normalizeModelBackgroundMode(payload.mode));
    setBackgroundSource(nextSource === "auto" ? "preset" : nextSource);
    setBackgroundPresetId(nextPreset);
    setBackgroundText(payload.backgroundText || DEFAULT_BACKGROUND_TEXT);
    setUserPrompt(payload.userPrompt || "");
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
    if (!options?.silent) toast.success(t("historyApplied"));
  }

  useHistoryApply({
    kind: "modelBackground",
    apply: (payload, resultUrls, { row }) => {
      applyModelBackgroundHistoryPayload(payload, resultUrls, { silent: true });
      if (isHistoryApplyRowFailed(row)) {
        setError(getHistoryApplyFailureMessage(row));
      }
      toast.success(t("historyApplied"));
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleUpload(files: File[], target: UploadTarget) {
    const validFiles = files.filter((file) => {
      if (!file.type.startsWith("image/")) {
        toast.error(t("notImageFormat", { name: file.name }));
        return false;
      }
      if (file.size === 0) {
        toast.error(t("emptyImageFile"));
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t("exceedsMaxSize", { name: file.name, mb: MAX_FILE_SIZE_MB }));
        return false;
      }
      return true;
    });
    if (validFiles.length === 0) return;

    const label = target === "source" ? t("source") : target === "model" ? t("modelReference") : t("backgroundReference");
    if (target === "source" && sourceUrls.length >= MAX_MODEL_BACKGROUND_SOURCE_IMAGES) {
      toast.error(t("sourceMaxCount", { max: MAX_MODEL_BACKGROUND_SOURCE_IMAGES }));
      return;
    }
    toast.info(t("uploadingLabel", { label }));
    setUploadingTarget(target);
    try {
      const remaining = Math.max(MAX_MODEL_BACKGROUND_SOURCE_IMAGES - sourceUrls.length, 0);
      const uploadFiles = target === "source" ? validFiles.slice(0, remaining) : validFiles.slice(0, 1);
      const uploads = await Promise.all(uploadFiles.map((file) => uploadImage(file)));
      if (target === "source") {
        setSourceUrls((prev) => {
          const merged = [...prev, ...uploads.map((item) => item.url)];
          return merged.slice(0, MAX_MODEL_BACKGROUND_SOURCE_IMAGES);
        });
        toast.success(t("uploadedSourceCount", { count: uploads.length }));
      } else if (target === "model") {
        setModelReferenceUrl(uploads[0].url);
        setModelReferenceName(t("custom"));
        toast.success(t("labelUploaded", { label }));
      } else {
        setBackgroundReferenceUrl(uploads[0].url);
        setBackgroundSource("upload");
        toast.success(t("labelUploaded", { label }));
      }
      setPromptOverride(null);
    } catch {
      toast.error(t("uploadFailedRetry"));
    } finally {
      setUploadingTarget(null);
    }
  }

  function applyDemo(demo: { title: string; imageUrl: string }) {
    setSourceUrls([demo.imageUrl]);
    setPromptOverride(null);
    closeRulesPopover();
    toast.success(t("demoApplied"));
  }

  async function generate(promptForRun?: string, options: ModelBackgroundGenerateOptions = {}) {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("pleaseLogin"));
      router.push("/login");
      return;
    }
    const runSourceUrls = options.sourceUrlsOverride?.length ? options.sourceUrlsOverride : sourceUrls;
    if (runSourceUrls.length === 0) return toast.error(t("uploadSourceFirst"));
    if (mode !== "background_only" && !modelReferenceUrl) return toast.error(t("selectModelReference"));
    if (mode !== "model_only" && (backgroundSource === "preset" || backgroundSource === "upload") && !backgroundReferenceUrl) return toast.error(t("selectBackgroundReference"));
    const runGenCount = Math.min(Math.max(Math.round(Number(options.genCountOverride ?? genCount) || 1), 1), 4);
    const runExpectedCount = Math.max(1, Math.round(Number(options.expectedCountOverride ?? (runSourceUrls.length * runGenCount)) || runGenCount));
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
    setError("");
    if (options.toastMessage) toast.info(options.toastMessage);
    const runTaskInputThumbnails = [
      ...runSourceUrls,
      ...(hasModelReference ? [modelReferenceUrl] : []),
      ...(hasBackgroundReference ? [backgroundReferenceUrl] : []),
    ].filter(Boolean);
    const provisionalTask = taskQueue.startTask({
      expectedCount: displayExpectedCount,
      inputThumbnails: runTaskInputThumbnails,
      progress: 10,
    });
    let activeTaskId = provisionalTask.id;

    try {
      const res = await fetch("/api/model-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_url: runSourceUrls[0] || "",
          source_urls: runSourceUrls,
          model_reference_url: mode !== "background_only" ? modelReferenceUrl : null,
          background_reference_url: hasBackgroundReference ? backgroundReferenceUrl : null,
          mode,
          background_source: backgroundSource,
          template_id: backgroundPresetId,
          background_text: backgroundText,
          user_prompt: userPrompt,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          gen_count: runGenCount,
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
        applyGenerationResponseStatus({
          res,
          data,
          userId,
          setCredits,
          fallbackError: t("generateFailed"),
        });
        throw new Error(data.error || t("generateFailed"));
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
      // 后台轮询：useGenerationPolling 替代原 inline for-loop
      pollCtxRef.current = {
        activeTaskId,
        generationId: typeof data.generation_id === "string" ? data.generation_id : "",
        displayExpectedCount,
        retryPreviousResultUrls,
        retryResultIndex,
        taskInputThumbnails: runTaskInputThumbnails,
        latestTaskResultUrlsRef: { current: [] },
        setProgress,
        setResultUrls,
        setIsGenerating,
        setError,
        refreshCredits,
        taskQueue,
      };
      startModelBackgroundPolling();
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

  function handleRunningTask(item: TaskQueueItem) {
    setRunningExpectedCount(clampTaskExpectedCount(item, 1, MAX_MODEL_BACKGROUND_SOURCE_IMAGES * 4));
    setIsGenerating(true);
    setProgress(Math.min(Math.max(Math.round(Number(item.progress) || 12), 1), 99));
    setError("");
    setResultUrls(safeTaskQueueUrls(item.resultThumbnails));
  }

  async function handleCompletedTask(item: TaskQueueItem, session: TaskSelectionSession) {
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "modelBackground", session.signal);
      if (!session.isCurrent()) return true;
      applyModelBackgroundHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), {
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

  function handleContinueCreate() {
    setSourceUrls([]);
    setMode("background_only");
    setModelReferenceUrl("");
    setModelReferenceName("");
    setBackgroundSource("preset");
    setBackgroundPresetId("cafe-courtyard");
    setBackgroundReferenceUrl(BACKGROUND_PRESETS[0].imageUrl);
    setBackgroundText(DEFAULT_BACKGROUND_TEXT);
    setUserPrompt("");
    setAiModel("nano-banana-2");
    setAspectRatio("auto");
    setImageSize("1K");
    setGenCount(1);
    setPromptOverride(null);
    setIsGenerating(false);
    setRunningExpectedCount(null);
    setProgress(0);
    setResultUrls([]);
    setError("");
    setLightboxSrc(null);
    closeRulesPopover();
    if (sourceInputRef.current) sourceInputRef.current.value = "";
    if (modelInputRef.current) modelInputRef.current.value = "";
    if (backgroundInputRef.current) backgroundInputRef.current.value = "";
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="modelBackground" />
      <ModuleTaskRail module="modelBackground" moduleLabel={t("moduleLabel")} onContinue={handleContinueCreate} onRunningTask={handleRunningTask} onCompletedTask={handleCompletedTask} />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5">
          <ModuleHeader
            title={t("title")}
            tooltip={t("headerTooltip")}
            actions={(
              <button
                ref={rulesButtonRef}
                type="button"
                onMouseEnter={openRulesPopover}
                onMouseLeave={scheduleRulesHide}
                onFocus={openRulesPopover}
                onBlur={scheduleRulesHide}
                aria-expanded={showRules}
                className="studio-upload-rule-button"
              >
                {t("imageRules")} <ChevronRight className="h-3 w-3" />
              </button>
            )}
          />

          <StudioUploadSection
            title={t("uploadSectionTitle")}
            inputRef={sourceInputRef}
            multiple
            isDragging={isSourceDragging}
            setDragging={setIsSourceDragging}
            onFiles={(files) => handleUpload(files, "source")}
          >
            {(openFileDialog) => (
              <MultiImageUploadV2
                urls={sourceUrls}
                maxCount={MAX_MODEL_BACKGROUND_SOURCE_IMAGES}
                title={t("uploadedSourceTitle")}
                emptyHint={t("uploadEmptyTitle")}
                itemLabelPrefix={t("itemPrefix")}
                loading={uploadingTarget === "source"}
                isDragging={isSourceDragging}
                libraryLabel={t("uploadLibrary")}
                summary={sourceUrls.length ? t("uploadSummary", { count: sourceUrls.length * genCount }) : undefined}
                footnote={t("uploadFootnote", { max: MAX_MODEL_BACKGROUND_SOURCE_IMAGES })}
                tips={[
                  { label: t("tipNote"), text: t("tipNoteText") },
                  { label: t("tipRequirement"), text: t("tipRequirementText") },
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
                examples={{
                  label: t("tryIt"),
                  images: MODEL_BACKGROUND_UPLOAD_RULE.demos.map((demo) => ({ url: demo.imageUrl, title: demo.title })),
                  disabled: uploadingTarget === "source",
                  onSelect: (image) => applyDemo({ title: image.title, imageUrl: image.url }),
                }}
              />
            )}
          </StudioUploadSection>

          <section>
            <h3 className="flex items-center gap-2 font-bold text-sm mb-3 text-codex-ink"><Layers className="h-4 w-4 text-[var(--codex-accent)]" /> {t("operationMode")}</h3>
            <StudioOptionGrid
              options={MODE_OPTIONS.map((item) => ({
                value: item.value,
                label: t(`mode.${item.value}`),
                description: item.descKey ? t(item.descKey) : item.desc,
              }))}
              value={mode}
              onChange={(value) => { setMode(value); setPromptOverride(null); }}
              columns={3}
              ariaLabel={t("operationMode")}
            />
          </section>

          {mode !== "background_only" ? (
            <section>
              <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
                <UserRound className="w-4 h-4 text-[var(--codex-accent)]" /> {t("modelReference")} <span className="text-[var(--codex-accent-72)] font-normal text-xs">· {t("required")}</span>
                <span className="px-1.5 py-0.5 rounded-full bg-[var(--codex-accent-10)] text-[var(--codex-accent)] text-[11px]">{t("pleaseSelect")}</span>
              </h3>
              <p className="text-[12px] text-codex-faint mb-3">
                {mode === "model_only" ? t("modelOnlyDesc") : t("modelBackgroundDesc")}
              </p>
              <input
                ref={modelInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label={t("uploadModelReference")}
                onChange={(event) => {
                  const input = event.currentTarget;
                  void handleUpload(Array.from(input.files || []), "model").finally(() => {
                    input.value = "";
                  });
                }}
              />
              <div className="grid grid-cols-3 gap-2">
                {PRESET_BACKGROUND_MODELS.map((model) => (
                  <div
                    key={model.id}
                    className={`group relative overflow-hidden rounded-lg border-2 transition-shadow ${modelReferenceUrl === model.imageUrl ? "border-[var(--codex-accent)] ring-1 ring-[var(--codex-accent-25)]" : "border-transparent hover:shadow-md"}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setModelReferenceUrl(model.imageUrl);
                        setModelReferenceName(model.name);
                        setPromptOverride(null);
                      }}
                      className="block w-full"
                    >
                      <RawPreviewImage src={model.imageUrl} alt={model.name} className="aspect-square w-full object-cover" />
                      <div className="p-1 text-center"><span className="text-[11px] font-medium">{model.name}</span></div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLightboxSrc(model.imageUrl); }}
                      className={CARD_ZOOM_BUTTON_CLASS}
                      title={t("zoomPreview")}
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                    {modelReferenceUrl === model.imageUrl ? <CheckCircle2 className="absolute left-1.5 top-1.5 h-4 w-4 rounded-full bg-white dark:bg-white/10 text-emerald-500" /> : null}
                  </div>
                ))}
                <div className={`group relative overflow-hidden rounded-lg border-2 border-dashed transition-colors ${modelReferenceUrl && !PRESET_BACKGROUND_MODELS.some((item) => item.imageUrl === modelReferenceUrl) ? "border-[var(--codex-accent-55)] bg-[var(--codex-accent-08)]" : "border-[var(--codex-border)] hover:bg-[var(--codex-accent-08)]"}`}>
                  <button type="button" onClick={() => modelInputRef.current?.click()} className="flex aspect-square w-full flex-col items-center justify-center">
                    {modelReferenceUrl && !PRESET_BACKGROUND_MODELS.some((item) => item.imageUrl === modelReferenceUrl)
                      ? <RawPreviewImage src={modelReferenceUrl} alt={modelReferenceName || t("customModel")} className="h-full w-full rounded-lg object-contain p-1" />
                      : <><Camera className="w-5 h-5 text-codex-faint" /><span className="mt-1 text-[11px] text-codex-faint">{t("clickToUpload")}</span></>
                    }
                  </button>
                  {modelReferenceUrl && !PRESET_BACKGROUND_MODELS.some((item) => item.imageUrl === modelReferenceUrl) ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLightboxSrc(modelReferenceUrl); }}
                      className={CARD_ZOOM_BUTTON_CLASS}
                      title={t("zoomPreview")}
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {mode !== "model_only" ? (
            <section>
              <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-codex-ink">
                <Images className="h-4 w-4 text-[var(--codex-accent)]" /> {t("referenceScene")}
              </h3>
              <p className="mb-3 text-[12px] text-codex-faint">{t("referenceSceneHint")}</p>
              <div className="mb-3">
                <StudioOptionGrid
                  options={BACKGROUND_SOURCE_OPTIONS.map((item) => ({
                    value: item,
                    label: t(`sourceMode.${item}`),
                  }))}
                  value={backgroundSource}
                  onChange={(item) => {
                    setBackgroundSource(item);
                    if (item === "preset") {
                      setBackgroundReferenceUrl(getBackgroundPreset(backgroundPresetId).imageUrl);
                    }
                    if (item === "upload" && backgroundSource !== "upload") {
                      setBackgroundReferenceUrl("");
                    }
                    setPromptOverride(null);
                  }}
                  columns={3}
                  ariaLabel={t("backgroundSource")}
                />
              </div>
              <input
                ref={backgroundInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label={t("uploadBackgroundReference")}
                onChange={(event) => {
                  const input = event.currentTarget;
                  void handleUpload(Array.from(input.files || []), "background").finally(() => {
                    input.value = "";
                  });
                }}
              />
              {backgroundSource === "preset" ? (
                <div className="rounded-2xl border border-dashed border-[var(--codex-border)] bg-white/55 p-3">
                  <p className="mb-3 text-[12px] text-codex-faint">{t("presetSelectHint")}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {BACKGROUND_PRESETS.map((item) => (
                      <div key={item.id} className={`group relative overflow-hidden rounded-xl border bg-codex-surface text-center shadow-sm transition-shadow ${backgroundPresetId === item.id ? "border-[var(--codex-accent)] ring-2 ring-[var(--codex-accent-25)]" : "border-[var(--codex-border)] hover:shadow-md"}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setBackgroundPresetId(item.id);
                            setBackgroundReferenceUrl(item.imageUrl);
                            setPromptOverride(null);
                          }}
                          className="block w-full"
                        >
                          <div className="relative aspect-[3/4] overflow-hidden bg-[var(--codex-surface-soft)]">
                            <RawPreviewImage src={item.imageUrl} alt={item.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                          </div>
                          <p className="truncate px-1.5 py-1.5 text-[12px] font-bold text-codex-ink">{item.name}</p>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setLightboxSrc(item.imageUrl); }}
                          className={CARD_ZOOM_BUTTON_CLASS}
                          title={t("zoomPreview")}
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </button>
                        {backgroundPresetId === item.id ? <CheckCircle2 className="absolute left-2 top-2 h-4 w-4 rounded-full bg-white dark:bg-white/10 text-emerald-500" /> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : backgroundSource === "upload" ? (
                <button type="button" onClick={() => backgroundInputRef.current?.click()} className="group studio-upload-dropzone studio-fixed-upload-slot flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[var(--codex-border)] p-3 text-center transition hover:bg-[var(--codex-accent-08)]" style={{ "--studio-fixed-upload-height": "328px" } as CSSProperties}>
                  {backgroundReferenceUrl ? (
                    <div className="studio-fixed-upload-preview studio-checkerboard relative mb-2 overflow-hidden rounded-xl" style={{ "--studio-fixed-preview-height": "220px" } as CSSProperties}>
                      <RawPreviewImage src={backgroundReferenceUrl} alt={t("backgroundReference")} className="h-full w-full object-contain p-2" />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLightboxSrc(backgroundReferenceUrl); }}
                        className={CARD_ZOOM_BUTTON_CLASS}
                        title={t("zoomPreview")}
                        aria-label={t("zoomBackgroundReference")}
                      >
                        <ZoomIn aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-codex-surface shadow-sm">
                      <Images className="h-7 w-7 text-[var(--codex-accent)]" />
                    </div>
                  )}
                  <span className="text-sm font-semibold text-codex-ink">{backgroundReferenceUrl ? t("changeBackgroundReference") : t("uploadBackgroundReference")}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-codex-faint">{t("uploadBackgroundHint")}</span>
                </button>
              ) : (
                <div className="space-y-3">
                <PromptTextarea value={backgroundText} onChange={(e) => { setBackgroundText(e.target.value); setPromptOverride(null); }} rows={4} placeholder={t("backgroundTextPlaceholder")} maxLength={1000} onClear={() => setBackgroundText("")} />
                  <div className="flex flex-wrap gap-2">
                    {BACKGROUND_TEXT_PRESETS.map((preset) => (
                      <button key={preset} type="button" onClick={() => { setBackgroundText(preset); setPromptOverride(null); }} className="inline-flex min-h-9 items-center rounded-full border border-[var(--codex-border)] bg-codex-surface px-3 py-1.5 text-[12px] text-codex-muted transition-colors duration-150 hover:border-[var(--codex-accent-45)] hover:text-[var(--codex-accent)] dark:border-white/10 dark:bg-white/5 dark:text-codex-muted">
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <PromptTextarea
            title={t("extraPrompt")}
            badge={t("optional")}
            value={userPrompt}
            onChange={(e) => { setUserPrompt(e.target.value); setPromptOverride(null); }}
            rows={4}
            placeholder={MODEL_BACKGROUND_USER_PROMPT_PLACEHOLDER}
            maxLength={2000}
            onClear={() => setUserPrompt("")}
          />

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-codex-ink"><Sparkles className="h-4 w-4 text-[var(--codex-accent)]" /> {t("genModel")}</h3>
            <StudioModelSelector
              models={modelOptions}
              value={aiModel}
              onChange={setAiModel}
              ariaLabel={t("genModel")}
              getMeta={(model) => `${model.desc} · ${t("currentCredits", { credits: getCreditCost(model.value, imageSize, aspectRatio) })}`}
            />
          </section>

          <section>
            <AspectRatioSelector options={ASPECTS} value={aspectRatio} onChange={setAspectRatio} ariaLabel={t("imageAspectRatio")} />
          </section>

          <section>
            <ResolutionSelector
              titleKey="resolution"
              options={imageSizes.map((size) => ({
                value: size,
                label: size,
                description: `${getCreditCost(aiModel, size, aspectRatio)}${t("creditsUnit")}`,
              }))}
              value={imageSize}
              onChange={setImageSize}
              ariaLabel={t("resolution")}
            />
          </section>
          <section>
            <GenerationCountField
              title={t("genCount")}
              label={t("genCount")}
              value={genCount}
              onChange={setGenCount}
              ariaLabel={t("genCount")}
            />
          </section>
        </div>
        <StudioRunBar
          summary={sourceUrls.length > 1 ? t("runSummaryMulti", { count: sourceUrls.length, genCount, imageSize }) : t("runSummarySingle", { status: sourceUrls.length ? t("sourceUploaded") : t("waitingForSource"), genCount })}
          estimateLabel={isGenerating ? t("runBar.estimateGenerating") : t("runBar.estimateReady", { count: genCount })}
          costLabel={authIsAnonymous ? t("loginToViewCredits") : t("runCost", { cost, credits: credits ?? "-" })}
          disabled={isGenerating || Boolean(runDisabledReason)}
          disabledReason={runDisabledReason}
          primaryLabel={authIsAnonymous ? t("loginToGenerate") : isGenerating ? t("generatingPercent", { percent: Math.round(progress) }) : t("generateN", { count: genCount })}
          isLoading={isGenerating}
          onPrimaryAction={() => generate()}
        />
      </div>

      <div className="studio-canvas relative flex-1 min-h-[520px] lg:h-full overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title={t("guideTitle")}
              subtitle={t("guideSubtitle")}
              steps={[
                {
                  title: t("guideStep1Title"),
                  desc: "",
                  imageSrc: "/tutorial-guides/background-source.webp",
                  imageAlt: t("guideStep1Alt"),
                  badge: t("guideStep1Badge"),
                },
                {
                  title: t("guideStep2Title"),
                  desc: "",
                  imageSrc: "/tutorial-guides/background-reference.webp",
                  imageAlt: t("guideStep2Alt"),
                  badge: t("guideStep2Badge"),
                },
                {
                  title: t("guideStep3Title"),
                  desc: "",
                  imageSrc: "/tutorial-guides/background-result.webp",
                  imageAlt: t("guideStep3Alt"),
                  badge: t("guideStep3Badge"),
                },
              ]}
            />
          </div>
        )}

        {(isGenerating || resultUrls.length > 0) && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            <div className="flex min-h-0 flex-1 flex-col gap-6">
              {sourceUrls.length === 0 ? (
                <ResultImageGrid
                  urls={resultUrls}
                  filenamePrefix="model-background"
                  expectedCount={activeResultExpectedCount}
                  isGenerating={isGenerating}
                  statusGroup={statusGroup}
                  variant="task"
                  inputReferences={[
                    ...(hasModelReference && modelReferenceUrl ? [{ url: modelReferenceUrl, label: t("modelReference") }] : []),
                    ...(hasBackgroundReference && backgroundReferenceUrl ? [{ url: backgroundReferenceUrl, label: t("backgroundReference") }] : []),
                  ]}
                  markMissingAsFailed={hasCompletedPartialResults}
                    markMissingAsCompleted={statusGroup === "completed" && !hasCompletedPartialResults}
                  missingFailureLabel={t("missingFailureLabel")}
                  missingFailureDetail={partialFailureMessage}
                  missingFailureActionLabel={t("missingFailureActionLabel")}
                  onMissingFailureAction={handleRetryFailedResult}
                  missingFailureActionDisabled={retryDisabled}
                  onOpen={(_, index) => setPreviewIndex(index)}
                
                  tileAspectRatio={aspectRatio}
                />
              ) : null}
              {sourceUrls.map((sourceUrl, sIndex) => {
                const start = sIndex * perSourceCount;
                return (
                  <ResultImageGrid
                    key={`model-bg-group-${sIndex}-${sourceUrl}`}
                    urls={Array.from({ length: perSourceCount }, (_, tIndex) => resultUrls[start + tIndex] || "")}
                    filenamePrefix={`model-background-s${sIndex + 1}`}
                    expectedCount={perSourceCount}
                    isGenerating={isGenerating}
                    statusGroup={statusGroup}
                    variant="task"
                    inputReferences={[
                      { url: sourceUrl, label: t("sourceIndexed", { index: sIndex + 1 }) },
                      ...(hasModelReference && modelReferenceUrl ? [{ url: modelReferenceUrl, label: t("modelReference") }] : []),
                      ...(hasBackgroundReference && backgroundReferenceUrl ? [{ url: backgroundReferenceUrl, label: t("backgroundReference") }] : []),
                    ]}
                    markMissingAsFailed={hasCompletedPartialResults}
                      markMissingAsCompleted={statusGroup === "completed" && !hasCompletedPartialResults}
                    missingFailureLabel={t("missingFailureLabel")}
                    missingFailureDetail={partialFailureMessage}
                    missingFailureActionLabel={t("missingFailureActionLabel")}
                    onMissingFailureAction={(idx) => handleRetryFailedResult(start + idx)}
                    missingFailureActionDisabled={retryDisabled}
                    onOpen={(_, index) => setPreviewIndex(start + index)}
                  
                  tileAspectRatio={aspectRatio}
                />
                );
              })}
            </div>
            <StudioImagePreviewDialog
              open={previewIndex !== null}
              onClose={() => setPreviewIndex(null)}
              session={previewSession}
              selectedIndex={previewIndex || 0}
              onSelectedIndexChange={setPreviewIndex}
              filenamePrefix="model-background"
              actions={MODEL_BACKGROUND_PREVIEW_ACTIONS}
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
        width={760}
        demoGridClassName="md:grid-cols-4"
        examplesGridClassName="grid gap-3 md:grid-cols-4"
        title={MODEL_BACKGROUND_UPLOAD_RULE.title}
        specText={MODEL_BACKGROUND_UPLOAD_RULE.uploadSpecText}
        tryItLabel={t("tryIt")}
        closeLabel={t("close")}
        onClose={closeRulesPopover}
        demos={MODEL_BACKGROUND_UPLOAD_RULE.demos.map((demo) => ({
          key: demo.imageUrl,
          title: demo.title,
          description: demo.description,
          imageUrls: [demo.imageUrl],
          onApply: () => applyDemo(demo),
        }))}
        examples={MODEL_BACKGROUND_UPLOAD_RULE.badExamples.map((bad) => ({
          key: bad.imageUrl,
          title: bad.title,
          imageUrl: bad.imageUrl,
        }))}
        examplesTip={t("badExamplesTip")}
        onMouseEnter={cancelRulesHide}
        onMouseLeave={scheduleRulesHide}
      />

      <StudioMediaLightbox
        src={lightboxSrc}
        alt={t("previewAlt")}
        onClose={() => setLightboxSrc(null)}
      />
      {unsavedDialog}
    </div>
  );
}
