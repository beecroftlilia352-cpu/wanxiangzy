"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRulesPopover } from "@/hooks/use-rules-popover";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, ChevronRight, Cpu, UserRound } from "lucide-react";
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
import { StudioMultiImageUpload } from "@/components/studio/StudioMultiImageUpload";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { StudioRulesPopover } from "@/components/studio/StudioRulesPopover";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { useGenerationPolling } from "@/hooks/use-generation-polling";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE_MB, isLikelyImageFile, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { useStudioImageModelOptions } from "@/lib/studio-models";
import { fetchHistoryApplyDetail, getHistoryApplyFailureMessage, isHistoryApplyRowFailed, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import { useHistoryApply } from "@/hooks/use-history-apply";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import { enforceModelPromptRequirements } from "@/lib/model-prompt";
import { applyGenerationResponseStatus, showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import { createGenericImagePreviewSession, referencesFromUrls, type ImagePreviewAction } from "@/lib/studio-image-preview";
import { useStudioPreview } from "@/hooks/use-studio-preview";
import { FAILED_RETRY_NOTICE, buildPartialFailureDetail, coerceErrorMessage, summarizeGenerationError } from "@/lib/studio-generation-feedback";
import {
  buildRetryPendingResultUrls,
  getRetryDisplayExpectedCount,
  mergeRetryResultUrls,
  normalizeRetryResultIndex,
} from "@/lib/result-slot-retry";
import {
  DEFAULT_MODEL_SHOOT_STYLE,
  MODEL_SHOOT_STYLES,
  applyModelShootStylePrompt,
  buildModelShootStylePrompt,
  normalizeModelShootStyle,
  type ModelShootStyle,
} from "@/lib/module-style-presets";
import { MODEL_UPLOAD_RULE, type ModelRuleDemo } from "@/lib/model-upload-rules";
import {
  MODEL_ASPECTS,
  MODEL_HAIR_COLORS,
  MODEL_HAIR_STYLES,
  MODEL_PREVIEW_ACTIONS,
  type ModelPreviewAction,
} from "@/lib/model-presets";
import { buildModelDefaultPrompt } from "@/lib/model-default-prompt";
import { HairStyleSection } from "@/features/model/HairStyleSection";

type Gender = "female" | "male";
type ModelGenerateOptions = {
  genCountOverride?: number;
  expectedCountOverride?: number;
  retryResultIndex?: number;
  toastMessage?: string;
};

type ModelHistoryPayload = Extract<HistoryJobPayload, { kind: "model" }>;

export default function ModelPage() {
  const t = useTranslations("Model");
  // descKey/badgeKey 为根相对全路径（StudioModelSelector 内部用根 t 解析），这里同样用根翻译器
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hairInputRef = useRef<HTMLInputElement>(null);
  const hairColorInputRef = useRef<HTMLInputElement>(null);

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
    show: showModelRules,
    style: rulesPopoverStyle,
    open: openRulesPopover,
    scheduleHide: scheduleRulesHide,
    close: closeRulesPopover,
    cancelHide: cancelRulesHide,
  } = useRulesPopover({ width: 760 });
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [isReferenceDragging, setIsReferenceDragging] = useState(false);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [gender, setGender] = useState<Gender>("female");
  const [modelStyle, setModelStyle] = useState<ModelShootStyle>(DEFAULT_MODEL_SHOOT_STYLE);
  const [hairStyle, setHairStyle] = useState<string | null>(null);
  const [hairColor, setHairColor] = useState<string | null>(null);
  const [hairReferenceUrl, setHairReferenceUrl] = useState<string | null>(null);
  const [hairColorReferenceUrl, setHairColorReferenceUrl] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  // 可选模型列表来自共享模块（lib/studio-models）：channel 配置推导 + 根相对翻译键
  const modelOptions = useStudioImageModelOptions();
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [userExtraPrompt, setUserExtraPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [runningExpectedCount, setRunningExpectedCount] = useState<number | null>(null);
  const [activeResultMeta, setActiveResultMeta] = useState<{ createdAt: string; inputThumbnails: string[] } | null>(null);
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [referencePreviewIndex, setReferencePreviewIndex] = useState<number | null>(null);

  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const cost = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = cost * genCount;
  const authIsAnonymous = authChecked && !isAuthenticated;
  const runDisabledReason = !referenceUrls.length
    ? t("uploadAtLeastOne")
    : credits !== null && credits < totalCost
      ? t("insufficientCredits", { totalCost })
      : undefined;
  const defaultPrompt = useMemo(
    () => buildModelDefaultPrompt({
      refCount: referenceUrls.length || 1,
      gender,
      hairStyle,
      hairColor,
      hasHairReference: !!hairReferenceUrl,
      hasHairColorReference: !!hairColorReferenceUrl,
      modelStyle,
    }),
    [referenceUrls.length, gender, hairStyle, hairColor, hairReferenceUrl, hairColorReferenceUrl, modelStyle]
  );
  const taskInputThumbnails = useMemo(
    () => [...referenceUrls, hairReferenceUrl, hairColorReferenceUrl].filter(Boolean) as string[],
    [referenceUrls, hairReferenceUrl, hairColorReferenceUrl]
  );
  const previewReferences = useMemo(
    () => referencesFromUrls(activeResultMeta?.inputThumbnails.length ? activeResultMeta.inputThumbnails : taskInputThumbnails, "reference", t("referenceImage")),
    [activeResultMeta, taskInputThumbnails, t]
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
      toastMessage: t("retryBackfillToast", { index: index + 1 }),
    });
  }
  const previewSession = useStudioPreview({
    module: "model",
    title: t("title"),
    urls: resultUrls,
    expectedCount: activeResultExpectedCount,
    isGenerating,
    createdAt: activeResultMeta?.createdAt,
    references: previewReferences,
    promptText: userExtraPrompt,
    metaItems: [
      { label: t("meta.gender"), value: gender === "female" ? t("genderModel.female") : t("genderModel.male") },
      { label: t("meta.shootStyle"), value: modelStyle },
      { label: t("meta.model"), value: aiModel },
      { label: t("meta.aspectRatio"), value: aspectRatio },
      { label: t("meta.resolution"), value: imageSize },
      { label: t("meta.genCount"), value: genCount },
    ],
    resultTitlePrefix: t("resultTitlePrefix"),
    aspectRatio,
  });
  const referencePreviewSession = useStudioPreview({
    module: "model",
    title: t("referenceTitle"),
    urls: referenceUrls,
    expectedCount: Math.max(referenceUrls.length, 1),
    references: referencesFromUrls(referenceUrls, "reference", t("referenceImage")),
    resultTitlePrefix: t("referenceImage"),
    aspectRatio: "auto",
  });
  const taskQueue = useTaskQueueGeneration({
    module: "model",
    title: t("title"),
    defaultExpectedCount: genCount,
    applyPath: "/model",
  });

  // 后台轮询：useGenerationPolling 替代 inline while-loop + setTimeout + fetch。
  // useGenerationPolling 自带 4xx/5xx/maxAttempts 保护（hooks/use-generation-polling.ts runLoop）
  const pollCtxRef = useRef<{
    activeTaskId: string;
    generationId: string;
    displayExpectedCount: number;
    retryPreviousResultUrls: string[];
    retryResultIndex: number | null;
    taskInputThumbnails: string[];
    latestTaskResultUrlsRef: { current: string[] };
    setResultUrls: (urls: string[]) => void;
    setIsGenerating: (b: boolean) => void;
    setError: (msg: string) => void;
    refreshCredits: () => Promise<number | null | undefined>;
    taskQueue: typeof taskQueue;
  } | null>(null);

  const { start: startModelPolling } = useGenerationPolling<{
    status: string;
    progress?: number;
    result_urls?: unknown;
    error?: string;
    partial_failure?: { message?: unknown };
  }>({
    id: "",
    buildUrl: (id) => {
      const ctx = pollCtxRef.current;
      return `/api/model?generation_id=${encodeURIComponent(ctx?.generationId ?? id)}`;
    },
    isTerminal: (state) => state.status === "completed" || state.status === "failed",
    intervalMs: 2000,
    maxAttempts: 120,
    onTick: (state) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      if (state.status === "completed" || state.status === "failed") return;

      // 处理中：推结果 + 进度
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
      const runningProgress = Number.isFinite(nextProgress)
        ? Math.min(Math.max(Math.round(nextProgress), 0), 99)
        : 24; // hook 拿不到 attempts，原 25 + attempts*1.5 渐进 fallback 改为 24
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
        ctx.setResultUrls(finalUrls);
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
        return;
      }
      if (state.status === "failed") {
        const message = summarizeGenerationError(state.error || t("generateFailed"));
        ctx.setError(message);
        ctx.setIsGenerating(false);
        ctx.taskQueue.markFailed(ctx.activeTaskId, message, {
          expectedCount: ctx.displayExpectedCount,
          inputThumbnails: ctx.taskInputThumbnails,
          resultThumbnails: ctx.latestTaskResultUrlsRef.current,
        });
        toast.error(message);
        void ctx.refreshCredits();
      }
    },
    onError: (error) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      const message = summarizeGenerationError(error.message || t("generateTimeout"));
      ctx.setError(message);
      ctx.setIsGenerating(false);
      ctx.taskQueue.markFailed(ctx.activeTaskId, message, {
        expectedCount: ctx.displayExpectedCount,
        inputThumbnails: ctx.taskInputThumbnails,
        resultThumbnails: ctx.latestTaskResultUrlsRef.current,
      });
      toast.error(message);
      void ctx.refreshCredits();
    },
  });

  useEffect(() => {
    if (!promptTouched) {
      setPrompt(defaultPrompt);
    }
  }, [defaultPrompt, promptTouched]);

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  function applyModelHistoryPayload(payload: ModelHistoryPayload, historyResultUrls: string[] = [], options?: { silent?: boolean; row?: { status?: string | null; error_message?: string | null } }) {
    const normalizedStyle = normalizeModelShootStyle(payload.modelStyle);
    setReferenceUrls(payload.referenceUrls);
    setHairReferenceUrl(payload.hairReferenceUrl || null);
    setHairColorReferenceUrl(payload.hairColorReferenceUrl || null);
    setGender(payload.gender || "female");
    setModelStyle(normalizedStyle);
    setHairStyle(payload.hairStyle || null);
    setHairColor(payload.hairColor || null);
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setGenCount(payload.genCount);
    // Rebuild the default prompt from the freshly-restored inputs rather
    // than sending the historical (already-styled) prompt raw. The
    // server's `applyModelShootStylePrompt` only replaces the marker
    // line — the rest of the historical style's descriptive text would
    // otherwise leak into `fragments.userIntent` when the user changes
    // `modelStyle` after applying history.
    setPromptTouched(false);
    setPrompt(
      buildModelDefaultPrompt({
        refCount: payload.referenceUrls.length || 1,
        gender: payload.gender || "female",
        hairStyle: payload.hairStyle || null,
        hairColor: payload.hairColor || null,
        hasHairReference: !!payload.hairReferenceUrl,
        hasHairColorReference: !!payload.hairColorReferenceUrl,
        modelStyle: normalizedStyle,
      }),
    );
    setRunningExpectedCount(null);
    setResultUrls(historyResultUrls);
    setIsGenerating(false);
    setError(options?.row && isHistoryApplyRowFailed(options.row) ? getHistoryApplyFailureMessage(options.row) : "");
    if (!options?.silent) toast.success(t("historyApplied"));
  }

  useHistoryApply({
    kind: "model",
    apply: (payload, resultUrls) => applyModelHistoryPayload(payload, resultUrls, { silent: true }),
    onError: (err) => toast.error(err.message),
  });

  async function addFiles(files?: FileList | File[]) {
    if (!files) return;
    const incoming = Array.from(files).slice(0, 3 - referenceUrls.length);
    if (!incoming.length) {
      toast.error(t("maxThreeImages"));
      return;
    }

    // Pre-validate every file before kicking off uploads so we surface
    // every error in one toast instead of partially-uploading and then
    // complaining about the rest. Bounds come from MODEL_UPLOAD_RULE so
    // the displayed "20KB-15MB" range and the actual enforcement stay in
    // sync.
    const accepted: File[] = [];
    for (const file of incoming) {
      if (!isLikelyImageFile(file)) {
        toast.error(t("notImageFileSkipped", { name: file.name }));
        continue;
      }
      if (file.size < MODEL_UPLOAD_RULE.minFileSize) {
        toast.error(t("belowMinSizeSkipped", { name: file.name, kb: MODEL_UPLOAD_RULE.minFileSize / 1024 }));
        continue;
      }
      if (file.size > MODEL_UPLOAD_RULE.maxFileSize) {
        toast.error(t("exceedsMaxSize", { name: file.name, mb: MAX_FILE_SIZE_MB }));
        continue;
      }
      accepted.push(file);
    }
    if (!accepted.length) return;

    setIsUploadingReference(true);
    toast.info(t("uploadingCount", { count: accepted.length }));
    try {
      // Upload in parallel — each file's network round-trip runs
      // concurrently, cutting wall-clock time from N*RTT to ~RTT for
      // the common case of a multi-file drop.
      const results = await Promise.all(
        accepted.map(async (file) => {
          try {
            const result = await uploadImage(file);
            return { ok: true as const, name: file.name, url: result.url };
          } catch {
            return { ok: false as const, name: file.name };
          }
        }),
      );
      const next: string[] = [];
      for (const r of results) {
        if (r.ok) next.push(r.url);
        else toast.error(t("uploadFailedRetry", { name: r.name }));
      }
      if (next.length) {
        setReferenceUrls((prev) => [...prev, ...next].slice(0, 3));
        toast.success(t("addedCount", { count: next.length }));
      }
    } finally {
      setIsUploadingReference(false);
    }
  }

  function selectGender(nextGender: Gender) {
    setGender(nextGender);
    setHairStyle(null);
  }

  function selectModelStyle(nextStyle: ModelShootStyle) {
    setModelStyle(nextStyle);
    if (promptTouched) {
      setPrompt((prev) => applyModelShootStylePrompt(prev, nextStyle));
    }
  }

  async function uploadHairVariant(files: FileList | File[] | undefined, options: {
    label: string; // "发型" | "发色" — used in toasts
    setUrl: (url: string | null) => void;
    clearSelection: () => void;
  }) {
    const file = files?.[0];
    if (!file) return;
    if (!isLikelyImageFile(file)) {
      toast.error(t("pleaseUploadImage"));
      return;
    }
    if (file.size < MODEL_UPLOAD_RULE.minFileSize) {
      toast.error(t("belowMinSizeSkipped", { name: file.name, kb: MODEL_UPLOAD_RULE.minFileSize / 1024 }));
      return;
    }
    if (file.size > MODEL_UPLOAD_RULE.maxFileSize) {
      toast.error(t("exceedsMaxSize", { name: file.name, mb: MAX_FILE_SIZE_MB }));
      return;
    }
    options.clearSelection();

    toast.info(t("uploadingVariant", { label: options.label }));
    try {
      const result = await uploadImage(file);
      options.setUrl(result.url);
      toast.success(t("variantUploaded", { label: options.label }));
    } catch {
      options.setUrl(null);
      toast.error(t("variantUploadFailed", { label: options.label }));
    }
  }

  function uploadHairReference(files?: FileList | File[]) {
    return uploadHairVariant(files, {
      label: t("hairStyle"),
      setUrl: setHairReferenceUrl,
      clearSelection: () => setHairStyle(null),
    });
  }

  function uploadHairColorReference(files?: FileList | File[]) {
    return uploadHairVariant(files, {
      label: t("hairColor"),
      setUrl: setHairColorReferenceUrl,
      clearSelection: () => setHairColor(null),
    });
  }

  async function generate(promptForRun?: string, options: ModelGenerateOptions = {}) {
    // Concurrent submit guard: a rapid second click (or retry fired
    // while a previous run is still polling) would otherwise post twice
    // and double-charge credits. The button is also `disabled` while
    // `isGenerating`, but that only protects keyboard / screen-reader
    // paths — direct re-entry from hot-reload or programmatic callers
    // needs the in-function guard.
    if (isGenerating) return;
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("pleaseLogin"));
      router.push("/login");
      return;
    }
    if (!referenceUrls.length) {
      toast.error(t("uploadAtLeastOne"));
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
    const runTotalCost = cost * runExpectedCount;
    if (credits !== null && credits < runTotalCost) {
      showInsufficientCreditsToast({ required: runTotalCost, balance: credits, onRecharge: () => router.push("/pricing") });
      return;
    }

    setIsGenerating(true);
    setRunningExpectedCount(displayExpectedCount);
    setError("");
    setResultUrls(buildRetryPendingResultUrls(retryPreviousResultUrls, retryResultIndex, displayExpectedCount));
    if (options.toastMessage) toast.info(options.toastMessage);
    setActiveResultMeta({
      createdAt: new Date().toISOString(),
      inputThumbnails: taskInputThumbnails,
    });
    const provisionalTask = taskQueue.startTask({
      expectedCount: displayExpectedCount,
      inputThumbnails: taskInputThumbnails,
      progress: 10,
    });
    let activeTaskId = provisionalTask.id;

    try {
      const res = await fetch("/api/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference_urls: referenceUrls,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          gen_count: runGenCount,
          hair_reference_url: hairReferenceUrl,
          hair_color_reference_url: hairColorReferenceUrl,
          gender,
          model_style: modelStyle,
          hair_style: hairStyle,
          hair_color: hairColor,
          prompt: typeof promptForRun === "string"
            ? promptForRun
            : userExtraPrompt.trim()
              ? `${prompt}\n\n用户补充要求：${userExtraPrompt.trim()}`
              : prompt,
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
      if (typeof data.generation_id !== "string" || !data.generation_id) {
        // Server returned 200 without a generation id (partial deploy,
        // upstream outage short-circuited into JSON, etc.). Without this
        // guard the polling loop would happily call
        // `/api/model?generation_id=undefined` for the full 120-attempt
        // budget and surface a misleading '生成超时'.
        throw new Error(t("noGenerationId"));
      }
      const generationId = data.generation_id;
      const serverTask = taskQueue.replaceWithServerTask(activeTaskId, {
        id: generationId,
        expectedCount: displayExpectedCount,
        inputThumbnails: taskInputThumbnails,
        status: data.status || "processing_tryon",
        progress: 25,
      });
      activeTaskId = serverTask.id;

      // 后台轮询：useGenerationPolling 自带 4xx/5xx/maxAttempts 处理
      pollCtxRef.current = {
        activeTaskId,
        generationId,
        displayExpectedCount,
        retryPreviousResultUrls,
        retryResultIndex,
        taskInputThumbnails,
        latestTaskResultUrlsRef: { current: [] },
        setResultUrls,
        setIsGenerating,
        setError,
        refreshCredits,
        taskQueue,
      };
      startModelPolling();
    } catch (err: unknown) {
      const message = summarizeGenerationError(err instanceof Error ? err.message : t("generateFailed"));
      setError(message);
      setIsGenerating(false);
      taskQueue.markFailed(activeTaskId, message, {
        expectedCount: displayExpectedCount,
        inputThumbnails: taskInputThumbnails,
        resultThumbnails: pollCtxRef.current?.latestTaskResultUrlsRef.current ?? [],
      });
      toast.error(message);
      void refreshCredits();
    }
  }

  function applyRuleDemo(demo: ModelRuleDemo) {
    setReferenceUrls(demo.imageUrls.slice(0, 3));
    setPromptTouched(false);
    closeRulesPopover();
    toast.success(t("demoApplied", { title: demo.title }));
  }

  function handleRunningTask(item: TaskQueueItem) {
    setRunningExpectedCount(clampTaskExpectedCount(item, 1, 4));
    setIsGenerating(true);
    setError("");
    setResultUrls(safeTaskQueueUrls(item.resultThumbnails));
    setActiveResultMeta({
      createdAt: item.createdAt || item.updatedAt || new Date().toISOString(),
      inputThumbnails: safeTaskQueueUrls(item.inputThumbnails),
    });
  }

  async function handleCompletedTask(item: TaskQueueItem, session: TaskSelectionSession) {
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "model", session.signal);
      // Apply even if the session went stale mid-fetch — swallowing silently
      // here was the root cause of "click a row, preview doesn't update". A
      // real abort would have hit the catch block via session.signal.
      applyModelHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), {
        silent: session.reason === "restore",
      });
      if (item.statusGroup === "failed" || isHistoryApplyRowFailed(detail.row)) {
        setError(getHistoryApplyFailureMessage(detail.row, item.error || t("generateFailed")));
      }
      return true;
    } catch (err) {
      if (session.signal.aborted) return undefined;
      toast.error(err instanceof Error ? err.message : t("historyLoadFailed"));
      return true;
    }
  }

  function handleContinueCreate() {
    setReferenceUrls([]);
    setGender("female");
    setModelStyle(DEFAULT_MODEL_SHOOT_STYLE);
    setHairStyle(null);
    setHairColor(null);
    setHairReferenceUrl(null);
    setHairColorReferenceUrl(null);
    setAiModel("nano-banana-2");
    setAspectRatio("auto");
    setImageSize("1K");
    setGenCount(1);
    setPrompt("");
    setPromptTouched(false);
    setUserExtraPrompt("");
    setIsGenerating(false);
    setRunningExpectedCount(null);
    setResultUrls([]);
    setActiveResultMeta(null);
    setError("");
    setPreviewIndex(null);
    setReferencePreviewIndex(null);
    closeRulesPopover();
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (hairInputRef.current) hairInputRef.current.value = "";
    if (hairColorInputRef.current) hairColorInputRef.current.value = "";
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="model" />
      <ModuleTaskRail module="model" moduleLabel={t("moduleLabel")} onContinue={handleContinueCreate} onRunningTask={handleRunningTask} onCompletedTask={handleCompletedTask} />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
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
                aria-expanded={showModelRules}
                className="studio-upload-rule-button"
              >
                {t("imageRules")} <ChevronRight className="h-3 w-3" />
              </button>
            )}
          />
          <StudioUploadSection
            title={t("uploadReference")}
            inputRef={fileInputRef}
            multiple
            isDragging={isReferenceDragging}
            setDragging={setIsReferenceDragging}
            onFiles={addFiles}
          >
            {(openFileDialog) => (
              <StudioMultiImageUpload
                urls={referenceUrls}
                maxCount={3}
                title={t("uploadedReferenceTitle")}
                emptyTitle={t("uploadEmptyTitle")}
                description={t("uploadDescription")}
                emptyDescription={t("uploadEmptyDescription")}
                itemLabelPrefix={t("itemPrefix")}
                loading={isUploadingReference}
                isDragging={isReferenceDragging}
                uploadLabel={t("uploadLocal")}
                libraryLabel={t("uploadLibrary")}
                summary={referenceUrls.length ? t("uploadSummary") : undefined}
                footnote={t("uploadFootnote")}
                onUploadClick={openFileDialog}
                onLibraryClick={() => toast.info(t("libraryComingSoon"))}
                onPreview={(_, index) => setReferencePreviewIndex(index)}
                onRemove={(_, index) => {
                  setReferenceUrls((prev) => prev.filter((__, i) => i !== index));
                  setReferencePreviewIndex((current) => {
                    if (current === null) return null;
                    if (referenceUrls.length <= 1) return null;
                    if (current === index) return Math.max(0, Math.min(index, referenceUrls.length - 2));
                    return current > index ? current - 1 : current;
                  });
                }}
                onClear={() => {
                  setReferenceUrls([]);
                  setReferencePreviewIndex(null);
                }}
                examples={{
                  label: t("tryIt"),
                  images: MODEL_UPLOAD_RULE.demos.map((demo) => ({
                    url: demo.imageUrls[0],
                    title: demo.title,
                    previewUrls: demo.imageUrls,
                  })),
                  disabled: isUploadingReference,
                  onSelect: (image) => {
                    const demo = MODEL_UPLOAD_RULE.demos.find((item) => item.title === image.title && item.imageUrls[0] === image.url);
                    if (demo) applyRuleDemo(demo);
                  },
                }}
              />
            )}
          </StudioUploadSection>

          <section>
            <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("modelStyle")}</h3>
            <StudioOptionGrid
              options={MODEL_SHOOT_STYLES.map((style) => ({
                value: style.value,
                label: style.label,
                description: style.desc,
              }))}
              value={modelStyle}
              onChange={selectModelStyle}
              columns={2}
              ariaLabel={t("modelStyle")}
            />
            <p className="mt-2 text-[12px] leading-relaxed text-codex-faint">
              {t("modelStyleHint")}
            </p>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("gender")}</h3>
            <StudioOptionGrid<Gender>
              options={[
                { value: "female", label: t("genderFemale") },
                { value: "male", label: t("genderMale") },
              ]}
              value={gender}
              onChange={selectGender}
              columns={2}
              ariaLabel={t("gender")}
            />
          </section>

          <HairStyleSection
            gender={gender}
            hairStyle={hairStyle}
            hairReferenceUrl={hairReferenceUrl}
            hairInputRef={hairInputRef}
            onSelectPreset={(value) => {
              setHairStyle(value);
              setHairReferenceUrl(null);
            }}
            onClear={() => {
              setHairStyle(null);
              setHairReferenceUrl(null);
            }}
            onUpload={uploadHairReference}
            onRemoveUpload={() => setHairReferenceUrl(null)}
            onPickFile={() => hairInputRef.current?.click()}
          />

          <section>
            <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("hairColorRef")}</h3>
            <input
              ref={hairColorInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const input = event.currentTarget;
                const files = Array.from(input.files || []);
                void uploadHairColorReference(files).finally(() => {
                  input.value = "";
                });
              }}
            />
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => { setHairColor(null); setHairColorReferenceUrl(null); }}
                className={`rounded-lg border p-2 text-center transition-colors aspect-[3/4] flex flex-col items-center justify-center ${
                  !hairColor && !hairColorReferenceUrl ? "border-[var(--codex-accent)] bg-[var(--codex-accent-08)] text-[var(--codex-accent)] ring-1 ring-[var(--codex-accent-25)] dark:bg-[var(--codex-accent-14)] dark:text-[var(--codex-accent)] dark:ring-[var(--codex-accent-38)]" : "border-[var(--codex-border)] dark:border-white/10 bg-codex-surface dark:bg-[#26262a] text-codex-faint dark:text-codex-faint hover:border-[var(--codex-border-strong)] dark:hover:border-white/20"
                }`}
              >
                <UserRound className="w-5 h-5 mb-1" />
                <span className="text-[11px] font-medium">{t("noDefault")}</span>
              </button>
              {MODEL_HAIR_COLORS.map((item) => (
                <button key={item.value} onClick={() => { setHairColor(item.value); setHairColorReferenceUrl(null); }}
                  className={`rounded-lg overflow-hidden border text-left transition-colors ${
                    hairColor === item.value && !hairColorReferenceUrl ? "border-[var(--codex-accent)] ring-1 ring-[var(--codex-accent-25)]" : "border-[var(--codex-border)] dark:border-white/10 hover:border-[var(--codex-border-strong)] dark:hover:border-white/20 bg-codex-surface dark:bg-[#26262a] text-codex-ink dark:text-codex-muted"
                  }`}>
                  <RawPreviewImage src={item.image} alt={item.labelKey ? t(item.labelKey) : item.label} className="w-full aspect-[3/4] object-cover bg-[var(--codex-surface-soft)] dark:bg-white/4" />
                  <div className="px-1 py-1 text-[11px] text-center font-medium">{item.labelKey ? t(item.labelKey) : item.label}</div>
                </button>
              ))}
              <button
                onClick={() => hairColorInputRef.current?.click()}
                className={`relative rounded-lg border-2 border-dashed p-2 text-center transition-[background-color,border-color,box-shadow,color] aspect-[3/4] flex flex-col items-center justify-center overflow-hidden ${
                  hairColorReferenceUrl
                    ? "studio-checkerboard border-[var(--codex-accent)] text-[var(--codex-accent)] ring-2 ring-[var(--codex-accent-25)] shadow-[0_14px_34px_var(--codex-accent-18)]"
                    : "border-[var(--codex-border)] dark:border-white/10 bg-[var(--codex-surface-soft)]/70 dark:bg-white/4 text-codex-faint dark:text-codex-faint hover:border-[var(--codex-accent-35)] hover:bg-[var(--codex-accent-08)] hover:text-[var(--codex-accent)]"
                }`}
              >
                {hairColorReferenceUrl ? (
                  <>
                    <RawPreviewImage src={hairColorReferenceUrl} className="absolute inset-0 h-full w-full object-contain p-1" alt={t("uploadedHairColorRef")} />
                    <span className="absolute inset-0 bg-gradient-to-t from-codex-ink/38 via-transparent to-transparent" />
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white dark:bg-white/5 text-emerald-500 shadow">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <span className="absolute bottom-0 left-0 right-0 bg-white/94 dark:bg-white/5 px-1.5 py-1 text-center backdrop-blur">
                      <span className="block text-[11px] font-bold text-[var(--codex-accent)]">{t("uploadedHairColorRef")}</span>
                      <span className="block truncate text-[12px] text-codex-faint">{t("hairColorToneOnly")}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5 mb-1.5" />
                    <span className="text-[11px] font-bold">{t("uploadHairColorRef")}</span>
                    <span className="mt-1 max-w-[78px] text-[12px] leading-snug text-codex-faint">
                      {t("hairColorNoIdentity")}
                    </span>
                    <span className="mt-1 text-[11px] text-codex-faint">≤15MB</span>
                  </>
                )}
              </button>
            </div>
            {hairColorReferenceUrl && (
              <button
                onClick={() => setHairColorReferenceUrl(null)}
                className="mt-2 text-xs text-codex-faint hover:text-red-500"
              >
                {t("removeHairColorRef")}
              </button>
            )}
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-codex-ink">
              <Cpu className="w-4 h-4 text-[var(--codex-accent)]" /> {t("genModel")}
            </h3>
            <StudioModelSelector
              models={modelOptions}
              value={aiModel}
              onChange={setAiModel}
              ariaLabel={t("genModel")}
              getMeta={(model) => `${model.desc} · ${t("currentCredits", { credits: getCreditCost(model.value, imageSize, aspectRatio) })}`}
            />
          </section>

          <section>
            <AspectRatioSelector
              options={MODEL_ASPECTS}
              value={aspectRatio}
              onChange={setAspectRatio}
              ariaLabel={t("aspectRatio")}
            />
          </section>

          {imageSizes.length > 1 && (
            <section>
              <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("resolution")}</h3>
              <StudioOptionGrid
                options={imageSizes.map((size) => ({
                  value: size,
                  label: `${size} · ${getCreditCost(aiModel, size, aspectRatio)}${t("creditsUnit")}`,
                }))}
                value={imageSize}
                onChange={setImageSize}
                ariaLabel={t("resolution")}
              />
            </section>
          )}

          <section>
            <StudioPromptTextarea
              title={t("extraPrompt")}
              badge={t("optional")}
              value={userExtraPrompt}
              onChange={(event) => setUserExtraPrompt(event.target.value)}
              placeholder={t("extraPromptPlaceholder")}
              rows={4}
              description={t("extraPromptDescription")}
            />
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3 text-codex-ink">{t("genCount")}</h3>
            <GenerationCountField
              value={genCount}
              onChange={setGenCount}
              ariaLabel={t("genCount")}
            />
          </section>
        </div>

        <StudioRunBar
          summary={t("runSummary", { count: referenceUrls.length, cost, genCount })}
          estimateLabel={isGenerating ? t("runBar.estimateGenerating") : t("runBar.estimateReady", { count: genCount })}
          costLabel={authIsAnonymous ? t("loginToViewCredits") : t("runCost", { totalCost, credits: credits ?? "-" })}
          disabled={isGenerating || Boolean(runDisabledReason)}
          disabledReason={runDisabledReason}
          primaryLabel={authIsAnonymous ? t("loginToGenerate") : isGenerating ? t("generating") : t("generateN", { count: genCount })}
          isLoading={isGenerating}
          onPrimaryAction={() => generate()}
        />
      </div>

      <div className="studio-canvas min-h-[260px] sm:min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title={t("guideTitle")}
              subtitle={t("guideSubtitle")}
              imageSrc="https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/exclusive-model-02.png"
              imageAlt={t("guideAlt")}
              steps={[
                { title: t("guideStep1Title"), desc: t("guideStep1Desc") },
                { title: t("guideStep2Title"), desc: t("guideStep2Desc") },
                { title: t("guideStep3Title"), desc: t("guideStep3Desc") },
              ]}
            />
          </div>
        )}

        {(isGenerating || resultUrls.length > 0) && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            <div className="flex min-h-0 flex-1 items-start justify-start">
              <ResultImageGrid
                urls={resultUrls}
                filenamePrefix="model"
                extension="jpg"
                expectedCount={activeResultExpectedCount}
                isGenerating={isGenerating}
                inputThumbnails={activeResultMeta?.inputThumbnails.length ? activeResultMeta.inputThumbnails : taskInputThumbnails}
                createdAt={activeResultMeta?.createdAt}
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
              filenamePrefix="model"
              extension="jpg"
              actions={MODEL_PREVIEW_ACTIONS}
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

        <StudioImagePreviewDialog
          open={referencePreviewIndex !== null}
          onClose={() => setReferencePreviewIndex(null)}
          session={referencePreviewSession}
          selectedIndex={referencePreviewIndex || 0}
          onSelectedIndexChange={setReferencePreviewIndex}
          filenamePrefix="model-reference"
          extension="jpg"
        />
      </div>

      <StudioRulesPopover
        open={showModelRules}
        style={rulesPopoverStyle}
        width={760}
        demoGridClassName="md:grid-cols-3"
        shortTitle={MODEL_UPLOAD_RULE.shortTitle}
        title={MODEL_UPLOAD_RULE.title}
        specText={MODEL_UPLOAD_RULE.uploadSpecText}
        hoverPreviewLabel={t("hoverPreview")}
        tryItLabel={t("tryIt")}
        demos={MODEL_UPLOAD_RULE.demos.map((demo) => ({
          key: demo.title,
          title: demo.title,
          description: demo.description,
          imageUrls: demo.imageUrls,
          onApply: () => applyRuleDemo(demo),
        }))}
        examples={MODEL_UPLOAD_RULE.deprecatedImages.map((image) => ({
          key: image.title,
          title: image.title,
          imageUrl: image.url,
        }))}
        examplesTitle={MODEL_UPLOAD_RULE.deprecatedTitle}
        onMouseEnter={cancelRulesHide}
        onMouseLeave={scheduleRulesHide}
      />

    </div>
  );
}
