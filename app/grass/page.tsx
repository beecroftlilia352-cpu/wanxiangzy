"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Eye, FolderOpen, Heart, Loader2, Sparkles, Upload, Wand, X, XCircle, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { ModelPromptPreview } from "@/components/ModelPromptPreview";
import { RepairPromptPanel } from "@/components/RepairPromptPanel";
import { ClientPortal } from "@/components/ClientPortal";
import { PreviewGuide } from "@/components/PreviewGuide";
import { LoadingStage } from "@/components/studio/LoadingStage";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { createClient, getCachedProfileCredits, setCachedProfileCredits } from "@/lib/supabase/client";
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
  normalizeGrassSceneMode,
  normalizeGrassTemplate,
  type GrassSceneMode,
  type GrassTemplateId,
} from "@/lib/grass-planting";
import { takeApplyPayload } from "@/lib/history-apply";

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4分/次", badge: "最新", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/openai.svg" },
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3分/次", badge: "推荐", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4分/次", badge: "推荐", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "4K · 2分/次", badge: "新", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/doubao.png" },
];

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

export default function GrassPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const rulesButtonRef = useRef<HTMLButtonElement>(null);
  const rulesHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [garmentUrl, setGarmentUrl] = useState("");
  const [garmentName, setGarmentName] = useState("");
  const [templateId, setTemplateId] = useState<GrassTemplateId>("street");
  const [sceneMode, setSceneMode] = useState<GrassSceneMode>("system_reference");
  const [uploadedReferenceUrl, setUploadedReferenceUrl] = useState("");
  const [uploadedReferenceName, setUploadedReferenceName] = useState("");
  const [changeModel, setChangeModel] = useState(true);
  const [userPrompt, setUserPrompt] = useState(DEFAULT_GRASS_USER_PROMPT);
  const [supplementPrompt, setSupplementPrompt] = useState("");
  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingReference, setIsDraggingReference] = useState(false);
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [rulesPopoverStyle, setRulesPopoverStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

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
        : "上传种草参考图 / 场景姿势构图参考",
    }] : []),
  ], [garmentUrl, effectiveReferenceUrl, sceneMode, selectedTemplate.name]);
  const activePrompt = sceneMode === "custom_prompt" ? userPrompt : supplementPrompt;
  const finalPrompt = useMemo(
    () => promptOverride ?? buildGrassPrompt({
      templateId,
      userPrompt: activePrompt,
      changeModel,
      sceneMode,
      hasReference: !!effectiveReferenceUrl,
      referenceName: effectiveReferenceName,
    }),
    [promptOverride, templateId, activePrompt, changeModel, sceneMode, effectiveReferenceUrl, effectiveReferenceName]
  );
  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const cost = getCreditCost(aiModel, imageSize, aspectRatio) * genCount;

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
    let cancelled = false;
    (async () => {
    const payload = await takeApplyPayload("grass");
    if (cancelled || !payload) return;
    setGarmentUrl(payload.garmentUrl);
    setTemplateId(normalizeGrassTemplate(payload.templateId));
    const nextSceneMode = normalizeGrassSceneMode(payload.sceneMode || (payload.referenceUrl ? "upload_reference" : "system_reference"));
    setSceneMode(nextSceneMode);
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
    try {
      const result = await uploadImage(file);
      setGarmentUrl(result.url);
      setGarmentName(file.name);
      setPromptOverride(null);
      toast.success("服装图已上传");
    } catch {
      toast.error("上传失败，请重试");
    }
  }

  async function handleReferenceFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("请上传图片文件");
    if (file.size > MAX_FILE_SIZE) return toast.error(`图片不能超过 ${MAX_FILE_SIZE_MB}MB`);
    toast.info("正在上传种草参考图...");
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
    if (!isAuthenticated) {
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
        const poll = await fetch(`/api/grass?generation_id=${data.generation_id}`);
        if (!poll.ok) continue;
        const state = await poll.json();
        if (state.status === "completed") {
          setProgress(100);
          setResultUrls(state.result_urls || []);
          setIsGenerating(false);
          toast.success("服装种草图生成完成");
          return;
        }
        if (state.status === "failed") throw new Error(state.error || "生成失败");
        setProgress(Math.min(25 + attempts * 1.5, 90));
      }
      throw new Error("生成超时");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "生成失败");
      toast.error(err instanceof Error ? err.message : "生成失败");
      setIsGenerating(false);
    }
  }

  function handleRepairGenerate(repairValue: string) {
    const repairedPrompt = applyRepairPrompt(finalPrompt, "grass", repairValue);
    setPromptOverride(repairedPrompt);
    toast.info("已加入修复指令，正在重新生成...");
    generate(repairedPrompt);
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
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          <ModuleHeader title="服装种草图" tooltip="上传服装或穿搭图，保持同款穿搭不变，生成街拍、咖啡店、自拍、居家等真实种草内容图。" />

          <section
            onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
            className={`relative rounded-xl transition-all ${isDragging ? "ring-2 ring-purple-400 ring-offset-2" : ""}`}
          >
            <div className="studio-upload-header">
              <h3 className="studio-upload-title"><Upload className="w-4 h-4 text-purple-500" /> 上传服装</h3>
              <button ref={rulesButtonRef} type="button" onMouseEnter={openRulesPopover} onMouseLeave={scheduleRulesHide} onFocus={openRulesPopover} onBlur={scheduleRulesHide} className="studio-upload-rule-button">
                图片规则 <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            {garmentUrl ? (
              <div className="group studio-checkerboard relative h-[320px] overflow-hidden rounded-2xl border border-dashed border-slate-200">
                <img src={garmentUrl} alt="服装图" className="h-full w-full object-contain p-3" />
                <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">{garmentName || "已上传"}</span>
                <button onClick={() => setGarmentUrl("")} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 opacity-0 shadow group-hover:opacity-100"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm"><Heart className="h-7 w-7 text-violet-400" /></div>
                <p className="text-sm font-semibold text-slate-800">上传服装或穿搭图</p>
                <p className="mt-1 text-[11px] text-slate-400">平铺图、人台图、上身图都可以，主体越完整越稳定</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-violet-700"><Upload className="h-3.5 w-3.5" /> 从本地上传</button>
                  <button type="button" onClick={() => toast.info("作品库选择即将接入")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"><FolderOpen className="h-3.5 w-3.5" /> 从作品选择</button>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">{GRASS_UPLOAD_RULE.uploadSpecText}</p>
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <span className="shrink-0 text-[11px] font-medium text-slate-400">试一试</span>
              <div className="studio-scrollbar-hide flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                {GRASS_UPLOAD_RULE.demos.map((demo) => (
                  <button key={demo.imageUrl} type="button" onClick={() => applyDemo(demo)} className="group flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50 shadow-sm transition-all hover:border-violet-200" title={demo.description}>
                    <img src={demo.imageUrl} alt={demo.title} className="h-full w-full object-contain p-1" />
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-bold text-sm">参考图 / 场景</h3>
              <span className="rounded-full bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-600">
                {sceneMode === "custom_prompt" ? "提示词为准" : effectiveReferenceName}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-1">
              {[
                { value: "system_reference" as const, label: "系统参考图" },
                { value: "upload_reference" as const, label: "上传参考图" },
                { value: "custom_prompt" as const, label: "用户自定义" },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => { setSceneMode(tab.value); setPromptOverride(null); }}
                  className={`rounded-lg px-1 py-2 text-xs font-bold ${sceneMode === tab.value ? "bg-white text-purple-600 shadow-sm" : "text-slate-500"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

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
                onDragEnter={(e) => { e.preventDefault(); setIsDraggingReference(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDraggingReference(false); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); setIsDraggingReference(false); handleReferenceFile(e.dataTransfer.files?.[0]); }}
                className={`mt-3 rounded-2xl border border-dashed bg-white/70 p-3 transition ${isDraggingReference ? "border-purple-400 ring-2 ring-purple-100" : "border-slate-200"}`}
              >
                <input ref={referenceInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleReferenceFile(e.target.files?.[0])} />
                {uploadedReferenceUrl ? (
                  <div className="group relative overflow-hidden rounded-xl bg-slate-100">
                    <img src={uploadedReferenceUrl} alt="种草参考图" className="h-52 w-full object-cover" />
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
                    className="flex min-h-40 w-full flex-col items-center justify-center rounded-xl bg-slate-50 px-4 py-6 text-center hover:bg-slate-100"
                  >
                    <Upload className="mb-3 h-7 w-7 text-violet-400" />
                    <span className="text-sm font-semibold text-slate-800">上传种草参考图</span>
                    <span className="mt-1 text-[11px] text-slate-400">姿势、场景、构图会作为图2进入提示词</span>
                  </button>
                )}
              </div>
            )}

            {sceneMode === "custom_prompt" ? (
              <div className="mt-3 space-y-3">
                <textarea
                  value={userPrompt}
                  onChange={(e) => { setUserPrompt(e.target.value); setPromptOverride(null); }}
                  placeholder="改变模特、背景、构图、姿势，保持服装与穿搭单品不变。"
                  className="h-36 w-full resize-none rounded-xl border px-3 py-2 text-xs leading-relaxed outline-none focus:ring-2 focus:ring-purple-200"
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
              <div className="mt-3 rounded-xl border border-slate-100 bg-white/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-slate-600">补充要求（可选）</p>
                  <span className="text-[10px] text-slate-400">不影响图2参考优先级</span>
                </div>
                <input
                  value={supplementPrompt}
                  onChange={(e) => { setSupplementPrompt(e.target.value); setPromptOverride(null); }}
                  placeholder="例如：突出显瘦、通勤、高级感；保留真实肤色，不要过度美颜。"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-purple-200"
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
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => { setChangeModel(true); setPromptOverride(null); }}
                  className={`rounded-lg px-3 py-2 text-left transition-all ${changeModel ? "bg-white text-purple-600 shadow-sm" : "text-slate-500 hover:bg-white/70"}`}
                >
                  <span className="block text-xs font-bold">更换模特</span>
                  <span className="mt-1 block text-[10px] leading-4 text-slate-400">换成新真人模特，保留服装穿搭</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setChangeModel(false); setPromptOverride(null); }}
                  className={`rounded-lg px-3 py-2 text-left transition-all ${!changeModel ? "bg-white text-purple-600 shadow-sm" : "text-slate-500 hover:bg-white/70"}`}
                >
                  <span className="block text-xs font-bold">保持模特</span>
                  <span className="mt-1 block text-[10px] leading-4 text-slate-400">沿用原图人物，只调整种草氛围</span>
                </button>
              </div>
            </section>
          )}

          <section>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500" /> 生成模型</h3>
            <div className="grid grid-cols-2 gap-2">
              {MODELS.map((opt) => (
                <button key={opt.value} onClick={() => setAiModel(opt.value)} className={`rounded-xl border p-2 text-left transition-all ${aiModel === opt.value ? "border-purple-500 bg-purple-50 ring-1 ring-purple-200" : "border-gray-200 hover:border-gray-300"}`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <img src={opt.icon} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" />
                    <span className="truncate text-[11px] font-bold">{opt.label}</span>
                    {opt.badge && <span className="text-[9px] px-1 rounded bg-purple-100 text-purple-600 flex-shrink-0">{opt.badge}</span>}
                  </div>
                  <p className="mt-0.5 text-[10px] text-gray-400 truncate">{opt.desc}</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">图片比例</h3>
            <div className="grid grid-cols-3 gap-2">{ASPECTS.map((a) => <button key={a.value} onClick={() => setAspectRatio(a.value)} className={`rounded-lg border py-2 text-xs font-medium ${aspectRatio === a.value ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"}`}>{a.label}</button>)}</div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">分辨率</h3>
            <div className="grid grid-cols-3 gap-2">{imageSizes.map((s) => <button key={s} onClick={() => setImageSize(s)} className={`rounded-lg border py-2 text-xs font-medium ${imageSize === s ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"}`}>{s} · {getCreditCost(aiModel, s, aspectRatio)}积分</button>)}</div>
          </section>

          <section>
            <button type="button" onClick={() => setShowPromptPreview(true)} className="studio-prompt-trigger flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all"><Eye className="w-3.5 h-3.5" /> 查看完整提示词</button>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">生成数量</h3>
            <div className="grid grid-cols-4 gap-2">{[1, 2, 3, 4].map((n) => <button key={n} onClick={() => setGenCount(n)} className={`rounded-lg border py-2 text-sm font-medium ${genCount === n ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"}`}>{n} 张</button>)}</div>
          </section>
        </div>

        <div className="studio-runbar border-t p-3 sm:p-4 space-y-2 sticky bottom-0 z-10 lg:static">
          <div className="flex items-center justify-between text-xs"><span className="text-gray-400">{garmentUrl ? `${effectiveReferenceUrl ? 2 : 1} 张输入图` : "未上传"} · {genCount} 张</span>{isAuthenticated ? <span className="font-bold text-orange-500">消耗 {cost} · 余额 {credits ?? "-"}</span> : <span className="text-orange-500">登录后生成</span>}</div>
          <button onClick={() => generate()} disabled={isGenerating || !garmentUrl} className="w-full py-3 rounded-xl gradient-brand text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 shadow-lg shadow-purple-200">
            <Sparkles className="w-4 h-4" /> {!isAuthenticated ? "登录后生成" : isGenerating ? "生成中..." : `生成 ${genCount} 张`}
          </button>
        </div>
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
        {isGenerating && (
          <LoadingStage genCount={genCount} progress={progress} moduleName="服装种草图" />
        )}
        {resultUrls.length > 0 && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <ResultImageGrid urls={resultUrls} filenamePrefix="grass" extension="jpg" onOpen={setLightboxSrc} />
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
                    ["补充输入", activePrompt || "无"],
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
