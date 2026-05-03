"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Eye,
  FolderOpen,
  Images,
  Loader2,
  Sparkles,
  Upload,
  UserRound,
  Wand,
  X,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { ClientPortal } from "@/components/ClientPortal";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { ModelPromptPreview } from "@/components/ModelPromptPreview";
import { PreviewGuide } from "@/components/PreviewGuide";
import { RepairPromptPanel } from "@/components/RepairPromptPanel";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { createClient, getCachedProfileCredits, setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { applyRepairPrompt } from "@/lib/generation-repair";
import { takeApplyPayload } from "@/lib/history-apply";
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
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 高质感", badge: "推荐", icon: "/model-icons/openai.svg" },
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "快速稳定", badge: "稳定", icon: "/model-icons/gemini.png" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "细节更强", icon: "/model-icons/gemini.png" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "风格自然", icon: "/model-icons/doubao.png" },
];

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
  const supabase = createClient();
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const rulesButtonRef = useRef<HTMLButtonElement>(null);
  const rulesHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
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
  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [rulesPopoverStyle, setRulesPopoverStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const hasModelReference = mode !== "background_only" && Boolean(modelReferenceUrl);
  const hasBackgroundReference = mode !== "model_only" && (backgroundSource === "preset" || backgroundSource === "upload") && Boolean(backgroundReferenceUrl);
  const selectedBackgroundPreset = useMemo(() => getBackgroundPreset(backgroundPresetId), [backgroundPresetId]);
  const promptImages = useMemo(() => [
    ...(sourceUrl ? [{ imageNumber: 1, url: sourceUrl, role: "原始人物/服装/穿搭硬参考" }] : []),
    ...(hasModelReference ? [{ imageNumber: 2, url: modelReferenceUrl, role: mode === "model_only" ? "脸部参考图 / 只替换主图脸部" : "必选模特参考图 / 人物气质身份参考" }] : []),
    ...(hasBackgroundReference ? [{ imageNumber: mode === "model_background" ? 3 : 2, url: backgroundReferenceUrl, role: "背景参考图 / 场景光线构图参考" }] : []),
  ], [sourceUrl, hasModelReference, modelReferenceUrl, mode, hasBackgroundReference, backgroundReferenceUrl]);
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
  const backgroundReferenceLabel = mode === "model_only"
    ? "未使用"
    : backgroundSource === "preset"
      ? selectedBackgroundPreset.name
      : backgroundSource === "upload"
        ? backgroundReferenceUrl ? "自定义上传" : "未上传"
        : "文生背景";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setIsAuthenticated(true);
        setUserId(data.user.id);
        getCachedProfileCredits(data.user.id).then(setCredits);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
        setUserId(session.user.id);
        getCachedProfileCredits(session.user.id).then(setCredits);
      } else {
        setIsAuthenticated(false);
        setUserId(null);
        setCredits(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  useEffect(() => {
    const payload = takeApplyPayload("modelBackground");
    if (!payload) return;
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
    toast.success("已套用历史参数");
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
    if (!isAuthenticated) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (!sourceUrl) return toast.error("请先上传原图");
    if (mode !== "background_only" && !modelReferenceUrl) return toast.error("请选择或上传模特参考图");
    if (mode !== "model_only" && (backgroundSource === "preset" || backgroundSource === "upload") && !backgroundReferenceUrl) return toast.error("请选择或上传背景参考图");
    if (credits !== null && credits < cost) return toast.error(`积分不足，需要 ${cost}，余额 ${credits}`);

    setIsGenerating(true);
    setProgress(10);
    setResultUrls([]);
    setError("");

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
      for (let attempts = 0; attempts < 120; attempts++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await fetch(`/api/model-background?generation_id=${data.generation_id}`);
        if (!poll.ok) continue;
        const state = await poll.json();
        if (state.status === "completed") {
          setProgress(100);
          setResultUrls(state.result_urls || []);
          setIsGenerating(false);
          toast.success("换背景生成完成");
          return;
        }
        if (state.status === "failed") throw new Error(state.error || "生成失败");
        setProgress(Math.min(25 + attempts * 1.5, 90));
      }
      throw new Error("生成超时");
    } catch (err: any) {
      setError(err.message || "生成失败");
      toast.error(err.message || "生成失败");
      setIsGenerating(false);
    }
  }

  function handleRepairGenerate(repairValue: string) {
    const repairedPrompt = applyRepairPrompt(finalPrompt, "tryon", repairValue);
    setPromptOverride(repairedPrompt);
    toast.info("已加入修复指令，正在重新生成...");
    generate(repairedPrompt);
  }

  async function handleOptimizeGenerationPrompt() {
    if (!sourceUrl) {
      toast.error("请先上传原图");
      return;
    }
    if (mode !== "background_only" && !modelReferenceUrl) {
      toast.error("请选择或上传模特参考图");
      return;
    }
    if (mode !== "model_only" && (backgroundSource === "preset" || backgroundSource === "upload") && !backgroundReferenceUrl) {
      toast.error("请选择或上传背景参考图");
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
          module_kind: "modelBackground",
          base_prompt: finalPrompt,
          user_context: `${MODEL_BACKGROUND_MODE_LABELS[mode]} / ${BACKGROUND_SOURCE_LABELS[backgroundSource]} / 补充：${userPrompt.trim() || "无"}`,
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
    } catch (err: any) {
      toast.error(err?.name === "AbortError" ? "AI 优化超时" : "AI 优化失败");
    } finally {
      setIsOptimizingPrompt(false);
    }
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="modelBackground" />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5">
          <ModuleHeader title="换背景" tooltip="默认只替换原图背景，人物、服装和穿搭保持不变；切换到换模特时需要先选择或上传模特参考图。" />

          <section
            onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleUpload(e.dataTransfer.files?.[0], "source"); }}
            className={`relative rounded-xl transition-all ${isDragging ? "ring-2 ring-purple-400 ring-offset-2" : ""}`}
          >
            <div className="studio-upload-header">
              <h3 className="studio-upload-title"><Upload className="h-4 w-4 text-purple-500" /> 上传人物/穿搭原图</h3>
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
            </div>
            <input ref={sourceInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0], "source")} />
            <div className="relative overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50/70">
              {sourceUrl ? (
                <div className="group studio-checkerboard relative flex h-[320px] items-center justify-center overflow-hidden rounded-2xl">
                  <img src={sourceUrl} alt="原图" className="h-full w-full object-contain p-3" />
                  <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">图1 原图</span>
                  <div className="absolute right-2 top-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLightboxSrc(sourceUrl)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/92 text-slate-600 opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-violet-600 focus:opacity-100 group-hover:opacity-100"
                      title="放大预览"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSourceUrl("");
                        setSourceName("");
                        setPromptOverride(null);
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/92 text-slate-700 shadow-sm backdrop-blur hover:text-slate-950"
                      title="移除图片"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="studio-upload-dropzone flex min-h-52 flex-col items-center justify-center px-4 py-8 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <Images className="h-7 w-7 text-violet-500" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">上传需要处理的原图</p>
                  <p className="mt-1 max-w-[300px] text-xs leading-relaxed text-slate-500">图1作为服装、人物关系和构图基础，建议主体完整、服装清晰。</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <button type="button" onClick={() => sourceInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-violet-700">
                      <Upload className="h-3.5 w-3.5" /> 从本地上传
                    </button>
                    <button type="button" onClick={() => toast.info("作品库选择即将接入")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300">
                      <FolderOpen className="h-3.5 w-3.5" /> 从作品选择
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">{MODEL_BACKGROUND_UPLOAD_RULE.uploadSpecText}</p>
                </div>
              )}
            </div>
            {sourceName ? <p className="mt-2 truncate text-[11px] text-slate-400">{sourceName}</p> : null}
            <div className="mt-3 flex items-center gap-2">
              <span className="shrink-0 text-[11px] font-medium text-slate-400">试一试</span>
              <div className="studio-scrollbar-hide flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                {MODEL_BACKGROUND_UPLOAD_RULE.demos.map((demo) => (
                  <button key={demo.imageUrl} type="button" onClick={() => applyDemo(demo)} className="group flex h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 shadow-sm transition-all hover:border-violet-200" title={demo.title}>
                    <img src={demo.imageUrl} alt={demo.title} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">操作模式</h3>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
              {MODE_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => { setMode(item.value); setPromptOverride(null); }}
                  className={`rounded-xl px-2 py-2 text-center transition-all ${mode === item.value ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  <span className="block text-xs font-bold">{MODEL_BACKGROUND_MODE_LABELS[item.value]}</span>
                  <span className="mt-0.5 block text-[10px] opacity-70">{item.desc}</span>
                </button>
              ))}
            </div>
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
              <input ref={modelInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0], "model")} />
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
                      ? <img src={modelReferenceUrl} alt={modelReferenceName || "自定义模特"} className="h-full w-full rounded-lg object-cover" />
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
              <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
                {BACKGROUND_SOURCE_OPTIONS.map((item) => (
                  <button key={item} type="button" onClick={() => {
                    setBackgroundSource(item);
                    if (item === "preset") {
                      setBackgroundReferenceUrl(getBackgroundPreset(backgroundPresetId).imageUrl);
                    }
                    if (item === "upload" && backgroundSource !== "upload") {
                      setBackgroundReferenceUrl("");
                    }
                    setPromptOverride(null);
                  }} className={`rounded-xl px-2 py-2 text-xs font-bold transition ${backgroundSource === item ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                    {BACKGROUND_SOURCE_LABELS[item]}
                  </button>
                ))}
              </div>
              <input ref={backgroundInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0], "background")} />
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
                <button type="button" onClick={() => backgroundInputRef.current?.click()} className="group studio-upload-dropzone w-full overflow-hidden rounded-2xl border border-dashed border-slate-200 p-3 text-center transition hover:border-purple-300">
                  {backgroundReferenceUrl ? (
                    <div className="relative mb-2 overflow-hidden rounded-xl">
                      <img src={backgroundReferenceUrl} alt="背景参考" className="aspect-[3/4] w-full object-cover" />
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
                  <textarea value={backgroundText} onChange={(e) => { setBackgroundText(e.target.value); setPromptOverride(null); }} rows={4} className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-100" placeholder="描述你想要的背景..." />
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

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-950">
              补充要求 <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">可选</span>
            </h3>
            <textarea
              value={userPrompt}
              onChange={(e) => { setUserPrompt(e.target.value); setPromptOverride(null); }}
              rows={4}
              className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-sm leading-relaxed outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-100"
              placeholder={MODEL_BACKGROUND_USER_PROMPT_PLACEHOLDER}
            />
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-950"><Sparkles className="h-4 w-4 text-purple-500" /> 生成模型</h3>
            <div className="grid grid-cols-2 gap-2">
              {MODELS.map((model) => (
                <button key={model.value} type="button" onClick={() => setAiModel(model.value)} className={`rounded-xl border p-2 text-left transition-all ${aiModel === model.value ? "border-purple-500 bg-purple-50 ring-1 ring-purple-200" : "border-gray-200 hover:border-gray-300"}`}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <img src={model.icon} alt="" className="h-3.5 w-3.5 flex-shrink-0 object-contain" />
                    <span className="truncate text-[11px] font-bold text-slate-900">{model.label}</span>
                    {model.badge ? <span className="flex-shrink-0 rounded bg-purple-100 px-1 text-[9px] text-purple-600">{model.badge}</span> : null}
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-slate-400">{model.desc}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-950">图片比例</h3>
            <div className="grid grid-cols-3 gap-2">
              {ASPECTS.map((item) => (
                <button key={item.value} type="button" onClick={() => setAspectRatio(item.value)} className={`rounded-lg border py-2 text-xs font-medium transition-all ${aspectRatio === item.value ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"}`}>
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-950">分辨率</h3>
            <div className="grid grid-cols-3 gap-2">
              {imageSizes.map((size) => (
                <button key={size} type="button" onClick={() => setImageSize(size)} className={`rounded-lg border py-2 text-xs font-medium transition-all ${imageSize === size ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"}`}>
                  {size} · {getCreditCost(aiModel, size, aspectRatio)}积分
                </button>
              ))}
            </div>
          </section>

          <section>
            <button type="button" onClick={() => setShowPromptPreview(true)} className="studio-prompt-trigger flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all">
              <Eye className="h-3.5 w-3.5" /> 查看完整提示词
            </button>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-950">生成数量</h3>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((count) => (
                <button key={count} type="button" onClick={() => setGenCount(count)} className={`rounded-lg border py-2 text-sm font-medium transition-all ${genCount === count ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"}`}>
                  {count} 张
                </button>
              ))}
            </div>
          </section>
        </div>
        <div className="studio-runbar space-y-2 border-t p-3 sm:p-4 sticky bottom-0 z-10 lg:static">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{sourceUrl ? "原图已上传" : "等待上传原图"} · {genCount} 张</span>
            {isAuthenticated ? <span className="font-bold text-orange-500">消耗 {cost} · 余额 {credits ?? "-"}</span> : <span className="text-orange-500">登录后生成</span>}
          </div>
          <button type="button" disabled={isGenerating || !sourceUrl} onClick={() => generate()} className="gradient-brand flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-lg shadow-purple-200 hover:opacity-90 disabled:opacity-40">
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {!isAuthenticated ? "登录后生成" : isGenerating ? `生成中 ${Math.round(progress)}%` : `生成 ${genCount} 张`}
          </button>
        </div>
      </div>

      <div className="studio-canvas relative flex-1 min-h-[520px] lg:h-full overflow-hidden">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title="创建模特换背景作品"
              subtitle="默认只换背景；切到换模特相关模式时，必须先选择或上传模特参考图。"
              imageSrc="/home-showcase/background-male-jacket.webp"
              imageAlt="模特换背景指引"
              steps={[
                { title: "上传原图", desc: "原图中的人物、服装和穿搭是保留对象，先作为主参考输入。" },
                { title: "选择操作模式", desc: "只换背景、换背景换模特、只换模特分别对应不同输入要求。" },
                { title: "补充背景 / 模特参考", desc: "背景参考控制环境光影；模特参考仅在换模特模式中生效。" },
              ]}
            />
          </div>
        )}

        {isGenerating && (
          <div className="studio-loading-stage min-h-[260px] sm:min-h-[360px] lg:h-full p-4 sm:p-8 flex items-center justify-center">
            <div className="relative h-64 w-52 overflow-hidden rounded-[28px] border border-white/50 bg-white/30 shadow-2xl backdrop-blur-2xl">
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-violet-100 via-pink-50 to-sky-100" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-3xl font-black text-violet-500">{Math.round(progress)}%</div>
                <p className="mt-2 text-xs font-bold text-violet-400">AI 生成中...</p>
              </div>
            </div>
          </div>
        )}

        {resultUrls.length > 0 && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <ResultImageGrid urls={resultUrls} filenamePrefix="model-background" onOpen={setLightboxSrc} />
            </div>
            <div className="mt-4 flex justify-center">
              <RepairPromptPanel kind="tryon" onRepair={handleRepairGenerate} disabled={isGenerating} className="w-full max-w-3xl" />
            </div>
          </div>
        )}

        {error && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
                <X className="w-8 h-8 text-red-400" />
              </div>
              <p className="text-red-500 font-medium mb-1">生成失败</p>
              <p className="text-sm text-gray-400 mb-4 max-w-sm">{error}</p>
              <RepairPromptPanel kind="tryon" onRepair={handleRepairGenerate} disabled={isGenerating} className="mb-3 max-w-md" />
              <button onClick={() => setError("")} className="px-5 py-2 rounded-full border text-sm font-medium hover:bg-gray-50">重试</button>
            </div>
          </div>
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

      {showPromptPreview ? (
        <ClientPortal>
          <div className="fixed inset-0 z-[220] flex min-h-dvh w-dvw items-center justify-center bg-slate-950/38 p-4 backdrop-blur-xl sm:p-6" onClick={() => setShowPromptPreview(false)}>
            <div className="max-h-[86dvh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/80 bg-white/[0.94] shadow-[0_32px_100px_rgba(15,23,42,0.22)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b px-5 py-3">
                <h3 className="text-sm font-bold">{promptOverride ? "完整提示词" : "默认提示词模板"}</h3>
                <button type="button" onClick={() => setShowPromptPreview(false)} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              </div>
              <div className="border-b bg-gray-50 px-5 py-2">
                <div className="flex flex-wrap gap-2">
                  {promptImages.map((image) => (
                    <span key={`${image.imageNumber}-${image.url}`} className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                      图{image.imageNumber}：{image.role}
                    </span>
                  ))}
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    {MODEL_BACKGROUND_MODE_LABELS[mode]}
                  </span>
                </div>
              </div>
              <div className="max-h-[64dvh] space-y-3 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  {[
                    ["模型", aiModel],
                    ["比例", aspectRatio],
                    ["分辨率", imageSize],
                    ["生成张数", `${genCount}`],
                    ["模式", MODEL_BACKGROUND_MODE_LABELS[mode]],
                    ["背景来源", mode === "model_only" ? "未使用" : BACKGROUND_SOURCE_LABELS[backgroundSource]],
                    ["背景参考", backgroundReferenceLabel],
                    ["模特参考", mode === "background_only" ? "未使用" : hasModelReference ? "已使用" : "必选未选"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border bg-gray-50 px-3 py-2">
                      <p className="text-[10px] text-gray-400">{label}</p>
                      <p className="break-words text-xs font-medium text-gray-700">{value}</p>
                    </div>
                  ))}
                </div>
                <textarea
                  value={finalPrompt}
                  onChange={(e) => setPromptOverride(e.target.value)}
                  className="min-h-[320px] w-full resize-y rounded-lg border px-3 py-2 text-xs leading-relaxed text-gray-700 outline-none focus:ring-2 focus:ring-purple-200"
                />
                <ModelPromptPreview kind="modelBackground" model={aiModel} prompt={finalPrompt} className="mt-3" />
                <button
                  type="button"
                  onClick={handleOptimizeGenerationPrompt}
                  disabled={isOptimizingPrompt || !sourceUrl}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-purple-200 py-2 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-40"
                >
                  {isOptimizingPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand className="h-3.5 w-3.5" />}
                  AI 优化完整提示词
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const repaired = applyRepairPrompt(finalPrompt, "tryon", "garment_restore");
                    setPromptOverride(repaired);
                    navigator.clipboard.writeText(repaired);
                    toast.success("已复制并套用服装还原修复提示词");
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-purple-200 py-2 text-xs font-medium text-purple-600 hover:bg-purple-50"
                >
                  <Wand className="h-3.5 w-3.5" /> 一键加强服装还原
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
