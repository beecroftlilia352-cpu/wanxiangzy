"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { ClientPortal } from "@/components/ClientPortal";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { StudioGenerationCountSelector, StudioModelSelector, StudioOptionGrid, StudioPromptTextarea } from "@/components/studio/StudioFormControls";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { fetchHistoryApplyDetail, getHistoryApplyFailureMessage, isHistoryApplyRowFailed, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import { GARMENT_TYPE_OPTIONS, type GarmentType } from "@/lib/garment-types";
import { showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import {
  DEFAULT_MATERIAL_ENHANCEMENT_LEVEL,
  MATERIAL_ENHANCEMENT_LEVELS,
  buildMaterialEnhancementPrompt,
  normalizeMaterialEnhancementLevel,
  type MaterialEnhancementLevel,
} from "@/lib/material-enhancement";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import { createGenericImagePreviewSession, type ImagePreviewAction } from "@/lib/studio-image-preview";
import { FAILED_RETRY_NOTICE, buildPartialFailureDetail, summarizeGenerationError } from "@/lib/studio-generation-feedback";
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

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "最高4K", badge: "推荐", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "最高4K", badge: "最新", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/openai.svg" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "最高4K", badge: "推荐", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
];

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
  const [error, setError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const costPerImage = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = costPerImage * genCount;
  const authIsAnonymous = authChecked && !isAuthenticated;
  const taskInputThumbnails = useMemo(() => [sourceUrl, garmentUrl].filter(Boolean), [sourceUrl, garmentUrl]);
  const taskQueue = useTaskQueueGeneration({
    module: "materialEnhancement",
    title: "材质增强",
    defaultExpectedCount: genCount,
    applyPath: "/material-enhancement",
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
      toastMessage: `正在补位重试第 ${index + 1} 张，失败图已退款，完成后会回填到当前结果中...`,
    });
  }
  const previewSession = useMemo(
    () => createGenericImagePreviewSession({
      module: "materialEnhancement",
      title: "材质增强",
      urls: resultUrls,
      expectedCount: activeResultExpectedCount,
      isGenerating,
      statusGroup: isGenerating ? "running" : undefined,
      references: [
        ...(sourceUrl ? [{ url: sourceUrl, label: "原图", role: "source" as const }] : []),
        ...(garmentUrl ? [{ url: garmentUrl, label: "高清服装图", role: "garment" as const }] : []),
      ],
      promptText: userPrompt,
      metaItems: [
        { label: "服装类型", value: garmentType === "其他" ? customGarmentType : garmentType },
        { label: "增强强度", value: enhancementLevelLabel },
        { label: "模型", value: aiModel },
        { label: "比例", value: aspectRatio },
        { label: "分辨率", value: imageSize },
        { label: "生成数量", value: genCount },
      ],
      resultTitlePrefix: "材质增强结果",
      aspectRatio,
    }),
    [activeResultExpectedCount, aiModel, aspectRatio, customGarmentType, enhancementLevelLabel, garmentType, garmentUrl, genCount, imageSize, isGenerating, resultUrls, sourceUrl, userPrompt]
  );

  const runDisabledReason = !sourceUrl
    ? "请先上传需要增强的原图"
    : !garmentUrl
      ? "请上传高清服装图作为材质参考"
      : garmentType === "其他" && !customGarmentType.trim()
        ? "请输入自定义服装类型"
        : credits !== null && credits < totalCost
          ? `灵点不足，生成需要 ${totalCost} 灵点`
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
    setSourceName("历史原图");
    setGarmentUrl(payload.garmentUrl);
    setGarmentName("历史高清服装图");
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
    if (!options?.silent) toast.success("已套用历史参数");
  }

  async function handleUpload(files: FileList | File[], kind: "source" | "garment") {
    const file = Array.from(files)[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`图片不能超过 ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    if (kind === "source") {
      setSourceName(file.name);
      setIsUploadingSource(true);
    } else {
      setGarmentName(file.name);
      setIsUploadingGarment(true);
    }

    toast.info(kind === "source" ? "正在上传原图..." : "正在上传高清服装图...");
    try {
      const result = await uploadImage(file);
      if (kind === "source") {
        setSourceUrl(result.url);
        toast.success("原图已准备");
      } else {
        setGarmentUrl(result.url);
        toast.success("高清服装图已准备");
      }
    } catch {
      if (kind === "source") setSourceUrl("");
      else setGarmentUrl("");
      toast.error("图片上传失败，请重试");
    } finally {
      if (kind === "source") setIsUploadingSource(false);
      else setIsUploadingGarment(false);
    }
  }

  async function generate(finalPromptForRun?: string, options: MaterialEnhancementGenerateOptions = {}) {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error("请先登录");
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
      if (runDisabledReason.includes("灵点不足") && (credits === null || credits < runTotalCost)) {
        showInsufficientCreditsToast({ required: runTotalCost, balance: credits, onRecharge: () => router.push("/pricing") });
        return;
      }
      if (!runDisabledReason.includes("灵点不足")) {
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
        headers: { "Content-Type": "application/json" },
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
        if (res.status === 402) {
          const nextCredits = data.balance ?? 0;
          setCredits(nextCredits);
          if (userId) setCachedProfileCredits(userId, nextCredits);
        }
        throw new Error(data.error || "生成失败");
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

      let attempts = 0;
      while (attempts < 120) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts++;
        const fallbackProgress = Math.min(18 + attempts * 1.6, 92);
        let runningProgress = fallbackProgress;
        setProgress(fallbackProgress);

        const poll = await fetch(`/api/material-enhancement?generation_id=${data.generation_id}`);
        if (!poll.ok) continue;
        const pollData = await poll.json();
        if (Array.isArray(pollData.result_urls) && pollData.result_urls.length) {
          latestTaskResultUrls = mergeRetryResultUrls(retryPreviousResultUrls, retryResultIndex, pollData.result_urls, displayExpectedCount);
          setResultUrls(latestTaskResultUrls);
        }
        const nextProgress = Number(pollData.progress);
        if (Number.isFinite(nextProgress)) {
          runningProgress = Math.min(Math.max(Math.round(nextProgress), 0), 99);
          setProgress(runningProgress);
        }
        taskQueue.markRunning(activeTaskId, {
          expectedCount: displayExpectedCount,
          inputThumbnails: taskInputThumbnails,
          resultThumbnails: latestTaskResultUrls,
          resultCount: latestTaskResultUrls.filter(Boolean).length,
          progress: runningProgress,
          status: pollData.status || "processing",
        });

        if (pollData.status === "completed") {
          const finalUrls = mergeRetryResultUrls(
            retryPreviousResultUrls,
            retryResultIndex,
            Array.isArray(pollData.result_urls) ? pollData.result_urls : latestTaskResultUrls,
            displayExpectedCount
          );
          latestTaskResultUrls = finalUrls;
          const finalResultCount = finalUrls.filter(Boolean).length;
          const partialFailure = pollData.partial_failure && typeof pollData.partial_failure === "object"
            ? pollData.partial_failure as { message?: unknown }
            : null;
          const completedError = pollData.error || partialFailure?.message || "";
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
            toast.warning(`材质增强部分完成：已生成 ${finalResultCount}/${displayExpectedCount} 张，失败图片灵点会自动退回`);
          } else {
            toast.success("材质增强完成");
          }
          return;
        }
        if (pollData.status === "failed") {
          throw new Error(pollData.error || "生成失败");
        }
      }
      throw new Error("生成超时");
    } catch (err: unknown) {
      const message = summarizeGenerationError(err instanceof Error ? err.message : "操作失败");
      setError(message);
      taskQueue.markFailed(activeTaskId, message, {
        expectedCount: displayExpectedCount,
        inputThumbnails: taskInputThumbnails,
        resultThumbnails: latestTaskResultUrls,
        resultCount: latestTaskResultUrls.filter(Boolean).length,
      });
      if (message.includes("灵点不足")) {
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
      applyHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), {
        silent: session.reason === "restore",
      });
      if (item.statusGroup === "failed" || isHistoryApplyRowFailed(detail.row)) {
        setError(getHistoryApplyFailureMessage(detail.row, item.error || "生成失败"));
      }
      return true;
    } catch (err) {
      if (session.signal.aborted || !session.isCurrent()) return true;
      toast.error(err instanceof Error ? err.message : "历史任务加载失败");
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
        moduleLabel="材质增强"
        onContinue={resetForm}
        onRunningTask={handleRunningTask}
        onCompletedTask={handleCompletedTask}
      />

      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          <ModuleHeader
            title="材质增强"
            tooltip="上传最终画面原图和高清服装图，只增强服装区域的面料、走线、五金和细节质感，保持人物、姿势、背景不变。"
          />

          <StudioUploadSection
            title="上传原图"
            inputRef={sourceInputRef}
            isDragging={isDraggingSource}
            setDragging={setIsDraggingSource}
            onFiles={(files) => handleUpload(files, "source")}
          >
            {(openFileDialog, dragContext) => (
              <StudioUploadTile
                title="上传需要增强的成片"
                description="人物、姿势、背景和构图以这张图为准，只增强服装区域。"
                imageUrl={sourceUrl || null}
                imageAlt="已上传原图"
                isDragging={isDraggingSource}
                loading={isUploadingSource}
                onUploadClick={openFileDialog}
                onLibraryClick={() => toast.info("作品库选择即将接入")}
                onPreview={sourceUrl ? () => setLightboxSrc(sourceUrl) : undefined}
                onRemove={sourceUrl ? () => {
                  setSourceUrl("");
                  setSourceName("");
                } : undefined}
                onDropFile={(file) => handleUpload(file ? [file] : [], "source")}
                dragContext={dragContext}
                uploadLabel="从本地上传"
                libraryLabel="从作品选择"
                footnote={sourceUrl ? sourceName || "已上传原图" : "建议使用已成片或上身图，主体清楚、服装区域可见。"}
              />
            )}
          </StudioUploadSection>

          <StudioUploadSection
            title="上传高清服装图"
            inputRef={garmentInputRef}
            isDragging={isDraggingGarment}
            setDragging={setIsDraggingGarment}
            onFiles={(files) => handleUpload(files, "garment")}
          >
            {(openFileDialog, dragContext) => (
              <StudioUploadTile
                title="上传同款高清商品图"
                description="用于提取面料织法、走线、纽扣、拉链、logo 和材质细节。"
                imageUrl={garmentUrl || null}
                imageAlt="已上传高清服装图"
                isDragging={isDraggingGarment}
                loading={isUploadingGarment}
                onUploadClick={openFileDialog}
                onLibraryClick={() => toast.info("作品库选择即将接入")}
                onPreview={garmentUrl ? () => setLightboxSrc(garmentUrl) : undefined}
                onRemove={garmentUrl ? () => {
                  setGarmentUrl("");
                  setGarmentName("");
                } : undefined}
                onDropFile={(file) => handleUpload(file ? [file] : [], "garment")}
                dragContext={dragContext}
                uploadLabel="从本地上传"
                libraryLabel="从作品选择"
                footnote={garmentUrl ? garmentName || "已上传高清服装图" : "建议单件服装、纹理清晰、图案和细节完整。"}
              />
            )}
          </StudioUploadSection>

          <section>
            <h3 className="font-bold text-sm mb-3">服装类型</h3>
            <StudioOptionGrid
              options={GARMENT_TYPE_OPTIONS.map((type) => ({ value: type, label: type }))}
              value={garmentType}
              onChange={setGarmentType}
              columns={4}
              ariaLabel="服装类型"
            />
            {garmentType === "其他" && (
              <input
                value={customGarmentType}
                onChange={(event) => setCustomGarmentType(event.target.value)}
                placeholder="例如：围巾、帽子、礼服套装"
                className="studio-text-input mt-2"
              />
            )}
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">增强方式</h3>
            <StudioOptionGrid
              options={MATERIAL_ENHANCEMENT_LEVELS.map((item) => ({
                value: item.value,
                label: item.label,
                description: item.description,
              }))}
              value={enhancementLevel}
              onChange={setEnhancementLevel}
              columns={3}
              ariaLabel="增强方式"
            />
          </section>

          <StudioPromptTextarea
            title="补充要求"
            badge="可选"
            value={userPrompt}
            onChange={(event) => setUserPrompt(event.target.value)}
            placeholder="例如：重点增强牛仔斜纹和明线；保留原图暖色光线；logo 不要变形。"
            rows={4}
            description="补充要求只用于服装区域增强，不会改变人物、姿势、背景和画幅。"
          />

          <section>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--codex-accent)]" />生成模型</h3>
            <StudioModelSelector models={MODELS} value={aiModel} onChange={setAiModel} ariaLabel="生成模型" />
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">图片比例</h3>
            <StudioOptionGrid
              options={[
                { value: "auto", label: "智能" },
                { value: "3:4", label: "3:4 竖版" },
                { value: "4:5", label: "4:5 商品图" },
                { value: "1:1", label: "1:1 方图" },
              ] as const}
              value={aspectRatio}
              onChange={setAspectRatio}
              columns={3}
              ariaLabel="图片比例"
            />
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">分辨率</h3>
            <StudioOptionGrid
              options={imageSizes.map((size) => ({
                value: size,
                label: `${size} · ${getCreditCost(aiModel, size, aspectRatio)}灵点`,
              }))}
              value={imageSize}
              onChange={setImageSize}
              columns={2}
              ariaLabel="分辨率"
            />
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">生成数量</h3>
            <StudioGenerationCountSelector value={genCount} onChange={setGenCount} ariaLabel="生成数量" />
          </section>
        </div>

        <StudioRunBar
          summary={`${costPerImage} × ${genCount} 张`}
          costLabel={authIsAnonymous ? "登录后查看灵点" : `消耗 ${totalCost} · 余额 ${credits ?? "-"}`}
          disabled={isGenerating || Boolean(runDisabledReason)}
          disabledReason={runDisabledReason}
          primaryLabel={authIsAnonymous ? "登录后生成" : isGenerating ? "生成中..." : `生成 ${genCount} 张`}
          isLoading={isGenerating}
          onPrimaryAction={() => generate()}
        />
      </div>

      <div className="studio-canvas min-h-[260px] sm:min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title="商用服装材质增强"
              subtitle="用高清商品图修复上身图中的面料、走线、五金和 logo 细节，保持人物和场景稳定。"
              imageSrc="https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/model-white-top-denim-shorts.jpg"
              imageAlt="材质增强指引"
              steps={[
                { title: "上传原图", desc: "原图决定人物、姿势、背景、光线和最终构图。" },
                { title: "上传高清服装图", desc: "高清图只提供面料、走线、logo、五金和细节参考。" },
                { title: "增强服装区域", desc: "输出更清晰可信的商用成片，不重绘人物和背景。" },
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
                markMissingAsFailed={hasCompletedPartialResults}
                missingFailureLabel="本张生成失败"
                missingFailureDetail={partialFailureMessage}
                missingFailureActionLabel="重试本张"
                onMissingFailureAction={handleRetryFailedResult}
                missingFailureActionDisabled={retryDisabled}
                onOpen={(_, index) => setPreviewIndex(index)}
              />
            </div>
            <StudioImagePreviewDialog
              open={previewIndex !== null}
              onClose={() => setPreviewIndex(null)}
              session={previewSession}
              selectedIndex={previewIndex || 0}
              onSelectedIndexChange={setPreviewIndex}
              filenamePrefix="material-enhancement"
              actions={MATERIAL_PREVIEW_ACTIONS}
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
            retryLabel="重新生成"
            notice={FAILED_RETRY_NOTICE}
          />
        )}
      </div>

      {lightboxSrc && (
        <ClientPortal>
          <div className="fixed inset-0 z-[180] flex cursor-zoom-out items-center justify-center bg-slate-950/66 p-4 backdrop-blur-xl sm:p-8" onClick={() => setLightboxSrc(null)}>
            <RawPreviewImage src={lightboxSrc} alt="预览图" className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_32px_120px_rgba(0,0,0,0.45)]" />
            <button onClick={() => setLightboxSrc(null)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/85 bg-white/90 text-slate-700 shadow-[0_12px_34px_rgba(15,23,42,0.22)] backdrop-blur transition-colors hover:bg-white hover:text-slate-950 sm:right-6 sm:top-6">
              <X className="h-5 w-5" />
            </button>
          </div>
        </ClientPortal>
      )}
    </div>
  );
}
