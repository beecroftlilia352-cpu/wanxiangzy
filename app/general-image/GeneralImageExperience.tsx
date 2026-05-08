"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Eye,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { LoadingStage } from "@/components/studio/LoadingStage";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { ClientPortal } from "@/components/ClientPortal";
import { PreviewGuide } from "@/components/PreviewGuide";
import { createClient, getCachedProfileCredits, setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { takeApplyPayload } from "@/lib/history-apply";

type GeneralImageMode = "text-to-image" | "image-to-image";

type ReferenceImage = {
  id: string;
  name: string;
  url: string;
  preview: string;
};

type ImagePromptImage = {
  name: string;
  url: string;
  preview: string;
};

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4分/次", badge: "最新", icon: "/model-icons/openai.svg" },
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "4K · 2分/次", badge: "新", icon: "/model-icons/doubao.png" },
];

const ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: "3:4", label: "3:4 竖版" },
  { value: "4:3", label: "4:3 横版" },
  { value: "1:1", label: "1:1 方图" },
  { value: "9:16", label: "9:16 手机" },
  { value: "16:9", label: "16:9 宽屏" },
  { value: "4:5", label: "4:5 电商" },
  { value: "auto", label: "自动" },
];

const IMAGE_PROMPT_PLACEHOLDER =
  "例如：将图1中的无袖灰色连衣裙穿到图2的人物身上，图2人物需穿着图1的灰色无袖连衣裙，保留图2人物的黑色长发、金色十字架项链、金色耳环，背景为浅灰色，光线柔和自然，突出服装的质感和人物的优雅气质，同时参考图3的服装风格，但此处主要是替换图1的服装到图2人物身上，无需添加图3元素。";

export function GeneralImageExperience({ initialMode = "text-to-image" }: { initialMode?: GeneralImageMode }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagePromptInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<GeneralImageMode>(initialMode);
  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [showImagePromptModal, setShowImagePromptModal] = useState(false);
  const [imagePromptImage, setImagePromptImage] = useState<ImagePromptImage | null>(null);
  const [imagePromptText, setImagePromptText] = useState("");
  const [isImagePromptUploading, setIsImagePromptUploading] = useState(false);
  const [isImagePromptGenerating, setIsImagePromptGenerating] = useState(false);

  const supportedSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const costPerImage = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = costPerImage * genCount;
  const isImageMode = mode === "image-to-image";
  const activeFeature = isImageMode ? "imageToImage" : "textToImage";
  const modeMeta = isImageMode
    ? {
        title: "图生图",
        tooltip: "上传多张参考图并用文字说明每张图的角色，适合换装、风格参考、背景参考和多图合成生成。",
        emptyTitle: "创建多图参考生成",
        emptySubtitle: "按图1、图2、图3明确分配服装、人物、风格或背景角色，让模型按关系生成新图。",
        emptyImage: "/home-showcase/model-grey-tank-denim.jpg",
      }
    : {
        title: "文生图",
        tooltip: "仅通过文字描述生成图片，支持图片转提示词、AI 帮写、模型、比例、清晰度和张数配置。",
        emptyTitle: "创建文本生成图片",
        emptySubtitle: "写下主体、场景、光线和风格，也可以先用图片转提示词获得更稳定的描述。",
        emptyImage: "/home-showcase/exclusive-model-01.png",
      };
  const canGenerate = !isGenerating && !isUploading && prompt.trim().length > 0 && (!isImageMode || referenceImages.length > 0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setIsAuthenticated(true);
        setUserId(data.user.id);
        getCachedProfileCredits(data.user.id).then(setCredits);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0] || "1K");
  }, [aiModel, aspectRatio, imageSize]);

  useEffect(() => {
    setMode(initialMode);
    resetOutput();
  }, [initialMode]);

  useEffect(() => {
    const payload = takeApplyPayload("generalImage");
    if (!payload) return;
    setMode(payload.mode);
    setPrompt(payload.prompt);
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setGenCount(payload.genCount);
    setReferenceImages(payload.referenceUrls.map((url, index) => ({
      id: `history-general-${index}-${url}`,
      name: `历史参考图${index + 1}`,
      url,
      preview: url,
    })));
    setResultUrls([]);
    setError("");
    setProgress(0);
    toast.success("已套用历史参数");
  }, []);

  function resetOutput() {
    setResultUrls([]);
    setError("");
    setProgress(0);
  }

  async function handleFiles(files?: FileList | File[]) {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    const invalid = selected.find((file) => !file.type.startsWith("image/"));
    if (invalid) return toast.error("请选择图片文件");

    const oversized = selected.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) return toast.error(`${oversized.name} 超过 ${MAX_FILE_SIZE_MB}MB`);

    const remain = Math.max(0, 8 - referenceImages.length);
    if (!remain) return toast.error("最多上传 8 张参考图");
    const limited = selected.slice(0, remain);
    if (selected.length > limited.length) toast.info("已自动保留前 8 张参考图");

    setIsUploading(true);
    resetOutput();
    toast.info(`正在上传 ${limited.length} 张参考图...`);
    try {
      const results = await Promise.allSettled(limited.map((file) => uploadImage(file)));
      const nextImages: ReferenceImage[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          nextImages.push({
            id: `${limited[index].name}-${Date.now()}-${index}`,
            name: limited[index].name || `参考图${referenceImages.length + index + 1}`,
            url: result.value.url,
            preview: result.value.display_url || result.value.url,
          });
        } else {
          toast.error(`${limited[index].name} 上传失败`);
        }
      });
      if (nextImages.length) {
        setReferenceImages((prev) => [...prev, ...nextImages].slice(0, 8));
        toast.success("参考图已上传");
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function optimizePrompt() {
    if (!isAuthenticated) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (!prompt.trim() && referenceImages.length === 0) {
      toast.error(isImageMode ? "请先输入基本想法或上传参考图" : "请先输入基本想法");
      return;
    }

    setIsOptimizing(true);
    try {
      const res = await fetch("/api/general-image/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt,
          reference_urls: isImageMode ? referenceImages.map((item) => item.url) : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "提示词优化失败");
      if (data.prompt) {
        setPrompt(String(data.prompt).slice(0, 4000));
        toast.success(data.source === "fallback" ? "已用本地模板优化提示词" : "AI 已优化提示词");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "提示词优化失败");
    } finally {
      setIsOptimizing(false);
    }
  }

  async function uploadImageForPrompt(files?: FileList | File[]) {
    const file = Array.from(files || [])[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("请选择图片文件");
    if (file.size > MAX_FILE_SIZE) return toast.error(`${file.name} 超过 ${MAX_FILE_SIZE_MB}MB`);

    if (!isAuthenticated) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }

    setIsImagePromptUploading(true);
    setImagePromptText("");
    try {
      const result = await uploadImage(file);
      const nextImage = {
        name: file.name,
        url: result.url,
        preview: result.display_url || result.url,
      };
      setImagePromptImage(nextImage);
      toast.success("图片已上传，正在反推提示词");
      await generateImagePrompt(nextImage.url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "图片上传失败");
    } finally {
      setIsImagePromptUploading(false);
      if (imagePromptInputRef.current) imagePromptInputRef.current.value = "";
    }
  }

  async function generateImagePrompt(imageUrl = imagePromptImage?.url) {
    if (!imageUrl) return toast.error("请先上传图片");
    if (!isAuthenticated) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }

    setIsImagePromptGenerating(true);
    try {
      const res = await fetch("/api/general-image/image-to-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "图片转提示词失败");
      if (data.prompt) {
        setImagePromptText(String(data.prompt).slice(0, 4000));
        toast.success(data.source === "fallback" ? "已用本地模板生成提示词" : "图片提示词已生成");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "图片转提示词失败");
    } finally {
      setIsImagePromptGenerating(false);
    }
  }

  function applyImagePromptToDescription() {
    if (!imagePromptText.trim()) return toast.error("请先生成提示词");
    setPrompt(imagePromptText.trim().slice(0, 4000));
    setShowImagePromptModal(false);
    resetOutput();
    toast.success("已应用到文本描述");
  }

  async function generate() {
    if (!isAuthenticated) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (!prompt.trim()) return toast.error("请输入提示词");
    if (isImageMode && !referenceImages.length) return toast.error("请先上传参考图");
    if (credits !== null && credits < totalCost) return toast.error(`积分不足，需要 ${totalCost}，余额 ${credits}`);

    setIsGenerating(true);
    setProgress(8);
    setError("");
    setResultUrls([]);
    try {
      const res = await fetch("/api/general-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt,
          reference_urls: isImageMode ? referenceImages.map((item) => item.url) : [],
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          gen_count: genCount,
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

      for (let attempts = 0; attempts < 150; attempts++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const poll = await fetch(`/api/general-image?generation_id=${encodeURIComponent(data.generation_id)}`);
        if (!poll.ok) continue;
        const state = await poll.json();
        const nextProgress = Number(state.progress);
        if (Number.isFinite(nextProgress)) setProgress(Math.min(Math.max(Math.round(nextProgress), 0), 100));
        if (Array.isArray(state.result_urls) && state.result_urls.length) setResultUrls(state.result_urls);
        if (state.status === "completed") {
          setProgress(100);
          setResultUrls(state.result_urls || []);
          setIsGenerating(false);
          toast.success(`${modeMeta.title}生成完成`);
          return;
        }
        if (state.status === "failed") throw new Error(state.error || "生成失败");
      }
      throw new Error("生成超时");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "生成失败";
      setError(message);
      toast.error(message);
      setIsGenerating(false);
    }
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active={activeFeature} />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          <ModuleHeader
            title={modeMeta.title}
            tooltip={modeMeta.tooltip}
          />

          {isImageMode && (
            <section
              onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={(event) => { event.preventDefault(); setIsDragging(false); }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); setIsDragging(false); handleFiles(event.dataTransfer.files); }}
              className={`relative transition-all ${isDragging ? "ring-2 ring-purple-400 ring-offset-2" : ""}`}
            >
              <div className="studio-upload-header">
                <h3 className="studio-upload-title">
                  <Upload className="w-4 h-4 text-purple-500" /> 参考图
                </h3>
                <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-500">{referenceImages.length}/8</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event: ChangeEvent<HTMLInputElement>) => handleFiles(event.target.files || undefined)}
              />
              <div className="studio-upload-dropzone rounded-2xl border border-dashed p-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-28 w-full flex-col items-center justify-center rounded-xl border border-white/70 bg-white/82 px-4 py-5 text-center transition hover:bg-white"
                >
                  {isUploading ? <Loader2 className="mb-2 h-6 w-6 animate-spin text-violet-500" /> : <ImagePlus className="mb-2 h-6 w-6 text-violet-500" />}
                  <span className="text-sm font-black text-slate-900">{referenceImages.length ? "继续上传参考图" : "上传 / 拖拽参考图"}</span>
                  <span className="mt-1 text-[11px] text-slate-400">jpg、png、webp，单张不超过 {MAX_FILE_SIZE_MB}MB</span>
                </button>

                {referenceImages.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-500">上传顺序会标记为图1、图2、图3</span>
                      <button type="button" onClick={() => { setReferenceImages([]); resetOutput(); }} className="inline-flex items-center gap-1 text-slate-400 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" /> 清空
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                      {referenceImages.map((item, index) => (
                        <div key={item.id} className="group relative aspect-square overflow-hidden rounded-xl border border-white bg-white shadow-sm">
                          <img src={item.preview} alt={item.name} className="h-full w-full object-cover" />
                          <span className="absolute left-1 top-1 rounded bg-white/92 px-1.5 py-0.5 text-[10px] font-black text-slate-500">图{index + 1}</span>
                          <button
                            type="button"
                            onClick={() => { setReferenceImages((prev) => prev.filter((image) => image.id !== item.id)); resetOutput(); }}
                            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/80 text-white opacity-0 transition group-hover:opacity-100"
                            aria-label={`移除图${index + 1}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-3 font-bold text-sm">文本描述</h3>
            <div className="rounded-2xl border border-slate-100 bg-white/85 p-3 shadow-sm">
              <textarea
                value={prompt}
                onChange={(event) => { setPrompt(event.target.value.slice(0, 4000)); resetOutput(); }}
                placeholder={isImageMode ? IMAGE_PROMPT_PLACEHOLDER : "输入文本描述内容，如：1个中国女性模特身着丝绸质感粉色连衣裙，妆容柔和高级，背景为玫瑰金纯色，整体氛围浪漫而精致"}
                className="min-h-40 w-full resize-y rounded-xl border border-slate-100 bg-slate-50/65 px-3 py-3 text-sm leading-7 text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-purple-200 focus:bg-white focus:ring-2 focus:ring-purple-100"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {!isImageMode && (
                    <button
                      type="button"
                      onClick={() => setShowImagePromptModal(true)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-100 bg-violet-50 px-3 text-xs font-bold text-violet-700 transition hover:bg-violet-100"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      图片转提示词
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={optimizePrompt}
                    disabled={isOptimizing}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-violet-200 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isOptimizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                    AI帮写
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPromptPreview(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 transition hover:border-violet-200 hover:text-violet-600"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    预览
                  </button>
                </div>
                <span className="text-[11px] font-medium text-slate-400">{prompt.length} / 4000</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 font-bold text-sm">
              <Sparkles className="h-4 w-4 text-purple-500" /> 生成模型
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {MODELS.map((model) => (
                <button
                  key={model.value}
                  type="button"
                  onClick={() => setAiModel(model.value)}
                  className={`rounded-xl border p-2 text-left transition-all ${
                    aiModel === model.value ? "border-purple-500 bg-purple-50 text-purple-600 ring-1 ring-purple-200" : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <img src={model.icon} alt="" className="h-4 w-4 flex-shrink-0 object-contain" />
                    <span className="truncate text-[11px] font-bold text-slate-900">{model.label}</span>
                    {model.badge && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-600">{model.badge}</span>}
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-400">{model.desc}</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 font-bold text-sm">图片比例</h3>
            <div className="grid grid-cols-3 gap-2">
              {ASPECTS.filter((item) => item.value !== "auto").map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setAspectRatio(item.value)}
                  className={`rounded-lg border py-2 text-xs font-medium transition-all ${
                    aspectRatio === item.value ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 font-bold text-sm">分辨率</h3>
            <div className="grid grid-cols-3 gap-2">
              {supportedSizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setImageSize(size)}
                  className={`rounded-lg border py-2 text-xs font-medium transition-all ${
                    imageSize === size ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  {size} · {getCreditCost(aiModel, size, aspectRatio)}积分
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 font-bold text-sm">生成数量</h3>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGenCount(value)}
                  className={`rounded-lg border py-2 text-sm font-medium transition-all ${
                    genCount === value ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  {value} 张
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="studio-runbar border-t p-3 sm:p-4 space-y-2 sticky bottom-0 z-10 lg:static">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{isImageMode ? `图生图 · ${referenceImages.length} 张参考` : "文生图"} · {costPerImage} × {genCount}</span>
            {isAuthenticated
              ? <span className="font-bold text-amber-600">消耗 {totalCost} · 余额 {credits ?? "-"}</span>
              : <span className="text-gray-400">登录后查看积分</span>
            }
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            className="gradient-brand flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-lg shadow-purple-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {!isAuthenticated ? "登录后生成" : isGenerating ? "生成中..." : `立即生成 ${genCount} 张`}
          </button>
        </div>
      </div>

      <div className="studio-canvas min-h-[260px] sm:min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title={modeMeta.emptyTitle}
              subtitle={modeMeta.emptySubtitle}
              imageSrc={modeMeta.emptyImage}
              imageAlt={`${modeMeta.title}指引`}
              steps={!isImageMode ? [
                { title: "输入想法", desc: "可先写一句简短描述，再让 AI 帮写成完整提示词。" },
                { title: "选择参数", desc: "确认模型、画幅、清晰度和张数。" },
                { title: "生成结果", desc: "结果会进入作品资产，可下载或继续放大查看。" },
              ] : [
                { title: "上传参考图", desc: "多张图会按上传顺序标记为图1、图2、图3。" },
                { title: "写清图号", desc: "说明每张图承担服装、人物、风格、背景或构图等角色。" },
                { title: "生成结果", desc: "模型会按提示词处理参考关系并输出新图。" },
              ]}
            />
          </div>
        )}

        {isGenerating && (
          <LoadingStage genCount={genCount} progress={progress} moduleName={modeMeta.title} />
        )}

        {resultUrls.length > 0 && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <ResultImageGrid urls={resultUrls} filenamePrefix={isImageMode ? "image-to-image" : "text-to-image"} expectedCount={genCount} isGenerating={isGenerating} onOpen={setLightboxSrc} />
            </div>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => { setResultUrls([]); setError(""); setProgress(0); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:border-violet-200 hover:text-violet-600"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                重新创作
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="studio-result-stage flex min-h-[260px] items-center justify-center px-4 sm:min-h-[360px] lg:h-full">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-400">
                <X className="h-8 w-8" />
              </div>
              <p className="mb-1 font-bold text-red-500">生成失败</p>
              <p className="mb-4 text-sm text-slate-400">{error}</p>
              <button
                type="button"
                onClick={generate}
                disabled={isGenerating}
                className="rounded-full border px-5 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
              >
                重试
              </button>
            </div>
          </div>
        )}
      </div>

      {showImagePromptModal && (
        <ClientPortal>
          <div
            className="fixed inset-0 z-[220] flex min-h-dvh w-dvw items-center justify-center bg-slate-950/38 p-4 backdrop-blur-xl sm:p-6"
            onClick={() => setShowImagePromptModal(false)}
          >
            <div
              className="w-full max-w-2xl overflow-hidden rounded-[22px] border border-violet-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-violet-100"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 px-5 py-4">
                <div>
                  <h3 className="text-base font-black text-slate-950">图片转提示词</h3>
                  <p className="mt-2 text-sm leading-5 text-slate-500">
                    上传图片，使用 AI 反推图片内容描述，用于生成相似内容图片
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImagePromptModal(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  aria-label="关闭图片转提示词"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-4 px-5 pb-5 sm:grid-cols-[120px_minmax(0,1fr)]">
                <div className="space-y-3">
                  <input
                    ref={imagePromptInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => uploadImageForPrompt(event.target.files || undefined)}
                  />
                  <button
                    type="button"
                    onClick={() => imagePromptInputRef.current?.click()}
                    className="group relative flex aspect-[3/4] w-full min-w-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-400 transition hover:border-violet-200 hover:bg-violet-50"
                  >
                    {imagePromptImage ? (
                      <img src={imagePromptImage.preview} alt={imagePromptImage.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex flex-col items-center gap-2 text-xs font-bold">
                        {isImagePromptUploading ? <Loader2 className="h-6 w-6 animate-spin text-violet-500" /> : <ImagePlus className="h-6 w-6 text-violet-500" />}
                        上传图片
                      </span>
                    )}
                    {imagePromptImage && (
                      <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg border border-white/80 bg-white/90 text-slate-600 shadow-sm group-hover:text-violet-600">
                        <ImagePlus className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => generateImagePrompt()}
                    disabled={!imagePromptImage || isImagePromptUploading || isImagePromptGenerating}
                    className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 transition hover:border-violet-200 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {isImagePromptGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    重新生成
                  </button>
                </div>

                <textarea
                  value={imagePromptText}
                  onChange={(event) => setImagePromptText(event.target.value.slice(0, 4000))}
                  placeholder="上传图片后，AI 会在这里生成可用于文生图的内容描述。"
                  className="min-h-[260px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-violet-300 focus:ring-2 focus:ring-violet-100 sm:min-h-0"
                />
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!imagePromptText.trim()) return toast.error("暂无可复制内容");
                    navigator.clipboard.writeText(imagePromptText);
                    toast.success("已复制");
                  }}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 transition hover:text-violet-600"
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </button>
                <button
                  type="button"
                  onClick={applyImagePromptToDescription}
                  disabled={!imagePromptText.trim()}
                  className="gradient-brand inline-flex h-9 items-center justify-center rounded-lg px-5 text-sm font-black text-white shadow-lg shadow-purple-200 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  应用到描述
                </button>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}

      {showPromptPreview && (
        <ClientPortal>
          <div
            className="fixed inset-0 z-[220] flex min-h-dvh w-dvw items-center justify-center bg-slate-950/38 p-4 backdrop-blur-xl sm:p-6"
            onClick={() => setShowPromptPreview(false)}
          >
            <div
              className="max-h-[86dvh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/80 bg-white/[0.94] shadow-[0_32px_100px_rgba(15,23,42,0.22)] backdrop-blur-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b px-5 py-3">
                <h3 className="text-sm font-bold">完整提示词</h3>
                <button onClick={() => setShowPromptPreview(false)} className="rounded p-1 hover:bg-gray-100" aria-label="关闭提示词预览">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[64dvh] space-y-3 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["模式", modeMeta.title],
                    ["模型", aiModel],
                    ["比例", aspectRatio],
                    ["分辨率", imageSize],
                    ["生成张数", `${genCount}`],
                    ["参考图", `${isImageMode ? referenceImages.length : 0} 张`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border bg-gray-50 px-3 py-2">
                      <p className="text-[10px] text-gray-400">{label}</p>
                      <p className="break-words text-xs font-medium text-gray-700">{value}</p>
                    </div>
                  ))}
                </div>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value.slice(0, 4000))}
                  className="min-h-[320px] w-full resize-y rounded-lg border px-3 py-2 text-xs leading-relaxed text-gray-700 outline-none focus:ring-2 focus:ring-purple-200"
                />
              </div>
              <div className="flex justify-end gap-2 border-t px-5 py-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(prompt);
                    toast.success("已复制");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-medium hover:bg-gray-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </button>
                <button onClick={() => setShowPromptPreview(false)} className="gradient-brand rounded-full px-4 py-1.5 text-xs font-medium text-white">
                  关闭
                </button>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}

      {lightboxSrc && (
        <ClientPortal>
          <div
            className="fixed inset-0 z-[180] flex cursor-zoom-out items-center justify-center bg-slate-950/66 p-4 backdrop-blur-xl sm:p-8"
            onClick={() => setLightboxSrc(null)}
          >
            <img src={lightboxSrc} className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_32px_120px_rgba(0,0,0,0.45)]" alt={`${modeMeta.title}结果预览`} />
            <button
              onClick={() => setLightboxSrc(null)}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/85 bg-white/90 text-slate-700 shadow-[0_12px_34px_rgba(15,23,42,0.22)] backdrop-blur transition-colors hover:bg-white hover:text-slate-950 sm:right-6 sm:top-6"
              aria-label="关闭大图预览"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </ClientPortal>
      )}
    </div>
  );
}
