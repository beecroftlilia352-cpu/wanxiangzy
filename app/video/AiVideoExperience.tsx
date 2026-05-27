"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronRight,
  Clapperboard,
  FolderOpen,
  ImagePlus,
  Loader2,
  Maximize2,
  Play,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ClientPortal } from "@/components/ClientPortal";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { ResultVideoGrid } from "@/components/ResultVideoGrid";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { StudioOptionGrid, StudioPromptTextarea } from "@/components/studio/StudioFormControls";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioSideDrawer } from "@/components/studio/StudioSideDrawer";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import { useStableFileDrag } from "@/components/studio/useStableFileDrag";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import {
  AI_VIDEO_ACTION_TEMPLATES,
  AI_VIDEO_RESOLUTION_OPTIONS,
  getAiVideoCreditCost,
  getAiVideoKind,
  getAiVideoPath,
  normalizeAiVideoResolution,
  type AiVideoActionTemplate,
  type AiVideoMode,
  type AiVideoResolution,
} from "@/lib/ai-video";
import { fetchHistoryApplyDetail, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import {
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB,
  MAX_VIDEO_FILE_SIZE,
  MAX_VIDEO_FILE_SIZE_MB,
  uploadImage,
  uploadVideo,
} from "@/lib/utils";

const VIDEO_GENERATION_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const VIDEO_GENERATION_POLL_FAST_WINDOW_MS = 60 * 1000;
const VIDEO_GENERATION_POLL_FAST_MS = 4 * 1000;
const VIDEO_GENERATION_POLL_SLOW_MS = 7 * 1000;

type VideoImagePayload = Extract<HistoryJobPayload, { kind: "videoImageToVideo" }>;
type VideoMotionPayload = Extract<HistoryJobPayload, { kind: "videoMotion" }>;

type AiVideoExperienceProps = {
  mode: AiVideoMode;
};

export function AiVideoExperience({ mode }: AiVideoExperienceProps) {
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const modelImageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const generationRunRef = useRef(0);
  const isMotion = mode === "motion-control";
  const generationKind = getAiVideoKind(mode);
  const featureKey = isMotion ? "videoMotion" : "videoImageToVideo";
  const moduleTitle = isMotion ? "动作模仿" : "图生视频";
  const moduleLabel = isMotion ? "动作模仿" : "图生视频";
  const apiPath = isMotion ? "/api/video/motion-control" : "/api/video/image-to-video";
  const applyPath = getAiVideoPath(generationKind);

  const { authChecked, isAuthenticated, userId, credits, setCredits, refreshAuth } = useStudioAuth();
  const [imageUrl, setImageUrl] = useState("");
  const [modelImageUrl, setModelImageUrl] = useState("");
  const [referenceVideoUrl, setReferenceVideoUrl] = useState("");
  const [prompt, setPrompt] = useState(AI_VIDEO_ACTION_TEMPLATES[0]?.promptContent || "");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(AI_VIDEO_ACTION_TEMPLATES[0]?.id || null);
  const [resolution, setResolution] = useState<AiVideoResolution>("720p");
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isDraggingModelImage, setIsDraggingModelImage] = useState(false);
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingModelImage, setIsUploadingModelImage] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [lightboxVideo, setLightboxVideo] = useState<string | null>(null);

  const taskQueue = useTaskQueueGeneration({
    module: generationKind,
    title: moduleTitle,
    defaultExpectedCount: 1,
    applyPath,
  });
  const cost = getAiVideoCreditCost(resolution);
  const authIsAnonymous = authChecked && !isAuthenticated;
  const inputThumbnails = isMotion
    ? [modelImageUrl, referenceVideoUrl].filter(Boolean)
    : [imageUrl].filter(Boolean);
  const runDisabledReason = isMotion
    ? !modelImageUrl
      ? "请先上传模特图"
      : !referenceVideoUrl
        ? "请先上传参考视频"
        : credits !== null && credits < cost
          ? `积分不足，生成需要 ${cost} 积分`
          : undefined
    : !imageUrl
      ? "请先上传图片"
      : !prompt.trim()
        ? "请输入动作描述或选择动作模板"
        : credits !== null && credits < cost
          ? `积分不足，生成需要 ${cost} 积分`
          : undefined;

  const imageDrag = useStableFileDrag<HTMLDivElement>({
    isDragging: isDraggingImage,
    setDragging: setIsDraggingImage,
    accept: "image/*",
    multiple: false,
    onFiles: (files) => handleImageFile(files[0], "image"),
  });
  const modelImageDrag = useStableFileDrag<HTMLDivElement>({
    isDragging: isDraggingModelImage,
    setDragging: setIsDraggingModelImage,
    accept: "image/*",
    multiple: false,
    onFiles: (files) => handleImageFile(files[0], "model"),
  });
  const videoDrag = useStableFileDrag<HTMLDivElement>({
    isDragging: isDraggingVideo,
    setDragging: setIsDraggingVideo,
    accept: "video/mp4,video/quicktime,.mp4,.mov",
    multiple: false,
    onFiles: (files) => handleVideoFile(files[0]),
  });

  const selectedTemplate = useMemo(
    () => AI_VIDEO_ACTION_TEMPLATES.find((item) => item.id === selectedTemplateId) || null,
    [selectedTemplateId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const detail = await takeApplyDetail(generationKind);
      if (cancelled || !detail?.payload) return;
      applyHistoryPayload(detail.payload, detail.resultUrls, { silent: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [generationKind]);

  async function handleImageFile(file?: File, target: "image" | "model" = "image") {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`图片不能超过 ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    setError("");
    setResultUrls([]);
    const setUploading = target === "model" ? setIsUploadingModelImage : setIsUploadingImage;
    setUploading(true);
    toast.info("正在上传图片...");
    try {
      const result = await uploadImage(file);
      if (target === "model") setModelImageUrl(result.url);
      else setImageUrl(result.url);
      toast.success("图片已上传");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "图片上传失败，请重试");
    } finally {
      setUploading(false);
    }
  }

  async function handleVideoFile(file?: File) {
    if (!file) return;
    const accepted = file.type === "video/mp4" || file.type === "video/quicktime" || /\.(mp4|mov)$/i.test(file.name);
    if (!accepted) {
      toast.error("请上传 MP4 或 MOV 视频");
      return;
    }
    if (file.size > MAX_VIDEO_FILE_SIZE) {
      toast.error(`视频不能超过 ${MAX_VIDEO_FILE_SIZE_MB}MB`);
      return;
    }

    setError("");
    setResultUrls([]);
    setIsUploadingVideo(true);
    toast.info("正在上传参考视频...");
    try {
      const result = await uploadVideo(file);
      setReferenceVideoUrl(result.url);
      toast.success("参考视频已上传");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "视频上传失败，请重试");
    } finally {
      setIsUploadingVideo(false);
    }
  }

  function applyTemplate(template: AiVideoActionTemplate) {
    setSelectedTemplateId(template.id);
    setPrompt(template.promptContent);
    setTemplatePanelOpen(false);
    setResultUrls([]);
    setError("");
    toast.success("已套用动作模板");
  }

  async function generate() {
    if (isSubmitting) return;
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (runDisabledReason) {
      toast.error(runDisabledReason);
      return;
    }

    const runId = generationRunRef.current + 1;
    generationRunRef.current = runId;
    const isCurrentRun = () => generationRunRef.current === runId;
    setIsSubmitting(true);
    setIsGenerating(true);
    setProgress(10);
    setError("");
    setResultUrls([]);

    const provisionalTask = taskQueue.startTask({
      expectedCount: 1,
      inputThumbnails,
      progress: 10,
    });
    let activeTaskId = provisionalTask.id;
    let latestTaskResultUrls: string[] = [];

    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isMotion
          ? {
              modelImageUrl,
              referenceVideoUrl,
              prompt: prompt.trim(),
              templateId: selectedTemplateId,
              resolution,
            }
          : {
              imageUrl,
              prompt: prompt.trim(),
              templateId: selectedTemplateId,
              resolution,
              aspectRatio: "9:16",
            }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          await refreshAuth();
          taskQueue.removeTask(activeTaskId);
          if (isCurrentRun()) {
            setIsSubmitting(false);
            setIsGenerating(false);
            router.push("/login");
          }
          return;
        }
        if (res.status === 402) {
          const nextCredits = data.balance ?? 0;
          setCredits(nextCredits);
          if (userId) setCachedProfileCredits(userId, nextCredits);
        }
        throw new Error(data.error || "视频生成失败");
      }

      if (data.credits_remaining !== undefined) {
        setCredits(data.credits_remaining);
        if (userId) setCachedProfileCredits(userId, data.credits_remaining);
      }
      if (typeof data.generation_id === "string" && data.generation_id) {
        const serverTask = taskQueue.replaceWithServerTask(activeTaskId, {
          id: data.generation_id,
          expectedCount: 1,
          inputThumbnails,
          status: data.status || "processing_tryon",
          progress: 25,
        });
        activeTaskId = serverTask.id;
      }
      if (isCurrentRun()) {
        setProgress(25);
        setIsSubmitting(false);
        toast.success("视频任务已提交，可继续创建");
      }

      let elapsedMs = 0;
      while (elapsedMs < VIDEO_GENERATION_POLL_TIMEOUT_MS) {
        const pollDelayMs = elapsedMs < VIDEO_GENERATION_POLL_FAST_WINDOW_MS
          ? VIDEO_GENERATION_POLL_FAST_MS
          : VIDEO_GENERATION_POLL_SLOW_MS;
        await sleep(pollDelayMs);
        elapsedMs += pollDelayMs;
        const poll = await fetch(`${apiPath}?generation_id=${encodeURIComponent(data.generation_id)}`);
        if (!poll.ok) continue;
        const state = await poll.json();
        if (state.status === "processing_tryon" || state.status === "processing" || state.status === "pending") {
          if (Array.isArray(state.result_urls) && state.result_urls.length) {
            latestTaskResultUrls = state.result_urls;
            if (isCurrentRun()) setResultUrls(state.result_urls);
          }
          const runningProgress = Math.min(Number(state.progress) || 25 + (elapsedMs / VIDEO_GENERATION_POLL_TIMEOUT_MS) * 65, 95);
          if (isCurrentRun()) setProgress(runningProgress);
          taskQueue.markRunning(activeTaskId, {
            expectedCount: 1,
            inputThumbnails,
            resultThumbnails: latestTaskResultUrls,
            progress: runningProgress,
            status: state.status,
          });
        } else if (state.status === "completed") {
          const finalUrls = Array.isArray(state.result_urls) ? state.result_urls : latestTaskResultUrls;
          if (isCurrentRun()) {
            setProgress(100);
            setResultUrls(finalUrls);
            setIsGenerating(false);
            toast.success("视频生成完成");
          }
          taskQueue.markCompleted(activeTaskId, {
            expectedCount: 1,
            inputThumbnails,
            resultThumbnails: finalUrls,
            resultCount: finalUrls.length,
          });
          return;
        } else if (state.status === "failed") {
          throw new Error(state.error || "视频生成失败");
        }
      }

      taskQueue.markRunning(activeTaskId, {
        expectedCount: 1,
        inputThumbnails,
        resultThumbnails: latestTaskResultUrls,
        progress: 90,
        status: "processing",
      });
      taskQueue.refresh();
      if (isCurrentRun()) {
        setIsGenerating(false);
        setIsSubmitting(false);
        toast.info("视频仍在后台生成，可稍后在任务队列或作品库查看");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "视频生成失败";
      taskQueue.markFailed(activeTaskId, message, {
        expectedCount: 1,
        inputThumbnails,
        resultThumbnails: latestTaskResultUrls,
      });
      if (isCurrentRun()) {
        setError(message);
        toast.error(message);
        setIsSubmitting(false);
        setIsGenerating(false);
      }
    }
  }

  function handleRunningTask(item: TaskQueueItem) {
    generationRunRef.current += 1;
    setIsSubmitting(false);
    setIsGenerating(true);
    setProgress(Math.min(Math.max(Math.round(Number(item.progress) || 12), 1), 99));
    setError("");
    setResultUrls(safeTaskQueueUrls(item.resultThumbnails));
  }

  async function handleCompletedTask(item: TaskQueueItem, session: TaskSelectionSession) {
    try {
      const detail = await fetchHistoryApplyDetail(item.id, generationKind, session.signal);
      if (!session.isCurrent()) return true;
      applyHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), {
        silent: session.reason === "restore",
      });
      return true;
    } catch (err) {
      if (session.signal.aborted || !session.isCurrent()) return true;
      toast.error(err instanceof Error ? err.message : "历史参数加载失败");
      return true;
    }
  }

  function applyHistoryPayload(payload: VideoImagePayload | VideoMotionPayload, historyResultUrls: string[] = [], options?: { silent?: boolean }) {
    generationRunRef.current += 1;
    if (payload.kind === "videoMotion") {
      setModelImageUrl(payload.modelImageUrl);
      setReferenceVideoUrl(payload.referenceVideoUrl);
      setImageUrl("");
      setPrompt(payload.prompt || "");
      setSelectedTemplateId(payload.templateId || null);
      setResolution(normalizeAiVideoResolution(payload.resolution));
    } else {
      setImageUrl(payload.imageUrl);
      setModelImageUrl("");
      setReferenceVideoUrl("");
      setPrompt(payload.prompt);
      setSelectedTemplateId(payload.templateId || null);
      setResolution(normalizeAiVideoResolution(payload.resolution));
    }
    setResultUrls(historyResultUrls);
    setIsSubmitting(false);
    setIsGenerating(false);
    setProgress(historyResultUrls.length ? 100 : 0);
    setError("");
    if (!options?.silent) toast.success("已套用历史参数");
  }

  function handleContinueCreate() {
    generationRunRef.current += 1;
    setImageUrl("");
    setModelImageUrl("");
    setReferenceVideoUrl("");
    setPrompt(AI_VIDEO_ACTION_TEMPLATES[0]?.promptContent || "");
    setSelectedTemplateId(AI_VIDEO_ACTION_TEMPLATES[0]?.id || null);
    setResolution("720p");
    setResultUrls([]);
    setError("");
    setProgress(0);
    setIsSubmitting(false);
    setIsGenerating(false);
    setTemplatePanelOpen(false);
    setLightboxVideo(null);
  }

  const controlPanel = (
    <div className="studio-parameters-scroll flex-1 overflow-visible p-3 sm:p-5 lg:overflow-y-auto">
      <div className="space-y-4">
        {!isMotion ? (
          <section {...imageDrag.dragHandlers} className={`rounded-xl transition-all ${isDraggingImage ? "ring-2 ring-[rgba(91,124,255,0.38)] ring-offset-2" : ""}`}>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const input = event.currentTarget;
                void handleImageFile(input.files?.[0], "image").finally(() => {
                  input.value = "";
                });
              }}
            />
            <StudioUploadTile
              title="上传图片"
              description="PNG、JPG 或 WebP，建议主体清晰、人物或服装完整。"
              imageUrl={imageUrl || null}
              imageAlt="图生视频输入图"
              isDragging={isDraggingImage}
              loading={isUploadingImage}
              onUploadClick={() => imageInputRef.current?.click()}
              onLibraryClick={() => toast.info("作品库选择即将接入")}
              onPreview={imageUrl ? () => setLightboxVideo(null) : undefined}
              onRemove={imageUrl ? () => setImageUrl("") : undefined}
              libraryLabel="从作品库选择"
              uploadLabel="点击或拖拽上传"
              footnote="模板动作会作为运动方向，图片主体和服装细节会作为硬参考。"
            />
          </section>
        ) : (
          <>
            <section {...modelImageDrag.dragHandlers} className={`rounded-xl transition-all ${isDraggingModelImage ? "ring-2 ring-[rgba(91,124,255,0.38)] ring-offset-2" : ""}`}>
              <input
                ref={modelImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const input = event.currentTarget;
                  void handleImageFile(input.files?.[0], "model").finally(() => {
                    input.value = "";
                  });
                }}
              />
              <StudioUploadTile
                title="上传模特图"
                description="PNG、JPG 或 WebP，人物正面或半身更稳定。"
                imageUrl={modelImageUrl || null}
                imageAlt="动作模仿模特图"
                isDragging={isDraggingModelImage}
                loading={isUploadingModelImage}
                onUploadClick={() => modelImageInputRef.current?.click()}
                onLibraryClick={() => toast.info("作品库选择即将接入")}
                onRemove={modelImageUrl ? () => setModelImageUrl("") : undefined}
                libraryLabel="从作品库选择"
                uploadLabel="点击或拖拽上传"
              />
            </section>
            <section {...videoDrag.dragHandlers} className={`rounded-xl transition-all ${isDraggingVideo ? "ring-2 ring-[rgba(91,124,255,0.38)] ring-offset-2" : ""}`}>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                className="hidden"
                onChange={(event) => {
                  const input = event.currentTarget;
                  void handleVideoFile(input.files?.[0]).finally(() => {
                    input.value = "";
                  });
                }}
              />
              <VideoUploadTile
                videoUrl={referenceVideoUrl}
                isDragging={isDraggingVideo}
                loading={isUploadingVideo}
                onUploadClick={() => videoInputRef.current?.click()}
                onLibraryClick={() => toast.info("作品库选择即将接入")}
                onRemove={referenceVideoUrl ? () => setReferenceVideoUrl("") : undefined}
              />
            </section>
          </>
        )}

        <StudioPromptTextarea
          title={isMotion ? "动作补充" : "动作描述"}
          badge={selectedTemplate ? selectedTemplate.title : "自定义"}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            setSelectedTemplateId(null);
          }}
          rows={isMotion ? 4 : 7}
          placeholder="描述想要的视频动作，例如：模特自然向前走，保持微笑，镜头平稳推进"
          description={isMotion ? "可选：补充服装、动作细节或镜头稳定要求；参考视频仍是主要动作来源。" : "模板会自动填入动作描述，也可以自行编辑。"}
        />

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-codex-ink">动作模板</h3>
            <button
              type="button"
              onClick={() => setTemplatePanelOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-black text-codex-faint transition hover:text-codex-ink"
            >
              更多 <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <TemplateStrip selectedId={selectedTemplateId} onSelect={applyTemplate} />
        </section>

        {isMotion && (
          <section>
            <h3 className="mb-3 text-sm font-black text-codex-ink">分辨率</h3>
            <StudioOptionGrid
              options={AI_VIDEO_RESOLUTION_OPTIONS.map((item) => ({
                value: item.value,
                label: item.label,
                description: `${item.cost} 积分`,
              }))}
              value={resolution}
              onChange={setResolution}
              columns={2}
              ariaLabel="视频分辨率"
            />
          </section>
        )}

        {!isMotion && (
          <section>
            <h3 className="mb-3 text-sm font-black text-codex-ink">分辨率</h3>
            <StudioOptionGrid
              options={AI_VIDEO_RESOLUTION_OPTIONS.map((item) => ({
                value: item.value,
                label: item.label,
                description: `${item.cost} 积分`,
              }))}
              value={resolution}
              onChange={setResolution}
              columns={2}
              ariaLabel="视频分辨率"
            />
          </section>
        )}
      </div>
    </div>
  );

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active={featureKey} />
      <ModuleTaskRail
        module={generationKind}
        moduleLabel={moduleTitle}
        onContinue={handleContinueCreate}
        onRunningTask={handleRunningTask}
        onCompletedTask={handleCompletedTask}
      />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-shell-header">
          <ModuleHeader
            title={moduleLabel}
            tooltip={isMotion
              ? "上传模特图与参考视频，系统会复刻参考视频中的人物动作并生成新视频。"
              : "上传图片并选择动作模板，系统会生成服装或模特展示视频。"}
          />
        </div>
        {controlPanel}
        <StudioRunBar
          summary={isMotion ? "模特图 + 参考视频 · 单个结果" : "单图驱动 · 9:16 竖版视频"}
          costLabel={authIsAnonymous ? "登录后查看积分" : `消耗 ${cost} · 余额 ${credits ?? "-"}`}
          disabled={isSubmitting || Boolean(runDisabledReason)}
          disabledReason={runDisabledReason}
          primaryLabel={authIsAnonymous ? "登录后生成" : isSubmitting ? "提交中..." : isGenerating ? `生成中 ${Math.round(progress)}%` : "生成视频"}
          isLoading={isSubmitting}
          onPrimaryAction={generate}
        />
      </div>

      <main className="studio-canvas min-h-[520px] flex-1 overflow-hidden">
        {error ? (
          <div className="studio-result-stage flex h-full items-center justify-center px-4">
            <div className="max-w-md rounded-[16px] border border-red-100 bg-white/82 p-6 text-center shadow-[0_18px_54px_rgba(15,23,42,0.08)]">
              <X className="mx-auto mb-3 h-10 w-10 rounded-full bg-red-50 p-2 text-red-500" />
              <h2 className="text-base font-black text-red-600">视频生成失败</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{error}</p>
              <button type="button" onClick={() => setError("")} className="mac-button mt-4 h-10 px-5 text-sm font-black">
                返回编辑
              </button>
            </div>
          </div>
        ) : (isGenerating || resultUrls.length > 0) ? (
          <div className="studio-result-stage h-full overflow-y-auto p-4 pb-28 sm:p-6">
            {isGenerating && (
              <div className="mb-4 rounded-xl border border-blue-100 bg-white/80 px-3 py-2 text-xs font-bold text-blue-600 shadow-sm">
                视频生成中 {Math.round(progress)}%，完成后会自动显示在这里。
              </div>
            )}
            <ResultVideoGrid
              urls={resultUrls}
              filenamePrefix={isMotion ? "motion-video" : "image-video"}
              onOpen={(url) => setLightboxVideo(url)}
              expectedCount={isGenerating ? 1 : undefined}
              isGenerating={isGenerating}
              inputThumbnails={inputThumbnails}
              statusGroup={isGenerating ? "running" : undefined}
            />
          </div>
        ) : isMotion ? (
          <MotionControlCanvas />
        ) : (
          <ImageToVideoGuide onOpenTemplates={() => setTemplatePanelOpen(true)} />
        )}
      </main>

      {templatePanelOpen && (
        <StudioSideDrawer
          open={templatePanelOpen}
          side="left"
          size="lg"
          title="动作模板"
          description="选择模板后会自动写入动作描述，也可以在左侧继续编辑。"
          ariaLabel="动作模板选择"
          onClose={() => setTemplatePanelOpen(false)}
        >
          <div className="border-b border-slate-100 px-5 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <TemplateTabs />
              </div>
              <button type="button" className="mac-button inline-flex h-10 shrink-0 items-center gap-2 px-4 text-sm font-black">
                <Sparkles className="h-4 w-4" />
                AI 推荐
              </button>
            </div>
          </div>
          <div className="custom-scroll min-h-0 flex-1 overflow-y-auto p-5">
            <TemplateGrid selectedId={selectedTemplateId} onSelect={applyTemplate} />
          </div>
        </StudioSideDrawer>
      )}

      {lightboxVideo && (
        <ClientPortal>
          <div className="fixed inset-0 z-[180] flex cursor-zoom-out items-center justify-center bg-slate-950/66 p-4 backdrop-blur-xl sm:p-8" onClick={() => setLightboxVideo(null)}>
            <video
              src={lightboxVideo}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full rounded-[16px] bg-black shadow-[0_32px_120px_rgba(0,0,0,0.45)]"
              onClick={(event) => event.stopPropagation()}
            />
            <button onClick={() => setLightboxVideo(null)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/85 bg-white/90 text-slate-700 shadow-[0_12px_34px_rgba(15,23,42,0.22)] backdrop-blur transition-colors hover:bg-white hover:text-slate-950 sm:right-6 sm:top-6">
              <X className="h-5 w-5" />
            </button>
          </div>
        </ClientPortal>
      )}
    </div>
  );
}

function TemplateStrip({ selectedId, onSelect }: { selectedId: number | null; onSelect: (template: AiVideoActionTemplate) => void }) {
  return (
    <div className="studio-scrollbar-hide flex gap-2 overflow-x-auto pb-1">
      {AI_VIDEO_ACTION_TEMPLATES.slice(0, 6).map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={() => onSelect(template)}
          aria-pressed={selectedId === template.id}
          className={`relative h-[78px] w-[68px] shrink-0 overflow-hidden rounded-[12px] border bg-slate-100 transition ${
            selectedId === template.id ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-blue-200"
          }`}
          title={template.title}
        >
          <img src={template.previewImage} alt={template.title} className="h-full w-full object-cover" />
          {selectedId === template.id && <span className="absolute inset-x-2 bottom-1 h-1 rounded-full bg-blue-500" />}
        </button>
      ))}
    </div>
  );
}

function ImageToVideoGuide({ onOpenTemplates }: { onOpenTemplates: () => void }) {
  return (
    <div className="studio-empty-stage flex h-full min-h-[520px] items-center justify-center px-4 py-8">
      <div className="w-full max-w-3xl">
        <PreviewGuide
          title="开始生成服饰视频"
          subtitle="先上传主体清晰的图片，再选择或编辑动作描述；系统会把图片中的人物、服装和细节作为硬参考生成竖版视频。"
          imageSrc={AI_VIDEO_ACTION_TEMPLATES[0]?.previewImage}
          imageAlt="图生视频指引"
          icon={<Clapperboard className="h-9 w-9" />}
          steps={[
            { title: "上传图片", desc: "人物或服装尽量完整，边缘清晰时更容易保持版型和细节。" },
            { title: "选择动作模板", desc: "模板只控制动作和镜头方向，左侧动作描述可以继续微调。" },
            { title: "生成竖版视频", desc: "默认输出 9:16 视频，完成后会显示在当前区域和最近任务中。" },
          ]}
        />
        <div className="mt-5 flex justify-center">
          <button type="button" onClick={onOpenTemplates} className="gradient-brand inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-black text-white shadow-[0_18px_44px_rgba(91,124,255,0.24)]">
            <ImagePlus className="h-4 w-4" />
            选择动作模板
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateTabs() {
  return (
    <div className="flex gap-7 overflow-x-auto text-sm font-black text-slate-950">
      {["示例动作", "男装", "女装", "儿童", "幼童"].map((item, index) => (
        <button
          key={item}
          type="button"
          className={`h-9 shrink-0 border-b-2 px-0.5 transition ${
            index === 0 ? "border-slate-950 text-slate-950" : "border-transparent text-slate-700 hover:text-slate-950"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function TemplateGrid({ selectedId, onSelect }: { selectedId: number | null; onSelect: (template: AiVideoActionTemplate) => void }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {AI_VIDEO_ACTION_TEMPLATES.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          selected={selectedId === template.id}
          onSelect={() => onSelect(template)}
        />
      ))}
    </div>
  );
}

function TemplateCard({ template, selected, onSelect }: { template: AiVideoActionTemplate; selected: boolean; onSelect: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [active]);

  return (
    <article
      className={`group overflow-hidden rounded-[12px] border bg-white shadow-sm transition hover:-translate-y-0.5 ${
        selected ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"
      }`}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-slate-100">
        <img src={template.previewImage} alt={template.title} className={`h-full w-full object-cover transition ${active ? "opacity-0" : "opacity-100"}`} />
        <video
          ref={videoRef}
          src={template.previewVideo}
          muted
          loop
          playsInline
          preload="metadata"
          className={`absolute inset-0 h-full w-full object-cover transition ${active ? "opacity-100" : "opacity-0"}`}
        />
        {active && (
          <span className="absolute left-3 top-3 rounded-full bg-black/72 px-2.5 py-1 text-xs font-black text-white">00:05</span>
        )}
        {selected && (
          <span className="absolute inset-0 flex items-center justify-center bg-slate-950/18 text-white">
            <Maximize2 className="h-9 w-9 drop-shadow" />
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="truncate text-base font-black text-slate-950">{template.title}</h3>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-500">{template.promptContent}</p>
        <button
          type="button"
          onClick={onSelect}
          className="gradient-brand mt-4 inline-flex h-10 w-full items-center justify-center rounded-[8px] text-sm font-black text-white"
        >
          使用模板
        </button>
      </div>
    </article>
  );
}

function VideoUploadTile({
  videoUrl,
  isDragging,
  loading,
  onUploadClick,
  onLibraryClick,
  onRemove,
}: {
  videoUrl: string;
  isDragging: boolean;
  loading: boolean;
  onUploadClick: () => void;
  onLibraryClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className={`studio-upload-tile ${isDragging ? "studio-upload-tile-dragging" : ""}`} aria-busy={loading ? "true" : undefined}>
      <div className="studio-upload-tile-panel">
        {videoUrl ? (
          <div className="studio-upload-tile-main bg-black">
            <video src={videoUrl} controls playsInline preload="metadata" className="h-full w-full object-contain" />
          </div>
        ) : (
          <div className="studio-upload-tile-empty" aria-label="上传参考视频">
            <button type="button" onClick={onUploadClick} disabled={loading} className="studio-upload-tile-heading">
              <span className="studio-upload-tile-icon">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              </span>
              <span className="studio-upload-tile-title">上传参考视频</span>
            </button>
            <span className="studio-upload-tile-description text-center">
              点击上传或拖拽视频到这里
            </span>
            <p className="max-w-[310px] text-center text-xs font-bold leading-6 text-rose-500">
              参考视频中如果有转场或剪切，可能导致生成失败。
            </p>
            <p className="max-w-[330px] text-center text-[12px] font-semibold leading-6 text-codex-faint">
              支持 MP4、MOV，最大 100MB，宽高建议在 340px 到 3850px 之间。
            </p>
            <span className="studio-upload-tile-action-row">
              <button type="button" onClick={onUploadClick} disabled={loading} className="studio-upload-tile-primary">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {loading ? "上传中..." : "点击上传"}
              </button>
              <button type="button" onClick={onLibraryClick} disabled={loading} className="studio-upload-tile-secondary">
                <FolderOpen className="h-3.5 w-3.5" />
                从作品库选择
              </button>
            </span>
          </div>
        )}
      </div>
      {videoUrl && (
        <div className="studio-upload-tile-actions">
          {onRemove && (
            <button type="button" onClick={onRemove} disabled={loading} className="studio-icon-button studio-icon-button-danger" aria-label="删除参考视频" title="删除参考视频">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      {loading && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center rounded-[inherit] bg-white/72 backdrop-blur-[2px]">
          <div className="flex items-center gap-2 rounded-full border border-white/80 bg-white/95 px-3.5 py-2 text-xs font-black text-slate-700 shadow-[0_14px_36px_rgba(15,23,42,0.16)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--codex-accent)]" />
            <span>上传中...</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MotionControlCanvas() {
  return (
    <div className="flex h-full items-center justify-center bg-[#f6f6ff] px-6 py-10">
      <div className="w-full max-w-5xl text-center">
        <h2 className="text-4xl font-black tracking-normal text-slate-950 sm:text-5xl">动作模仿</h2>
        <p className="mt-5 text-lg font-semibold text-slate-500">上传模特图和参考视频，生成同款动作的视频结果。</p>
        <div className="mx-auto mt-14 rounded-[28px] bg-white px-8 py-9 shadow-[0_28px_90px_rgba(91,124,255,0.16)]">
          <div className="grid grid-cols-[1fr_1fr_auto_1fr] items-center gap-6">
            <MotionStep image={AI_VIDEO_ACTION_TEMPLATES[0]?.previewImage || ""} label="模特图" />
            <MotionStep image={AI_VIDEO_ACTION_TEMPLATES[8]?.previewImage || ""} label="参考视频" />
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--codex-accent)] text-white shadow-[0_18px_48px_rgba(91,124,255,0.34)]">
              <ArrowRight className="h-8 w-8" />
            </div>
            <MotionStep image={AI_VIDEO_ACTION_TEMPLATES[6]?.previewImage || ""} label="生成视频" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MotionStep({ image, label }: { image: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="mx-auto aspect-[3/4] w-full max-w-[180px] overflow-hidden rounded-[16px] border border-slate-100 bg-slate-50 shadow-sm">
        <img src={image} alt={label} className="h-full w-full object-cover" />
      </div>
      <p className="mt-4 text-base font-black text-slate-600">{label}</p>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
