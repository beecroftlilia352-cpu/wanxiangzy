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
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { StudioResultViewport, type StudioResultStatus } from "@/components/studio/StudioResultViewport";
import { StudioMultiImageUpload } from "@/components/studio/StudioMultiImageUpload";
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
  MAX_FACE_SWAP_SOURCE_IMAGES,
  getFaceSwapUserPromptFromPayload,
  normalizeFaceSwapCount,
  normalizeFaceSwapTextureEnhance,
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
import { showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { fetchHistoryApplyDetail, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import { createFaceSwapPreviewSession, type ImagePreviewAction } from "@/lib/studio-image-preview";
import { FAILED_RETRY_NOTICE, buildFailedTaskDetail, buildPartialFailureDetail, summarizeGenerationError } from "@/lib/studio-generation-feedback";

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
  { value: "auto", label: "智能" },
];

const FACE_SWAP_PREVIEW_ACTIONS: ImagePreviewAction[] = [
  { kind: "download", label: "下载图片" },
  { kind: "copy", label: "复制链接" },
  { kind: "useAsSource", label: "设为原图" },
  { kind: "useAsFace", label: "设为脸图" },
  { kind: "aiVideo", label: "AI视频" },
  { kind: "modelBackground", label: "换背景" },
  { kind: "pose", label: "姿势裂变" },
  { kind: "productSet", label: "商品套图" },
  { kind: "regenerateAll", label: "再来一组" },
  { kind: "feedback", label: "反馈" },
];

type GenerationStatus = "idle" | "running" | "completed" | "failed";
type GenderFilter = "female" | "male";
type FaceSwapHistoryPayload = Extract<HistoryJobPayload, { kind: "faceSwap" }>;
type ActiveFaceSwapJob = {
  generationId: string;
  sourceUrl: string;
  sourceUrls?: string[];
  faceUrl: string;
  resultUrls: string[];
  progress: number;
  status: GenerationStatus;
  genCount?: number;
  userPrompt?: string;
  textureEnhance?: boolean;
};
type FaceSwapGenerateOptions = {
  sourceUrlsOverride?: string[];
  genCountOverride?: number;
  expectedCountOverride?: number;
  toastMessage?: string;
};
type FaceSwapPollContext = {
  expectedCount: number;
  inputThumbnails: string[];
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
    refreshCredits,
  } = useStudioAuth();
  const [sourceUrls, setSourceUrls] = useState<string[]>([]);
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
  const [isOriginalDragging, setIsOriginalDragging] = useState(false);
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
  const requestedFaceSwapCount = normalizeFaceSwapCount(genCount);
  const requestedFaceSwapResultCount = requestedFaceSwapCount * Math.max(sourceUrls.length, 1);
  const totalCost = unitCost * requestedFaceSwapResultCount;
  const faceLibrary = FACE_SWAP_LIBRARY.filter((item) => item.gender === genderFilter);
  const validationHint = sourceUrls.length === 0
    ? "请先上传或选择原始模特图"
    : !faceUrl
      ? "请选择目标脸图"
      : sourceUrls.includes(faceUrl)
        ? "原始模特图和目标脸图不能是同一张"
        : credits !== null && credits < totalCost
          ? `灵点不足，生成需要 ${totalCost} 灵点`
          : "";
  const canGenerate = status !== "running" && !validationHint;
  const authIsAnonymous = authChecked && !isAuthenticated;
  const taskQueue = useTaskQueueGeneration({
    module: "faceSwap",
    title: "换脸",
    defaultExpectedCount: requestedFaceSwapResultCount,
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
      const detailSourceUrls = Array.isArray(payload.sourceUrls) && payload.sourceUrls.length > 0
        ? payload.sourceUrls
        : payload.sourceUrl ? [payload.sourceUrl] : [];
      setSourceUrls(detailSourceUrls);
      setFaceUrl(payload.faceUrl);
      setAiModel(payload.aiModel);
      setAspectRatio(payload.aspectRatio);
      setImageSize(payload.imageSize);
      setPrompt(getFaceSwapUserPromptFromPayload(payload));
      setGenCount(normalizeFaceSwapCount(payload.genCount));
      setTextureEnhance(normalizeFaceSwapTextureEnhance(payload.textureEnhance));
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
    const historySourceUrls = Array.isArray(payload.sourceUrls) && payload.sourceUrls.length > 0
      ? payload.sourceUrls
      : payload.sourceUrl ? [payload.sourceUrl] : [];
    setSourceUrls(historySourceUrls);
    setFaceUrl(payload.faceUrl);
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setPrompt(getFaceSwapUserPromptFromPayload(payload));
    setGenCount(normalizeFaceSwapCount(payload.genCount));
    setTextureEnhance(normalizeFaceSwapTextureEnhance(payload.textureEnhance));
    setActiveQueueTask(null);
    setResultUrls(historyResultUrls);
    setProgress(historyResultUrls.length ? 100 : 0);
    setStatus(historyResultUrls.length ? "completed" : "idle");
    setGenerationId("");
    setError("");
    if (!options?.silent) toast.success("已套用历史换脸参数");
  }, [clearPolling]);

  const pollGeneration = useCallback(async (id: string, immediate = false, context?: FaceSwapPollContext) => {
    clearPolling();
    const expectedCount = context?.expectedCount ?? requestedFaceSwapResultCount;
    const inputThumbnails = context?.inputThumbnails ?? [...sourceUrls, faceUrl].filter(Boolean);
    const run = async () => {
      try {
        const res = await fetch(`/api/face-swap?generation_id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "查询生成进度失败");

        const nextProgress = Number.isFinite(Number(data.progress)) ? Number(data.progress) : progress;
        const nextUrls = Array.isArray(data.result_urls) ? data.result_urls : [];
        const nextResultCount = nextUrls.filter(Boolean).length;
        const roundedProgress = Math.min(Math.max(Math.round(nextProgress), 0), 100);
        setProgress(roundedProgress);
        if (nextUrls.length) setResultUrls(nextUrls);

        if (data.status === "completed") {
          const partialFailure = data.partial_failure && typeof data.partial_failure === "object"
            ? data.partial_failure as { message?: unknown }
            : null;
          const completedErrorSource = data.error || partialFailure?.message || "";
          const completedError = completedErrorSource ? summarizeGenerationError(completedErrorSource) : "";
          setStatus("completed");
          setProgress(100);
          setResultUrls(nextUrls);
          const completedTask = taskQueue.markCompleted(id, {
            expectedCount,
            inputThumbnails,
            resultThumbnails: nextUrls,
            resultCount: nextResultCount,
            error: completedError,
          });
          setActiveQueueTask(completedTask);
          if (nextResultCount < expectedCount || completedError) {
            await refreshCredits();
            toast.warning(buildPartialFailureDetail({
              message: completedError || completedErrorSource,
              failedCount: expectedCount - nextResultCount || 1,
            }));
          } else {
            toast.success("换脸完成");
          }
          return;
        }

        if (data.status === "failed") {
          setStatus("failed");
          const message = summarizeGenerationError(data.error || "换脸生成失败");
          setError(message);
          const failedTask = taskQueue.markFailed(id, message, {
            expectedCount,
            inputThumbnails,
            resultThumbnails: nextUrls,
          });
          setActiveQueueTask(failedTask);
          await refreshCredits();
          return;
        }

        setStatus("running");
        const runningTask = taskQueue.markRunning(id, {
          expectedCount,
          inputThumbnails,
          resultThumbnails: nextUrls,
          progress: roundedProgress,
          status: data.status,
        });
        setActiveQueueTask(runningTask);
        pollTimerRef.current = setTimeout(() => pollGeneration(id, false, context), 2200);
      } catch (err) {
        const message = summarizeGenerationError(err instanceof Error ? err.message : "查询生成进度失败");
        setStatus("failed");
        setError(message);
        const failedTask = taskQueue.markFailed(id, message, {
          expectedCount,
          inputThumbnails,
        });
        setActiveQueueTask(failedTask);
        await refreshCredits();
      }
    };
    if (immediate) void run();
    else pollTimerRef.current = setTimeout(run, 2200);
  }, [clearPolling, faceUrl, progress, refreshCredits, requestedFaceSwapResultCount, sourceUrls, taskQueue]);

  useEffect(() => {
    if (!isAuthenticated || status !== "idle" || generationId || sourceUrls.length > 0 || faceUrl) return;
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
        const jobSourceUrls = Array.isArray(job.sourceUrls) && job.sourceUrls.length > 0
          ? job.sourceUrls
          : job.sourceUrl ? [job.sourceUrl] : [];
        if (
          jobSourceUrls.some(isLegacyRemoteAssetUrl) ||
          isLegacyRemoteAssetUrl(job.faceUrl) ||
          (job.resultUrls || []).some(isLegacyRemoteAssetUrl)
        ) {
          return;
        }

        setGenerationId(job.generationId);
        setSourceUrls(jobSourceUrls);
        setFaceUrl(job.faceUrl);
        setResultUrls(job.resultUrls || []);
        setProgress(job.progress || 0);
        setGenCount(normalizeFaceSwapCount(job.genCount));
        setTextureEnhance(Boolean(job.textureEnhance));
        setPrompt(getFaceSwapUserPromptFromPayload(job));
        setStatus("running");
        pollGeneration(job.generationId, true, {
          expectedCount: Math.max(1, jobSourceUrls.length * normalizeFaceSwapCount(job.genCount)),
          inputThumbnails: [...jobSourceUrls, job.faceUrl].filter(Boolean),
        });
      } catch {
        // 恢复进行中任务失败不阻断正常使用。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [faceUrl, generationId, isAuthenticated, pollGeneration, sourceUrls, status]);

  useEffect(() => () => clearPolling(), [clearPolling]);

  async function handleUpload(files: File[], kind: "source" | "face") {
    const validFiles = files.filter((file) => {
      if (!file.type.startsWith("image/")) {
        toast.error(`"${file.name}" 不是图片格式`);
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`"${file.name}" 超过 ${MAX_FILE_SIZE_MB}MB`);
        return false;
      }
      return true;
    });
    if (validFiles.length === 0) return;

    const setUploading = kind === "source" ? setIsUploadingOriginal : setIsUploadingFace;
    setUploading(true);
    try {
      const uploads = await Promise.all(validFiles.map((file) => uploadImage(file)));
      if (kind === "source") {
        setSourceUrls((prev) => {
          const merged = [...prev, ...uploads.map((u) => u.url)];
          return merged.slice(0, MAX_FACE_SWAP_SOURCE_IMAGES);
        });
        toast.success(`已上传 ${uploads.length} 张原始模特图`);
      } else {
        setFaceUrl(uploads[0].url);
        toast.success("目标脸图已上传");
      }
      resetGenerationForInputChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败，请重试");
    } finally {
      setUploading(false);
    }
  }

  async function generate(options: FaceSwapGenerateOptions = {}) {
    const runSourceUrls = options.sourceUrlsOverride?.length ? options.sourceUrlsOverride : sourceUrls;
    const runGenCount = normalizeFaceSwapCount(options.genCountOverride ?? genCount);
    const runExpectedCount = Math.max(1, options.expectedCountOverride ?? runSourceUrls.length * runGenCount);
    const runTotalCost = unitCost * runExpectedCount;
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (runSourceUrls.length === 0) {
      toast.error("请先上传或选择原始模特图");
      return;
    }
    if (!faceUrl) {
      toast.error("请先选择目标模特脸");
      return;
    }
    if (runSourceUrls.includes(faceUrl)) {
      toast.error("原始模特图和目标脸图不能是同一张");
      return;
    }
    if (credits !== null && credits < runTotalCost) {
      showInsufficientCreditsToast({ required: runTotalCost, balance: credits, onRecharge: () => router.push("/pricing") });
      return;
    }

    if (options.toastMessage) toast.info(options.toastMessage);
    clearPolling();
    skipActiveRestoreRef.current = false;
    setActiveQueueTask(null);
    setStatus("running");
    setProgress(1);
    setResultUrls([]);
    setError("");
    const taskInputThumbnails = [...runSourceUrls, faceUrl].filter(Boolean);
    const provisionalTask = taskQueue.startTask({
      expectedCount: runExpectedCount,
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
          source_urls: runSourceUrls,
          face_url: faceUrl,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSizeValue,
          gen_count: runGenCount,
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
          expectedCount: runExpectedCount,
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
      pollGeneration(data.generation_id, true, {
        expectedCount: runExpectedCount,
        inputThumbnails: taskInputThumbnails,
      });
    } catch (err) {
      const message = summarizeGenerationError(err instanceof Error ? err.message : "提交换脸任务失败");
      setStatus("failed");
      setError(message);
      const failedTask = taskQueue.markFailed(activeTaskId, message, {
        expectedCount: runExpectedCount,
        inputThumbnails: taskInputThumbnails,
      });
      setActiveQueueTask(failedTask);
      await refreshCredits();
      toast.error(message);
    }
  }

  function clearAll() {
    skipActiveRestoreRef.current = true;
    clearPolling();
    setSourceUrls([]);
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
    const expectedCount = clampTaskExpectedCount(item, 1, MAX_FACE_SWAP_SOURCE_IMAGES * 4);
    setGenCount(normalizeFaceSwapCount(Math.min(4, expectedCount)));
    clearPolling();
    setGenerationId(item.id);
    setStatus("running");
    setProgress(Math.min(Math.max(Math.round(nextProgress), 1), 99));
    setResultUrls(urls);
    setError("");
    pollGeneration(item.id, true, {
      expectedCount,
      inputThumbnails: safeTaskQueueUrls(item.inputThumbnails),
    });
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
  const retryDisabled = status === "running";
  function handleRetryFailedResult(index: number) {
    if (retryDisabled) return;
    const perSourceCount = Math.max(1, normalizeFaceSwapCount(genCount));
    const sourceIndex = Math.min(Math.max(0, Math.floor(index / perSourceCount)), Math.max(sourceUrls.length - 1, 0));
    const retrySourceUrl = sourceUrls[sourceIndex] || sourceUrls[0];
    if (!retrySourceUrl) {
      toast.error("未找到要重试的原始模特图");
      return;
    }
    void generate({
      sourceUrlsOverride: [retrySourceUrl],
      genCountOverride: 1,
      expectedCountOverride: 1,
      toastMessage: `正在重试第 ${index + 1} 张，失败图已退款，本次按 1 张重新生成...`,
    });
  }
  const faceSwapInputThumbnails = (
    safeTaskQueueUrls(activeQueueTask?.inputThumbnails).length
      ? safeTaskQueueUrls(activeQueueTask?.inputThumbnails)
      : [...sourceUrls, faceUrl]
  ).filter(Boolean);
  const faceSwapExpectedCount = activeQueueTask
    ? clampTaskExpectedCount(activeQueueTask, 1, MAX_FACE_SWAP_SOURCE_IMAGES * 4, requestedFaceSwapResultCount)
    : status === "running"
      ? requestedFaceSwapResultCount
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
            multiple
            isDragging={isOriginalDragging}
            setDragging={setIsOriginalDragging}
            onFiles={(files) => handleUpload(files, "source")}
          >
            {(openFileDialog) => (
              <StudioMultiImageUpload
                urls={sourceUrls}
                maxCount={MAX_FACE_SWAP_SOURCE_IMAGES}
                title="已上传原始模特图"
                emptyTitle="上传需要处理的原图"
                description="图1作为身体、服装和构图基础，可继续补充多张原图批量换脸。"
                emptyDescription="图1作为身体、服装和构图基础，建议主体完整、画面清晰。"
                itemLabelPrefix="图"
                loading={isUploadingOriginal}
                isDragging={isOriginalDragging}
                uploadLabel="从本地上传"
                libraryLabel="从作品选择"
                summary={sourceUrls.length ? `共生成 ${sourceUrls.length * normalizeFaceSwapCount(genCount)} 张` : undefined}
                footnote={`支持同时上传多张原图（最多 ${MAX_FACE_SWAP_SOURCE_IMAGES} 张），每张原图 × 生成数量。主体完整、脸部清晰时最稳。`}
                onUploadClick={openFileDialog}
                onLibraryClick={() => toast.info("作品库选择即将接入")}
                onPreview={(url, index) => openLightbox(url, `原始模特图 ${index + 1}`)}
                onRemove={(_, index) => {
                  setSourceUrls((prev) => prev.filter((__, i) => i !== index));
                  resetGenerationForInputChange();
                }}
                onClear={() => {
                  setSourceUrls([]);
                  resetGenerationForInputChange();
                }}
                examples={{
                  label: "试一试",
                  images: FACE_SWAP_SAMPLE_IMAGES.map((sample) => ({ url: sample.url, title: `示例图 ${sample.id}` })),
                  disabled: isUploadingOriginal,
                  onSelect: (image) => {
                    setSourceUrls([image.url]);
                    resetGenerationForInputChange();
                  },
                }}
              />
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
            onFiles={(files) => handleUpload(files.slice(0, 1), "face")}
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
                onDropFile={(file) => file && handleUpload([file], "face")}
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
                label: `${size} · ${getCreditCost(aiModel, size, aspectRatio)}灵点`,
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
            <PanelTitle title="细节恢复" />
            <button
              type="button"
              onClick={() => setTextureEnhance((value) => !value)}
              className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-all ${textureEnhance ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"}`}
            >
              <span>
                <span className="block text-sm font-black">轻量细节恢复</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                  默认关闭；仅在布料细节明显糊时开启。开启后只做服装局部细节恢复，不改原图曝光、对比度、白平衡，不强化细密条纹或裤纹。
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
          summary={sourceUrls.length > 1 ? `${sourceUrls.length} 张原图 × ${genCount} · ${imageSizeValue} · ${aspectRatio}` : `${genCount} 张 · ${imageSizeValue} · ${aspectRatio}`}
          costLabel={authIsAnonymous ? "登录后查看灵点" : `消耗 ${totalCost} · 余额 ${credits ?? "-"}`}
          disabled={!canGenerate}
          disabledReason={validationHint}
          primaryLabel={status === "running" ? "生成中" : authIsAnonymous ? "登录后生成" : "开始换脸"}
          isLoading={status === "running"}
          onPrimaryAction={() => void generate()}
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
              sourceUrls={sourceUrls}
              faceUrl={faceUrl}
              prompt={prompt}
              aiModel={aiModel}
              aspectRatio={aspectRatio}
              imageSize={imageSizeValue}
              textureEnhance={textureEnhance}
              onUseAsSource={(url) => {
                setSourceUrls((prev) => [url, ...prev.filter((u) => u !== url)].slice(0, MAX_FACE_SWAP_SOURCE_IMAGES));
                resetGenerationForInputChange();
                toast.success("已添加为原始模特图");
              }}
              onUseAsFace={(url) => {
                setFaceUrl(url);
                resetGenerationForInputChange();
                toast.success("已设为目标脸图");
              }}
              onRegenerate={() => void generate()}
              onRetryMissing={handleRetryFailedResult}
            />
          )}
          errorState={(
            <div className="studio-result-stage flex min-h-[260px] items-center justify-center px-4 sm:min-h-[360px] lg:h-full">
              <div className="max-w-md rounded-2xl border border-white/80 bg-white/[0.84] p-6 text-center shadow-[0_24px_76px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                  <X className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-lg font-black text-slate-950">生成失败</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{summarizeGenerationError(error)}</p>
                <p className="mx-auto mt-3 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold leading-5 text-amber-700">
                  {FAILED_RETRY_NOTICE}
                </p>
                <button type="button" onClick={() => void generate()} className="gradient-brand mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white hover:opacity-95">
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
  onUseAsSource,
  onUseAsFace,
  onRegenerate,
  onRetryMissing,
  task,
  inputThumbnails,
  sourceUrls,
  faceUrl,
  prompt,
  aiModel,
  aspectRatio,
  imageSize,
  textureEnhance,
}: {
  urls: string[];
  expectedCount?: number;
  isGenerating: boolean;
  task?: TaskQueueItem | null;
  inputThumbnails: string[];
  sourceUrls: string[];
  faceUrl: string;
  prompt: string;
  aiModel: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  textureEnhance: boolean;
  onUseAsSource: (url: string) => void;
  onUseAsFace: (url: string) => void;
  onRegenerate: () => void;
  onRetryMissing: (index: number) => void;
}) {
  const count = Math.max(urls.length, expectedCount || 0, 1);
  const failed = task?.statusGroup === "failed";
  const completedPartial = Boolean(task?.statusGroup === "completed" && urls.filter(Boolean).length < count);
  const partialFailureMessage = buildPartialFailureDetail({
    message: task?.error || undefined,
    failedCount: count - urls.filter(Boolean).length || 1,
  });
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const session = createFaceSwapPreviewSession({
    urls,
    expectedCount: count,
    isGenerating,
    statusGroup: failed ? "failed" : isGenerating ? "running" : task?.statusGroup,
    taskId: task?.id,
    createdAt: task?.createdAt,
    sourceUrl: sourceUrls[0] || "",
    faceUrl,
    promptText: prompt,
    metaItems: [
      { label: "模型", value: aiModel },
      { label: "比例", value: aspectRatio },
      { label: "分辨率", value: imageSize },
      { label: "纹理增强", value: textureEnhance ? "开启" : "关闭" },
      { label: "生成数量", value: count },
    ],
  });
  const copyResultUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("已复制图片链接");
  };

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
          failureLabel="生成失败"
          failureDetail={failed ? buildFailedTaskDetail(task?.error || undefined) : undefined}
          markMissingAsFailed={completedPartial}
          missingFailureLabel="本张生成失败"
          missingFailureDetail={partialFailureMessage}
          missingFailureActionLabel="重试本张"
          onMissingFailureAction={onRetryMissing}
          onOpen={(_, index) => setPreviewIndex(index)}
        />

        {urls.length > 0 && (
          <div className="studio-result-actions mx-auto flex w-full max-w-[760px] flex-wrap justify-center gap-2">
            <button type="button" onClick={onRegenerate} disabled={isGenerating} className="studio-button studio-button-compact">
              <RotateCcw className="h-3.5 w-3.5" /> 再来一组
            </button>
            {urls.slice(0, 1).map((url) => (
              <span key={url} className="flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => void copyResultUrl(url)} className="studio-button studio-button-compact">
                  <Copy className="h-3.5 w-3.5" /> 复制链接
                </button>
                <button type="button" onClick={() => onUseAsSource(url)} className="studio-button studio-button-compact">
                  <Brush className="h-3.5 w-3.5" /> 加为原图
                </button>
                <button type="button" onClick={() => onUseAsFace(url)} className="studio-button studio-button-compact">
                  <UserRoundCheck className="h-3.5 w-3.5" /> 设为脸图
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <StudioImagePreviewDialog
        open={previewIndex !== null}
        onClose={() => setPreviewIndex(null)}
        session={session}
        selectedIndex={previewIndex || 0}
        onSelectedIndexChange={setPreviewIndex}
        filenamePrefix="face-swap"
        actions={FACE_SWAP_PREVIEW_ACTIONS}
        onUseAsSource={onUseAsSource}
        onUseAsFace={onUseAsFace}
        onRegenerateAll={onRegenerate}
      />
    </div>
  );
}

function isLegacyRemoteAssetUrl(url?: string) {
  return typeof url === "string" && (
    url.includes("zhiyi-image.oss-cn-hangzhou.aliyuncs.com") ||
    url.includes("aliyuncs.com/devops/comfyui")
  );
}
