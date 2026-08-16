"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {CircleDollarSign,
  ImageIcon,
  Square,
  SunMedium,
  WandSparkles, Wand2, Settings2,} from "lucide-react";
import { toast } from "sonner";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { StudioControlPanel } from "@/components/studio/StudioControlPanel";
import {
  StudioModelSelector,
  StudioOptionGrid,
} from "@/components/studio/StudioFormControls";
import { AspectRatioSelector } from "@/components/studio/AspectRatioSelector";
import { ResolutionSelector } from "@/components/studio/ResolutionSelector";
import { GenerationCountField } from "@/components/studio/GenerationCountField";
import { PromptTextarea } from "@/components/studio/PromptTextarea";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { StudioMediaLightbox } from "@/components/studio/StudioMediaLightbox";
import { MultiImageUploadV2 } from "@/components/studio/MultiImageUploadV2";
import { StudioPageShell } from "@/components/studio/StudioPageShell";
import { StudioResultViewport, type StudioResultStatus } from "@/components/studio/StudioResultViewport";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioSection } from "@/components/studio/StudioSection";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ProductRetouchBatchGrid } from "@/features/product-retouch/ProductRetouchBatchGrid";
import {
  isTerminalBatch,
  useProductRetouchBatch,
} from "@/features/product-retouch/useProductRetouchBatch";
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
import {PRODUCT_RETOUCH_EXAMPLE_IMAGES,
  PRODUCT_RETOUCH_MAX_SOURCES,
  PRODUCT_RETOUCH_MODE_OPTIONS,
  normalizeProductRetouchInstruction,
  normalizeProductRetouchMode,
  normalizeProductRetouchSources,
  normalizeProductRetouchVariants,
  type ProductRetouchBatch,
  type ProductRetouchMode,
  type ProductRetouchOutput,
  type ProductRetouchSource,} from "@/lib/product-retouch";
import {
  createGenericImagePreviewSession,
  type ImagePreviewSession,
} from "@/lib/studio-image-preview";
import {
  fetchHistoryApplyDetail,
  takeApplyDetail,
} from "@/lib/history-apply";
import { isTaskRunning, type TaskQueueItem } from "@/lib/task-queue";
import { showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import {
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB,
  uploadImage,
} from "@/lib/utils";
import { useStudioImageModelOptions } from "@/lib/studio-models";

const ASPECT_OPTIONS: ReadonlyArray<{
  value: AspectRatio;
  label: string;
  labelKey?: string;
  description: string;
  descriptionKey?: string;
}> = [
  { value: "auto", label: "原图比例", labelKey: "aspect.autoLabel", description: "跟随商品原图", descriptionKey: "aspect.auto" },
  { value: "1:1", label: "1:1", description: "平台主图", descriptionKey: "aspect.square" },
  { value: "3:4", label: "3:4", description: "竖版商品图", descriptionKey: "aspect.portrait" },
  { value: "4:5", label: "4:5", description: "电商信息流", descriptionKey: "aspect.feed" },
] as const;

const MODE_OPTIONS = PRODUCT_RETOUCH_MODE_OPTIONS.map((option) => ({
  ...option,
  icon: option.value === "faithful-retouch"
    ? WandSparkles
    : option.value === "marketplace-white"
      ? Square
      : SunMedium,
}));

const SIZE_OPTIONS: ReadonlyArray<{
  value: ImageSize;
  label: string;
  description: string;
  descriptionKey?: string;
}> = [
  { value: "1K", label: "1K", description: "快速预览", descriptionKey: "size.preview" },
  { value: "2K", label: "2K", description: "生产默认", descriptionKey: "size.default" },
  { value: "4K", label: "4K", description: "大图交付", descriptionKey: "size.large" },
];

type PreviewState = {
  session: ImagePreviewSession;
  selectedIndex: number;
};

export function ProductRetouchExperience() {
  const t = useTranslations("ProductRetouch");
  const displayModels = useStudioImageModelOptions();
  const displayAspects = useMemo(() => ASPECT_OPTIONS.map((m) => {
    const { labelKey } = m;
    return {
      value: m.value,
      label: labelKey ? t(labelKey) : m.label,
    };
  }), [t]);
  const displaySizes = useMemo(() => SIZE_OPTIONS.map((m) => {
    const { descriptionKey, ...rest } = m;
    return {
      ...rest,
      description: descriptionKey ? t(descriptionKey) : m.description,
    };
  }), [t]);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const restoredIdRef = useRef<string | null>(null);
  const submissionRef = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const [sources, setSources] = useState<ProductRetouchSource[]>([]);
  const [mode, setMode] = useState<ProductRetouchMode>("faithful-retouch");
  const [category] = useState("auto");
  const [variantsPerSource, setVariantsPerSource] = useState(1);
  const [model, setModel] = useState<LingyaModel>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [imageSize, setImageSize] = useState<ImageSize>("2K");
  const [userInstruction, setUserInstruction] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [batch, setBatch] = useState<ProductRetouchBatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [sourceLightboxSrc, setSourceLightboxSrc] = useState<string | null>(null);
  const [retryingOutputId, setRetryingOutputId] = useState<string | null>(null);
  const {
    authChecked,
    isAuthenticated,
    credits,
    setCredits,
    refreshAuth,
  } = useStudioAuth();
  const taskQueue = useTaskQueueGeneration({
    module: "productRetouch",
    title: t("moduleName"),
    defaultExpectedCount: 1,
    applyPath: "/product-retouch",
  });
  const { loadBatch, watchBatch, stopWatching } = useProductRetouchBatch();

  const expectedCount = Math.max(1, sources.length * variantsPerSource);
  const unitCreditCost = getCreditCost(model, imageSize, aspectRatio);
  const totalCost = sources.length * variantsPerSource * unitCreditCost;
  const terminalCount = (batch?.completedCount || 0) + (batch?.failedCount || 0);
  const batchProgress = batch?.expectedCount
    ? Math.round((terminalCount / batch.expectedCount) * 100)
    : isGenerating ? 8 : 0;

  useEffect(() => {
    const supported = getSupportedImageSizes(model, aspectRatio);
    if (!supported.includes(imageSize)) {
      setImageSize(supported.includes("2K") ? "2K" : supported[0]);
    }
  }, [aspectRatio, imageSize, model]);

  const applyBatchUpdate = useCallback((nextBatch: ProductRetouchBatch) => {
    setBatch(nextBatch);
    setError(null);
    const resultUrls = nextBatch.outputs
      .flatMap((output) => output.resultUrl ? [output.resultUrl] : [])
      .slice(0, 4);
    const completed = isTerminalBatch(nextBatch);
    const progress = nextBatch.expectedCount > 0
      ? Math.round(((nextBatch.completedCount + nextBatch.failedCount) / nextBatch.expectedCount) * 100)
      : 0;
    if (completed && nextBatch.status === "failed") {
      taskQueue.markFailed(
        nextBatch.parentGenerationId,
        t("batch.failedRetryable"),
        {
          expectedCount: nextBatch.expectedCount,
          resultCount: nextBatch.completedCount,
          resultThumbnails: resultUrls,
          inputThumbnails: nextBatch.outputs.slice(0, 8).map((output) => output.sourceUrl),
        },
      );
    } else if (completed) {
      taskQueue.markCompleted(nextBatch.parentGenerationId, {
        expectedCount: nextBatch.expectedCount,
        resultCount: nextBatch.completedCount,
        resultThumbnails: resultUrls,
        inputThumbnails: nextBatch.outputs.slice(0, 8).map((output) => output.sourceUrl),
      });
    } else {
      taskQueue.markRunning(nextBatch.parentGenerationId, {
        progress,
        expectedCount: nextBatch.expectedCount,
        resultCount: nextBatch.completedCount,
        resultThumbnails: resultUrls,
        inputThumbnails: nextBatch.outputs.slice(0, 8).map((output) => output.sourceUrl),
      });
    }
    if (completed) {
      setIsGenerating(false);
      taskQueue.refresh();
    }
  }, [taskQueue]);

  const restoreBatch = useCallback(async (
    id: string,
    options?: { signal?: AbortSignal; watch?: boolean },
  ) => {
    const loaded = await loadBatch(id, options?.signal);
    applyBatchUpdate(loaded);
    if (options?.watch !== false && !isTerminalBatch(loaded)) {
      setIsGenerating(true);
      void watchBatch(loaded.id, {
        signal: options?.signal,
        expectedCount: loaded.expectedCount,
        onUpdate: applyBatchUpdate,
      }).catch((watchError) => {
        if (options?.signal?.aborted) return;
        setIsGenerating(false);
        toast.info(watchError instanceof Error ? watchError.message : t("batch.stillProducing"));
      });
    }
    return loaded;
  }, [applyBatchUpdate, loadBatch, watchBatch]);

  // 历史套用：从 payload 复原参数 + sources，再叠加可用的 URL / 事件渠道。
  // 应用于 /history 跳过来的 ?apply=<id> 以及 wanxiang:history-apply 事件，两条路径最后都走同一个 restoreBatch。
  const applyHistoryPayload = useCallback((payload: Extract<import("@/lib/history-apply").HistoryJobPayload, { kind: "productRetouch" }>) => {
    setMode(normalizeProductRetouchMode(payload.mode));
    setVariantsPerSource(normalizeProductRetouchVariants(payload.variantsPerSource));
    setModel(normalizeLingyaModel(payload.aiModel));
    setAspectRatio(normalizeAspectRatio(payload.aspectRatio, "1:1"));
    setImageSize(normalizeImageSize(payload.aiModel, payload.imageSize, normalizeAspectRatio(payload.aspectRatio, "1:1")));
    setUserInstruction(normalizeProductRetouchInstruction(payload.userInstruction));
    toast.success(t("historyParamsApplied"));
  }, []);

  // 复原 sources：batch.outputs 上同一 sourceIndex 的 clientId/url/filename 是一致的；
  // 从已加载的 batch 里抽出每组第一行作为该 source 的复原记录（按 sourceIndex 升序）。
  const sourcesFromBatch = useCallback((batchOutputs: ProductRetouchOutput[] | undefined) => {
    if (!Array.isArray(batchOutputs) || !batchOutputs.length) return null;
    const seen = new Map<number, ProductRetouchSource>();
    for (const output of batchOutputs) {
      if (seen.has(output.sourceIndex)) continue;
      seen.set(output.sourceIndex, {
        clientId: output.sourceClientId,
        url: output.sourceUrl,
        filename: output.sourceFilename,
      });
    }
    const ordered = Array.from(seen.entries())
      .sort(([a], [b]) => a - b)
      .map(([, source]) => source);
    return normalizeProductRetouchSources(ordered);
  }, []);

  useEffect(() => {
    const restoreFromLocation = async () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("apply") || params.get("task");
      if (!id || restoredIdRef.current === id) return;
      restoredIdRef.current = id;
      try {
        const cached = await takeApplyDetail("productRetouch");
        if (cached?.payload?.kind === "productRetouch") {
          applyHistoryPayload(cached.payload);
        } else {
          const fetched = await fetchHistoryApplyDetail(id, "productRetouch");
          if (fetched?.payload?.kind === "productRetouch") {
            applyHistoryPayload(fetched.payload);
          }
        }
        const loaded = await restoreBatch(id);
        const restored = sourcesFromBatch(loaded.outputs);
        if (restored && restored.length) setSources(restored);
      } catch (restoreError) {
        setError(restoreError instanceof Error ? restoreError.message : t("historyBatchRestoreFailed"));
      }
    };
    const onHistoryApply = async (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      const id = detail?.id;
      if (!id) return;
      restoredIdRef.current = id;
      try {
        const fetched = await fetchHistoryApplyDetail(id, "productRetouch");
        if (fetched?.payload?.kind === "productRetouch") {
          applyHistoryPayload(fetched.payload);
        }
        const loaded = await restoreBatch(id);
        const restored = sourcesFromBatch(loaded.outputs);
        if (restored && restored.length) setSources(restored);
      } catch (restoreError) {
        setError(restoreError instanceof Error ? restoreError.message : t("historyBatchRestoreFailed"));
      }
    };
    restoreFromLocation();
    window.addEventListener("wanxiang:history-apply", onHistoryApply);
    return () => window.removeEventListener("wanxiang:history-apply", onHistoryApply);
  }, [applyHistoryPayload, restoreBatch, sourcesFromBatch]);

  const handleFiles = useCallback(async (incomingFiles: File[]) => {
    if (isUploading) return;
    const remaining = PRODUCT_RETOUCH_MAX_SOURCES - sources.length;
    if (remaining <= 0) {
      toast.error(t("upload.maxSources", { count: PRODUCT_RETOUCH_MAX_SOURCES }));
      return;
    }

    const accepted = incomingFiles.filter((file) => {
      const validType = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
      if (!validType) toast.error(t("upload.invalidType", { name: file.name }));
      else if (file.size > MAX_FILE_SIZE) toast.error(t("upload.oversized", { name: file.name, mb: MAX_FILE_SIZE_MB }));
      return validType && file.size <= MAX_FILE_SIZE;
    }).slice(0, remaining);
    if (!accepted.length) return;
    if (incomingFiles.length > remaining) {
      toast.info(t("upload.onlyFirst", { remaining, max: PRODUCT_RETOUCH_MAX_SOURCES }));
    }

    setIsUploading(true);
    toast.info(t("upload.uploading", { count: accepted.length }));
    try {
      const uploaded = await uploadFilesWithConcurrency(accepted, 4);
      const valid = uploaded.flatMap((result, index) => {
        if (result.status !== "fulfilled") {
          toast.error(t("upload.uploadFailed", { name: accepted[index].name }));
          return [];
        }
        return [{
          clientId: crypto.randomUUID(),
          url: result.value.url,
          filename: accepted[index].name,
        }];
      });
      setSources((current) => {
        const existing = new Set(current.map((source) => source.url));
        return [
          ...current,
          ...valid.filter((source) => !existing.has(source.url)),
        ].slice(0, PRODUCT_RETOUCH_MAX_SOURCES);
      });
      if (valid.length) toast.success(t("upload.prepared", { count: valid.length }));
    } finally {
      setIsUploading(false);
      setIsDragging(false);
    }
  }, [isUploading, sources.length]);

  const applyExample = useCallback((image: { url: string; title: string }) => {
    if (isUploading || isGenerating) return;
    const example = PRODUCT_RETOUCH_EXAMPLE_IMAGES.find((item) => item.url === image.url);
    if (!example) return;
    if (sources.some((source) => source.url === example.url)) {
      toast.info(t("example.alreadyAdded", { title: example.title }));
      return;
    }
    if (sources.length >= PRODUCT_RETOUCH_MAX_SOURCES) {
      toast.error(t("upload.maxSources", { count: PRODUCT_RETOUCH_MAX_SOURCES }));
      return;
    }
    setSources((current) => [
      ...current,
      {
        clientId: `product-retouch-example-${example.id}`,
        url: example.url,
        filename: example.filename,
      },
    ]);
    toast.success(t("example.added", { title: example.title }));
  }, [isGenerating, isUploading, sources]);

  const handleGenerate = useCallback(async () => {
    if (!authChecked) return;
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("common.pleaseLogin"));
      router.push("/login");
      return;
    }
    if (!sources.length) {
      toast.error(t("generate.pleaseUploadSource"));
      return;
    }
    if (credits !== null && credits < totalCost) {
      showInsufficientCreditsToast({
        required: totalCost,
        balance: credits,
        onRecharge: () => router.push("/pricing"),
      });
      return;
    }

    stopWatching();
    setIsGenerating(true);
    setError(null);
    setBatch(null);
    const optimistic = taskQueue.startTask({
      expectedCount,
      inputThumbnails: sources.slice(0, 8).map((source) => source.url),
      progress: 5,
    });
    let serverTaskId: string | null = null;
    const fingerprint = JSON.stringify({
      sources: sources.map(({ clientId, url }) => ({ clientId, url })),
      mode,
      category,
      variantsPerSource,
      model,
      aspectRatio,
      imageSize,
      userInstruction,
    });
    const submission = submissionRef.current?.fingerprint === fingerprint
      ? submissionRef.current
      : { fingerprint, requestId: crypto.randomUUID() };
    submissionRef.current = submission;

    try {
      const response = await fetch("/api/product-retouch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: submission.requestId,
          sources,
          mode,
          category,
          variantsPerSource,
          model,
          aspectRatio,
          imageSize,
          userInstruction,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status < 500 && submissionRef.current?.requestId === submission.requestId) {
          submissionRef.current = null;
        }
        if (response.status === 401) router.push("/login");
        if (response.status === 402 && typeof payload.balance === "number") {
          setCredits(payload.balance);
        }
        throw new Error(typeof payload.error === "string" ? payload.error : t("batch.createFailed"));
      }

      if (typeof payload.credits_remaining === "number") setCredits(payload.credits_remaining);
      if (typeof payload.generation_id !== "string" || typeof payload.batch_id !== "string") {
        throw new Error(t("batch.invalidResponse"));
      }
      const generationId = payload.generation_id as string;
      if (submissionRef.current?.requestId === submission.requestId) {
        submissionRef.current = null;
      }
      serverTaskId = generationId;
      taskQueue.replaceWithServerTask(optimistic.id, {
        id: generationId,
        expectedCount,
        inputThumbnails: sources.slice(0, 8).map((source) => source.url),
        progress: 8,
        applyUrl: `/product-retouch?apply=${encodeURIComponent(generationId)}`,
      });
      await watchBatch(payload.batch_id, {
        expectedCount,
        onUpdate: applyBatchUpdate,
      });
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : t("batch.failed");
      setError(message);
      setIsGenerating(false);
      if (serverTaskId) {
        taskQueue.markRunning(serverTaskId, { progress: Math.max(batchProgress, 8) });
      } else {
        taskQueue.markFailed(optimistic.id, message);
      }
    }
  }, [
    applyBatchUpdate,
    aspectRatio,
    authChecked,
    batchProgress,
    category,
    credits,
    expectedCount,
    imageSize,
    isAuthenticated,
    mode,
    model,
    refreshAuth,
    router,
    setCredits,
    sources,
    stopWatching,
    taskQueue,
    totalCost,
    userInstruction,
    variantsPerSource,
    watchBatch,
  ]);

  const handleRetryOutput = useCallback(async (output: ProductRetouchOutput) => {
    if (!batch || retryingOutputId) return;
    setRetryingOutputId(output.id);
    try {
      const response = await fetch(`/api/product-retouch/outputs/${encodeURIComponent(output.id)}/retry`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 402 && typeof payload.balance === "number") setCredits(payload.balance);
        throw new Error(typeof payload.error === "string" ? payload.error : t("retry.itemFailed"));
      }
      if (typeof payload.credits_remaining === "number") setCredits(payload.credits_remaining);
      toast.success(t("retry.requeued"));
      setIsGenerating(true);
      await watchBatch(batch.id, {
        expectedCount: batch.expectedCount,
        onUpdate: applyBatchUpdate,
      });
    } catch (retryError) {
      toast.error(retryError instanceof Error ? retryError.message : t("retry.itemFailed"));
    } finally {
      setRetryingOutputId(null);
    }
  }, [applyBatchUpdate, batch, retryingOutputId, setCredits, watchBatch]);

  const openSourcePreview = useCallback((url: string) => {
    setSourceLightboxSrc(url);
  }, []);

  const openOutputPreview = useCallback((output: ProductRetouchOutput, selectedIndex: number) => {
    if (!batch) return;
    const group = batch.outputs
      .filter((item) => item.sourceIndex === output.sourceIndex)
      .sort((a, b) => a.variantIndex - b.variantIndex);
    setPreview({
      selectedIndex,
      session: createGenericImagePreviewSession({
        module: "productRetouch",
        title: t("preview.title", { filename: output.sourceFilename }),
        urls: group.map((item) => item.resultUrl || ""),
        expectedCount: group.length,
        statusGroup: isTerminalBatch(batch) ? "completed" : "running",
        taskId: batch.parentGenerationId,
        createdAt: batch.createdAt,
        references: [{ url: output.sourceUrl, label: t("preview.sourceImage"), role: "product" }],
        promptText: batch.userInstruction,
        selectedIndex,
        resultTitlePrefix: t("preview.resultPrefix"),
        metaItems: [
          { label: t("meta.mode"), value: getModeLabel(batch.mode) },
          { label: t("meta.model"), value: batch.model },
          { label: t("meta.size"), value: batch.imageSize },
          { label: t("meta.skill"), value: batch.skillVersion },
        ],
        errors: group.map((item) => item.error),
        aspectRatio: batch.aspectRatio,
      }),
    });
  }, [batch]);

  const handleRunningTask = useCallback(async (
    item: TaskQueueItem,
    session: TaskSelectionSession,
  ) => {
    setError(null);
    setIsGenerating(true);
    try {
      await restoreBatch(item.id, { signal: session.signal });
    } catch (restoreError) {
      if (!session.isCurrent()) return;
      setIsGenerating(false);
      setError(restoreError instanceof Error ? restoreError.message : t("task.restoreFailed"));
    }
  }, [restoreBatch]);

  const handleCompletedTask = useCallback(async (
    item: TaskQueueItem,
    session: TaskSelectionSession,
  ) => {
    try {
      await restoreBatch(item.id, { signal: session.signal, watch: isTaskRunning(item) });
      return session.isCurrent();
    } catch (restoreError) {
      if (!session.isCurrent()) return true;
      setError(restoreError instanceof Error ? restoreError.message : t("task.restoreFailed"));
      return true;
    }
  }, [restoreBatch]);

  const runDisabledReason = isUploading
    ? t("run.stillUploading")
    : !sources.length
      ? t("run.needSource")
      : credits !== null && credits < totalCost
        ? t("run.insufficientCredits", { cost: totalCost })
        : undefined;
  const resultStatus: StudioResultStatus = batch
    ? "results"
    : error
      ? "error"
      : isGenerating
        ? "results"
        : "empty";

  return (
    <>
      <StudioPageShell
        activeFeature="productRetouch"
        taskRail={(
          <ModuleTaskRail
            module="productRetouch"
            moduleLabel={t("moduleName")}
            onContinue={() => {
              stopWatching();
              setBatch(null);
              setError(null);
              setIsGenerating(false);
              setSources([]);
              setMode("faithful-retouch");
              setVariantsPerSource(1);
              setModel("gpt-image-2");
              setAspectRatio("1:1");
              setImageSize("2K");
              setUserInstruction("");
                      setPreview(null);
            }}
            onRunningTask={handleRunningTask}
            onCompletedTask={handleCompletedTask}
          />
        )}
        header={(
          <ModuleHeader
            title={t("moduleName")}
            tooltip={t("header.tooltip")}
            actions={<Badge variant="secondary">{t("header.batchBadge")}</Badge>}
          />
        )}
        controlPanel={(
          <StudioControlPanel>
            <div className="space-y-4 p-4">
              <StudioUploadSection
                title={t("upload.sourceTitle")}
                inputRef={inputRef}
                multiple
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                isDragging={isDragging}
                setDragging={setIsDragging}
                onFiles={handleFiles}
              >
                {(openFileDialog) => (
                  <MultiImageUploadV2
                    urls={sources.map((source) => source.url)}
                    maxCount={PRODUCT_RETOUCH_MAX_SOURCES}
                    title={t("upload.uploadedTitle")}
                    emptyHint={t("upload.emptyTitle")}
                    itemLabelPrefix={t("upload.itemLabelPrefix")}
                    loading={isUploading}
                    disabled={isGenerating}
                    isDragging={isDragging}
                    summary={sources.length ? t("upload.summary", { count: sources.length, expected: expectedCount }) : undefined}
                    footnote={t("upload.footnote")}
                    tips={[
                      { label: t("upload.tipConsistencyLabel"), text: t("upload.tipConsistency") },
                      { label: t("upload.tipAdviceLabel"), text: t("upload.tipAdvice") },
                    ]}
                    onUploadClick={openFileDialog}
                    onPreview={openSourcePreview}
                    onRemove={(_, index) => setSources((current) => current.filter((__, itemIndex) => itemIndex !== index))}
                    onMove={(fromIndex, toIndex) => setSources((current) => {
                      if (fromIndex === toIndex
                        || fromIndex < 0
                        || toIndex < 0
                        || fromIndex >= current.length
                        || toIndex >= current.length) return current;
                      const next = [...current];
                      const [moved] = next.splice(fromIndex, 1);
                      next.splice(toIndex, 0, moved);
                      return next;
                    })}
                    onClear={() => setSources([])}
                    examples={{
                      label: t("common.tryIt"),
                      images: PRODUCT_RETOUCH_EXAMPLE_IMAGES.map((example) => ({
                        url: example.url,
                        title: example.title,
                      })),
                      disabled: sources.length >= PRODUCT_RETOUCH_MAX_SOURCES,
                      onSelect: applyExample,
                    }}
                  />
                )}
              </StudioUploadSection>

              <StudioSection
                title={t("section.planTitle")}
                description={t("section.planDesc")}
                icon={<Wand2 className="h-4 w-4" />}
              >
                <StudioOptionGrid
                  options={MODE_OPTIONS}
                  value={mode}
                  onChange={setMode}
                  columns={1}
                  textAlign="start"
                  descriptionMode="wrap"
                  ariaLabel={t("section.modeAria")}
                />
              </StudioSection>

              <StudioSection
                title={t("section.settingsTitle")}
                description={t("section.settingsDesc")}
                icon={<Settings2 className="h-4 w-4" />}
              >
                <StudioModelSelector
                  models={displayModels}
                  value={model}
                  onChange={setModel}
                  columns={2}
                  ariaLabel={t("section.modelAria")}
                />
                <div className="mt-4">
                  <Label className="mb-2 block">{t("section.aspectLabel")}</Label>
                  <AspectRatioSelector
                    options={displayAspects}
                    value={aspectRatio}
                    onChange={setAspectRatio}
                    ariaLabel={t("section.aspectAria")}
                  />
                </div>
                <ResolutionSelector
                  className="mt-4"
                  title={t("section.resolutionLabel")}
                  value={imageSize}
                  options={displaySizes.map((option) => ({
                    ...option,
                    disabled: !getSupportedImageSizes(model, aspectRatio).includes(option.value),
                  }))}
                  onChange={setImageSize}
                  ariaLabel={t("section.resolutionAria")}
                />
                <GenerationCountField
                  className="mt-4"
                  title={t("section.perSourceLabel")}
                  label={t("section.perSourceLabel")}
                  value={variantsPerSource}
                  onChange={setVariantsPerSource}
                  counts={[1, 2, 3, 4]}
                  unit={t("section.perSourceUnit")}
                  ariaLabel={t("section.perSourceAria")}
                />
              </StudioSection>

              <PromptTextarea
                title={t("prompt.title")}
                badge={t("prompt.badge")}
                value={userInstruction}
                maxLength={1200}
                rows={4}
                onChange={(event) => setUserInstruction(event.target.value)}
                placeholder={t("prompt.placeholder")}
                description={t("prompt.desc")}
                disabled={isGenerating}
                onClear={() => setUserInstruction("")}
              />
            </div>
          </StudioControlPanel>
        )}
        runBar={(
          <StudioRunBar
            summary={(
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{t("run.sourceCount", { count: sources.length })}</span>
                <span>{t("run.variantCount", { count: variantsPerSource })}</span>
                <span>· {imageSize}</span>
              </span>
            )}
            estimateLabel={isGenerating ? t("runBar.estimateGenerating") : t("runBar.estimateReady", { count: expectedCount })}
            costLabel={(
              <span className="inline-flex items-center gap-1">
                <CircleDollarSign className="h-3.5 w-3.5" />
                {totalCost} {t("common.lingpoints")}
              </span>
            )}
            disabled={Boolean(runDisabledReason) || isGenerating}
            disabledReason={runDisabledReason}
            primaryLabel={isGenerating ? t("run.producing", { progress: batchProgress }) : t("run.start", { count: sources.length ? expectedCount : 0 })}
            isLoading={isGenerating}
            onPrimaryAction={handleGenerate}
          />
        )}
        canvas={(
          <StudioResultViewport
            status={resultStatus}
            loadingState={null}
            emptyState={(
              <div className="studio-empty-stage flex min-h-[260px] items-center justify-center px-4 py-6 sm:min-h-[360px] lg:h-full">
                <PreviewGuide
                  title={t("guide.title")}
                  subtitle={t("guide.subtitle")}
                  icon={<ImageIcon className="h-9 w-9" />}
                  steps={[
                    {
                      title: t("guide.step1Title"),
                      desc: t("guide.step1Desc"),
                    },
                    {
                      title: t("guide.step2Title"),
                      desc: t("guide.step2Desc"),
                    },
                    {
                      title: t("guide.step3Title"),
                      desc: t("guide.step3Desc"),
                    },
                  ]}
                />
              </div>
            )}
            errorState={(
              <ErrorStage
                error={error || t("batch.createFailed")}
                onRetry={handleGenerate}
                isGenerating={isGenerating}
                retryDisabled={!sources.length || isGenerating}
                notice={t("batch.restoreNotice")}
              />
            )}
            results={batch ? (
              <div className="h-full overflow-y-auto p-3 sm:p-4">
                <ProductRetouchBatchGrid
                  batch={batch}
                  onPreview={openOutputPreview}
                  onRetry={handleRetryOutput}
                  retryingOutputId={retryingOutputId}
                />
              </div>
            ) : null}
          />
        )}
      />

      {preview ? (
        <StudioImagePreviewDialog
          open
          onClose={() => setPreview(null)}
          session={preview.session}
          filenamePrefix="product-retouch"
          selectedIndex={preview.selectedIndex}
          onSelectedIndexChange={(selectedIndex) => setPreview((current) => current ? { ...current, selectedIndex } : null)}
        />
      ) : null}

      <StudioMediaLightbox
        src={sourceLightboxSrc}
        alt={t("preview.sourceImageAlt")}
        onClose={() => setSourceLightboxSrc(null)}
      />
    </>
  );
}

function getModeLabel(mode: ProductRetouchMode) {
  return PRODUCT_RETOUCH_MODE_OPTIONS.find((option) => option.value === mode)?.label || "standard-retouch";
}

async function uploadFilesWithConcurrency(files: File[], concurrency: number) {
  const results: PromiseSettledResult<{ url: string }>[] = Array(files.length);
  let nextIndex = 0;
  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, concurrency), files.length) },
    async () => {
      while (nextIndex < files.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          const value = await uploadImage(files[index]);
          results[index] = { status: "fulfilled", value };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    },
  ));
  return results;
}
