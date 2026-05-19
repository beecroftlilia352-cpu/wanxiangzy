"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Images,
  Loader2,
  Sparkles,
  UserRound,
  X,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { ClientPortal } from "@/components/ClientPortal";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { RepairPromptPanel } from "@/components/RepairPromptPanel";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { StudioGenerationCountSelector, StudioModelSelector, StudioOptionGrid, StudioPromptTextarea } from "@/components/studio/StudioFormControls";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import { useStableFileDrag } from "@/components/studio/useStableFileDrag";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { applyRepairPrompt } from "@/lib/generation-repair";
import { fetchHistoryApplyDetail, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import {
  BACKGROUND_PRESETS,
  BACKGROUND_SOURCE_LABELS,
  BACKGROUND_TEXT_PRESETS,
  DEFAULT_BACKGROUND_TEXT,
  MODEL_BACKGROUND_MODE_LABELS,
  MODEL_BACKGROUND_USER_PROMPT_PLACEHOLDER,
  MODEL_BACKGROUND_UPLOAD_RULE,
  PRESET_BACKGROUND_MODELS,
  buildModelBackgroundPrompt,
  getBackgroundPreset,
  normalizeBackgroundPreset,
  normalizeBackgroundSourceMode,
  normalizeModelBackgroundMode,
  type BackgroundPresetId,
  type BackgroundSourceMode,
  type ModelBackgroundMode,
} from "@/lib/model-background";

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3分/次", badge: "推荐", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4分/次", badge: "最新", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/openai.svg" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4分/次", badge: "推荐", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
];

type ModelBackgroundHistoryPayload = Extract<HistoryJobPayload, { kind: "modelBackground" }>;

const ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: "3:4", label: "3:4 竖版" },
  { value: "4:5", label: "4:5 种草" },
  { value: "1:1", label: "1:1 方图" },
  { value: "9:16", label: "9:16 手机" },
  { value: "4:3", label: "4:3 横图" },
];

const MODE_OPTIONS: { value: ModelBackgroundMode; desc: string }[] = [
  { value: "background_only", desc: "默认" },
  { value: "model_background", desc: "换人+景" },
  { value: "model_only", desc: "只换脸" },
];

const BACKGROUND_SOURCE_OPTIONS: BackgroundSourceMode[] = ["preset", "upload", "text"];
const CARD_ZOOM_BUTTON_CLASS =
  "absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-slate-600 opacity-0 shadow-sm transition-opacity hover:bg-white hover:text-violet-600 focus:opacity-100 group-hover:opacity-100";

type UploadTarget = "source" | "model" | "background";

export default function ModelBackgroundPage() {
  const router = useRouter();
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
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
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [mode, setMode] = useState<ModelBackgroundMode>("background_only");
  const [modelReferenceUrl, setModelReferenceUrl] = useState("");
  const [modelReferenceName, setModelReferenceName] = useState("");
  const [backgroundSource, setBackgroundSource] = useState<BackgroundSourceMode>("preset");
  const [backgroundPresetId, setBackgroundPresetId] = useState<BackgroundPresetId>("cafe-courtyard");
  const [backgroundReferenceUrl, setBackgroundReferenceUrl] = useState(BACKGROUND_PRESETS[0].imageUrl);
  const [backgroundText, setBackgroundText] = useState(DEFAULT_BACKGROUND_TEXT);
  const [userPrompt, setUserPrompt] = useState("");
  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<UploadTarget | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [runningExpectedCount, setRunningExpectedCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [rulesPopoverStyle, setRulesPopoverStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const sourceDrag = useStableFileDrag<HTMLDivElement>({
    isDragging,
    setDragging: setIsDragging,
    fileFilter: (file) => file.type.startsWith("image/"),
    onFiles: (files) => handleUpload(files[0], "source"),
  });

  const hasModelReference = mode !== "background_only" && Boolean(modelReferenceUrl);
  const hasBackgroundReference = mode !== "model_only" && (backgroundSource === "preset" || backgroundSource === "upload") && Boolean(backgroundReferenceUrl);
  const selectedBackgroundPreset = useMemo(() => getBackgroundPreset(backgroundPresetId), [backgroundPresetId]);
  const promptImages = useMemo(() => [
    ...(sourceUrl ? [{ imageNumber: 1, url: sourceUrl, role: "原始人物/服装/穿搭硬参考" }] : []),
    ...(hasModelReference ? [{ imageNumber: 2, url: modelReferenceUrl, role: mode === "model_only" ? "脸部参考图 / 只替换主图脸部" : "必选模特参考图 / 人物气质身份参考" }] : []),
    ...(hasBackgroundReference ? [{ imageNumber: mode === "model_background" ? 3 : 2, url: backgroundReferenceUrl, role: "背景参考图 / 场景光线构图参考" }] : []),
  ], [sourceUrl, hasModelReference, modelReferenceUrl, mode, hasBackgroundReference, backgroundReferenceUrl]);
  const taskInputThumbnails = useMemo(
    () => promptImages.map((item) => item.url).filter(Boolean),
    [promptImages]
  );
  const finalPrompt = useMemo(() => promptOverride ?? buildModelBackgroundPrompt({
    mode,
    backgroundSource,
    templateId: backgroundPresetId,
    backgroundText,
    userPrompt,
    hasModelReference,
    hasBackgroundReference,
  }), [promptOverride, mode, backgroundSource, backgroundPresetId, backgroundText, userPrompt, hasModelReference, hasBackgroundReference]);
  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const cost = getCreditCost(aiModel, imageSize, aspectRatio) * genCount;
  const taskQueue = useTaskQueueGeneration({
    module: "modelBackground",
    title: "换背景",
    defaultExpectedCount: genCount,
    applyPath: "/model-background",
  });
  const authIsAnonymous = authChecked && !isAuthenticated;
  const runDisabledReason = !sourceUrl
    ? "请先上传原图"
    : mode !== "background_only" && !modelReferenceUrl
      ? "请选择或上传模特参考图"
      : mode !== "model_only" && (backgroundSource === "preset" || backgroundSource === "upload") && !backgroundReferenceUrl
        ? "请选择或上传背景参考图"
        : credits !== null && credits < cost
          ? `积分不足，生成需要 ${cost} 积分`
          : undefined;
  const backgroundReferenceLabel = mode === "model_only"
    ? "未使用"
    : backgroundSource === "preset"
      ? selectedBackgroundPreset.name
      : backgroundSource === "upload"
        ? backgroundReferenceUrl ? "自定义上传" : "未上传"
        : "文生背景";

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  function applyModelBackgroundHistoryPayload(payload: ModelBackgroundHistoryPayload, historyResultUrls: string[] = [], options?: { silent?: boolean }) {
    const nextSource = normalizeBackgroundSourceMode(payload.backgroundSource);
    const nextPreset = normalizeBackgroundPreset(payload.templateId);
    setSourceUrl(payload.sourceUrl);
    setModelReferenceUrl(payload.modelReferenceUrl || "");
    setModelReferenceName(payload.modelReferenceUrl ? "历史模特" : "");
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
    if (!options?.silent) toast.success("已套用历史参数");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
    const detail = await takeApplyDetail("modelBackground");
    const payload = detail?.payload;
    if (cancelled || !payload) return;
    const nextSource = normalizeBackgroundSourceMode(payload.backgroundSource);
    const nextPreset = normalizeBackgroundPreset(payload.templateId);
    setSourceUrl(payload.sourceUrl);
    setModelReferenceUrl(payload.modelReferenceUrl || "");
    setModelReferenceName(payload.modelReferenceUrl ? "历史模特" : "");
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
    setResultUrls(detail?.resultUrls || []);
    setIsGenerating(false);
    setProgress(detail?.resultUrls.length ? 100 : 0);
    setError("");
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
    const width = Math.min(760, window.innerWidth - 32);
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

  async function handleUpload(file: File | undefined, target: UploadTarget) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("请上传图片文件");
    if (file.size > MAX_FILE_SIZE) return toast.error(`图片不能超过 ${MAX_FILE_SIZE_MB}MB`);
    const label = target === "source" ? "原图" : target === "model" ? "模特参考图" : "背景参考图";
    toast.info(`正在上传${label}...`);
    setUploadingTarget(target);
    try {
      const result = await uploadImage(file);
      if (target === "source") {
        setSourceUrl(result.url);
        setSourceName(file.name);
        setResultUrls([]);
      } else if (target === "model") {
        setModelReferenceUrl(result.url);
        setModelReferenceName("自定义");
      } else {
        setBackgroundReferenceUrl(result.url);
        setBackgroundSource("upload");
      }
      setPromptOverride(null);
      toast.success(`${label}已上传`);
    } catch {
      toast.error("上传失败，请重试");
    } finally {
      setUploadingTarget(null);
    }
  }

  function applyDemo(demo: { title: string; imageUrl: string }) {
    setSourceUrl(demo.imageUrl);
    setSourceName(demo.title);
    setPromptOverride(null);
    setResultUrls([]);
    setError("");
    setShowRules(false);
    setRulesPopoverStyle(null);
    toast.success("已套用示例图");
  }

  async function generate(promptForRun?: string) {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (!sourceUrl) return toast.error("请先上传原图");
    if (mode !== "background_only" && !modelReferenceUrl) return toast.error("请选择或上传模特参考图");
    if (mode !== "model_only" && (backgroundSource === "preset" || backgroundSource === "upload") && !backgroundReferenceUrl) return toast.error("请选择或上传背景参考图");
    if (credits !== null && credits < cost) return toast.error(`积分不足，需要 ${cost}，余额 ${credits}`);

    setIsGenerating(true);
    setRunningExpectedCount(genCount);
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
      const res = await fetch("/api/model-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_url: sourceUrl,
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
          gen_count: genCount,
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
        const poll = await fetch(`/api/model-background?generation_id=${data.generation_id}`);
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
            resultCount: finalUrls.filter(Boolean).length,
          });
          toast.success("换背景生成完成");
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
    const repairedPrompt = applyRepairPrompt(finalPrompt, "tryon", repairValue);
    setPromptOverride(repairedPrompt);
    toast.info("已加入修复指令，正在重新生成...");
    generate(repairedPrompt);
  }

  function handleRunningTask(item: TaskQueueItem) {
    setRunningExpectedCount(clampTaskExpectedCount(item, 1, 4));
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
      return true;
    } catch (err) {
      if (session.signal.aborted || !session.isCurrent()) return true;
      toast.error(err instanceof Error ? err.message : "历史参数加载失败");
      return true;
    }
  }

  function handleContinueCreate() {
    setSourceUrl("");
    setSourceName("");
    setMode("background_only");
    setModelReferenceUrl("");
    setModelReferenceName("");
    setBackgroundSource("preset");
    setBackgroundPresetId("cafe-courtyard");
    setBackgroundReferenceUrl(BACKGROUND_PRESETS[0].imageUrl);
    setBackgroundText(DEFAULT_BACKGROUND_TEXT);
    setUserPrompt("");
    setAiModel("nano-banana-2");
    setAspectRatio("3:4");
    setImageSize("1K");
    setGenCount(1);
    setPromptOverride(null);
    setIsGenerating(false);
    setRunningExpectedCount(null);
    setProgress(0);
    setResultUrls([]);
    setError("");
    setLightboxSrc(null);
    setShowRules(false);
    setRulesPopoverStyle(null);
    if (sourceInputRef.current) sourceInputRef.current.value = "";
    if (modelInputRef.current) modelInputRef.current.value = "";
    if (backgroundInputRef.current) backgroundInputRef.current.value = "";
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="modelBackground" />
      <ModuleTaskRail module="modelBackground" moduleLabel="换背景" onContinue={handleContinueCreate} onRunningTask={handleRunningTask} onCompletedTask={handleCompletedTask} />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5">
          <ModuleHeader
            title="换背景"
            tooltip="默认只替换原图背景，人物、服装和穿搭保持不变；切换到换模特时需要先选择或上传模特参考图。"
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
                图片规则 <ChevronRight className="h-3 w-3" />
              </button>
            )}
          />

          <section
            {...sourceDrag.dragHandlers}
            className={`studio-stable-upload-boundary relative rounded-xl transition-all ${isDragging ? "ring-2 ring-[rgba(91,124,255,0.38)] ring-offset-2" : ""}`}
          >
            <input
              ref={sourceInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const input = event.currentTarget;
                void handleUpload(input.files?.[0], "source").finally(() => {
                  input.value = "";
                });
              }}
            />
            <StudioUploadTile
              title="上传需要处理的原图"
              description="图1作为服装、人物关系和构图基础，建议主体完整、服装清晰。"
              imageUrl={sourceUrl || null}
              imageAlt="原图"
              isDragging={isDragging}
              loading={uploadingTarget === "source"}
              onUploadClick={() => sourceInputRef.current?.click()}
              onLibraryClick={() => toast.info("作品库选择即将接入")}
              onPreview={sourceUrl ? () => setLightboxSrc(sourceUrl) : undefined}
              onRemove={sourceUrl ? () => {
                setSourceUrl("");
                setSourceName("");
                setPromptOverride(null);
              } : undefined}
              libraryLabel="从作品选择"
              footnote="人物和服装主体完整、边缘清楚时最稳；换背景/换模特都会优先保留穿搭。"
              examples={{
                label: "试一试",
                images: MODEL_BACKGROUND_UPLOAD_RULE.demos.map((demo) => ({ url: demo.imageUrl, title: demo.title })),
                onSelect: (image) => applyDemo({ title: image.title, imageUrl: image.url }),
              }}
            />
            {sourceName ? <p className="mt-2 truncate text-[11px] text-slate-400">{sourceName}</p> : null}
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">操作模式</h3>
            <StudioOptionGrid
              options={MODE_OPTIONS.map((item) => ({
                value: item.value,
                label: MODEL_BACKGROUND_MODE_LABELS[item.value],
                description: item.desc,
              }))}
              value={mode}
              onChange={(value) => { setMode(value); setPromptOverride(null); }}
              columns={3}
              ariaLabel="操作模式"
            />
          </section>

          {mode !== "background_only" ? (
            <section>
              <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
                <UserRound className="w-4 h-4 text-purple-500" /> 模特参考 <span className="text-purple-400 font-normal text-xs">· 必选</span>
                <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 text-[9px]">请选择</span>
              </h3>
              <p className="text-[11px] text-gray-400 mb-3">
                {mode === "model_only" ? "只换主图脸部，身体、服装、发型、姿势、背景都保持原图不变。" : "请选择系统模特或上传模特图，再替换模特与背景；图1服装和穿搭仍保持不变。"}
              </p>
              <input
                ref={modelInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const input = event.currentTarget;
                  void handleUpload(input.files?.[0], "model").finally(() => {
                    input.value = "";
                  });
                }}
              />
              <div className="grid grid-cols-3 gap-2">
                {PRESET_BACKGROUND_MODELS.map((model) => (
                  <div
                    key={model.id}
                    className={`group relative overflow-hidden rounded-lg border-2 transition-all ${modelReferenceUrl === model.imageUrl ? "border-purple-500 ring-1 ring-purple-200" : "border-transparent hover:border-gray-300"}`}
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
                      <img src={model.imageUrl} alt={model.name} className="aspect-square w-full object-cover" />
                      <div className="p-1 text-center"><span className="text-[10px] font-medium">{model.name}</span></div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLightboxSrc(model.imageUrl); }}
                      className={CARD_ZOOM_BUTTON_CLASS}
                      title="放大预览"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                    {modelReferenceUrl === model.imageUrl ? <CheckCircle2 className="absolute left-1.5 top-1.5 h-4 w-4 rounded-full bg-white text-emerald-500" /> : null}
                  </div>
                ))}
                <div className={`group relative overflow-hidden rounded-lg border-2 border-dashed transition-all ${modelReferenceUrl && !PRESET_BACKGROUND_MODELS.some((item) => item.imageUrl === modelReferenceUrl) ? "border-purple-400 bg-purple-50" : "border-gray-200 hover:border-purple-300"}`}>
                  <button type="button" onClick={() => modelInputRef.current?.click()} className="flex aspect-square w-full flex-col items-center justify-center">
                    {modelReferenceUrl && !PRESET_BACKGROUND_MODELS.some((item) => item.imageUrl === modelReferenceUrl)
                      ? <img src={modelReferenceUrl} alt={modelReferenceName || "自定义模特"} className="h-full w-full rounded-lg object-contain p-1" />
                      : <><Camera className="w-5 h-5 text-gray-300" /><span className="mt-1 text-[10px] text-gray-400">点击上传</span></>
                    }
                  </button>
                  {modelReferenceUrl && !PRESET_BACKGROUND_MODELS.some((item) => item.imageUrl === modelReferenceUrl) ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLightboxSrc(modelReferenceUrl); }}
                      className={CARD_ZOOM_BUTTON_CLASS}
                      title="放大预览"
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
              <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-950">
                <Images className="h-4 w-4 text-purple-500" /> 参考图 / 场景
              </h3>
              <p className="mb-3 text-[11px] text-slate-400">预设背景、上传背景和文生背景互斥；选择参考图后会优先锁定场景、光线和构图氛围。</p>
              <div className="mb-3">
                <StudioOptionGrid
                  options={BACKGROUND_SOURCE_OPTIONS.map((item) => ({
                    value: item,
                    label: BACKGROUND_SOURCE_LABELS[item],
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
                  ariaLabel="背景来源"
                />
              </div>
              <input
                ref={backgroundInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const input = event.currentTarget;
                  void handleUpload(input.files?.[0], "background").finally(() => {
                    input.value = "";
                  });
                }}
              />
              {backgroundSource === "preset" ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/55 p-3">
                  <p className="mb-3 text-[11px] text-slate-500">选择系统参考图，只参考场景、光线、色彩和空间氛围。</p>
                  <div className="grid grid-cols-3 gap-2">
                    {BACKGROUND_PRESETS.map((item) => (
                      <div key={item.id} className={`group relative overflow-hidden rounded-xl border bg-white text-center shadow-sm transition ${backgroundPresetId === item.id ? "border-purple-500 ring-2 ring-purple-100" : "border-slate-100 hover:border-violet-200"}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setBackgroundPresetId(item.id);
                            setBackgroundReferenceUrl(item.imageUrl);
                            setPromptOverride(null);
                          }}
                          className="block w-full"
                        >
                          <div className="relative aspect-[3/4] overflow-hidden bg-slate-100">
                            <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                          </div>
                          <p className="truncate px-1.5 py-1.5 text-[11px] font-bold text-slate-800">{item.name}</p>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setLightboxSrc(item.imageUrl); }}
                          className={CARD_ZOOM_BUTTON_CLASS}
                          title="放大预览"
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </button>
                        {backgroundPresetId === item.id ? <CheckCircle2 className="absolute left-2 top-2 h-4 w-4 rounded-full bg-white text-emerald-500" /> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : backgroundSource === "upload" ? (
                <button type="button" onClick={() => backgroundInputRef.current?.click()} className="group studio-upload-dropzone studio-fixed-upload-slot flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-200 p-3 text-center transition hover:border-purple-300" style={{ "--studio-fixed-upload-height": "328px" } as CSSProperties}>
                  {backgroundReferenceUrl ? (
                    <div className="studio-fixed-upload-preview studio-checkerboard relative mb-2 overflow-hidden rounded-xl" style={{ "--studio-fixed-preview-height": "220px" } as CSSProperties}>
                      <img src={backgroundReferenceUrl} alt="背景参考" className="h-full w-full object-contain p-2" />
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setLightboxSrc(backgroundReferenceUrl); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setLightboxSrc(backgroundReferenceUrl);
                          }
                        }}
                        className={CARD_ZOOM_BUTTON_CLASS}
                        title="放大预览"
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  ) : (
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                      <Images className="h-7 w-7 text-violet-500" />
                    </div>
                  )}
                  <span className="text-sm font-semibold text-slate-800">{backgroundReferenceUrl ? "更换背景参考图" : "上传背景参考图"}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-500">只参考场景、光线、空间和构图氛围，不复制图里的衣服或人物。</span>
                </button>
              ) : (
                <div className="space-y-3">
                <StudioPromptTextarea value={backgroundText} onChange={(e) => { setBackgroundText(e.target.value); setPromptOverride(null); }} rows={4} className="studio-prompt-textarea-compact" placeholder="描述你想要的背景..." />
                  <div className="flex flex-wrap gap-2">
                    {BACKGROUND_TEXT_PRESETS.map((preset) => (
                      <button key={preset} type="button" onClick={() => { setBackgroundText(preset); setPromptOverride(null); }} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600 hover:border-purple-200 hover:text-purple-600">
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <StudioPromptTextarea
            title="补充要求"
            badge="可选"
            value={userPrompt}
            onChange={(e) => { setUserPrompt(e.target.value); setPromptOverride(null); }}
            rows={4}
            placeholder={MODEL_BACKGROUND_USER_PROMPT_PLACEHOLDER}
          />

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-950"><Sparkles className="h-4 w-4 text-[var(--codex-accent)]" /> 生成模型</h3>
            <StudioModelSelector
              models={MODELS}
              value={aiModel}
              onChange={setAiModel}
              ariaLabel="生成模型"
              getMeta={(model) => `${model.desc} · 当前${getCreditCost(model.value, imageSize, aspectRatio)}积分`}
            />
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-950">图片比例</h3>
            <StudioOptionGrid options={ASPECTS} value={aspectRatio} onChange={setAspectRatio} columns={3} ariaLabel="图片比例" />
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-950">分辨率</h3>
            <StudioOptionGrid
              options={imageSizes.map((size) => ({
                value: size,
                label: `${size} · ${getCreditCost(aiModel, size, aspectRatio)}积分`,
              }))}
              value={imageSize}
              onChange={setImageSize}
              columns={3}
              ariaLabel="分辨率"
            />
          </section>
          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-950">生成数量</h3>
            <StudioGenerationCountSelector
              value={genCount}
              onChange={setGenCount}
              ariaLabel="生成数量"
            />
          </section>
        </div>
        <StudioRunBar
          summary={`${sourceUrl ? "原图已上传" : "等待上传原图"} · ${genCount} 张`}
          costLabel={authIsAnonymous ? "登录后查看积分" : `消耗 ${cost} · 余额 ${credits ?? "-"}`}
          disabled={isGenerating || Boolean(runDisabledReason)}
          disabledReason={runDisabledReason}
          primaryLabel={authIsAnonymous ? "登录后生成" : isGenerating ? `生成中 ${Math.round(progress)}%` : `生成 ${genCount} 张`}
          isLoading={isGenerating}
          onPrimaryAction={() => generate()}
        />
      </div>

      <div className="studio-canvas relative flex-1 min-h-[520px] lg:h-full overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title="创建模特换背景作品"
              subtitle="默认只换背景；切到换模特相关模式时，必须先选择或上传模特参考图。"
              imageSrc="https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/background-male-jacket.webp"
              imageAlt="模特换背景指引"
              steps={[
                { title: "上传原图", desc: "原图中的人物、服装和穿搭是保留对象，先作为主参考输入。" },
                { title: "选择操作模式", desc: "只换背景、换背景换模特、只换模特分别对应不同输入要求。" },
                { title: "补充背景 / 模特参考", desc: "背景参考控制环境光影；模特参考仅在换模特模式中生效。" },
              ]}
            />
          </div>
        )}

        {(isGenerating || resultUrls.length > 0) && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            <div className="flex min-h-0 flex-1 items-start justify-start">
              <ResultImageGrid
                urls={resultUrls}
                filenamePrefix="model-background"
                expectedCount={isGenerating ? runningExpectedCount || genCount : undefined}
                isGenerating={isGenerating}
                inputThumbnails={promptImages.map((item) => item.url)}
                statusGroup={isGenerating ? "running" : undefined}
                variant="task"
                onOpen={setLightboxSrc}
              />
            </div>
            <div className="mt-4 flex justify-center">
              <RepairPromptPanel kind="tryon" onRepair={handleRepairGenerate} disabled={isGenerating} className="w-full max-w-3xl" />
            </div>
          </div>
        )}

        {error && (
          <ErrorStage
            error={error}
            onRetry={() => setError("")}
            onRepair={handleRepairGenerate}
            isGenerating={isGenerating}
            repairKind="modelBackground"
          />
        )}
      </div>

      {showRules && rulesPopoverStyle ? (
        <ClientPortal>
          <div
            className="fixed z-[240] w-[min(760px,calc(100vw-32px))] overflow-hidden rounded-[24px] border border-white/80 bg-white/[0.96] shadow-[0_28px_90px_rgba(15,23,42,0.18)] backdrop-blur-2xl animate-fade-in"
            style={{ top: rulesPopoverStyle.top, left: rulesPopoverStyle.left, maxHeight: rulesPopoverStyle.maxHeight }}
            onMouseEnter={cancelRulesHide}
            onMouseLeave={scheduleRulesHide}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-black text-slate-950">{MODEL_BACKGROUND_UPLOAD_RULE.title}</h3>
                <p className="mt-1 text-xs text-slate-400">{MODEL_BACKGROUND_UPLOAD_RULE.uploadSpecText}</p>
              </div>
              <button type="button" onClick={() => setShowRules(false)} className="rounded-full p-1.5 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="studio-scrollbar-hide overflow-y-auto px-5 py-4" style={{ maxHeight: rulesPopoverStyle.maxHeight - 88 }}>
              <div className="grid gap-3 md:grid-cols-4">
                {MODEL_BACKGROUND_UPLOAD_RULE.demos.map((demo) => (
                  <div key={demo.imageUrl} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
                    <div className="relative overflow-hidden rounded-xl bg-white">
                      <img src={demo.imageUrl} alt={demo.title} className="aspect-[3/4] w-full object-cover" />
                      <CheckCircle2 className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white text-emerald-500" />
                    </div>
                    <p className="mt-2 text-center text-xs font-semibold text-slate-700">{demo.title}</p>
                    <button type="button" onClick={() => applyDemo(demo)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-violet-200 hover:text-violet-600">试一试</button>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-center text-xs font-semibold text-slate-500">小贴士：请勿上传以下错误图片，会极大影响生成效果</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                {MODEL_BACKGROUND_UPLOAD_RULE.badExamples.map((bad) => (
                  <div key={bad.imageUrl} className="rounded-2xl border border-red-100 bg-red-50/50 p-2">
                    <div className="relative overflow-hidden rounded-xl bg-white">
                      <img src={bad.imageUrl} alt={bad.title} className="aspect-[3/4] w-full object-cover" />
                      <X className="absolute right-2 top-2 h-5 w-5 rounded-full bg-red-500 p-0.5 text-white" />
                    </div>
                    <p className="mt-2 text-center text-xs font-semibold text-slate-700">{bad.title}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ClientPortal>
      ) : null}

      {lightboxSrc ? (
        <ClientPortal>
          <div className="fixed inset-0 z-[180] flex cursor-zoom-out items-center justify-center bg-slate-950/66 p-4 backdrop-blur-xl sm:p-8" onClick={() => setLightboxSrc(null)}>
            <img src={lightboxSrc} alt="预览" className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_32px_120px_rgba(0,0,0,0.45)]" />
            <button type="button" onClick={() => setLightboxSrc(null)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/85 bg-white/90 text-slate-700 shadow-[0_12px_34px_rgba(15,23,42,0.22)] backdrop-blur transition-colors hover:bg-white hover:text-slate-950 sm:right-6 sm:top-6">
              <X className="h-5 w-5" />
            </button>
          </div>
        </ClientPortal>
      ) : null}
    </div>
  );
}
