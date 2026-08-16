"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRulesPopover } from "@/hooks/use-rules-popover";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Plus, Wand, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { StudioModelSelector, StudioOptionGrid, StudioPromptTextarea } from "@/components/studio/StudioFormControls";
import { GenerationCountField } from "@/components/studio/GenerationCountField";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { StudioRulesPopover } from "@/components/studio/StudioRulesPopover";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { useGenerationPolling } from "@/hooks/use-generation-polling";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { StudioMediaLightbox } from "@/components/studio/StudioMediaLightbox";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { useImageSizeOptions, useStudioImageModelOptions } from "@/lib/studio-models";
import { fetchHistoryApplyDetail, getHistoryApplyFailureMessage, isHistoryApplyRowFailed, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import { GARMENT_TYPE_OPTIONS, type GarmentType } from "@/lib/garment-types";
import { applyGenerationResponseStatus, showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import { createGenericImagePreviewSession, type ImagePreviewAction } from "@/lib/studio-image-preview";
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
  DEFAULT_GARMENT_3D_DISPLAY_STYLE,
  GARMENT_3D_DISPLAY_STYLES,
  buildGarment3dDisplayStylePrompt,
  normalizeGarment3dDisplayStyle,
  type Garment3dDisplayStyle,
} from "@/lib/module-style-presets";
import { GARMENT_3D_UPLOAD_RULE, type Garment3dRuleDemo } from "@/lib/garment-3d-upload-rules";

type OutputMode = "reference" | "prompt";
type Garment3dHistoryPayload = Extract<HistoryJobPayload, { kind: "garment3d" }>;
type Garment3dGenerateOptions = {
  genCountOverride?: number;
  expectedCountOverride?: number;
  retryResultIndex?: number;
  toastMessage?: string;
};

const DEFAULT_PROMPT = "衣服变为类似穿在人身上的立体效果，微微向左旋转，保留原始版型、面料厚度、纹理和所有细节，使用干净白色或浅灰棚拍背景。";
const GARMENT_3D_QUALITY =
  "photorealistic, 8K ultra-detailed, RAW photo quality, high contrast, commercial e-commerce catalog quality, sharp fabric details";

const SITE_ASSET_BASE = "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original";

const GARMENT_3D_PREVIEW_ACTIONS: ImagePreviewAction[] = [
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

const REFERENCE_PRESETS = [
  { id: "r1", label: "灰色连帽", labelKey: "refHoodie", url: `${SITE_ASSET_BASE}/references/garment-3d/ref-01.webp` },
  { id: "r2", label: "立体牛仔", labelKey: "refDenim", url: `${SITE_ASSET_BASE}/references/garment-3d/ref-02.png` },
  { id: "r3", label: "棒球外套", labelKey: "refJacket", url: `${SITE_ASSET_BASE}/references/garment-3d/ref-03.png` },
  { id: "r4", label: "直筒裤装", labelKey: "refPants", url: `${SITE_ASSET_BASE}/references/garment-3d/ref-04.png` },
  { id: "r5", label: "纹理卫衣", labelKey: "refSweatshirt", url: `${SITE_ASSET_BASE}/references/garment-3d/ref-05.png` },
  { id: "r6", label: "敞开夹克", labelKey: "refOpenJacket", url: `${SITE_ASSET_BASE}/references/garment-3d/ref-06.png` },
  { id: "r7", label: "侧身外套", labelKey: "refSideCoat", url: `${SITE_ASSET_BASE}/references/garment-3d/ref-07.png` },
  { id: "r8", label: "羽绒厚度", labelKey: "refDown", url: `${SITE_ASSET_BASE}/references/garment-3d/ref-08.png` },
  { id: "r9", label: "背面廓形", labelKey: "refBack", url: `${SITE_ASSET_BASE}/references/garment-3d/ref-09.jpg` },
  { id: "r10", label: "短外套", labelKey: "refShortCoat", url: `${SITE_ASSET_BASE}/references/garment-3d/ref-10.png` },
];

export default function Garment3dPage() {
  const router = useRouter();
  const t = useTranslations("Garment3d");
  const garmentInputRef = useRef<HTMLInputElement>(null);
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
    show: showGarmentRules,
    style: rulesPopoverStyle,
    open: openRulesPopover,
    scheduleHide: scheduleRulesHide,
    close: closeRulesPopover,
    cancelHide: cancelRulesHide,
  } = useRulesPopover({ width: 760 });
  const [garmentUrl, setGarmentUrl] = useState("");
  const [garmentName, setGarmentName] = useState("");
  const [garmentType, setGarmentType] = useState<GarmentType>("上装");
  const [customGarmentType, setCustomGarmentType] = useState("");
  const [outputMode, setOutputMode] = useState<OutputMode>("reference");
  const [displayStyle, setDisplayStyle] = useState<Garment3dDisplayStyle>(DEFAULT_GARMENT_3D_DISPLAY_STYLE);
  const [selectedReference, setSelectedReference] = useState(REFERENCE_PRESETS[0]);
  const [customReferenceUrl, setCustomReferenceUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [promptOverride, setPromptOverride] = useState<string | null>(null);

  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const modelOptions = useStudioImageModelOptions();
  const [aspectRatio, setAspectRatio] = useState<Extract<AspectRatio, "auto" | "1:1" | "3:4">>("auto");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploadingGarment, setIsUploadingGarment] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [runningExpectedCount, setRunningExpectedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const costPerImage = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = costPerImage * genCount;
  const activeReferenceUrl = customReferenceUrl || selectedReference.url;
  const authIsAnonymous = authChecked && !isAuthenticated;
  const taskInputThumbnails = useMemo(
    () => [garmentUrl, outputMode === "reference" ? activeReferenceUrl : ""].filter(Boolean) as string[],
    [garmentUrl, outputMode, activeReferenceUrl]
  );
  const taskQueue = useTaskQueueGeneration({
    module: "garment3d",
    title: t("moduleLabel"),
    defaultExpectedCount: genCount,
    applyPath: "/garment-3d",
  });

  // 后台轮询：useGenerationPolling 替代 inline while-loop
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

  const { start: startGarment3dPolling } = useGenerationPolling<{
    status: string;
    progress?: number;
    result_urls?: unknown;
    error?: string;
    partial_failure?: { message?: unknown };
  }>({
    id: "",
    buildUrl: (id) => {
      const ctx = pollCtxRef.current;
      return `/api/garment-3d?generation_id=${encodeURIComponent(ctx?.generationId ?? id)}`;
    },
    isTerminal: (state) => state.status === "completed" || state.status === "failed",
    intervalMs: 2000,
    maxAttempts: 120,
    onTick: (state) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
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
        ctx.setProgress(Math.min(Math.max(Math.round(nextProgress), 0), 99));
      }
      ctx.taskQueue.markRunning(ctx.activeTaskId, {
        expectedCount: ctx.displayExpectedCount,
        inputThumbnails: ctx.taskInputThumbnails,
        resultThumbnails: ctx.latestTaskResultUrlsRef.current,
        resultCount: ctx.latestTaskResultUrlsRef.current.filter(Boolean).length,
        progress: Number.isFinite(nextProgress) ? Math.min(Math.max(Math.round(nextProgress), 0), 99) : 24,
        status: state.status || "processing",
      });
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
        ctx.taskQueue.markCompleted(ctx.activeTaskId, {
          expectedCount: ctx.displayExpectedCount,
          inputThumbnails: ctx.taskInputThumbnails,
          resultThumbnails: finalUrls,
          resultCount: finalResultCount,
          error: completedError ? summarizeGenerationError(completedError) : "",
        });
        if (completedError || finalResultCount < ctx.displayExpectedCount) {
          void ctx.refreshCredits();
          toast.warning(t("partialCompleteToast", { done: finalResultCount, total: ctx.displayExpectedCount }));
        } else {
          toast.success(t("generationComplete"));
        }
        return;
      }
      if (state.status === "failed") {
        const message = summarizeGenerationError(state.error || t("generationFailed"));
        ctx.setError(message);
        ctx.taskQueue.markFailed(ctx.activeTaskId, message, {
          expectedCount: ctx.displayExpectedCount,
          inputThumbnails: ctx.taskInputThumbnails,
          resultThumbnails: ctx.latestTaskResultUrlsRef.current,
          resultCount: ctx.latestTaskResultUrlsRef.current.filter(Boolean).length,
        });
        toast.error(message);
        void ctx.refreshCredits();
      }
    },
    onError: (error) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      const message = summarizeGenerationError(error.message || t("generationTimeout"));
      ctx.setError(message);
      ctx.taskQueue.markFailed(ctx.activeTaskId, message, {
        expectedCount: ctx.displayExpectedCount,
        inputThumbnails: ctx.taskInputThumbnails,
        resultThumbnails: ctx.latestTaskResultUrlsRef.current,
        resultCount: ctx.latestTaskResultUrlsRef.current.filter(Boolean).length,
      });
      toast.error(message);
      void ctx.refreshCredits();
    },
  });

  const builtPrompt = useMemo(() => {
    return buildGarment3dPrompt({
      garmentType: garmentType === "其他" ? customGarmentType || "其他服装" : garmentType,
      outputMode,
      displayStyle,
      hasReference: outputMode === "reference" && !!activeReferenceUrl,
      prompt,
    });
  }, [activeReferenceUrl, customGarmentType, displayStyle, garmentType, outputMode, prompt]);
  const finalPrompt = promptOverride ?? builtPrompt;
  const displayStyleLabel = GARMENT_3D_DISPLAY_STYLES.find((item) => item.value === displayStyle)?.label || displayStyle;
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
      toastMessage: t("retryMissingToast", { index: index + 1 }),
    });
  }
  const previewSession = useStudioPreview({
    module: "garment3d",
    title: t("moduleLabel"),
    urls: resultUrls,
    expectedCount: activeResultExpectedCount,
    isGenerating,
    references: [
      ...(garmentUrl ? [{ url: garmentUrl, label: t("referenceGarmentLabel"), role: "garment" as const }] : []),
      ...(outputMode === "reference" && activeReferenceUrl ? [{ url: activeReferenceUrl, label: customReferenceUrl ? t("referenceCustomLabel") : (selectedReference.labelKey ? t(selectedReference.labelKey) : selectedReference.label), role: "reference" as const }] : []),
    ],
    promptText: prompt.trim() && prompt.trim() !== DEFAULT_PROMPT ? prompt : "",
    metaItems: [
      { label: t("metaGarmentType"), value: garmentType === "其他" ? customGarmentType : translateGarmentType(t, garmentType) },
      { label: t("metaOutputMode"), value: outputMode === "reference" ? t("outputModeReferenceValue") : t("outputModePromptValue") },
      { label: t("metaDisplayStyle"), value: displayStyleLabel },
      { label: t("metaModel"), value: aiModel },
      { label: t("metaAspect"), value: aspectRatio },
      { label: t("metaResolution"), value: imageSize },
      { label: t("metaCount"), value: genCount },
    ],
    resultTitlePrefix: t("resultTitlePrefix"),
    aspectRatio,
  });
  const runDisabledReason = !garmentUrl
    ? t("garmentReadyRequired")
    : credits !== null && credits < totalCost
      ? t("insufficientCredits", { cost: totalCost })
      : undefined;

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  function applyGarment3dHistoryPayload(payload: Garment3dHistoryPayload, historyResultUrls: string[] = [], options?: { silent?: boolean }) {
    setGarmentUrl(payload.garmentUrl);
    setGarmentName(t("historyGarmentName"));
    setGarmentType(
      payload.garmentType === "上装" || payload.garmentType === "下装" || payload.garmentType === "连体衣"
        ? payload.garmentType
        : "其他"
    );
    setCustomGarmentType(
      payload.garmentType && !["上装", "下装", "连体衣"].includes(payload.garmentType)
        ? payload.garmentType
        : ""
    );
    setOutputMode(payload.outputMode || (payload.referenceUrl ? "reference" : "prompt"));
    setDisplayStyle(normalizeGarment3dDisplayStyle(payload.displayStyle));
    setCustomReferenceUrl(payload.referenceUrl || "");
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio === "auto" || payload.aspectRatio === "1:1" ? payload.aspectRatio : "3:4");
    setImageSize(payload.imageSize);
    setGenCount(payload.genCount);
    setPrompt(payload.userPrompt || payload.prompt);
    setPromptOverride(payload.prompt);
    setRunningExpectedCount(null);
    setResultUrls(historyResultUrls);
    setIsGenerating(false);
    setProgress(historyResultUrls.length ? 100 : 0);
    setError(null);
    if (!options?.silent) toast.success(t("historyApplySuccess"));
  }

  useHistoryApply({
    kind: "garment3d",
    apply: (payload, resultUrls, { row }) => {
      applyGarment3dHistoryPayload(payload, resultUrls, { silent: true });
      if (isHistoryApplyRowFailed(row)) {
        setError(getHistoryApplyFailureMessage(row));
      }
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleGarmentFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("uploadImageOnly"));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t("imageTooLarge", { size: MAX_FILE_SIZE_MB }));
      return;
    }

    setGarmentName(file.name);

    toast.info(t("uploadingGarment"));
    setIsUploadingGarment(true);
    try {
      const result = await uploadImage(file);
      setGarmentUrl(result.url);
      toast.success(t("garmentReady"));
    } catch {
      setGarmentUrl("");
      toast.error(t("garmentUploadFailed"));
    } finally {
      setIsUploadingGarment(false);
    }
  }

  async function handleCustomReference(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("uploadImageOnly"));
      return;
    }
    setPromptOverride(null);

    toast.info(t("uploadingReference"));
    try {
      const result = await uploadImage(file);
      setCustomReferenceUrl(result.url);
      toast.success(t("referenceSelected"));
    } catch {
      setCustomReferenceUrl("");
      toast.error(t("referenceUploadFailed"));
    }
  }

  const base64Cache = useRef<Map<string, string>>(new Map());
  async function urlToBase64(url: string) {
    if (url.startsWith("data:")) return url;
    if (url.startsWith("http")) return url;
    const cached = base64Cache.current.get(url);
    if (cached) return cached;
    const res = await fetch(url);
    const blob = await res.blob();
    const result = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    base64Cache.current.set(url, result);
    return result;
  }

  async function optimizePrompt() {
    if (!garmentUrl) {
      toast.error(t("garmentReadyRequired"));
      return;
    }

    setIsOptimizing(true);
    try {
      const res = await fetch("/api/garment-3d/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garment_url: garmentUrl,
          garment_type: garmentType,
          custom_garment_type: customGarmentType,
          display_style: displayStyle,
          prompt: finalPrompt,
        }),
      });
      const data = await res.json();
      if (data.prompt) {
        const optimizedPrompt = buildGarment3dPrompt({
          garmentType: garmentType === "其他" ? customGarmentType || "其他服装" : garmentType,
          outputMode,
          displayStyle,
          hasReference: outputMode === "reference" && !!activeReferenceUrl,
          prompt: data.prompt,
        });
        setPrompt(data.prompt);
        setPromptOverride(optimizedPrompt);
        toast.success(t("analyzeSuccess"));
      } else {
        toast.error(t("analyzeEmpty"));
      }
    } catch {
      toast.error(t("analyzeFailed"));
    } finally {
      setIsOptimizing(false);
    }
  }

  async function generate(finalPromptForRun?: string, options: Garment3dGenerateOptions = {}) {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("loginRequired"));
      router.push("/login");
      return;
    }
    if (!garmentUrl) {
      toast.error(t("garmentRequired"));
      return;
    }
    if (garmentType === "其他" && !customGarmentType.trim()) {
      toast.error(t("customTypeRequired"));
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

    try {
      const submittedFinalPrompt = typeof finalPromptForRun === "string" ? finalPromptForRun : finalPrompt;
      const referencePayload = outputMode === "reference" ? await urlToBase64(activeReferenceUrl) : null;
      const res = await fetch("/api/garment-3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garment_url: garmentUrl,
          garment_type: garmentType,
          custom_garment_type: customGarmentType,
          output_mode: outputMode,
          display_style: displayStyle,
          reference_url: referencePayload,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          prompt,
          final_prompt: submittedFinalPrompt,
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
        applyGenerationResponseStatus({ res, data, userId, setCredits, fallbackError: t("generationFailed") });
      }

      if (data.credits_remaining !== undefined) {
        setCredits(data.credits_remaining);
        if (userId) setCachedProfileCredits(userId, data.credits_remaining);
      }

      if (typeof data.generation_id === "string" && data.generation_id) {
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

      if (data.status === "completed") {
        const finalUrls = mergeRetryResultUrls(
          retryPreviousResultUrls,
          retryResultIndex,
          Array.isArray(data.result_urls) ? data.result_urls : [],
          displayExpectedCount
        );
        const finalResultCount = finalUrls.filter(Boolean).length;
        const completedError = data.error || "";
        setProgress(100);
        setResultUrls(finalUrls);
        taskQueue.markCompleted(activeTaskId, {
          expectedCount: displayExpectedCount,
          inputThumbnails: taskInputThumbnails,
          resultThumbnails: finalUrls,
          resultCount: finalResultCount,
          error: completedError ? summarizeGenerationError(completedError) : "",
        });
        if (completedError || finalResultCount < displayExpectedCount) {
          void refreshCredits();
          toast.warning(t("partialCompleteToast", { done: finalResultCount, total: displayExpectedCount }));
        } else {
          toast.success(t("generationComplete"));
        }
        return;
      }

      // 后台轮询：useGenerationPolling 替代原 inline while-loop
      pollCtxRef.current = {
        activeTaskId,
        generationId: typeof data.generation_id === "string" ? data.generation_id : "",
        displayExpectedCount,
        retryPreviousResultUrls,
        retryResultIndex,
        taskInputThumbnails,
        latestTaskResultUrlsRef: { current: [] },
        setProgress,
        setResultUrls,
        setIsGenerating,
        setError,
        refreshCredits,
        taskQueue,
      };
      startGarment3dPolling();
    } catch (err: unknown) {
      const message = summarizeGenerationError(err instanceof Error ? err.message : t("operationFailed"));
      setError(message);
      taskQueue.markFailed(activeTaskId, message, {
        expectedCount: displayExpectedCount,
        inputThumbnails: taskInputThumbnails,
        resultThumbnails: pollCtxRef.current?.latestTaskResultUrlsRef.current ?? [],
        resultCount: pollCtxRef.current?.latestTaskResultUrlsRef.current.filter(Boolean).length ?? 0,
      });
      toast.error(message);
      void refreshCredits();
    } finally {
      setIsGenerating(false);
    }
  }

  function applyRuleDemo(demo: Garment3dRuleDemo) {
    setGarmentUrl(demo.imageUrl);
    setGarmentName(demo.title);
    setGarmentType(demo.garmentType);
    setPromptOverride(null);
    closeRulesPopover();
    toast.success(t("ruleApplied", { title: demo.title }));
  }

  function handleRunningTask(item: TaskQueueItem) {
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
      const detail = await fetchHistoryApplyDetail(item.id, "garment3d", session.signal);
      // Apply even if the session went stale mid-fetch — swallowing silently
      // here was the root cause of "click a row, preview doesn't update". A
      // real abort would have hit the catch block via session.signal.
      applyGarment3dHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), {
        silent: session.reason === "restore",
      });
      if (item.statusGroup === "failed" || isHistoryApplyRowFailed(detail.row)) {
        setError(getHistoryApplyFailureMessage(detail.row, item.error || t("generationFailed")));
      }
      return true;
    } catch (err) {
      if (session.signal.aborted) return undefined;
      toast.error(err instanceof Error ? err.message : t("historyLoadFailed"));
      return true;
    }
  }

  function handleContinueCreate() {
    setGarmentUrl("");
    setGarmentName("");
    setGarmentType("上装");
    setCustomGarmentType("");
    setOutputMode("reference");
    setDisplayStyle(DEFAULT_GARMENT_3D_DISPLAY_STYLE);
    setSelectedReference(REFERENCE_PRESETS[0]);
    setCustomReferenceUrl("");
    setPrompt("");
    setPromptOverride(null);
    setAiModel("nano-banana-2");
    setAspectRatio("auto");
    setImageSize("1K");
    setGenCount(1);
    setIsGenerating(false);
    setRunningExpectedCount(null);
    setProgress(0);
    setResultUrls([]);
    setError(null);
    setLightboxSrc(null);
    closeRulesPopover();
    if (garmentInputRef.current) garmentInputRef.current.value = "";
    if (referenceInputRef.current) referenceInputRef.current.value = "";
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="garment3d" />
      <ModuleTaskRail
        module="garment3d"
        moduleLabel={t("moduleLabel")}
        onContinue={handleContinueCreate}
        onRunningTask={handleRunningTask}
        onCompletedTask={handleCompletedTask}
      />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          <ModuleHeader
            title={t("title")}
            tooltip={t("tooltip")}
            actions={(
              <button
                ref={rulesButtonRef}
                type="button"
                onMouseEnter={openRulesPopover}
                onMouseLeave={scheduleRulesHide}
                onFocus={openRulesPopover}
                onBlur={scheduleRulesHide}
                aria-expanded={showGarmentRules}
                className="studio-upload-rule-button"
              >
                {t("rulesButton")} <ChevronRight className="h-3 w-3" />
              </button>
            )}
          />
          <StudioUploadSection
            title={t("uploadSectionTitle")}
            inputRef={garmentInputRef}
            isDragging={isDragging}
            setDragging={setIsDragging}
            onFiles={handleGarmentFiles}
          >
            {(openFileDialog, dragContext) => (
              <>
                <StudioUploadTile
                  title={t("uploadTileTitle")}
                  description={t("uploadTileDescription")}
                  imageUrl={garmentUrl || null}
                  imageAlt={t("uploadImageAlt")}
                  isDragging={isDragging}
                  loading={isUploadingGarment}
                  onUploadClick={openFileDialog}
                  onLibraryClick={() => toast.info(t("libraryComingSoon"))}
                  onPreview={garmentUrl ? () => setLightboxSrc(garmentUrl) : undefined}
                  onRemove={garmentUrl ? () => {
                    setGarmentUrl("");
                    setGarmentName("");
                  } : undefined}
                  onDropFile={(file) => handleGarmentFiles(file ? [file] : [])}
                  dragContext={dragContext}
                  uploadLabel={t("uploadLabel")}
                  libraryLabel={t("libraryLabel")}
                  footnote={garmentUrl ? garmentName || t("uploadedImage") : t("footnoteEmpty")}
                  examples={{
                    label: t("examplesLabel"),
                    images: GARMENT_3D_UPLOAD_RULE.demos.map((demo) => ({ url: demo.imageUrl, title: demo.title })),
                    onSelect: (image) => {
                      const demo = GARMENT_3D_UPLOAD_RULE.demos.find((item) => item.imageUrl === image.url);
                      if (demo) applyRuleDemo(demo);
                    },
                  }}
                />
              </>
            )}
          </StudioUploadSection>

          <section>
            <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("garmentTypeSectionTitle")}</h3>
            <StudioOptionGrid
              options={GARMENT_TYPE_OPTIONS.map((type) => ({
                value: type,
                label: translateGarmentType(t, type),
              }))}
              value={garmentType}
              onChange={setGarmentType}
              columns={4}
              ariaLabel={t("garmentTypeSectionTitle")}
            />
            {garmentType === "其他" && (
              <input
                value={customGarmentType}
                onChange={(e) => setCustomGarmentType(e.target.value)}
                placeholder={t("garmentTypePlaceholder")}
                className="studio-text-input mt-2"
              />
            )}
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("outputModeSectionTitle")}</h3>
            <StudioOptionGrid
              options={[
                { value: "reference" as const, label: t("outputModeReference") },
                { value: "prompt" as const, label: t("outputModePrompt") },
              ]}
              value={outputMode}
              onChange={(nextMode) => {
                setOutputMode(nextMode);
                setPromptOverride(null);
                if (nextMode === "reference" && prompt.trim() === DEFAULT_PROMPT) setPrompt("");
                if (nextMode === "prompt" && !prompt.trim()) setPrompt(DEFAULT_PROMPT);
              }}
              columns={2}
              ariaLabel={t("outputModeSectionTitle")}
              className="mb-3"
            />

            {outputMode === "reference" && (
              <div className="space-y-3">
                <div className="grid grid-cols-5 gap-2">
                  {REFERENCE_PRESETS.map((ref) => (
                    <div
                      key={ref.id}
                      className={`group relative aspect-square rounded-lg overflow-hidden border bg-[var(--codex-surface-soft)] dark:bg-white/4 ${
                        !customReferenceUrl && selectedReference.id === ref.id ? "border-[var(--codex-accent)] ring-2 ring-[var(--codex-accent-25)]" : "border-[var(--codex-border)]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => { setSelectedReference(ref); setCustomReferenceUrl(""); setPromptOverride(null); }}
                        aria-label={ref.labelKey ? t(ref.labelKey) : ref.label}
                        title={ref.labelKey ? t(ref.labelKey) : ref.label}
                        className="absolute inset-0 w-full h-full cursor-pointer"
                      >
                        <RawPreviewImage src={ref.url} alt={ref.labelKey ? t(ref.labelKey) : ref.label} className="w-full h-full object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLightboxSrc(ref.url); }}
                        aria-label={t("zoomPreview")}
                        title={t("zoomPreview")}
                        className="absolute right-1.5 top-1.5 w-7 h-7 rounded-full bg-white/90 dark:bg-white/5 text-codex-ink shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center justify-center hover:bg-white"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => referenceInputRef.current?.click()}
                    className={`aspect-square rounded-lg border-2 border-dashed flex items-center justify-center ${
                      customReferenceUrl ? "border-[var(--codex-accent)] bg-[var(--codex-accent-08)]" : "border-[var(--codex-border)]"
                    }`}
                    title={t("uploadReference")}
                  >
                    <Plus className="w-5 h-5 text-codex-faint" />
                  </button>
                </div>
                <input
                  ref={referenceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const input = event.currentTarget;
                    void handleCustomReference(input.files?.[0]).finally(() => {
                      input.value = "";
                    });
                  }}
                />
                <p className="text-[11px] text-codex-faint">{t("referenceHint")}</p>
              </div>
            )}

            <div className="mt-3">
              <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("displayStyleSectionTitle")}</h3>
              <StudioOptionGrid
                options={GARMENT_3D_DISPLAY_STYLES.map((style) => ({
                  value: style.value,
                  label: style.label,
                  description: style.desc,
                }))}
                value={displayStyle}
                onChange={(nextStyle) => {
                  setDisplayStyle(nextStyle);
                  setPromptOverride(null);
                }}
                columns={2}
                ariaLabel={t("displayStyleSectionTitle")}
              />
              <p className="mt-2 text-[11px] leading-relaxed text-codex-faint">
                {t("displayStyleHint")}
              </p>
            </div>

            <div className="relative mt-3">
              <StudioPromptTextarea
                title={outputMode === "reference" ? t("promptTitleReference") : t("promptTitlePrompt")}
                badge={outputMode === "reference" ? t("promptBadge") : undefined}
                value={prompt}
                onChange={(e) => { setPrompt(e.target.value); setPromptOverride(null); }}
                placeholder={outputMode === "reference"
                  ? t("promptPlaceholderReference")
                  : t("promptPlaceholderPrompt")}
                rows={4}
                description={outputMode === "reference"
                  ? t("promptDescriptionReference")
                  : undefined}
                action={(
                  <button
                    type="button"
                    onClick={optimizePrompt}
                    disabled={isOptimizing || !garmentUrl}
                    className="studio-prompt-icon-action"
                    title={t("analyzeTooltip")}
                  >
                    {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
                  </button>
                )}
              />
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("modelSectionTitle")}</h3>
            <StudioModelSelector
              models={modelOptions}
              value={aiModel}
              onChange={setAiModel}
              ariaLabel={t("modelSectionTitle")}
            />
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("aspectSectionTitle")}</h3>
            <StudioOptionGrid
              options={[
                { value: "auto", label: t("aspectAuto") },
                { value: "1:1", label: t("aspectSquare") },
                { value: "3:4", label: t("aspectPortrait") },
              ] as const}
              value={aspectRatio}
              onChange={setAspectRatio}
              columns={2}
              ariaLabel={t("aspectSectionTitle")}
            />
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("sizeSectionTitle")}</h3>
            <StudioOptionGrid
              options={useImageSizeOptions(imageSizes, (size) => getCreditCost(aiModel, size, aspectRatio), t("sizeUnit"))}
              value={imageSize}
              onChange={setImageSize}
              columns={2}
              ariaLabel={t("sizeSectionTitle")}
            />
          </section>
          <section>
            <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("countSectionTitle")}</h3>
            <GenerationCountField
              value={genCount}
              onChange={setGenCount}
              ariaLabel={t("countSectionTitle")}
            />
          </section>
        </div>

        <StudioRunBar
          summary={t("summary", { cost: costPerImage, count: genCount })}
          estimateLabel={isGenerating ? t("runBar.estimateGenerating") : t("runBar.estimateReady", { count: genCount })}
          costLabel={authIsAnonymous ? t("costLogin") : t("costConsume", { cost: totalCost, balance: credits ?? "-" })}
          disabled={isGenerating || Boolean(runDisabledReason)}
          disabledReason={runDisabledReason}
          primaryLabel={authIsAnonymous ? t("loginGenerate") : isGenerating ? t("generatingBtn") : t("generatePrimary", { count: genCount })}
          isLoading={isGenerating}
          onPrimaryAction={() => generate()}
        />
      </div>

      <div className="studio-canvas min-h-[260px] sm:min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title={t("emptyTitle")}
              subtitle={t("emptySubtitle")}
              imageSrc="https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/garment-blue-hoodie-3d.png"
              imageAlt={t("emptyImageAlt")}
              steps={[
                { title: t("stepUploadTitle"), desc: t("stepUploadDesc") },
                { title: t("stepTypeTitle"), desc: t("stepTypeDesc") },
                { title: t("stepGenerateTitle"), desc: t("stepGenerateDesc") },
              ]}
            />
          </div>
        )}

        {(isGenerating || resultUrls.length > 0) && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full animate-fade-in">
            <div className="flex min-h-full items-start justify-start">
              <ResultImageGrid
                urls={resultUrls}
                filenamePrefix="garment-3d"
                expectedCount={activeResultExpectedCount}
                isGenerating={isGenerating}
                inputThumbnails={taskInputThumbnails}
                statusGroup={isGenerating ? "running" : undefined}
                variant="task"
                markMissingAsFailed={hasCompletedPartialResults}
                missingFailureLabel={t("missingFailureLabel")}
                missingFailureDetail={partialFailureMessage}
                missingFailureActionLabel={t("missingFailureActionLabel")}
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
              filenamePrefix="garment-3d"
              actions={GARMENT_3D_PREVIEW_ACTIONS.map((a) => {
                const key: Record<string, string> = {
                  download: "previewDownload",
                  copy: "previewCopy",
                  repair: "previewRepair",
                  aiVideo: "previewAiVideo",
                  modelBackground: "previewModelBackground",
                  pose: "previewPose",
                  productSet: "previewProductSet",
                  regenerateAll: "previewRegenerateAll",
                  feedback: "previewFeedback",
                };
                return { ...a, label: t(key[a.kind]) };
              })}
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
            retryLabel={t("retryLabel")}
            notice={FAILED_RETRY_NOTICE}
          />
        )}
      </div>

      <StudioRulesPopover
        open={showGarmentRules}
        style={rulesPopoverStyle}
        width={760}
        demoGridClassName="md:grid-cols-5"
        shortTitle={GARMENT_3D_UPLOAD_RULE.shortTitle}
        title={GARMENT_3D_UPLOAD_RULE.title}
        specText={GARMENT_3D_UPLOAD_RULE.uploadSpecText}
        hoverPreviewLabel={t("hoverPreview")}
        tryItLabel={t("examplesLabel")}
        demos={GARMENT_3D_UPLOAD_RULE.demos.map((demo) => ({
          key: demo.imageUrl,
          title: demo.title,
          description: demo.description,
          imageUrls: [demo.imageUrl],
          onApply: () => applyRuleDemo(demo),
        }))}
        examples={GARMENT_3D_UPLOAD_RULE.deprecatedImages.map((image) => ({
          key: image.title,
          title: image.title,
          imageUrl: image.url,
        }))}
        examplesTitle={GARMENT_3D_UPLOAD_RULE.deprecatedTitle}
        onMouseEnter={cancelRulesHide}
        onMouseLeave={scheduleRulesHide}
      />

      <StudioMediaLightbox
        src={lightboxSrc}
        alt={t("lightboxAlt")}
        onClose={() => setLightboxSrc(null)}
      />
    </div>
  );
}

function translateGarmentType(t: (key: string) => string, type: string) {
  if (type === "上装") return t("garmentTypeTop");
  if (type === "下装") return t("garmentTypeBottom");
  if (type === "连体衣") return t("garmentTypeBody");
  if (type === "其他") return t("garmentTypeOther");
  return type;
}

function buildGarment3dPrompt(params: {
  garmentType: string;
  outputMode: OutputMode;
  displayStyle: Garment3dDisplayStyle;
  hasReference: boolean;
  prompt: string;
}) {
  const roles = params.hasReference
    ? "图像角色：图1是用户上传的服装图，图2是3D立体效果参考图。"
    : "图像角色：图1是用户上传的服装图。";
  const referenceLine = params.hasReference
    ? "参考图2只用于学习立体角度、布料厚度、支撑形态、阴影结构和商业棚拍光影，不参考图2的背景元素、颜色、图案、文字或具体款式。"
    : "按照用户提示生成类似穿在人身上的3D立体展示效果，使用干净白色背景。";
  const backgroundLine = "画面要求：主体居中，边缘干净，真实商业棚拍质感，柔和自然阴影，背景使用干净白色或浅灰棚拍背景，不带场景杂物。";
  const userRequirement = params.prompt.trim()
    ? `用户补充要求：${params.prompt.trim()}`
    : params.hasReference
      ? "用户补充要求：无，优先按照图2的立体角度、厚度、支撑形态和棚拍光影生成。"
      : `用户要求：${DEFAULT_PROMPT}`;

  return `${roles}
任务：将图1的${params.garmentType || "服装"}从平面图或人台图转换为无真人、无头部、无脸、无手的3D立体服装展示图。
${referenceLine}
严格保留图1服装的版型、颜色、材质、纹理、图案、纽扣、拉链、口袋、帽绳、袖口、裤腰、裤脚等细节。
${buildGarment3dDisplayStylePrompt(params.displayStyle)}
${userRequirement}
${backgroundLine}
图像质量：${GARMENT_3D_QUALITY}。
负面约束：不要生成真人身体，不要生成模特脸，不要多件衣服，不要改变服装品类，不要改变主要颜色，不要扭曲文字和 logo。`;
}
