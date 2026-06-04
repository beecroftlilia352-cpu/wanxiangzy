"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  Copy,
  RotateCcw,
  Activity,
  UserRoundCheck,
  Brush,
  ZoomIn,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ClientPortal } from "@/components/ClientPortal";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { StudioResultViewport, type StudioResultStatus } from "@/components/studio/StudioResultViewport";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import { StudioGenerationCountSelector, StudioModelSelector, StudioOptionGrid, StudioPromptTextarea } from "@/components/studio/StudioFormControls";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import {
  FACE_SWAP_LIBRARY,
  FACE_SWAP_NOTE,
  FACE_SWAP_SAMPLE_IMAGES,
  DEFAULT_FACE_SWAP_TEXTURE_ENHANCE,
  getFaceSwapUserPromptFromPayload,
  normalizeFaceSwapCount,
} from "@/lib/face-swap";
import {
  getCreditCost,
  getSupportedImageSizes,
  normalizeImageSize,
  type AspectRatio,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import {
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB,
  uploadImage,
} from "@/lib/utils";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { fetchHistoryApplyDetail, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";

const MODELS: Array<{ value: LingyaModel; label: string; desc: string; icon: string; badge?: string }> = [
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "最高4K", icon: "/model-icons/gemini.png", badge: "默认" },
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "最高4K", icon: "/model-icons/openai.svg", badge: "高质感" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "最高4K", icon: "/model-icons/gemini.png", badge: "推荐" },
];

const ASPECT_RATIOS: Array<{ value: AspectRatio; label: string }> = [
  { value: "3:4", label: "3:4 竖版" },
  { value: "4:3", label: "4:3 横版" },
  { value: "1:1", label: "1:1 方形" },
  { value: "16:9", label: "16:9 宽屏" },
  { value: "9:16", label: "9:16 手机" },
  { value: "2:3", label: "2:3" },
  { value: "3:2", label: "3:2" },
  { value: "4:5", label: "4:5" },
  { value: "5:4", label: "5:4" },
  { value: "21:9", label: "21:9" },
  { value: "auto", label: "自动/原图" },
];

type GenerationStatus = "idle" | "running" | "completed" | "failed";
type GenderFilter = "female" | "male";
type FaceSwapHistoryPayload = Extract<HistoryJobPayload, { kind: "faceSwap" }>;
type ActiveFaceSwapJob = {
  generationId: string;
  sourceUrl: string;
  faceUrl: string;
  resultUrls: string[];
  progress: number;
  status: GenerationStatus;
  userPrompt?: string;
  textureEnhance?: boolean;
};

export default function FaceSwapPage() {
  const router = useRouter();
  const originalInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipActiveRestoreRef = useRef(false);
  const historyApplyConsumedRef = useRef(false);

  const {
    authChecked,
    isAuthenticated,
    userId,
    credits,
    setCredits,
    refreshAuth,
  } = useStudioAuth();
  const [sourceUrl, setSourceUrl] = useState("");
  const [faceUrl, setFaceUrl] = useState("");
  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [textureEnhance, setTextureEnhance] = useState(DEFAULT_FACE_SWAP_TEXTURE_ENHANCE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("female");
  const [isUploadingOriginal, setIsUploadingOriginal] = useState(false);
  const [isUploadingFace, setIsUploadingFace] = useState(false);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [generationId, setGenerationId] = useState("");
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxCaption, setLightboxCaption] = useState("");
  const [activeQueueTask, setActiveQueueTask] = useState<TaskQueueItem | null>(null);

  const supportedSizes = useMemo(() => getSupportedImageSizes(aiModel, aspectRatio), [aiModel, aspectRatio]);
  const imageSizeValue = normalizeImageSize(aiModel, imageSize, aspectRatio);
  const unitCost = getCreditCost(aiModel, imageSizeValue, aspectRatio);
  const totalCost = unitCost * normalizeFaceSwapCount(genCount);
  const requestedFaceSwapCount = normalizeFaceSwapCount(genCount);
  const faceLibrary = FACE_SWAP_LIBRARY.filter((item) => item.gender === genderFilter);
  const validationHint = !sourceUrl
    ? "请先上传或选择原始模特图"
    : !faceUrl
      ? "请选择目标脸图"
      : sourceUrl === faceUrl
        ? "原始模特图和目标脸图不能是同一张"
        : credits !== null && credits < totalCost
          ? `积分不足，生成需要 ${totalCost} 积分`
          : "";
  const canGenerate = status !== "running" && !validationHint;
  const authIsAnonymous = authChecked && !isAuthenticated;
  const taskQueue = useTaskQueueGeneration({
    module: "faceSwap",
    title: "换脸",
    defaultExpectedCount: requestedFaceSwapCount,
    applyPath: "/face-swap",
  });

  const openLightbox = useCallback((src: string, caption = "") => {
    setLightboxSrc(src);
    setLightboxCaption(caption);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxSrc(null);
    setLightboxCaption("");
  }, []);

  useEffect(() => {
    if (!supportedSizes.includes(imageSize)) setImageSize(supportedSizes[0] || "1K");
  }, [supportedSizes, imageSize]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const detail = await takeApplyDetail("faceSwap");
      if (cancelled || !detail) return;
      const payload = detail.payload;
      historyApplyConsumedRef.current = true;
      setSourceUrl(payload.sourceUrl);
      setFaceUrl(payload.faceUrl);
      setAiModel(payload.aiModel);
      setAspectRatio(payload.aspectRatio);
      setImageSize(payload.imageSize);
      setPrompt(getFaceSwapUserPromptFromPayload(payload));
      setGenCount(normalizeFaceSwapCount(payload.genCount));
      setTextureEnhance(payload.textureEnhance === false ? false : DEFAULT_FACE_SWAP_TEXTURE_ENHANCE);
      setActiveQueueTask(null);
      setResultUrls(detail.resultUrls);
      setProgress(detail.resultUrls.length ? 100 : 0);
      setStatus(detail.resultUrls.length ? "completed" : "idle");
      setGenerationId("");
      setError("");
      toast.success("已套用历史换脸参数");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const resetGenerationForInputChange = useCallback(() => {
    skipActiveRestoreRef.current = true;
    clearPolling();
    setActiveQueueTask(null);
    setResultUrls([]);
    setProgress(0);
    setStatus("idle");
    setGenerationId("");
    setError("");
  }, [clearPolling]);

  const applyFaceSwapHistoryPayload = useCallback((payload: FaceSwapHistoryPayload, historyResultUrls: string[] = [], options?: { silent?: boolean }) => {
    clearPolling();
    historyApplyConsumedRef.current = true;
    skipActiveRestoreRef.current = true;
    setSourceUrl(payload.sourceUrl);
    setFaceUrl(payload.faceUrl);
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setPrompt(getFaceSwapUserPromptFromPayload(payload));
    setGenCount(normalizeFaceSwapCount(payload.genCount));
    setTextureEnhance(payload.textureEnhance === false ? false : DEFAULT_FACE_SWAP_TEXTURE_ENHANCE);
    setActiveQueueTask(null);
    setResultUrls(historyResultUrls);
    setProgress(historyResultUrls.length ? 100 : 0);
    setStatus(historyResultUrls.length ? "completed" : "idle");
    setGenerationId("");
    setError("");
    if (!options?.silent) toast.success("已套用历史换脸参数");
  }, [clearPolling]);

  const pollGeneration = useCallback(async (id: string, immediate = false) => {
    clearPolling();
    const run = async () => {
      try {
        const res = await fetch(`/api/face-swap?generation_id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "查询生成进度失败");

        const nextProgress = Number.isFinite(Number(data.progress)) ? Number(data.progress) : progress;
        const nextUrls = Array.isArray(data.result_urls) ? data.result_urls : [];
        const nextResultCount = nextUrls.filter(Boolean).length;
        const roundedProgress = Math.min(Math.max(Math.round(nextProgress), 0), 100);
        const inputThumbnails = [sourceUrl, faceUrl].filter(Boolean);
        setProgress(roundedProgress);
        if (nextUrls.length) setResultUrls(nextUrls);

        if (data.status === "completed") {
          setStatus("completed");
          setProgress(100);
          setResultUrls(nextUrls);
          const completedTask = taskQueue.markCompleted(id, {
            expectedCount: requestedFaceSwapCount,
            inputThumbnails,
            resultThumbnails: nextUrls,
            resultCount: nextResultCount,
          });
          setActiveQueueTask(completedTask);
          toast.success("换脸完成");
          return;
        }

        if (data.status === "failed") {
          setStatus("failed");
          const message = data.error || "换脸生成失败";
          setError(message);
          const failedTask = taskQueue.markFailed(id, message, {
            expectedCount: requestedFaceSwapCount,
            inputThumbnails,
            resultThumbnails: nextUrls,
          });
          setActiveQueueTask(failedTask);
          return;
        }

        setStatus("running");
        const runningTask = taskQueue.markRunning(id, {
          expectedCount: requestedFaceSwapCount,
          inputThumbnails,
          resultThumbnails: nextUrls,
          progress: roundedProgress,
          status: data.status,
        });
        setActiveQueueTask(runningTask);
        pollTimerRef.current = setTimeout(() => pollGeneration(id), 2200);
      } catch (err) {
        const message = err instanceof Error ? err.message : "查询生成进度失败";
        setStatus("failed");
        setError(message);
        const failedTask = taskQueue.markFailed(id, message, {
          expectedCount: requestedFaceSwapCount,
          inputThumbnails: [sourceUrl, faceUrl].filter(Boolean),
        });
        setActiveQueueTask(failedTask);
      }
    };
    if (immediate) void run();
    else pollTimerRef.current = setTimeout(run, 2200);
  }, [clearPolling, faceUrl, progress, requestedFaceSwapCount, sourceUrl, taskQueue, textureEnhance]);

  useEffect(() => {
    if (!isAuthenticated || status !== "idle" || generationId || sourceUrl || faceUrl) return;
    if (skipActiveRestoreRef.current) return;
    if (historyApplyConsumedRef.current) return;
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("apply")) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/face-swap?active=1", { cache: "no-store" });
        const data = await res.json().catch(() => ({})) as { job?: ActiveFaceSwapJob | null; error?: string };
        if (!res.ok || cancelled || !data.job?.generationId) return;

        const job = data.job;
        if (
          isLegacyRemoteAssetUrl(job.sourceUrl) ||
          isLegacyRemoteAssetUrl(job.faceUrl) ||
          (job.resultUrls || []).some(isLegacyRemoteAssetUrl)
        ) {
          return;
        }

        setGenerationId(job.generationId);
        setSourceUrl(job.sourceUrl);
        setFaceUrl(job.faceUrl);
        setResultUrls(job.resultUrls || []);
        setProgress(job.progress || 0);
        setTextureEnhance(Boolean(job.textureEnhance));
        setPrompt(getFaceSwapUserPromptFromPayload(job));
        setStatus("running");
        pollGeneration(job.generationId, true);
      } catch {
        // 恢复进行中任务失败不阻断正常使用。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [faceUrl, generationId, isAuthenticated, pollGeneration, sourceUrl, status]);

  useEffect(() => () => clearPolling(), [clearPolling]);

  async function handleUpload(file: File | undefined, kind: "source" | "face") {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传 PNG / JPG / WebP 图片");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`图片不能超过 ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    const setUploading = kind === "source" ? setIsUploadingOriginal : setIsUploadingFace;
    setUploading(true);
    try {
      const uploaded = await uploadImage(file);
      if (kind === "source") setSourceUrl(uploaded.url);
      else setFaceUrl(uploaded.url);
      resetGenerationForInputChange();
      toast.success(kind === "source" ? "原始模特图已上传" : "目标脸图已上传");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败，请重试");
    } finally {
      setUploading(false);
    }
  }

  async function generate() {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (!sourceUrl) {
      toast.error("请先上传或选择原始模特图");
      return;
    }
    if (!faceUrl) {
      toast.error("请先选择目标模特脸");
      return;
    }
    if (sourceUrl === faceUrl) {
      toast.error("原始模特图和目标脸图不能是同一张");
      return;
    }
    if (credits !== null && credits < totalCost) {
      toast.error(`积分不足，需要 ${totalCost}，当前 ${credits}`);
      return;
    }

    clearPolling();
    skipActiveRestoreRef.current = false;
    setActiveQueueTask(null);
    setStatus("running");
    setProgress(1);
    setResultUrls([]);
    setError("");
    const taskInputThumbnails = [sourceUrl, faceUrl].filter(Boolean);
    const provisionalTask = taskQueue.startTask({
      expectedCount: requestedFaceSwapCount,
      inputThumbnails: taskInputThumbnails,
      progress: 1,
    });
    setActiveQueueTask(provisionalTask);
    let activeTaskId = provisionalTask.id;

    try {
      const res = await fetch("/api/face-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_url: sourceUrl,
          face_url: faceUrl,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSizeValue,
          gen_count: normalizeFaceSwapCount(genCount),
          prompt,
          texture_enhance: textureEnhance,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          await refreshAuth();
          taskQueue.removeTask(activeTaskId);
          setActiveQueueTask(null);
          setStatus("idle");
          router.push("/login");
          return;
        }
        if (res.status === 402) {
          const nextCredits = data.balance ?? 0;
          setCredits(nextCredits);
          if (userId) setCachedProfileCredits(userId, nextCredits);
        }
        throw new Error(data.error || "提交换脸任务失败");
      }
      setGenerationId(data.generation_id);
      if (typeof data.generation_id === "string" && data.generation_id) {
        const serverTask = taskQueue.replaceWithServerTask(activeTaskId, {
          id: data.generation_id,
          expectedCount: requestedFaceSwapCount,
          inputThumbnails: taskInputThumbnails,
          status: data.status || "processing_tryon",
          progress: 5,
        });
        setActiveQueueTask(serverTask);
        activeTaskId = serverTask.id;
      }
      if (typeof data.credits_remaining === "number") {
        setCredits(data.credits_remaining);
        if (userId) setCachedProfileCredits(userId, data.credits_remaining);
      }
      pollGeneration(data.generation_id, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "提交换脸任务失败";
      setStatus("failed");
      setError(message);
      const failedTask = taskQueue.markFailed(activeTaskId, message, {
        expectedCount: requestedFaceSwapCount,
        inputThumbnails: taskInputThumbnails,
      });
      setActiveQueueTask(failedTask);
      toast.error(message);
    }
  }

  function clearAll() {
    skipActiveRestoreRef.current = true;
    clearPolling();
    setSourceUrl("");
    setFaceUrl("");
    setPrompt("");
    setTextureEnhance(DEFAULT_FACE_SWAP_TEXTURE_ENHANCE);
    setResultUrls([]);
    setProgress(0);
    setStatus("idle");
    setGenerationId("");
    setError("");
    setActiveQueueTask(null);
  }

  function handleRunningTask(item: TaskQueueItem) {
    setActiveQueueTask(item);
    const urls = safeTaskQueueUrls(item.resultThumbnails);
    const nextProgress = Number.isFinite(Number(item.progress)) ? Number(item.progress) : 8;
    setGenCount(normalizeFaceSwapCount(clampTaskExpectedCount(item, 1, 4)));
    clearPolling();
    setGenerationId(item.id);
    setStatus("running");
    setProgress(Math.min(Math.max(Math.round(nextProgress), 1), 99));
    setResultUrls(urls);
    setError("");
    pollGeneration(item.id, true);
  }

  async function handleCompletedTask(item: TaskQueueItem, session: TaskSelectionSession) {
    setActiveQueueTask(item);
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "faceSwap", session.signal);
      if (!session.isCurrent()) return true;
      applyFaceSwapHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), {
        silent: session.reason === "restore",
      });
      return true;
    } catch (err) {
      if (session.signal.aborted || !session.isCurrent()) return true;
      toast.error(err instanceof Error ? err.message : "历史任务加载失败");
      return true;
    }
  }

  const resultStatus: StudioResultStatus =
    status === "running" || resultUrls.length > 0 || activeQueueTask
      ? "results"
      : error
        ? "error"
        : "empty";
  const faceSwapInputThumbnails = (
    safeTaskQueueUrls(activeQueueTask?.inputThumbnails).length
      ? safeTaskQueueUrls(activeQueueTask?.inputThumbnails)
      : [sourceUrl, faceUrl]
  ).filter(Boolean);
  const faceSwapExpectedCount = activeQueueTask
    ? clampTaskExpectedCount(activeQueueTask, 1, 4, genCount)
    : status === "running"
      ? normalizeFaceSwapCount(genCount)
      : undefined;

  return (
    <div className="studio-workbench face-swap-workbench flex min-h-[calc(100dvh-64px)] flex-col lg:h-[calc(100vh-64px)] lg:flex-row">
      <FeatureTabs active="faceSwap" />
      <ModuleTaskRail
        module="faceSwap"
        moduleLabel="换脸"
        onContinue={clearAll}
        onRunningTask={handleRunningTask}
        onCompletedTask={handleCompletedTask}
      />

      <aside className="studio-parameters flex w-full flex-col overflow-visible border-b lg:w-[472px] lg:overflow-hidden lg:border-b-0 lg:border-r">
        <div className="studio-parameters-scroll flex-1 overflow-visible p-3 sm:p-5 lg:overflow-y-auto">
          <ModuleHeader
            title="换脸"
            tooltip="上传原始模特图与目标脸图，只迁移五官身份，保留原图肤色、发型、服装、姿势和场景。"
          />

          <StudioUploadSection
            title="原始模特图"
            inputRef={originalInputRef}
            onFiles={(files) => handleUpload(files[0], "source")}
          >
            {(openFileDialog, dragContext) => (
              <>
                <StudioUploadTile
                  title="上传需要处理的原图"
                  description="图1作为身体、服装和构图基础，建议主体完整、画面清晰。"
                  imageUrl={sourceUrl || null}
                  imageAlt="已上传的原始模特图"
                  loading={isUploadingOriginal}
                  onUploadClick={openFileDialog}
                  onLibraryClick={() => toast.info("作品库选择即将接入")}
                  onPreview={sourceUrl ? () => openLightbox(sourceUrl, "原始模特图：保留身体、服装、姿势和场景") : undefined}
                  onRemove={sourceUrl ? () => {
                    setSourceUrl("");
                    resetGenerationForInputChange();
                  } : undefined}
                  onDropFile={(file) => handleUpload(file, "source")}
                  dragContext={dragContext}
                  uploadLabel="从本地上传"
                  libraryLabel="从作品选择"
                  footnote="主体完整、脸部清晰时最稳；换脸会保留原图身体、服装、姿势和场景。"
                  examples={{
                    label: "试一试",
                    images: FACE_SWAP_SAMPLE_IMAGES.map((sample) => ({ url: sample.url, title: `示例图 ${sample.id}` })),
                    onSelect: (image) => {
                      setSourceUrl(image.url);
                      resetGenerationForInputChange();
                    },
                  }}
                />
              </>
            )}
          </StudioUploadSection>

          <StudioUploadSection
            title={(
              <span className="face-swap-target-title">
                <span>目标脸图</span>
                <span>建议选择与原图肤色相近、正脸清晰的人脸</span>
              </span>
            )}
            inputRef={faceInputRef}
            onFiles={(files) => handleUpload(files[0], "face")}
            actions={(
              <button type="button" onClick={() => setDrawerOpen(true)} className="studio-upload-rule-button">
                模特脸库 <ChevronRight className="h-3 w-3" />
              </button>
            )}
          >
            {(openFileDialog, dragContext) => (
              <StudioUploadTile
                title="上传目标脸图"
                description={faceUrl ? "已选择目标脸图，可更换、预览或删除。" : FACE_SWAP_NOTE}
                imageUrl={faceUrl || null}
                imageAlt="已上传的目标脸图"
                loading={isUploadingFace}
                onUploadClick={openFileDialog}
                onLibraryClick={() => setDrawerOpen(true)}
                onPreview={faceUrl ? () => openLightbox(faceUrl, "目标脸图：只迁移五官身份，不带入发型、肤色和穿搭") : undefined}
                onRemove={faceUrl ? () => {
                  setFaceUrl("");
                  resetGenerationForInputChange();
                } : undefined}
                onDropFile={(file) => handleUpload(file, "face")}
                dragContext={dragContext}
                uploadLabel="上传脸图"
                libraryLabel="选择官方脸"
                footnote="目标脸尽量正脸清晰；仅迁移五官身份，不带入发型、肤色和穿搭。"
                examples={{
                  label: "试一试",
                  images: FACE_SWAP_LIBRARY.slice(0, 5).map((face) => ({ url: face.url, title: `脸图 ${face.id}` })),
                  onSelect: (image) => {
                    setFaceUrl(image.url);
                    resetGenerationForInputChange();
                  },
                }}
              />
            )}
          </StudioUploadSection>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-950">
              <Activity className="h-4 w-4 text-[var(--codex-accent)]" />
              生成模型
            </h3>
            <StudioModelSelector
              models={MODELS}
              value={aiModel}
              onChange={setAiModel}
              ariaLabel="生成模型"
              getMeta={(model) => `${model.desc} · 当前${getCreditCost(model.value, normalizeImageSize(model.value, imageSizeValue, aspectRatio), aspectRatio)}分`}
            />
          </section>

          <section>
            <PanelTitle title="画面比例" />
            <StudioOptionGrid
              options={ASPECT_RATIOS}
              value={aspectRatio}
              ariaLabel="画面比例"
              onChange={(value) => setAspectRatio(value as AspectRatio)}
            />
          </section>

          <section>
            <PanelTitle title="分辨率" />
            <StudioOptionGrid
              options={supportedSizes.map((size) => ({
                value: size,
                label: `${size} · ${getCreditCost(aiModel, size, aspectRatio)}积分`,
              }))}
              value={imageSizeValue}
              ariaLabel="分辨率"
              onChange={(value) => setImageSize(value as ImageSize)}
            />
          </section>

          <section>
            <PanelTitle title="生成数量" />
            <StudioGenerationCountSelector
              value={genCount}
              onChange={setGenCount}
              ariaLabel="生成数量"
            />
          </section>

          <section>
            <PanelTitle title="质感增强" />
            <button
              type="button"
              onClick={() => setTextureEnhance((value) => !value)}
              className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-all ${textureEnhance ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"}`}
            >
              <span>
                <span className="block text-sm font-black">服装质感增强</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                  默认开启；会做全图商业精修，明显强化布料纤维、褶皱、缝线、印花锐度和光影层次，同时不磨皮、不改表情、不移除眼镜配饰。
                </span>
              </span>
              <span className={`ml-3 flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${textureEnhance ? "bg-emerald-600" : "bg-neutral-200"}`}>
                <span className={`h-5 w-5 rounded-full bg-white shadow transition ${textureEnhance ? "translate-x-5" : "translate-x-0"}`} />
              </span>
            </button>
          </section>

          <StudioPromptTextarea
            title="补充要求"
            badge="可选"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            placeholder="可选：补充保留眼镜、雀斑、配饰、冷感表情等细节。默认模板已锁定只换五官身份，不换肤色、发型、表情和配饰。"
            description="补充说明会附加到系统提示词中，影响最终生成效果。"
          />
        </div>

        <StudioRunBar
          summary={`${genCount} 张 · ${imageSizeValue} · ${aspectRatio}`}
          costLabel={authIsAnonymous ? "登录后查看积分" : `消耗 ${totalCost} · 余额 ${credits ?? "-"}`}
          disabled={!canGenerate}
          disabledReason={validationHint}
          primaryLabel={status === "running" ? "生成中" : authIsAnonymous ? "登录后生成" : "开始换脸"}
          isLoading={status === "running"}
          onPrimaryAction={generate}
          secondaryActions={(
            <button type="button" onClick={clearAll} className="studio-button studio-tone-neutral studio-button-compact">
              清空
            </button>
          )}
        />
      </aside>

      <main className="studio-canvas relative mt-3 mb-6 min-h-[260px] flex-1 overflow-hidden sm:min-h-[360px] lg:mt-0 lg:mb-0 lg:min-h-0">
        <StudioResultViewport
          status={resultStatus}
          loadingState={null}
          results={(
            <ResultsPanel
              urls={resultUrls}
              isGenerating={status === "running"}
              expectedCount={faceSwapExpectedCount}
              task={activeQueueTask}
              inputThumbnails={faceSwapInputThumbnails}
              onOpen={(url) => openLightbox(url, "换脸结果预览")}
              onUseAsSource={(url) => {
                setSourceUrl(url);
                resetGenerationForInputChange();
                toast.success("已设为原始模特图");
              }}
              onUseAsFace={(url) => {
                setFaceUrl(url);
                resetGenerationForInputChange();
                toast.success("已设为目标脸图");
              }}
              onCopyUrl={async (url) => {
                await navigator.clipboard.writeText(url);
                toast.success("图片链接已复制");
              }}
              onRegenerate={generate}
            />
          )}
          errorState={(
            <div className="studio-result-stage flex min-h-[260px] items-center justify-center px-4 sm:min-h-[360px] lg:h-full">
              <div className="max-w-md rounded-2xl border border-white/80 bg-white/[0.84] p-6 text-center shadow-[0_24px_76px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                  <X className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-lg font-black text-slate-950">生成失败</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{error}</p>
                <button type="button" onClick={generate} className="gradient-brand mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white hover:opacity-95">
                  <RotateCcw className="h-4 w-4" /> 重新生成
                </button>
              </div>
            </div>
          )}
          emptyState={(
            <div className="studio-empty-stage flex min-h-[260px] items-center justify-center px-4 py-6 sm:min-h-[360px] lg:h-full">
              <PreviewGuide
                title="开始制作换脸图"
                subtitle="先上传原始模特图，再选择目标脸图；输出会保留原图的身体、服装、背景、光线和构图。"
                imageSrc={FACE_SWAP_SAMPLE_IMAGES[0]?.url || FACE_SWAP_LIBRARY[0]?.url}
                imageAlt="换脸图指引"
                steps={[
                  { title: "上传原始模特图", desc: "图1决定身体、服装、背景、光线和最终构图。" },
                  { title: "选择目标脸图", desc: "只提供五官身份，不带走发型、肤色、身体或配饰。" },
                  { title: "生成换脸成片", desc: "保持商品与场景稳定，快速得到新模特成片。" },
                ]}
              />
            </div>
          )}
        />
      </main>

      {drawerOpen && (
        <ClientPortal>
          <aside className="face-swap-face-library-panel" aria-label="模特脸库">
            <div className="face-swap-face-library-header">
              <div>
                <h2 className="text-lg font-black text-slate-950">模特脸库</h2>
                <p className="mt-1 text-xs text-slate-500">选择一张脸作为身份参考，只替换五官特征，不改变肤色和发型。</p>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="face-swap-face-library-tabs">
              {(["female", "male"] as GenderFilter[]).map((gender) => (
                <button
                  key={gender}
                  type="button"
                  onClick={() => setGenderFilter(gender)}
                  className={`face-swap-face-library-tab ${genderFilter === gender ? "face-swap-face-library-tab-active" : ""}`}
                >
                  {gender === "female" ? "女模特" : "男模特"}
                </button>
              ))}
            </div>
            <div className="face-swap-face-library-grid">
              {faceLibrary.map((item, index) => {
                const label = `${genderFilter === "female" ? "女模特" : "男模特"} ${String(index + 1).padStart(2, "0")}`;
                const active = faceUrl === item.url;
                return (
                  <div
                    key={item.id}
                    className={`face-swap-face-library-card ${active ? "face-swap-face-library-card-active" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFaceUrl(item.url);
                        setDrawerOpen(false);
                        resetGenerationForInputChange();
                      }}
                      className="face-swap-face-library-select"
                      aria-label={`选择${label}`}
                    >
                      <span className="face-swap-face-library-image">
                        <img src={item.url} alt={label} />
                      </span>
                      <span className="face-swap-face-library-name">{label}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openLightbox(item.url, `${label}：仅作为五官身份参考`)}
                      className="face-swap-face-library-zoom"
                      aria-label={`放大预览${label}`}
                      title={`放大预览${label}`}
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                    {active && (
                      <span className="face-swap-face-library-check">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        </ClientPortal>
      )}

      {lightboxSrc && (
        <ClientPortal>
          <div className="fixed inset-0 z-[240] flex cursor-zoom-out items-center justify-center bg-slate-950/70 p-6 backdrop-blur-xl" onClick={closeLightbox}>
            <div className="flex max-h-full max-w-full flex-col items-center gap-3">
              <img src={lightboxSrc} alt={lightboxCaption || "result preview"} className="max-h-[calc(100dvh-120px)] max-w-full rounded-3xl object-contain shadow-[0_32px_120px_rgba(0,0,0,0.5)]" />
              {lightboxCaption && (
                <div className="max-w-[min(680px,90vw)] rounded-full bg-white/92 px-4 py-2 text-center text-xs font-bold text-slate-700 shadow-lg">
                  {lightboxCaption}
                </div>
              )}
            </div>
            <button type="button" onClick={closeLightbox} className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg">
              <X className="h-5 w-5" />
            </button>
          </div>
        </ClientPortal>
      )}
    </div>
  );
}

function PanelTitle({ title }: { title: string }) {
  return <h2 className="mb-3 text-sm font-black text-slate-950">{title}</h2>;
}


function ResultsPanel({
  urls,
  expectedCount,
  isGenerating,
  onOpen,
  onUseAsSource,
  onUseAsFace,
  onCopyUrl,
  onRegenerate,
  task,
  inputThumbnails,
}: {
  urls: string[];
  expectedCount?: number;
  isGenerating: boolean;
  task?: TaskQueueItem | null;
  inputThumbnails: string[];
  onOpen: (url: string) => void;
  onUseAsSource: (url: string) => void;
  onUseAsFace: (url: string) => void;
  onCopyUrl: (url: string) => void;
  onRegenerate: () => void;
}) {
  const count = Math.max(urls.length, expectedCount || 0, 1);
  const failed = task?.statusGroup === "failed";

  return (
    <div className="studio-result-stage h-full overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-32">
      <div className="flex min-h-full flex-col gap-4">
        <ResultImageGrid
          urls={urls}
          filenamePrefix="face-swap"
          expectedCount={count}
          isGenerating={isGenerating}
          inputThumbnails={inputThumbnails}
          createdAt={task?.createdAt}
          statusGroup={failed ? "failed" : isGenerating ? "running" : task?.statusGroup}
          imageAltPrefix="换脸结果"
          variant="task"
          onOpen={(url) => onOpen(url)}
        />

        {urls.length > 0 && (
          <div className="studio-result-actions mx-auto flex w-full max-w-[760px] flex-wrap justify-center gap-2">
            <button type="button" onClick={onRegenerate} disabled={isGenerating} className="studio-button studio-button-compact">
              <RotateCcw className="h-3.5 w-3.5" /> 再来一组
            </button>
            {urls.slice(0, 1).map((url) => (
              <span key={url} className="flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => onCopyUrl(url)} className="studio-button studio-button-compact">
                  <Copy className="h-3.5 w-3.5" /> 复制链接
                </button>
                <button type="button" onClick={() => onUseAsSource(url)} className="studio-button studio-button-compact">
                  <Brush className="h-3.5 w-3.5" /> 设为原图
                </button>
                <button type="button" onClick={() => onUseAsFace(url)} className="studio-button studio-button-compact">
                  <UserRoundCheck className="h-3.5 w-3.5" /> 设为脸图
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function isLegacyRemoteAssetUrl(url?: string) {
  return typeof url === "string" && (
    url.includes("zhiyi-image.oss-cn-hangzhou.aliyuncs.com") ||
    url.includes("aliyuncs.com/devops/comfyui")
  );
}
