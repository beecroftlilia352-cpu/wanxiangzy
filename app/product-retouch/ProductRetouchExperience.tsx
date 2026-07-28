"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  CircleDollarSign,
  ImageIcon,
  Square,
  SunMedium,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { LoadingStage } from "@/components/studio/LoadingStage";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { StudioControlPanel } from "@/components/studio/StudioControlPanel";
import {
  StudioGenerationCountSelector,
  StudioModelSelector,
  StudioOptionGrid,
  StudioPromptTextarea,
} from "@/components/studio/StudioFormControls";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { StudioMultiImageUpload } from "@/components/studio/StudioMultiImageUpload";
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
import { NativeSelect } from "@/components/ui/native-select";
import {
  ProductRetouchBatchToolbar,
  type ProductRetouchFilter,
} from "@/features/product-retouch/ProductRetouchBatchToolbar";
import { ProductRetouchBatchGrid } from "@/features/product-retouch/ProductRetouchBatchGrid";
import { downloadProductRetouchZip } from "@/features/product-retouch/download";
import {
  isTerminalBatch,
  useProductRetouchBatch,
} from "@/features/product-retouch/useProductRetouchBatch";
import {
  getCreditCost,
  getSupportedImageSizes,
  type AspectRatio,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import {
  PRODUCT_RETOUCH_CATEGORY_OPTIONS,
  PRODUCT_RETOUCH_EXAMPLE_IMAGES,
  PRODUCT_RETOUCH_MAX_SOURCES,
  PRODUCT_RETOUCH_MODE_OPTIONS,
  type ProductRetouchBatch,
  type ProductRetouchMode,
  type ProductRetouchOutput,
  type ProductRetouchSource,
} from "@/lib/product-retouch";
import {
  createGenericImagePreviewSession,
  type ImagePreviewSession,
} from "@/lib/studio-image-preview";
import { isTaskRunning, type TaskQueueItem } from "@/lib/task-queue";
import { showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import {
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB,
  uploadImage,
} from "@/lib/utils";

const MODEL_OPTIONS: ReadonlyArray<{
  value: LingyaModel;
  label: string;
  desc: string;
  icon: string;
  badge?: string;
}> = [
  {
    value: "gpt-image-2",
    label: "GPT Image 2",
    desc: "商品一致性与精修细节优先",
    icon: "/model-icons/openai.svg",
    badge: "推荐",
  },
  {
    value: "nano-banana-pro",
    label: "Nano Banana Pro",
    desc: "复杂材质与商业布光",
    icon: "/model-icons/gemini.png",
  },
  {
    value: "nano-banana-2",
    label: "Nano Banana 2",
    desc: "速度优先的批量生产",
    icon: "/model-icons/gemini.png",
  },
] as const;

const ASPECT_OPTIONS: ReadonlyArray<{
  value: AspectRatio;
  label: string;
  description: string;
}> = [
  { value: "auto", label: "原图比例", description: "跟随商品原图" },
  { value: "1:1", label: "1:1", description: "平台主图" },
  { value: "3:4", label: "3:4", description: "竖版商品图" },
  { value: "4:5", label: "4:5", description: "电商信息流" },
] as const;

const MODE_OPTIONS = PRODUCT_RETOUCH_MODE_OPTIONS.map((option) => ({
  ...option,
  icon: option.value === "faithful-retouch"
    ? WandSparkles
    : option.value === "marketplace-white"
      ? Square
      : SunMedium,
}));

const SIZE_OPTIONS = [
  { value: "1K", label: "1K", description: "快速预览" },
  { value: "2K", label: "2K", description: "生产默认" },
  { value: "4K", label: "4K", description: "大图交付" },
] as const;

type PreviewState = {
  session: ImagePreviewSession;
  selectedIndex: number;
};

export function ProductRetouchExperience() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const restoredIdRef = useRef<string | null>(null);
  const submissionRef = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const [sources, setSources] = useState<ProductRetouchSource[]>([]);
  const [mode, setMode] = useState<ProductRetouchMode>("faithful-retouch");
  const [category, setCategory] = useState("auto");
  const [variantsPerSource, setVariantsPerSource] = useState(1);
  const [model, setModel] = useState<LingyaModel>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [imageSize, setImageSize] = useState<ImageSize>("2K");
  const [userInstruction, setUserInstruction] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [batch, setBatch] = useState<ProductRetouchBatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProductRetouchFilter>("all");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [retryingOutputId, setRetryingOutputId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingSourceIndex, setDownloadingSourceIndex] = useState<number | null>(null);
  const {
    authChecked,
    isAuthenticated,
    credits,
    setCredits,
    refreshAuth,
  } = useStudioAuth();
  const taskQueue = useTaskQueueGeneration({
    module: "productRetouch",
    title: "商品精修",
    defaultExpectedCount: 1,
    applyPath: "/product-retouch",
  });
  const { loadBatch, watchBatch, stopWatching } = useProductRetouchBatch();

  const expectedCount = Math.max(1, sources.length * variantsPerSource);
  const unitCreditCost = getCreditCost(model, imageSize, aspectRatio);
  const totalCost = sources.length * variantsPerSource * unitCreditCost;
  const selectedCategoryLabel = PRODUCT_RETOUCH_CATEGORY_OPTIONS.find(
    (option) => option.value === category
  )?.label || "自动识别";
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
        "商品精修批次失败，可重试失败结果",
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
        toast.info(watchError instanceof Error ? watchError.message : "批次仍在后台生产");
      });
    }
    return loaded;
  }, [applyBatchUpdate, loadBatch, watchBatch]);

  useEffect(() => {
    const restoreFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("apply") || params.get("task");
      if (!id || restoredIdRef.current === id) return;
      restoredIdRef.current = id;
      void restoreBatch(id).catch((restoreError) => {
        setError(restoreError instanceof Error ? restoreError.message : "历史批次恢复失败");
      });
    };
    const onHistoryApply = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      const id = detail?.id;
      if (!id) return;
      restoredIdRef.current = id;
      void restoreBatch(id).catch((restoreError) => {
        setError(restoreError instanceof Error ? restoreError.message : "历史批次恢复失败");
      });
    };
    restoreFromLocation();
    window.addEventListener("wanxiang:history-apply", onHistoryApply);
    return () => window.removeEventListener("wanxiang:history-apply", onHistoryApply);
  }, [restoreBatch]);

  const handleFiles = useCallback(async (incomingFiles: File[]) => {
    if (isUploading) return;
    const remaining = PRODUCT_RETOUCH_MAX_SOURCES - sources.length;
    if (remaining <= 0) {
      toast.error(`单批最多 ${PRODUCT_RETOUCH_MAX_SOURCES} 张商品图`);
      return;
    }

    const accepted = incomingFiles.filter((file) => {
      const validType = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
      if (!validType) toast.error(`${file.name} 不是 PNG、JPEG 或 WebP`);
      else if (file.size > MAX_FILE_SIZE) toast.error(`${file.name} 超过 ${MAX_FILE_SIZE_MB}MB`);
      return validType && file.size <= MAX_FILE_SIZE;
    }).slice(0, remaining);
    if (!accepted.length) return;
    if (incomingFiles.length > remaining) {
      toast.info(`本次仅添加前 ${remaining} 张，单批上限 ${PRODUCT_RETOUCH_MAX_SOURCES} 张`);
    }

    setIsUploading(true);
    toast.info(`正在上传 ${accepted.length} 张商品图…`);
    try {
      const uploaded = await uploadFilesWithConcurrency(accepted, 4);
      const valid = uploaded.flatMap((result, index) => {
        if (result.status !== "fulfilled") {
          toast.error(`${accepted[index].name} 上传失败`);
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
      if (valid.length) toast.success(`${valid.length} 张商品图已准备`);
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
      toast.info(`${example.title}示例已在当前批次中`);
      return;
    }
    if (sources.length >= PRODUCT_RETOUCH_MAX_SOURCES) {
      toast.error(`单批最多 ${PRODUCT_RETOUCH_MAX_SOURCES} 张商品图`);
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
    toast.success(`已加入${example.title}示例`);
  }, [isGenerating, isUploading, sources]);

  const handleGenerate = useCallback(async () => {
    if (!authChecked) return;
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (!sources.length) {
      toast.error("请先上传商品原图");
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
    setFilter("all");
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
        throw new Error(typeof payload.error === "string" ? payload.error : "商品精修批次创建失败");
      }

      if (typeof payload.credits_remaining === "number") setCredits(payload.credits_remaining);
      if (typeof payload.generation_id !== "string" || typeof payload.batch_id !== "string") {
        throw new Error("商品精修批次响应无效");
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
      const message = generationError instanceof Error ? generationError.message : "商品精修失败";
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
        throw new Error(typeof payload.error === "string" ? payload.error : "单项重试失败");
      }
      if (typeof payload.credits_remaining === "number") setCredits(payload.credits_remaining);
      toast.success("失败结果已重新排队");
      setIsGenerating(true);
      await watchBatch(batch.id, {
        expectedCount: batch.expectedCount,
        onUpdate: applyBatchUpdate,
      });
    } catch (retryError) {
      toast.error(retryError instanceof Error ? retryError.message : "单项重试失败");
    } finally {
      setRetryingOutputId(null);
    }
  }, [applyBatchUpdate, batch, retryingOutputId, setCredits, watchBatch]);

  const handleDownloadAll = useCallback(async () => {
    if (!batch || downloadingAll) return;
    setDownloadingAll(true);
    try {
      await downloadProductRetouchZip({
        batchId: batch.id,
        outputs: batch.outputs,
      });
      toast.success("批次 ZIP 已开始下载");
    } catch (downloadError) {
      toast.error(downloadError instanceof Error ? downloadError.message : "批次下载失败");
    } finally {
      setDownloadingAll(false);
    }
  }, [batch, downloadingAll]);

  const handleDownloadGroup = useCallback(async (
    sourceIndex: number,
    outputs: ProductRetouchOutput[],
  ) => {
    if (!batch || downloadingSourceIndex !== null) return;
    setDownloadingSourceIndex(sourceIndex);
    try {
      await downloadProductRetouchZip({
        batchId: batch.id,
        outputs,
        scopeLabel: outputs[0]?.sourceFilename || `商品-${sourceIndex + 1}`,
      });
      toast.success("本组 ZIP 已开始下载");
    } catch (downloadError) {
      toast.error(downloadError instanceof Error ? downloadError.message : "本组下载失败");
    } finally {
      setDownloadingSourceIndex(null);
    }
  }, [batch, downloadingSourceIndex]);

  const openSourcePreview = useCallback((url: string, index: number) => {
    const source = sources[index];
    setPreview({
      selectedIndex: 0,
      session: createGenericImagePreviewSession({
        module: "productRetouch",
        title: "商品原图",
        urls: [url],
        expectedCount: 1,
        statusGroup: "completed",
        references: [{ url, label: source?.filename || `商品 ${index + 1}`, role: "source" }],
        resultTitlePrefix: source?.filename || "商品原图",
      }),
    });
  }, [sources]);

  const openOutputPreview = useCallback((output: ProductRetouchOutput, selectedIndex: number) => {
    if (!batch) return;
    const group = batch.outputs
      .filter((item) => item.sourceIndex === output.sourceIndex)
      .sort((a, b) => a.variantIndex - b.variantIndex);
    setPreview({
      selectedIndex,
      session: createGenericImagePreviewSession({
        module: "productRetouch",
        title: `${output.sourceFilename} · 商品精修`,
        urls: group.map((item) => item.resultUrl || ""),
        expectedCount: group.length,
        statusGroup: isTerminalBatch(batch) ? "completed" : "running",
        taskId: batch.parentGenerationId,
        createdAt: batch.createdAt,
        references: [{ url: output.sourceUrl, label: "商品原图", role: "product" }],
        promptText: batch.userInstruction,
        selectedIndex,
        resultTitlePrefix: "精修结果",
        metaItems: [
          { label: "模式", value: getModeLabel(batch.mode) },
          { label: "模型", value: batch.model },
          { label: "尺寸", value: batch.imageSize },
          { label: "Skill", value: batch.skillVersion },
        ],
        errors: group.map((item) => item.error),
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
      setError(restoreError instanceof Error ? restoreError.message : "任务恢复失败");
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
      setError(restoreError instanceof Error ? restoreError.message : "任务恢复失败");
      return true;
    }
  }, [restoreBatch]);

  const runDisabledReason = isUploading
    ? "商品图仍在上传"
    : !sources.length
      ? "请先上传至少一张商品原图"
      : credits !== null && credits < totalCost
        ? `灵点不足，需要 ${totalCost} 灵点`
        : undefined;
  const resultStatus: StudioResultStatus = batch
    ? batch.outputs.length ? "results" : "loading"
    : error
      ? "error"
      : isGenerating
        ? "loading"
        : "empty";

  return (
    <>
      <StudioPageShell
        activeFeature="productRetouch"
        taskRail={(
          <ModuleTaskRail
            module="productRetouch"
            moduleLabel="商品精修"
            onContinue={() => {
              stopWatching();
              setBatch(null);
              setError(null);
              setIsGenerating(false);
            }}
            onRunningTask={handleRunningTask}
            onCompletedTask={handleCompletedTask}
          />
        )}
        header={(
          <ModuleHeader
            title="商品精修"
            tooltip="单批最多 30 张商品原图，每张可生产 1–4 个精修结果。系统严格保护商品结构、颜色、材质与品牌信息。"
            actions={<Badge variant="secondary">批量生产</Badge>}
          />
        )}
        controlPanel={(
          <StudioControlPanel>
            <div className="space-y-4 p-4">
              <StudioUploadSection
                title="商品原图"
                inputRef={inputRef}
                multiple
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                isDragging={isDragging}
                setDragging={setIsDragging}
                onFiles={handleFiles}
              >
                {(openFileDialog) => (
                  <StudioMultiImageUpload
                    urls={sources.map((source) => source.url)}
                    maxCount={PRODUCT_RETOUCH_MAX_SOURCES}
                    title="已上传商品图"
                    emptyTitle="上传商品原图"
                    description="每张原图独立生成结果，可批量查看、重试和下载。"
                    emptyDescription="支持 PNG、JPEG、WebP，单张不超过 15MB。"
                    itemLabelPrefix="商品"
                    loading={isUploading}
                    disabled={isGenerating}
                    isDragging={isDragging}
                    summary={sources.length ? `${sources.length} 张原图 · 预计输出 ${expectedCount} 张` : undefined}
                    footnote="单批最多 30 张；“试一试”提供的是待修原片，方便直接比较精修效果。"
                    tips={[
                      { label: "一致性", text: "Logo、文字、颜色、材质、结构和比例会被设为强保护项。" },
                      { label: "建议", text: "主体完整、对焦清晰、无遮挡的图片更适合批量生产。" },
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
                      label: "试一试",
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
                title="精修方案"
                description="按成片用途选择；所有方案均严格保留商品结构、颜色、材质、Logo 和文字。"
              >
                <StudioOptionGrid
                  options={MODE_OPTIONS}
                  value={mode}
                  onChange={setMode}
                  columns={1}
                  textAlign="start"
                  descriptionMode="wrap"
                  ariaLabel="商品精修模式"
                />
                <details className="group mt-4 rounded-xl border border-slate-200/80 bg-white/45 dark:border-white/10 dark:bg-white/5">
                  <summary
                    className="flex min-h-11 touch-manipulation cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2 dark:hover:bg-white/10 [&::-webkit-details-marker]:hidden"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-codex-ink">商品类型</span>
                      <span className="mt-0.5 block truncate text-[11px] font-semibold text-codex-faint">
                        {category === "auto" ? "自动识别（推荐）" : `已选择：${selectedCategoryLabel}`}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-codex-faint transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                    />
                  </summary>
                  <div className="space-y-2 border-t border-slate-200/70 px-3 pb-3 pt-3 dark:border-white/10">
                    <Label htmlFor="product-retouch-category">识别不准确时手动选择</Label>
                    <NativeSelect
                      id="product-retouch-category"
                      name="product-retouch-category"
                      autoComplete="off"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      disabled={isGenerating}
                    >
                      {PRODUCT_RETOUCH_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </NativeSelect>
                    <p className="text-[11px] font-medium leading-4 text-codex-faint">
                      通常保持自动识别即可；商品类型只用于匹配材质和细节保护规则。
                    </p>
                  </div>
                </details>
              </StudioSection>

              <StudioSection
                title="生产设置"
                description="默认使用高一致性的 GPT Image 2 与 2K 输出。"
              >
                <StudioModelSelector
                  models={MODEL_OPTIONS}
                  value={model}
                  onChange={setModel}
                  columns={2}
                  ariaLabel="商品精修模型"
                />
                <div className="mt-4">
                  <Label className="mb-2 block">画面比例</Label>
                  <StudioOptionGrid
                    options={ASPECT_OPTIONS}
                    value={aspectRatio}
                    onChange={setAspectRatio}
                    columns={2}
                    ariaLabel="商品精修画面比例"
                  />
                </div>
                <div className="mt-4">
                  <Label className="mb-2 block">分辨率</Label>
                  <StudioOptionGrid
                    value={imageSize}
                    options={SIZE_OPTIONS.map((option) => ({
                      ...option,
                      disabled: !getSupportedImageSizes(model, aspectRatio).includes(option.value),
                    }))}
                    onChange={setImageSize}
                    ariaLabel="商品精修分辨率"
                    columns={3}
                  />
                </div>
                <div className="mt-4">
                  <Label className="mb-2 block">每张原图生成</Label>
                  <StudioGenerationCountSelector
                    value={variantsPerSource}
                    onChange={setVariantsPerSource}
                    counts={[1, 2, 3, 4]}
                    unit="个"
                    ariaLabel="每张商品原图生成数量"
                  />
                </div>
              </StudioSection>

              <StudioPromptTextarea
                title="补充要求"
                badge="可选"
                value={userInstruction}
                maxLength={1200}
                rows={4}
                onChange={(event) => setUserInstruction(event.target.value)}
                placeholder="例如：保留原包装反光，阴影更轻，不改变瓶身文字。"
                description="补充要求不能覆盖商品一致性和安全约束。"
                disabled={isGenerating}
              />
            </div>
          </StudioControlPanel>
        )}
        runBar={(
          <StudioRunBar
            summary={(
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{sources.length} 张原图</span>
                <span>× {variantsPerSource} 个结果</span>
                <span>· {imageSize}</span>
              </span>
            )}
            costLabel={(
              <span className="inline-flex items-center gap-1">
                <CircleDollarSign className="h-3.5 w-3.5" />
                {totalCost} 灵点
              </span>
            )}
            disabled={Boolean(runDisabledReason) || isGenerating}
            disabledReason={runDisabledReason}
            primaryLabel={isGenerating ? `生产中 ${batchProgress}%` : `开始精修 ${sources.length ? expectedCount : 0} 张`}
            isLoading={isGenerating}
            onPrimaryAction={handleGenerate}
          />
        )}
        canvas={(
          <StudioResultViewport
            status={resultStatus}
            emptyState={(
              <div className="studio-empty-stage flex min-h-[260px] items-center justify-center px-4 py-6 sm:min-h-[360px] lg:h-full">
                <PreviewGuide
                  title="批量精修商品图"
                  subtitle="一次上传多张商品原图，选择统一精修规范，结果按商品分组交付。"
                  icon={<ImageIcon className="h-9 w-9" />}
                  steps={[
                    {
                      title: "上传商品原图",
                      desc: "单批最多 30 张，每件商品上传一张主体完整、对焦清晰的原图。",
                    },
                    {
                      title: "选择精修规范",
                      desc: "统一设置精修模式、模型、比例和每件商品的输出数量。",
                    },
                    {
                      title: "查看批次结果",
                      desc: "结果按商品分组，可预览、单项重试，或按商品和整批下载。",
                    },
                  ]}
                />
              </div>
            )}
            loadingState={(
              <LoadingStage
                genCount={Math.min(expectedCount, 8)}
                progress={batchProgress}
                moduleName="商品精修"
                statusText="正在拆分批次并分配生产槽位"
                aspectRatio={aspectRatio}
                referenceImages={sources.slice(0, 4).map((source) => ({
                  url: source.url,
                  label: source.filename,
                }))}
                estimatedTime="大批次会在后台持续生产，可从任务栏恢复"
                metaItems={[`批次共 ${expectedCount} 个结果`, `${model} · ${imageSize}`]}
              />
            )}
            errorState={(
              <ErrorStage
                error={error || "商品精修批次创建失败"}
                onRetry={handleGenerate}
                isGenerating={isGenerating}
                retryDisabled={!sources.length || isGenerating}
                notice="如果任务已经进入后台，请先从左侧任务栏恢复，避免重复创建批次。"
              />
            )}
            results={batch ? (
              <div className="h-full overflow-y-auto p-3 sm:p-4">
                <ProductRetouchBatchToolbar
                  batch={batch}
                  filter={filter}
                  onFilterChange={setFilter}
                  onDownloadAll={handleDownloadAll}
                  downloading={downloadingAll}
                />
                <div className="mt-4">
                  <ProductRetouchBatchGrid
                    batch={batch}
                    filter={filter}
                    onPreview={openOutputPreview}
                    onRetry={handleRetryOutput}
                    onDownloadGroup={handleDownloadGroup}
                    retryingOutputId={retryingOutputId}
                    downloadingSourceIndex={downloadingSourceIndex}
                  />
                </div>
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
    </>
  );
}

function getModeLabel(mode: ProductRetouchMode) {
  return PRODUCT_RETOUCH_MODE_OPTIONS.find((option) => option.value === mode)?.label || "标准精修";
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
