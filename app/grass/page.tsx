"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Eye, Loader2, Sparkles, Upload, Wand, X, XCircle, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { ModelPromptPreview } from "@/components/ModelPromptPreview";
import { RepairPromptPanel } from "@/components/RepairPromptPanel";
import { ClientPortal } from "@/components/ClientPortal";
import { PreviewGuide } from "@/components/PreviewGuide";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { StudioGenerationCountSelector, StudioModelSelector, StudioOptionGrid, StudioPromptTextarea } from "@/components/studio/StudioFormControls";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import { useStableFileDrag } from "@/components/studio/useStableFileDrag";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { applyRepairPrompt } from "@/lib/generation-repair";
import {
  buildGrassPrompt,
  DEFAULT_GRASS_USER_PROMPT,
  GRASS_PROMPT_REFERENCES,
  GRASS_TEMPLATES,
  GRASS_UPLOAD_RULE,
  getGrassTemplate,
  normalizeGrassSceneBackgroundMode,
  normalizeGrassSceneMode,
  normalizeGrassTemplate,
  type GrassSceneBackgroundMode,
  type GrassSceneMode,
  type GrassTemplateId,
} from "@/lib/grass-planting";
import { fetchHistoryApplyDetail, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3分/次", badge: "推荐", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4分/次", badge: "最新", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/openai.svg" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4分/次", badge: "推荐", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
];

type GrassHistoryPayload = Extract<HistoryJobPayload, { kind: "grass" }>;

const ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: "3:4", label: "3:4 竖版" },
  { value: "4:5", label: "4:5 种草" },
  { value: "1:1", label: "1:1 方图" },
  { value: "9:16", label: "9:16 手机" },
  { value: "4:3", label: "4:3 横图" },
];

const GRASS_SCENE_MODE_LABELS: Record<GrassSceneMode, string> = {
  system_reference: "系统参考图",
  upload_reference: "上传参考图",
  custom_prompt: "用户自定义",
};

const GRASS_SCENE_BACKGROUND_MODE_LABELS: Record<GrassSceneBackgroundMode, string> = {
  reference_scene: "沿用参考场景",
  similar_style: "AI 重构相似场景",
};

export default function GrassPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const rulesButtonRef = useRef<HTMLButtonElement>(null);
  const rulesHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    authChecked,
    isAuthenticated,
    userId,
    credits,
    setCredits,
    refreshAuth,
  } = useStudioAuth();
  const [garmentUrl, setGarmentUrl] = useState("");
  const [garmentName, setGarmentName] = useState("");
  const [templateId, setTemplateId] = useState<GrassTemplateId>("street");
  const [sceneMode, setSceneMode] = useState<GrassSceneMode>("system_reference");
  const [sceneBackgroundMode, setSceneBackgroundMode] = useState<GrassSceneBackgroundMode>("reference_scene");
  const [uploadedReferenceUrl, setUploadedReferenceUrl] = useState("");
  const [uploadedReferenceName, setUploadedReferenceName] = useState("");
  const [changeModel, setChangeModel] = useState(true);
  const [userPrompt, setUserPrompt] = useState(DEFAULT_GRASS_USER_PROMPT);
  const [supplementPrompt, setSupplementPrompt] = useState("");
  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingReference, setIsDraggingReference] = useState(false);
  const [isUploadingGarment, setIsUploadingGarment] = useState(false);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [rulesPopoverStyle, setRulesPopoverStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const referenceDrag = useStableFileDrag<HTMLDivElement>({
    isDragging: isDraggingReference,
    setDragging: setIsDraggingReference,
    fileFilter: (file) => file.type.startsWith("image/"),
    onFiles: (files) => handleReferenceFile(files[0]),
  });

  const selectedTemplate = useMemo(() => getGrassTemplate(templateId), [templateId]);
  const effectiveReferenceUrl = sceneMode === "system_reference"
    ? selectedTemplate.imageUrl
    : sceneMode === "upload_reference"
      ? uploadedReferenceUrl
      : "";
  const effectiveReferenceName = sceneMode === "system_reference"
    ? selectedTemplate.name
    : sceneMode === "upload_reference"
      ? uploadedReferenceName || "上传参考图"
      : "用户自定义";
  const promptImages = useMemo(() => [
    ...(garmentUrl ? [{ imageNumber: 1, url: garmentUrl, role: "服装/穿搭硬参考" }] : []),
    ...(effectiveReferenceUrl ? [{
      imageNumber: 2,
      url: effectiveReferenceUrl,
      role: sceneMode === "system_reference"
        ? `系统种草参考图 / ${selectedTemplate.name}`
        : sceneBackgroundMode === "similar_style"
          ? "上传种草参考图 / 场景风格参考"
          : "上传种草参考图 / 场景姿势构图参考",
    }] : []),
  ], [garmentUrl, effectiveReferenceUrl, sceneMode, sceneBackgroundMode, selectedTemplate.name]);
  const taskInputThumbnails = useMemo(
    () => promptImages.map((item) => item.url).filter(Boolean),
    [promptImages]
  );
  const activePrompt = sceneMode === "custom_prompt" ? userPrompt : supplementPrompt;
  const finalPrompt = useMemo(
    () => promptOverride ?? buildGrassPrompt({
      templateId,
      userPrompt: activePrompt,
      changeModel,
      sceneMode,
      hasReference: !!effectiveReferenceUrl,
      referenceName: effectiveReferenceName,
      sceneBackgroundMode,
    }),
    [promptOverride, templateId, activePrompt, changeModel, sceneMode, effectiveReferenceUrl, effectiveReferenceName, sceneBackgroundMode]
  );
  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const cost = getCreditCost(aiModel, imageSize, aspectRatio) * genCount;
  const taskQueue = useTaskQueueGeneration({
    module: "grass",
    title: "种草图",
    defaultExpectedCount: genCount,
    applyPath: "/grass",
  });
  const authIsAnonymous = authChecked && !isAuthenticated;
  const runDisabledReason = !garmentUrl
    ? "请先上传服装或穿搭图"
    : credits !== null && credits < cost
      ? `积分不足，生成需要 ${cost} 积分`
      : undefined;

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  function applyGrassHistoryPayload(payload: GrassHistoryPayload, historyResultUrls: string[] = [], options?: { silent?: boolean }) {
    setGarmentUrl(payload.garmentUrl);
    setTemplateId(normalizeGrassTemplate(payload.templateId));
    const nextSceneMode = normalizeGrassSceneMode(payload.sceneMode || (payload.referenceUrl ? "upload_reference" : "system_reference"));
    setSceneMode(nextSceneMode);
    setSceneBackgroundMode(normalizeGrassSceneBackgroundMode(payload.sceneBackgroundMode));
    setUploadedReferenceUrl(payload.referenceUrl || "");
    setUploadedReferenceName(payload.referenceUrl ? "历史参考图" : "");
    setChangeModel(payload.changeModel);
    if (nextSceneMode === "custom_prompt") {
      setUserPrompt(payload.userPrompt || DEFAULT_GRASS_USER_PROMPT);
      setSupplementPrompt("");
    } else {
      setSupplementPrompt(payload.userPrompt || "");
    }
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setGenCount(payload.genCount);
    setPromptOverride(payload.prompt);
    setResultUrls(historyResultUrls);
    setIsGenerating(false);
    setProgress(historyResultUrls.length ? 100 : 0);
    setError("");
    if (!options?.silent) toast.success("已套用历史参数");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
    const detail = await takeApplyDetail("grass");
    const payload = detail?.payload;
    if (cancelled || !payload) return;
    setGarmentUrl(payload.garmentUrl);
    setTemplateId(normalizeGrassTemplate(payload.templateId));
    const nextSceneMode = normalizeGrassSceneMode(payload.sceneMode || (payload.referenceUrl ? "upload_reference" : "system_reference"));
    setSceneMode(nextSceneMode);
    setSceneBackgroundMode(normalizeGrassSceneBackgroundMode(payload.sceneBackgroundMode));
    setUploadedReferenceUrl(payload.referenceUrl || "");
    setUploadedReferenceName(payload.referenceUrl ? "历史参考图" : "");
    setChangeModel(payload.changeModel);
    if (nextSceneMode === "custom_prompt") {
      setUserPrompt(payload.userPrompt || DEFAULT_GRASS_USER_PROMPT);
      setSupplementPrompt("");
    } else {
      setSupplementPrompt(payload.userPrompt || "");
    }
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setGenCount(payload.genCount);
    setPromptOverride(payload.prompt);
    toast.success("已套用历史参数");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    if (rulesHideTimerRef.current) clearTimeout(rulesHideTimerRef.current);
  }, []);

  const cancelRulesHide = () => {
    if (rulesHideTimerRef.current) clearTimeout(rulesHideTimerRef.current);
  };
  const openRulesPopover = () => {
    cancelRulesHide();
    const rect = rulesButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(720, window.innerWidth - 32);
    const top = Math.max(16, Math.min(rect.top - 10, window.innerHeight - 360));
    const left = Math.max(16, Math.min(rect.right + 12, window.innerWidth - width - 16));
    setRulesPopoverStyle({ top, left, maxHeight: Math.max(320, window.innerHeight - top - 16) });
    setShowRules(true);
  };
  const scheduleRulesHide = () => {
    cancelRulesHide();
    rulesHideTimerRef.current = setTimeout(() => {
      setShowRules(false);
      setRulesPopoverStyle(null);
    }, 120);
  };

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("请上传图片文件");
    if (file.size > MAX_FILE_SIZE) return toast.error(`图片不能超过 ${MAX_FILE_SIZE_MB}MB`);
    setResultUrls([]);
    setError("");
    toast.info("正在上传服装图...");
    setIsUploadingGarment(true);
    try {
      const result = await uploadImage(file);
      setGarmentUrl(result.url);
      setGarmentName(file.name);
      setPromptOverride(null);
      toast.success("服装图已上传");
    } catch {
      toast.error("上传失败，请重试");
    } finally {
      setIsUploadingGarment(false);
    }
  }

  async function handleReferenceFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("请上传图片文件");
    if (file.size > MAX_FILE_SIZE) return toast.error(`图片不能超过 ${MAX_FILE_SIZE_MB}MB`);
    toast.info("正在上传种草参考图...");
    setIsUploadingReference(true);
    try {
      const result = await uploadImage(file);
      setUploadedReferenceUrl(result.url);
      setUploadedReferenceName(file.name);
      setSceneMode("upload_reference");
      setPromptOverride(null);
      toast.success("参考图已作为图2接入");
    } catch {
      toast.error("参考图上传失败，请重试");
    } finally {
      setIsUploadingReference(false);
      if (referenceInputRef.current) referenceInputRef.current.value = "";
    }
  }

  function applyDemo(demo: { title: string; imageUrl: string }) {
    setGarmentUrl(demo.imageUrl);
    setGarmentName(demo.title);
    setPromptOverride(null);
    setResultUrls([]);
    setError("");
    setShowRules(false);
    toast.success("已套用示例图");
  }

  function applyPromptReference(text: string) {
    setUserPrompt(text);
    setPromptOverride(null);
    setSceneMode("custom_prompt");
  }

  async function generate(promptForRun?: string) {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (!garmentUrl) return toast.error("请先上传服装图");
    if (sceneMode === "upload_reference" && !uploadedReferenceUrl) return toast.error("请先上传种草参考图");
    if (credits !== null && credits < cost) return toast.error(`积分不足，需要 ${cost}，余额 ${credits}`);

    setIsGenerating(true);
    setProgress(10);
    setResultUrls([]);
    setError("");
    const provisionalTask = taskQueue.startTask({
      expectedCount: genCount,
      inputThumbnails: taskInputThumbnails,
      progress: 10,
    });
    let activeTaskId = provisionalTask.id;
    let latestTaskResultUrls: string[] = [];

    try {
      const res = await fetch("/api/grass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garment_url: garmentUrl,
          template_id: templateId,
          change_model: changeModel,
          user_prompt: activePrompt,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          gen_count: genCount,
          reference_url: effectiveReferenceUrl || null,
          scene_mode: sceneMode,
          scene_background_mode: sceneBackgroundMode,
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
      setProgress(25);
      if (typeof data.generation_id === "string" && data.generation_id) {
        const serverTask = taskQueue.replaceWithServerTask(activeTaskId, {
          id: data.generation_id,
          expectedCount: genCount,
          inputThumbnails: taskInputThumbnails,
          status: data.status || "processing_tryon",
          progress: 25,
        });
        activeTaskId = serverTask.id;
      }
      for (let attempts = 0; attempts < 120; attempts++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await fetch(`/api/grass?generation_id=${data.generation_id}`);
        if (!poll.ok) continue;
        const state = await poll.json();
        if (Array.isArray(state.result_urls) && state.result_urls.length) {
          latestTaskResultUrls = state.result_urls;
          setResultUrls(state.result_urls);
        }
        if (state.status === "completed") {
          const finalUrls = Array.isArray(state.result_urls) ? state.result_urls : latestTaskResultUrls;
          setProgress(100);
          setResultUrls(finalUrls);
          setIsGenerating(false);
          taskQueue.markCompleted(activeTaskId, {
            expectedCount: genCount,
            inputThumbnails: taskInputThumbnails,
            resultThumbnails: finalUrls,
            resultCount: finalUrls.length,
          });
          toast.success("服装种草图生成完成");
          return;
        }
        if (state.status === "failed") throw new Error(state.error || "生成失败");
        const nextProgress = Number(state.progress);
        const runningProgress = Number.isFinite(nextProgress)
          ? Math.min(Math.max(Math.round(nextProgress), 0), 99)
          : Math.min(25 + attempts * 1.5, 90);
        setProgress(runningProgress);
        taskQueue.markRunning(activeTaskId, {
          expectedCount: genCount,
          inputThumbnails: taskInputThumbnails,
          resultThumbnails: latestTaskResultUrls,
          progress: runningProgress,
          status: state.status,
        });
      }
      throw new Error("生成超时");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "生成失败";
      setError(message);
      taskQueue.markFailed(activeTaskId, message, {
        expectedCount: genCount,
        inputThumbnails: taskInputThumbnails,
        resultThumbnails: latestTaskResultUrls,
      });
      toast.error(message);
      setIsGenerating(false);
    }
  }

  function handleRepairGenerate(repairValue: string) {
    const repairedPrompt = applyRepairPrompt(finalPrompt, "grass", repairValue);
    setPromptOverride(repairedPrompt);
    toast.info("已加入修复指令，正在重新生成...");
    generate(repairedPrompt);
  }

  function handleRunningTask(item: TaskQueueItem) {
    setGenCount(clampTaskExpectedCount(item, 1, 4));
    setIsGenerating(true);
    setProgress(Math.min(Math.max(Math.round(Number(item.progress) || 12), 1), 99));
    setError("");
    setResultUrls(safeTaskQueueUrls(item.resultThumbnails));
  }

  async function handleCompletedTask(item: TaskQueueItem, session: TaskSelectionSession) {
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "grass", session.signal);
      if (!session.isCurrent()) return true;
      applyGrassHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), {
        silent: session.reason === "restore",
      });
      return true;
    } catch (err) {
      if (session.signal.aborted || !session.isCurrent()) return true;
      toast.error(err instanceof Error ? err.message : "历史参数加载失败");
      return true;
    }
  }

  function handleContinueCreate() {
    setIsGenerating(false);
    setProgress(0);
    setResultUrls([]);
    setError("");
  }

  async function handleOptimizeGenerationPrompt() {
    if (!garmentUrl) {
      toast.error("请先上传服装图");
      return;
    }
    setIsOptimizingPrompt(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch("/api/optimize-generation-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          module_kind: "grass",
          base_prompt: finalPrompt,
          user_context: activePrompt,
          images: promptImages,
        }),
      }).finally(() => clearTimeout(timeout));
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.prompt) {
        setPromptOverride(data.prompt);
        toast.success("AI 已优化完整提示词");
      } else {
        toast.error(data.error || "暂时没有返回优化结果");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.name === "AbortError" ? "AI 优化超时" : "AI 优化失败");
    } finally {
      setIsOptimizingPrompt(false);
    }
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="grass" />
      <ModuleTaskRail module="grass" moduleLabel="种草图" onContinue={handleContinueCreate} onRunningTask={handleRunningTask} onCompletedTask={handleCompletedTask} />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          <ModuleHeader
            title="服装种草图"
            tooltip="上传服装或穿搭图，保持同款穿搭不变，生成街拍、咖啡店、自拍、居家等真实种草内容图。"
            actions={(
              <button
                ref={rulesButtonRef}
                type="button"
                onMouseEnter={openRulesPopover}
                onMouseLeave={scheduleRulesHide}
                onFocus={openRulesPopover}
                onBlur={scheduleRulesHide}
                className="studio-upload-rule-button"
              >
                图片规则 <ChevronRight className="h-3 w-3" />
              </button>
            )}
          />

          <StudioUploadSection
            title="上传服装"
            inputRef={fileInputRef}
            isDragging={isDragging}
            setDragging={setIsDragging}
            onFiles={async (files) => {
              await handleFile(files[0]);
            }}
          >
            {(openFileDialog, dragContext) => (
              <>
                <StudioUploadTile
                  title="上传服装或穿搭图"
                  description="平铺图、人台图、上身图都可以，主体越完整越稳定。"
                  imageUrl={garmentUrl || null}
                  imageAlt="服装图"
                  isDragging={isDragging}
                  loading={isUploadingGarment}
                  onUploadClick={openFileDialog}
                  onLibraryClick={() => toast.info("作品库选择即将接入")}
                  onPreview={garmentUrl ? () => setLightboxSrc(garmentUrl) : undefined}
                  onRemove={garmentUrl ? () => setGarmentUrl("") : undefined}
                  onDropFile={(file) => handleFile(file)}
                  dragContext={dragContext}
                  uploadLabel="从本地上传"
                  libraryLabel="从作品选择"
                  footnote={garmentUrl ? garmentName || "已上传" : "款式图上传无遮挡、无码图；平铺、人台或自然上身图都可以。"}
                  examples={{
                    label: "试一试",
                    images: GRASS_UPLOAD_RULE.demos.map((demo) => ({ url: demo.imageUrl, title: demo.title })),
                    onSelect: (image) => applyDemo({ title: image.title, imageUrl: image.url }),
                  }}
                  />
                </>
              )}
            </StudioUploadSection>

          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-bold text-sm">参考图 / 场景</h3>
              <span className="rounded-full bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-600">
                {sceneMode === "custom_prompt" ? "提示词为准" : effectiveReferenceName}
              </span>
            </div>

            <StudioOptionGrid
              options={[
                { value: "system_reference" as const, label: "系统参考图" },
                { value: "upload_reference" as const, label: "上传参考图" },
                { value: "custom_prompt" as const, label: "用户自定义" },
              ]}
              value={sceneMode}
              onChange={(value) => { setSceneMode(value); setPromptOverride(null); }}
              columns={3}
              ariaLabel="种草方式"
            />

            {sceneMode === "system_reference" && (
              <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white/55 p-3">
                <div className="grid grid-cols-3 gap-2">
                  {GRASS_TEMPLATES.map((tpl) => (
                    <div
                      key={tpl.id}
                      className={`group relative overflow-hidden rounded-xl border bg-white text-center shadow-sm transition ${templateId === tpl.id ? "border-purple-500 ring-2 ring-purple-100" : "border-slate-100 hover:border-violet-200"}`}
                    >
                      <button
                        type="button"
                        onClick={() => { setTemplateId(tpl.id); setPromptOverride(null); }}
                        className="block w-full text-center"
                      >
                        <div className="relative aspect-[3/4] overflow-hidden bg-slate-100">
                          <img src={tpl.imageUrl} alt={tpl.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                        </div>
                        <p className="truncate px-1.5 py-1.5 text-[11px] font-bold text-slate-800">{tpl.name}</p>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLightboxSrc(tpl.imageUrl); }}
                        className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-slate-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-white hover:text-violet-600"
                        title="放大预览"
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                      </button>
                      <div className="pointer-events-none absolute inset-0">
                        {templateId === tpl.id && <CheckCircle2 className="absolute left-1.5 top-1.5 h-4 w-4 rounded-full bg-white text-emerald-500" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sceneMode === "upload_reference" && (
              <div
                {...referenceDrag.dragHandlers}
                className={`studio-stable-upload-boundary mt-3 rounded-2xl border border-dashed bg-white/70 p-3 transition ${isDraggingReference ? "border-[rgba(91,124,255,0.48)] ring-2 ring-[rgba(91,124,255,0.16)]" : "border-slate-200"}`}
              >
                <input
                  ref={referenceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const input = event.currentTarget;
                    void handleReferenceFile(input.files?.[0]).finally(() => {
                      input.value = "";
                    });
                  }}
                />
                {uploadedReferenceUrl ? (
                  <div className="group studio-fixed-upload-preview relative overflow-hidden rounded-xl bg-slate-100" style={{ "--studio-fixed-preview-height": "208px" } as CSSProperties}>
                    <img src={uploadedReferenceUrl} alt="种草参考图" className="h-full w-full object-contain p-2" />
                    <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-2">
                      <span className="truncate rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">{uploadedReferenceName || "已上传参考图"}</span>
                      <span className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setLightboxSrc(uploadedReferenceUrl)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-slate-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-white hover:text-violet-600"
                          title="放大预览"
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setUploadedReferenceUrl(""); setUploadedReferenceName(""); setPromptOverride(null); }}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm hover:bg-white"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </span>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => referenceInputRef.current?.click()}
                    disabled={isUploadingReference}
                    className="studio-fixed-upload-slot flex w-full flex-col items-center justify-center rounded-xl bg-slate-50 px-4 py-6 text-center hover:bg-slate-100"
                    style={{ "--studio-fixed-upload-height": "160px" } as CSSProperties}
                  >
                    {isUploadingReference ? (
                      <Loader2 className="mb-3 h-7 w-7 animate-spin text-violet-400" />
                    ) : (
                      <Upload className="mb-3 h-7 w-7 text-violet-400" />
                    )}
                    <span className="text-sm font-semibold text-slate-800">{isUploadingReference ? "上传中..." : "上传种草参考图"}</span>
                    <span className="mt-1 text-[11px] text-slate-400">姿势、场景、构图会作为图2进入提示词</span>
                  </button>
                )}
              </div>
            )}

            {sceneMode === "custom_prompt" ? (
              <div className="mt-3 space-y-3">
                <StudioPromptTextarea
                  value={userPrompt}
                  onChange={(e) => { setUserPrompt(e.target.value); setPromptOverride(null); }}
                  placeholder="改变模特、背景、构图、姿势，保持服装与穿搭单品不变。"
                  className="studio-prompt-textarea-compact"
                />
                <div>
                  <p className="mb-2 text-[11px] font-bold text-slate-500">参考提示词</p>
                  <div className="space-y-2">
                    {GRASS_PROMPT_REFERENCES.map((item) => (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => applyPromptReference(item.text)}
                        className="w-full rounded-xl border border-slate-100 bg-white/80 px-3 py-2 text-left transition hover:border-purple-200 hover:bg-purple-50/40"
                      >
                        <p className="text-xs font-bold text-slate-800">{item.title}</p>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">{item.text}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <StudioPromptTextarea
                  title="补充要求"
                  badge="可选"
                  value={supplementPrompt}
                  onChange={(e) => { setSupplementPrompt(e.target.value); setPromptOverride(null); }}
                  placeholder="例如：突出显瘦、通勤、高级感；保留真实肤色，不要过度美颜。"
                  rows={3}
                  description="不影响图2参考优先级。"
                />
              </div>
            )}
          </section>

          {sceneMode !== "custom_prompt" && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">人物控制</h3>
                <span className="text-[11px] text-slate-400">只影响人物，不改服装</span>
              </div>
              <p className="mb-3 text-[11px] leading-5 text-slate-500">
                选择是否替换画面中的模特；服装、单品、颜色和穿搭关系仍以图1为准。
              </p>
              <StudioOptionGrid
                options={[
                  { value: "replace", label: "更换模特", description: "新真人模特" },
                  { value: "keep", label: "保持模特", description: "沿用原图人物" },
                ]}
                value={changeModel ? "replace" : "keep"}
                onChange={(value) => { setChangeModel(value === "replace"); setPromptOverride(null); }}
                columns={2}
                ariaLabel="人物控制"
              />
            </section>
          )}

          {sceneMode !== "custom_prompt" && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">场景控制</h3>
                <span className="text-[11px] text-slate-400">控制背景相似度</span>
              </div>
              <p className="mb-3 text-[11px] leading-5 text-slate-500">
                可让 AI 只学习参考图的光线、色调和空间气质，重新生成同风格但不完全相同的背景，降低照搬风险。
              </p>
              <StudioOptionGrid
                options={[
                  { value: "reference_scene" as const, label: "沿用参考场景", description: "保持现有效果" },
                  { value: "similar_style" as const, label: "AI 重构相似场景", description: "同风格不照搬" },
                ]}
                value={sceneBackgroundMode}
                onChange={(value) => { setSceneBackgroundMode(value); setPromptOverride(null); }}
                columns={2}
                ariaLabel="场景控制"
              />
            </section>
          )}

          <section>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500" /> 生成模型</h3>
            <StudioModelSelector models={MODELS} value={aiModel} onChange={setAiModel} ariaLabel="生成模型" />
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">图片比例</h3>
            <StudioOptionGrid options={ASPECTS} value={aspectRatio} onChange={setAspectRatio} ariaLabel="图片比例" />
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">分辨率</h3>
            <StudioOptionGrid
              options={imageSizes.map((s) => ({ value: s, label: `${s} · ${getCreditCost(aiModel, s, aspectRatio)}积分` }))}
              value={imageSize}
              onChange={setImageSize}
              ariaLabel="分辨率"
            />
          </section>

          <section>
            <button type="button" onClick={() => setShowPromptPreview(true)} className="studio-prompt-trigger flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all"><Eye className="w-3.5 h-3.5" /> 查看完整提示词</button>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">生成数量</h3>
            <StudioGenerationCountSelector
              value={genCount}
              onChange={setGenCount}
              ariaLabel="生成数量"
            />
          </section>
        </div>

        <StudioRunBar
          summary={`${garmentUrl ? `${effectiveReferenceUrl ? 2 : 1} 张输入图` : "未上传"} · ${genCount} 张`}
          costLabel={authIsAnonymous ? "登录后查看积分" : `消耗 ${cost} · 余额 ${credits ?? "-"}`}
          disabled={isGenerating || Boolean(runDisabledReason)}
          disabledReason={runDisabledReason}
          primaryLabel={authIsAnonymous ? "登录后生成" : isGenerating ? "生成中..." : `生成 ${genCount} 张`}
          isLoading={isGenerating}
          onPrimaryAction={() => generate()}
        />
      </div>

      <div className="studio-canvas relative flex-1 min-h-[520px] lg:h-full overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title="生成服装种草图"
              subtitle="图1始终是服装硬参考，图2或文字只决定场景、姿势、构图和社媒氛围。"
              imageSrc="https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/model-grey-tank-denim.jpg"
              imageAlt="服装种草图指引"
              steps={[
                { title: "上传服装图", desc: "服装与穿搭单品会作为最高优先级保留，不改款式和颜色。" },
                { title: "选择种草方式", desc: "可用系统模板、上传场景参考图，或切到用户自定义输入完整提示词。" },
                { title: "生成社媒成片", desc: "输出真实自然的小红书、电商封面和穿搭分享图。" },
              ]}
            />
          </div>
        )}
        {(isGenerating || resultUrls.length > 0) && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            <div className="flex min-h-0 flex-1 items-start justify-start">
              <ResultImageGrid
                urls={resultUrls}
                filenamePrefix="grass"
                extension="jpg"
                expectedCount={isGenerating ? genCount : undefined}
                isGenerating={isGenerating}
                inputThumbnails={promptImages.map((item) => item.url)}
                statusGroup={isGenerating ? "running" : undefined}
                variant="task"
                onOpen={setLightboxSrc}
              />
            </div>
            <div className="mt-4 flex justify-center"><RepairPromptPanel kind="grass" onRepair={handleRepairGenerate} disabled={isGenerating} className="w-full max-w-3xl" /></div>
          </div>
        )}
        {error && (
          <ErrorStage
            error={error}
            onRetry={() => setError("")}
            onRepair={handleRepairGenerate}
            isGenerating={isGenerating}
            repairKind="grass"
          />
        )}
      </div>

      {showRules && rulesPopoverStyle && (
        <ClientPortal>
          <div className="fixed z-[240] w-[min(720px,calc(100vw-32px))] overflow-hidden rounded-[24px] border border-white/80 bg-white/[0.96] shadow-[0_28px_90px_rgba(15,23,42,0.18)] backdrop-blur-2xl animate-fade-in" style={{ top: rulesPopoverStyle.top, left: rulesPopoverStyle.left, maxHeight: rulesPopoverStyle.maxHeight }} onMouseEnter={cancelRulesHide} onMouseLeave={scheduleRulesHide}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4"><div><h3 className="text-base font-black text-slate-950">{GRASS_UPLOAD_RULE.title}</h3><p className="mt-1 text-xs text-slate-400">{GRASS_UPLOAD_RULE.uploadSpecText}</p></div><button type="button" onClick={() => setShowRules(false)} className="rounded-full p-1.5 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            <div className="max-h-[inherit] overflow-y-auto p-5">
              <div className="grid grid-cols-5 gap-3">{GRASS_UPLOAD_RULE.demos.map((demo) => <div key={demo.imageUrl} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-2"><div className="relative overflow-hidden rounded-xl bg-white"><img src={demo.imageUrl} alt={demo.title} className="aspect-[3/4] w-full object-cover" /><CheckCircle2 className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white text-emerald-500" /></div><p className="mt-2 text-center text-xs text-slate-600">{demo.title}</p><button type="button" onClick={() => applyDemo(demo)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-violet-200 hover:text-violet-600">试一试</button></div>)}</div>
              <p className="my-4 text-center text-xs font-medium text-slate-500">请勿上传以下错误图片，会极大影响生成效果</p>
              <div className="mx-auto grid max-w-md grid-cols-3 gap-3">{GRASS_UPLOAD_RULE.badExamples.map((image) => <div key={image.title} className="rounded-2xl border border-red-100 bg-white/70 p-2 text-center"><div className="relative overflow-hidden rounded-xl bg-white"><img src={image.imageUrl} alt={image.title} className="aspect-square w-full object-cover" /><XCircle className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white text-red-500" /></div><p className="mt-1 text-xs text-slate-500">{image.title}</p></div>)}</div>
            </div>
          </div>
        </ClientPortal>
      )}

      {showPromptPreview && (
        <ClientPortal>
          <div className="fixed inset-0 z-[220] flex min-h-dvh w-dvw items-center justify-center bg-slate-950/38 p-4 backdrop-blur-xl sm:p-6" onClick={() => setShowPromptPreview(false)}>
            <div className="max-h-[86dvh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/80 bg-white/[0.94] shadow-[0_32px_100px_rgba(15,23,42,0.22)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b px-5 py-3">
                <h3 className="text-sm font-bold">{promptOverride ? "完整提示词" : "默认提示词模板"}</h3>
                <button onClick={() => setShowPromptPreview(false)} className="rounded p-1 hover:bg-gray-100"><X className="w-4 h-4" /></button>
              </div>
              <div className="border-b bg-gray-50 px-5 py-2">
                <div className="flex flex-wrap gap-2">
                  {promptImages.map((image) => (
                    <span key={`${image.imageNumber}-${image.url}`} className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                      图{image.imageNumber}：{image.role}
                    </span>
                  ))}
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    {GRASS_SCENE_MODE_LABELS[sceneMode]}
                  </span>
                  {sceneMode !== "custom_prompt" && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                      {GRASS_SCENE_BACKGROUND_MODE_LABELS[sceneBackgroundMode]}
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-[64dvh] space-y-3 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  {[
                    ["模型", aiModel],
                    ["比例", aspectRatio],
                    ["分辨率", imageSize],
                    ["生成张数", `${genCount}`],
                    ["场景模式", GRASS_SCENE_MODE_LABELS[sceneMode]],
                    ["种草参考", effectiveReferenceUrl ? effectiveReferenceName : "未使用"],
                    ["模特控制", sceneMode === "custom_prompt" ? "提示词为准" : changeModel ? "更换模特" : "保持模特"],
                    ["场景控制", sceneMode === "custom_prompt" ? "提示词为准" : GRASS_SCENE_BACKGROUND_MODE_LABELS[sceneBackgroundMode]],
                    ["补充输入", activePrompt || "无"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border bg-gray-50 px-3 py-2">
                      <p className="text-[10px] text-gray-400">{label}</p>
                      <p className="break-words text-xs font-medium text-gray-700">{value}</p>
                    </div>
                  ))}
                </div>
                <StudioPromptTextarea
                  value={finalPrompt}
                  onChange={(e) => setPromptOverride(e.target.value)}
                  className="studio-prompt-textarea-tall"
                />
                <ModelPromptPreview kind="grass" model={aiModel} prompt={finalPrompt} className="mt-3" />
                <button
                  type="button"
                  onClick={handleOptimizeGenerationPrompt}
                  disabled={isOptimizingPrompt || !garmentUrl}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-purple-200 py-2 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-40"
                >
                  {isOptimizingPrompt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
                  AI 优化完整提示词
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const repaired = applyRepairPrompt(finalPrompt, "grass", "garment_restore");
                    setPromptOverride(repaired);
                    navigator.clipboard.writeText(repaired);
                    toast.success("已复制并套用服装还原修复提示词");
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-purple-200 py-2 text-xs font-medium text-purple-600 hover:bg-purple-50"
                >
                  <Wand className="w-3.5 h-3.5" /> 一键加强服装还原
                </button>
              </div>
              <div className="flex justify-between gap-2 border-t bg-gray-50 px-5 py-3">
                <button
                  onClick={() => {
                    setPromptOverride(null);
                    toast.success("已重置为默认提示词");
                  }}
                  className="rounded-full border border-dashed border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-purple-300 hover:text-purple-600"
                >
                  重置默认
                </button>
                <div className="flex gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(finalPrompt); toast.success("已复制"); }} className="rounded-full border px-4 py-1.5 text-xs font-medium hover:bg-gray-50">复制</button>
                  <button onClick={() => setShowPromptPreview(false)} className="gradient-brand rounded-full px-4 py-1.5 text-xs font-medium text-white">关闭</button>
                </div>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}

      {lightboxSrc && (
        <ClientPortal>
          <div className="fixed inset-0 z-[180] flex cursor-zoom-out items-center justify-center bg-slate-950/66 p-4 backdrop-blur-xl sm:p-8" onClick={() => setLightboxSrc(null)}>
            <img src={lightboxSrc} className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_32px_120px_rgba(0,0,0,0.45)]" />
            <button onClick={() => setLightboxSrc(null)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/85 bg-white/90 text-slate-700 shadow-[0_12px_34px_rgba(15,23,42,0.22)] backdrop-blur transition-colors hover:bg-white hover:text-slate-950 sm:right-6 sm:top-6">
              <X className="w-5 h-5" />
            </button>
          </div>
        </ClientPortal>
      )}
    </div>
  );
}
