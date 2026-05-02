"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, UserRound, Image, Sparkles, Download,
  RefreshCw, X, Coins, Plus, Camera, ChevronRight, Wand, Loader2, ZoomIn,
} from "lucide-react";

// 简单图片组件（带加载占位）
function ImgSkeleton({ src, alt, className }: {
  src: string; alt?: string; className?: string;
}) {
  return (
    <div className={`${className} bg-gray-100`}>
      <img src={src} alt={alt} className="w-full h-full object-cover" />
    </div>
  );
}
import { useTryOnStore } from "@/lib/store/tryon-store";
import { fileToBase64, MAX_CLOTHING_FILES, downloadImage, generateDownloadFilename, uploadImage } from "@/lib/utils";
import { createClient, getCachedProfileCredits, setCachedProfileCredits } from "@/lib/supabase/client";
import { getCreditCost, getSupportedImageSizes, buildTryOnPrompt, type LingyaModel, type ImageSize, type AspectRatio } from "@/lib/api/lingya";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { takeApplyPayload } from "@/lib/history-apply";

// ---- 预设数据 ----
const SUPABASE_STORAGE = "https://mtdfvnhphpulhjtnmubw.supabase.co/storage/v1/object/public";

const PRESET_MODELS = [
  { id: "m0", name: "自然", image_url: `${SUPABASE_STORAGE}/models/model-natural-smile.jpg`, gender: "female" as const },
  { id: "m1", name: "甜妹", image_url: `${SUPABASE_STORAGE}/models/model-18542-0875a4d282bb.jpg`, gender: "female" as const },
  { id: "m2", name: "优雅", image_url: `${SUPABASE_STORAGE}/models/model-22921-89d4664cd1b0.jpg`, gender: "female" as const },
  { id: "m3", name: "红裙", image_url: `${SUPABASE_STORAGE}/models/model-26829-dca5c791efa8.jpg`, gender: "female" as const },
  { id: "m4", name: "酷飒", image_url: `${SUPABASE_STORAGE}/models/model-97612-bdc397740113.jpg`, gender: "female" as const },
  { id: "m5", name: "清纯", image_url: `${SUPABASE_STORAGE}/models/model-35127-693ee11382eb.png`, gender: "female" as const },
];

const PRESET_REFERENCES = [
  { id: "r1", url: `${SUPABASE_STORAGE}/references/reference-108513-b6db713a5d2f.jpg`, label: "白T街头", category: "scene" as const },
  { id: "r2", url: `${SUPABASE_STORAGE}/references/reference-56020-dc1aa74e5515.jpg`, label: "黑蕾丝夜景", category: "style" as const },
  { id: "r3", url: `${SUPABASE_STORAGE}/references/reference-23353-c281a160d01d.jpg`, label: "白衫桥边", category: "style" as const },
  { id: "r4", url: `${SUPABASE_STORAGE}/references/reference-soft-blue-cardigan.jpg`, label: "蓝衫光影", category: "pose" as const },
  { id: "r5", url: `${SUPABASE_STORAGE}/references/reference-white-top-denim-shorts.jpg`, label: "白顶牛仔", category: "pose" as const },
  { id: "r6", url: `${SUPABASE_STORAGE}/references/reference-mens-black-knitwear.jpg`, label: "男款木墙", category: "pose" as const },
  { id: "r7", url: `${SUPABASE_STORAGE}/references/reference-grey-tank-denim-culottes.jpg`, label: "灰背心牛仔", category: "style" as const },
  { id: "r8", url: `${SUPABASE_STORAGE}/references/reference-striped-top-white-skirt.png`, label: "条纹白裙", category: "scene" as const },
  { id: "r9", url: `${SUPABASE_STORAGE}/references/reference-cafe-wide-leg-pants.jpg`, label: "咖啡阔腿", category: "scene" as const },
];

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4分/次", badge: "最新", icon: "/model-icons/openai.svg" },
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "4K · 2分/次", badge: "新", icon: "/model-icons/doubao.png" },
];

const GPT_ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: "3:4", label: "3:4 竖版" }, { value: "4:3", label: "4:3 横版" },
  { value: "1:1", label: "1:1 方形" }, { value: "16:9", label: "16:9 宽屏" },
  { value: "9:16", label: "9:16 手机" }, { value: "auto", label: "自动" },
];

const BANANA_ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: "3:4", label: "3:4" }, { value: "4:3", label: "4:3" },
  { value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" }, { value: "2:3", label: "2:3" },
  { value: "3:2", label: "3:2" }, { value: "4:5", label: "4:5" },
  { value: "5:4", label: "5:4" }, { value: "21:9", label: "21:9" },
  { value: "auto", label: "自动" },
];

const STYLE_PRESETS = [
  "杂志封面，专业棚拍灯光", "小红书甜美风，自然光", "韩系温柔风，奶白色调",
  "街拍潮流，酷感十足", "极简白底电商图", "户外自然光，清新明亮",
];

export default function CreatePage() {
  const router = useRouter();
  const supabase = createClient();
  const store = useTryOnStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [genCount, setGenCount] = useState(1);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [customStyle, setCustomStyle] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);

  const [customModelPreview, setCustomModelPreview] = useState<string | null>(null);
  const [customRefPreview, setCustomRefPreview] = useState<string | null>(null);
  const [isDraggingClothing, setIsDraggingClothing] = useState(false);
  const [isDraggingModel, setIsDraggingModel] = useState(false);
  const [isDraggingRef, setIsDraggingRef] = useState(false);

  // 已上传的服装 URL 列表（选择后立即上传）
  const [uploadedClothingUrls, setUploadedClothingUrls] = useState<string[]>([]);

  // 大图预览
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const aspects = aiModel === "gpt-image-2" ? GPT_ASPECTS : BANANA_ASPECTS;
  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);

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
      } else { setIsAuthenticated(false); setUserId(null); setCredits(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!aspects.find(a => a.value === aspectRatio)) setAspectRatio("3:4");
    const nextImageSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextImageSizes.includes(imageSize)) setImageSize(nextImageSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  useEffect(() => {
    const payload = takeApplyPayload("tryon");
    if (!payload) return;

    const files = payload.clothingUrls.map((_, index) =>
      new File([], `history-clothing-${index + 1}.jpg`, { type: "image/jpeg" })
    );
    store.setClothing(files, payload.clothingUrls);
    setUploadedClothingUrls(payload.clothingUrls);
    if (payload.modelFaceUrl) {
      store.setSelectedModel({
        id: "history-model",
        name: "历史模特",
        image_url: payload.modelFaceUrl,
        gender: "female",
        is_preset: false,
        user_id: null,
      });
    } else {
      store.setSelectedModel(null);
    }
    if (payload.referenceUrl) {
      store.setReferenceImage({
        id: "history-reference",
        url: payload.referenceUrl,
        label: "历史参考",
        category: "style",
        is_preset: false,
        user_id: null,
      });
    } else {
      store.setReferenceImage(null);
    }
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setGenCount(payload.genCount);
    setCustomStyle(payload.style || "");
    setPromptOverride(payload.rawPrompt || null);
    store.setPromptUsed(payload.rawPrompt || "");
    toast.success("已套用历史参数");
  }, []);

  const costPerImage = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = costPerImage * genCount;
  const promptPreview = buildTryOnPrompt({
    clothingCount: store.clothingFiles.length || 1,
    hasModelFace: !!store.selectedModel,
    hasReference: !!store.referenceImage,
    style: customStyle || undefined,
  });
  const analysisBasePrompt = buildTryOnPrompt({
    clothingCount: store.clothingFiles.length || 1,
    hasModelFace: !!store.selectedModel,
    hasReference: !!store.referenceImage,
  });
  const finalPrompt = promptOverride ?? (store.promptUsed || promptPreview.prompt);

  // ---- AI 优化提示词 ----
  const handleOptimizePrompt = async () => {
    if (!customStyle.trim()) { toast.error("请先输入风格描述"); return; }
    setOptimizing(true);
    try {
      const res = await fetch("/api/optimize-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: customStyle }),
      });
      const data = await res.json();
      if (data.optimized) { setCustomStyle(data.optimized); toast.success("提示词已优化"); }
    } catch { toast.error("优化失败"); }
    setOptimizing(false);
  };

  const handleAnalyzeFullPrompt = async () => {
    if (!uploadedClothingUrls.length) { toast.error("请先上传衣服"); return; }
    setOptimizing(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch("/api/analyze-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          clothing_urls: uploadedClothingUrls,
          model_face_url: store.selectedModel?.image_url,
          reference_url: store.referenceImage?.url,
          base_prompt: analysisBasePrompt.prompt,
          user_style: customStyle || undefined,
        }),
      }).finally(() => clearTimeout(timeout));

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.prompt) {
        setPromptOverride(data.prompt);
        store.setPromptUsed(data.prompt);
        toast.success("视觉 AI 已优化完整提示词");
      } else {
        toast.error(data.error || "AI 暂时没有返回优化结果");
      }
    } catch (err: any) {
      toast.error(err?.name === "AbortError" ? "AI 分析超时" : "AI 分析失败");
    } finally {
      setOptimizing(false);
    }
  };

  // ---- 文件处理：选择后立即上传 ----
  const processFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (store.clothingFiles.length + arr.length > MAX_CLOTHING_FILES) { toast.error(`最多 ${MAX_CLOTHING_FILES} 张`); return; }
    setIsUploading(true);

    const validFiles: File[] = [];
    const previews: string[] = [];
    const newUrls: string[] = [];

    for (const f of arr) {
      if (!f.type.startsWith("image/") || f.size > 10 * 1024 * 1024) {
        if (f.size > 10 * 1024 * 1024) toast.error(`${f.name} 超过 10MB`);
        continue;
      }
      try {
        const preview = await fileToBase64(f);
        previews.push(preview);
        validFiles.push(f);
      } catch { toast.error(`${f.name} 处理失败`); }
    }

    if (validFiles.length > 0) {
      toast.info(`正在上传 ${validFiles.length} 张图片...`);
      const uploadResults = await Promise.allSettled(
        validFiles.map((f) => uploadImage(f))
      );
      const uploadedFiles: File[] = [];
      const uploadedPreviews: string[] = [];

      for (let i = 0; i < uploadResults.length; i++) {
        const result = uploadResults[i];
        if (result.status === "fulfilled") {
          newUrls.push(result.value.url);
          uploadedFiles.push(validFiles[i]);
          uploadedPreviews.push(previews[i]);
        } else {
          toast.error(`${validFiles[i].name} 上传失败，请重试`);
        }
      }

      if (newUrls.length > 0) {
        store.setClothing([...store.clothingFiles, ...uploadedFiles], [...store.clothingPreviews, ...uploadedPreviews]);
        setUploadedClothingUrls(prev => [...prev, ...newUrls]);
        setPromptOverride(null);
        toast.success(`${newUrls.length} 件衣服已就绪`);
      }
    }
    setIsUploading(false);
  }, [store]);

  // 删除服装时同步删除已上传的 URL
  const removeClothing = (index: number) => {
    store.removeClothing(index);
    setUploadedClothingUrls(prev => prev.filter((_, i) => i !== index));
    setPromptOverride(null);
  };

  const handleCustomModel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const base64 = await fileToBase64(file);
    setCustomModelPreview(base64);
    toast.info("正在上传模特图...");
    try {
      const result = await uploadImage(file);
      store.setSelectedModel({ id: "custom", name: "自定义", image_url: result.url, gender: "female", is_preset: false, user_id: null });
      setPromptOverride(null);
      toast.success("模特已选择");
    } catch {
      setCustomModelPreview(null);
      toast.error("模特图上传失败，请重试");
    }
  };

  const handleCustomRef = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const base64 = await fileToBase64(file);
    setCustomRefPreview(base64);
    toast.info("正在上传参考图...");
    try {
      const result = await uploadImage(file);
      store.setReferenceImage({ id: "custom", url: result.url, label: "自定义参考", category: "style", is_preset: false, user_id: null });
      setPromptOverride(null);
      toast.success("参考图已选择");
    } catch {
      setCustomRefPreview(null);
      toast.error("参考图上传失败，请重试");
    }
  };

  // ---- 生成（识图 → 生成提示词 → 生成图片） ----
  const handleGenerate = async () => {
    if (!isAuthenticated) { toast.error("请先登录"); router.push("/login"); return; }
    if (!uploadedClothingUrls.length) { toast.error("请上传衣服"); return; }
    if (credits !== null && credits < totalCost) { toast.error(`积分不足 ${totalCost}，余额 ${credits}`); return; }

    store.startGeneration();

    try {
      // ---- Step 1: 构建稳定的编号提示词 ----
      store.updateProgress(5);

      let finalStyle = customStyle || "";
      let usedAiPrompt = false;
      if (promptOverride?.trim()) {
        finalStyle = promptOverride.trim();
        usedAiPrompt = true;
        store.setPromptUsed(finalStyle);
      }
      console.log("[generate] 跳过自动图片分析，使用当前提示词");

      store.updateProgress(15);
      toast.info("正在提交生成任务...");

      // ---- Step 2: 调用生成 API ----
      const res = await fetch("/api/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clothing_urls: uploadedClothingUrls,
          model_face_url: store.selectedModel?.image_url,
          reference_url: store.referenceImage?.url,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          style: usedAiPrompt ? undefined : finalStyle,
          raw_prompt: usedAiPrompt ? finalStyle : undefined,
          gen_count: genCount,
        }),
      });

      if (!res.ok) {
        const e = await res.json();
        if (res.status === 402) {
          const nextCredits = e.balance ?? 0;
          toast.error(e.error);
          setCredits(nextCredits);
          if (userId) setCachedProfileCredits(userId, nextCredits);
          store.setError(e.error);
          return;
        }
        throw new Error(e.error || "生成失败");
      }

      const { generation_id, credits_remaining } = await res.json();
      if (credits_remaining !== undefined) {
        setCredits(credits_remaining);
        if (userId) setCachedProfileCredits(userId, credits_remaining);
      }
      store.updateProgress(25);

      // ---- Step 3: 轮询进度 ----
      let attempts = 0;
      while (attempts < 120) {
        await new Promise(r => setTimeout(r, 2000));
        attempts++;

        const pollRes = await fetch(`/api/tryon?generation_id=${generation_id}`);
        if (!pollRes.ok) continue;

        const pollData = await pollRes.json();

        if (pollData.status === "processing_tryon") {
          store.updateProgress(Math.min(25 + attempts * 1.5, 90));
        } else if (pollData.status === "completed") {
          store.updateProgress(100);
          store.setResult(pollData.result_urls);
          toast.success("生成完成！");
          return;
        } else if (pollData.status === "failed") {
          throw new Error(pollData.error || "AI 生成失败");
        }
      }
      throw new Error("生成超时");
    } catch (err: any) {
      store.setError(err.message);
      toast.error(err.message);
    }
  };

  return (
    <div className="min-h-[calc(100dvh-56px)] lg:h-[calc(100vh-56px)] flex flex-col lg:flex-row bg-gray-50 lg:bg-white">
      <FeatureTabs active="tryon" />
      {/* ========== LEFT PANEL ========== */}
      <div className="w-full lg:w-[460px] border-b lg:border-b-0 lg:border-r bg-white flex flex-col overflow-visible lg:overflow-hidden">
        <div className="flex-1 overflow-visible lg:overflow-y-auto p-4 sm:p-5 space-y-6">

          {/* ---- 服装（整个区域可拖拽） ---- */}
          <section
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingClothing(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingClothing(false); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingClothing(false); processFiles(e.dataTransfer.files); }}
            className={`relative rounded-xl transition-all ${isDraggingClothing ? "ring-2 ring-purple-400 ring-offset-2" : ""}`}
          >
            {/* 拖拽遮罩 */}
            {isDraggingClothing && (
              <div className="absolute inset-0 z-10 bg-purple-500/10 border-2 border-dashed border-purple-400 rounded-xl flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto text-purple-500 mb-1" />
                  <p className="text-sm font-medium text-purple-600">松开上传服装</p>
                </div>
              </div>
            )}
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Upload className="w-4 h-4 text-purple-500" /> 上传服装
              {isUploading && <Loader2 className="w-3 h-3 animate-spin text-purple-400" />}
            </h3>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => e.target.files && processFiles(e.target.files)} />
            <div onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 hover:border-purple-300 rounded-xl p-5 text-center cursor-pointer transition-all">
              <Upload className="w-5 h-5 mx-auto mb-1 text-gray-300" />
              <p className="text-xs text-gray-500">点击上传 · 选择后立即上传</p>
            </div>
            {store.clothingPreviews.length > 0 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {store.clothingPreviews.map((p, i) => (
                  <div key={i} className="relative group">
                    <img src={p} className="w-full aspect-[3/4] object-cover rounded-lg border" />
                    <button onClick={() => removeClothing(i)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
                {store.clothingFiles.length < MAX_CLOTHING_FILES && (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="aspect-[3/4] border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center hover:border-purple-300">
                    <Plus className="w-4 h-4 text-gray-300" />
                  </button>
                )}
              </div>
            )}
          </section>

          {/* ---- 参考图（整个区域可拖拽） ---- */}
          <section
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingRef(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingRef(false); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation(); setIsDraggingRef(false);
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith("image/")) {
                handleCustomRef({ target: { files: [file] } } as any);
              }
            }}
            className={`relative rounded-xl transition-all ${isDraggingRef ? "ring-2 ring-purple-400 ring-offset-2" : ""}`}
          >
            {/* 拖拽遮罩 */}
            {isDraggingRef && (
              <div className="absolute inset-0 z-10 bg-purple-500/10 border-2 border-dashed border-purple-400 rounded-xl flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto text-purple-500 mb-1" />
                  <p className="text-sm font-medium text-purple-600">松开上传参考图</p>
                </div>
              </div>
            )}
            <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
              <Image className="w-4 h-4 text-purple-500" /> 参考图 <span className="text-purple-400 font-normal text-xs">· 主参考</span>
            </h3>
            <p className="text-[11px] text-gray-400 mb-3">决定姿势、场景、风格 · 可拖拽图片到此处</p>
            <input type="file" accept="image/*" className="hidden" onChange={handleCustomRef} />
            <div className="grid grid-cols-3 gap-2">
              {PRESET_REFERENCES.map((ref) => (
                <div key={ref.id} role="button" tabIndex={0}
                  onClick={() => {
                    store.setReferenceImage({ ...ref, is_preset: true, user_id: null } as any);
                    setPromptOverride(null);
                  }}
                  className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                    store.referenceImage?.id === ref.id ? "border-purple-500 ring-1 ring-purple-200" : "border-transparent hover:border-gray-300"
                  }`}>
                  <ImgSkeleton src={ref.url} className="w-full aspect-[3/4] object-cover" />
                  <div className="absolute inset-0 pointer-events-none group-hover:bg-black/20 transition-all flex items-end justify-end p-1 opacity-0 group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); setLightboxSrc(ref.url); }}
                      className="pointer-events-auto w-7 h-7 rounded-full bg-white/80 flex items-center justify-center hover:bg-white shadow-sm">
                      <ZoomIn className="w-3.5 h-3.5 text-gray-600" />
                    </button>
                  </div>
                  <div className="p-1 text-center"><span className="text-[10px] font-medium">{ref.label}</span></div>
                </div>
              ))}
              <button onClick={() => document.querySelector<HTMLInputElement>('[data-ref-input]')?.click()}
                className="rounded-lg border-2 border-dashed border-gray-200 hover:border-purple-300 flex flex-col items-center justify-center aspect-[3/4] transition-all">
                {customRefPreview
                  ? <img src={customRefPreview} className="w-full h-full object-cover rounded-lg" />
                  : <><Camera className="w-4 h-4 text-gray-300 mb-0.5" /><span className="text-[10px] text-gray-400">点击上传</span></>
                }
              </button>
              <input data-ref-input type="file" accept="image/*" className="hidden" onChange={handleCustomRef} />
            </div>
          </section>

          {/* ---- 模特（整个区域可拖拽·可选） ---- */}
          <section
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingModel(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingModel(false); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation(); setIsDraggingModel(false);
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith("image/")) {
                handleCustomModel({ target: { files: [file] } } as any);
              }
            }}
            className={`relative rounded-xl transition-all ${isDraggingModel ? "ring-2 ring-purple-400 ring-offset-2" : ""}`}
          >
            {/* 拖拽遮罩 */}
            {isDraggingModel && (
              <div className="absolute inset-0 z-10 bg-purple-500/10 border-2 border-dashed border-purple-400 rounded-xl flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto text-purple-500 mb-1" />
                  <p className="text-sm font-medium text-purple-600">松开上传模特图</p>
                </div>
              </div>
            )}
            <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
              <UserRound className="w-4 h-4 text-purple-500" /> 模特 <span className="text-purple-400 font-normal text-xs">· 控制脸部</span>
              <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 text-[9px]">可选</span>
            </h3>
            <p className="text-[11px] text-gray-400 mb-3">不选则使用参考图中的人物面部 · 可拖拽图片到此处</p>
            <input type="file" accept="image/*" className="hidden" onChange={handleCustomModel} />
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  store.setSelectedModel(null);
                  setCustomModelPreview(null);
                  toast.success("已设为不替换脸部");
                }}
                className={`rounded-lg border-2 flex flex-col items-center justify-center aspect-square transition-all ${
                  !store.selectedModel ? "border-purple-500 bg-purple-50 ring-1 ring-purple-200" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <UserRound className={`w-5 h-5 mb-1 ${!store.selectedModel ? "text-purple-500" : "text-gray-300"}`} />
                <span className={`text-[10px] font-medium ${!store.selectedModel ? "text-purple-600" : "text-gray-400"}`}>
                  不选默认
                </span>
              </button>
              {PRESET_MODELS.map((m) => (
                <div key={m.id} role="button" tabIndex={0}
                  onClick={() => {
                    setCustomModelPreview(null);
                    store.setSelectedModel({ ...m, is_preset: true, user_id: null });
                    setPromptOverride(null);
                  }}
                  className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                    store.selectedModel?.id === m.id ? "border-purple-500 ring-1 ring-purple-200" : "border-transparent hover:border-gray-300"
                  }`}>
                  <ImgSkeleton src={m.image_url} className="w-full aspect-square object-cover" />
                  <div className="absolute inset-0 pointer-events-none group-hover:bg-black/20 transition-all flex items-end justify-end p-1 opacity-0 group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); setLightboxSrc(m.image_url); }}
                      className="pointer-events-auto w-7 h-7 rounded-full bg-white/80 flex items-center justify-center hover:bg-white shadow-sm">
                      <ZoomIn className="w-3.5 h-3.5 text-gray-600" />
                    </button>
                  </div>
                  <div className="p-1 text-center"><span className="text-[10px] font-medium">{m.name}</span></div>
                </div>
              ))}
              <button onClick={() => document.querySelector<HTMLInputElement>('[data-model-input]')?.click()}
                className="rounded-lg border-2 border-dashed border-gray-200 hover:border-purple-300 flex flex-col items-center justify-center aspect-square transition-all">
                {customModelPreview
                  ? <img src={customModelPreview} className="w-full h-full object-cover rounded-lg" />
                  : <><Camera className="w-5 h-5 text-gray-300" /><span className="text-[10px] text-gray-400">点击上传</span></>
                }
              </button>
              <input data-model-input type="file" accept="image/*" className="hidden" onChange={handleCustomModel} />
            </div>
          </section>

          {/* ---- AI 模型 ---- */}
          <section>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" /> AI 模型
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {MODELS.map((opt) => (
                <button key={opt.value} onClick={() => setAiModel(opt.value)}
                  className={`text-left px-3 py-2 rounded-lg border transition-all ${
                    aiModel === opt.value ? "border-purple-500 bg-purple-50" : "border-gray-100 hover:border-gray-300"
                  }`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <img src={opt.icon} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" />
                    <span className="text-[11px] font-semibold truncate min-w-0">{opt.label}</span>
                    {opt.badge && <span className="text-[9px] px-1 py-0.5 rounded-full bg-purple-100 text-purple-600 flex-shrink-0">{opt.badge}</span>}
                  </div>
                  <p className="text-[10px] text-gray-400 pl-5 leading-tight truncate">{opt.desc} · 当前{getCreditCost(opt.value, imageSize, aspectRatio)}分</p>
                </button>
              ))}
            </div>
          </section>

          {/* ---- 比例 ---- */}
          <section>
            <h3 className="font-bold text-sm mb-3">图片比例</h3>
            <div className="flex flex-wrap gap-1.5">
              {aspects.map((a) => (
                <button key={a.value} onClick={() => setAspectRatio(a.value)}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                    aspectRatio === a.value ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"
                  }`}>{a.label}</button>
              ))}
            </div>
          </section>

          {/* ---- 分辨率 ---- */}
          {imageSizes.length > 1 && (
            <section>
              <h3 className="font-bold text-sm mb-3">分辨率</h3>
              <div className="flex gap-2">
                {imageSizes.map((s) => (
                  <button key={s} onClick={() => setImageSize(s)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                      imageSize === s ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"
                    }`}>{s} · {getCreditCost(aiModel, s, aspectRatio)}积分</button>
                ))}
              </div>
            </section>
          )}

          {/* ---- 风格 + AI 优化 ---- */}
          <section>
            <h3 className="font-bold text-sm mb-3">风格指令（补充）</h3>
            <div className="relative">
              <textarea value={customStyle} onChange={(e) => { setCustomStyle(e.target.value); setPromptOverride(null); }}
                placeholder="可选：补充额外的风格方向..."
                className="w-full px-3 py-2 pr-10 rounded-lg border text-xs focus:ring-2 focus:ring-purple-200 outline-none resize-none h-14" />
              <button onClick={handleOptimizePrompt} disabled={optimizing || !customStyle.trim()}
                className="absolute right-2 top-2 p-1.5 rounded-md bg-purple-50 text-purple-500 hover:bg-purple-100 disabled:opacity-30"
                title="AI 优化提示词">
                {optimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {STYLE_PRESETS.map((s, i) => (
                <button key={i} onClick={() => { setCustomStyle(s); setPromptOverride(null); }}
                  className="px-2 py-0.5 rounded-full bg-gray-50 border text-[10px] text-gray-500 hover:bg-purple-50 hover:text-purple-600 transition-all">{s}</button>
              ))}
            </div>

            {/* 查看提示词 */}
            <button onClick={() => setShowPromptPreview(true)}
              className="mt-3 w-full py-2 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-purple-300 hover:text-purple-600 transition-all flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              查看完整提示词
            </button>
          </section>

          {/* ---- 生成数量 ---- */}
          <section>
            <h3 className="font-bold text-sm mb-3">生成数量</h3>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} onClick={() => setGenCount(n)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                    genCount === n ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"
                  }`}>
                  {n} 张
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* ---- 底部 ---- */}
        <div className="border-t p-3 sm:p-4 space-y-2 bg-white">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{store.clothingFiles.length} 件服装 · {costPerImage} × {genCount} 张</span>
            {isAuthenticated
              ? <span className="font-bold text-amber-600">消耗 {totalCost} · 余额 {credits ?? "—"}</span>
              : <span className="text-gray-400">登录后查看积分</span>
            }
          </div>
          <button onClick={handleGenerate} disabled={store.isGenerating || !uploadedClothingUrls.length}
            className="w-full py-3 rounded-xl gradient-brand text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 shadow-lg shadow-purple-200">
            <Sparkles className="w-4 h-4" />
            {!isAuthenticated ? "登录后生成" : store.isGenerating ? "生成中..." : `生成 ${genCount} 张`}
          </button>
        </div>
      </div>

      {/* ========== RIGHT PANEL ========== */}
      <div className="min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden">
        {/* Idle */}
        {!store.isGenerating && store.resultUrls.length === 0 && !store.error && (
          <div className="min-h-[360px] lg:h-full flex items-center justify-center relative overflow-hidden px-4">
            {/* 渐变背景 */}
            <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-white to-pink-50" />
            {/* 装饰圆 */}
            <div className="absolute top-20 right-20 w-64 h-64 rounded-full bg-purple-100/30 blur-3xl" />
            <div className="absolute bottom-20 left-20 w-48 h-48 rounded-full bg-pink-100/30 blur-3xl" />

            <div className="relative text-center animate-fade-in">
              <div className="w-28 h-28 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center shadow-lg shadow-purple-100">
                <Sparkles className="w-12 h-12 text-purple-400" />
              </div>
              <p className="text-gray-500 text-base font-medium mb-1">开始你的 AI 换装</p>
              <p className="text-gray-400 text-sm">在左侧选择服装、参考图和模特</p>
              <p className="text-gray-400 text-sm">然后点击「开始生成」</p>
            </div>
          </div>
        )}

        {/* ==== 生成中：毛玻璃流光卡片 ==== */}
        {store.isGenerating && (
          <div className="min-h-[360px] lg:h-full p-4 sm:p-8 flex items-center justify-center" style={{ background: "#f0f0f5" }}>
            {/* 背景装饰光斑 */}
            <div style={{
              position: "absolute", top: "10%", left: "20%", width: "300px", height: "300px",
              borderRadius: "50%", filter: "blur(80px)", opacity: 0.4,
              background: "radial-gradient(circle, #e879f9, #a78bfa, transparent)",
            }} />
            <div style={{
              position: "absolute", bottom: "15%", right: "15%", width: "250px", height: "250px",
              borderRadius: "50%", filter: "blur(80px)", opacity: 0.3,
              background: "radial-gradient(circle, #f472b6, #c084fc, transparent)",
            }} />

            <div className="grid grid-cols-2 gap-3 sm:gap-5 max-w-lg w-full relative z-10">
              {Array.from({ length: genCount }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden"
                  style={{
                    background: "rgba(255, 255, 255, 0.25)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    border: "1px solid rgba(255, 255, 255, 0.4)",
                    boxShadow: "0 8px 32px rgba(168, 85, 247, 0.15), inset 0 1px 0 rgba(255,255,255,0.5)",
                  }}>
                  <div className="aspect-[3/4] relative overflow-hidden"
                    style={{
                      background: "linear-gradient(135deg, rgba(232,121,249,0.15), rgba(167,139,250,0.2), rgba(244,114,182,0.15))",
                    }}>

                    {/* 柔和波动光效 */}
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "linear-gradient(120deg, transparent 0%, transparent 30%, rgba(232,121,249,0.08) 40%, rgba(255,255,255,0.15) 48%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.15) 52%, rgba(167,139,250,0.08) 60%, transparent 70%, transparent 100%)",
                      backgroundSize: "300% 100%",
                      animation: "shimmer 4s ease-in-out infinite",
                    }} />
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "linear-gradient(160deg, transparent 0%, transparent 35%, rgba(244,114,182,0.06) 45%, rgba(255,255,255,0.1) 50%, rgba(192,132,252,0.06) 55%, transparent 65%, transparent 100%)",
                      backgroundSize: "250% 100%",
                      animation: "shimmer 5.5s ease-in-out infinite reverse",
                    }} />
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(232,121,249,0.06), transparent)",
                      animation: "pulse 3s ease-in-out infinite",
                    }} />

                    {/* 玻璃噪点纹理 */}
                    <div style={{
                      position: "absolute", inset: 0, opacity: 0.03,
                      backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                    }} />

                    {/* 中心内容 */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="relative w-16 h-16 mb-4">
                        <svg className="w-full h-full" viewBox="0 0 100 100"
                          style={{ animation: "spin 5s linear infinite", transformOrigin: "center", filter: "drop-shadow(0 0 8px rgba(232,121,249,0.4))" }}>
                          <defs>
                            <linearGradient id={`g${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#e879f9">
                                <animate attributeName="stop-color" values="#e879f9;#a78bfa;#f472b6;#e879f9" dur="4s" repeatCount="indefinite" />
                              </stop>
                              <stop offset="100%" stopColor="#a78bfa">
                                <animate attributeName="stop-color" values="#a78bfa;#f472b6;#e879f9;#a78bfa" dur="4s" repeatCount="indefinite" />
                              </stop>
                            </linearGradient>
                          </defs>
                          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                          <circle cx="50" cy="50" r="42" fill="none" stroke={`url(#g${i})`} strokeWidth="4"
                            strokeLinecap="round" strokeDasharray="180 264" />
                          <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-black" style={{
                            background: "linear-gradient(135deg, #e879f9, #a78bfa, #f472b6)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
                          }}>{Math.round(store.generationProgress)}</span>
                          <span className="text-xs font-bold ml-0.5" style={{ color: "rgba(168,85,247,0.5)" }}>%</span>
                        </div>
                      </div>

                      <p className="text-xs font-medium" style={{ color: "rgba(168,85,247,0.7)" }}>
                        {store.generationProgress < 20 ? "准备中..." :
                         store.generationProgress < 90 ? "AI 生成中..." : "即将完成..."}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        {store.resultUrls.length > 0 && (
          <div className="min-h-[360px] lg:h-full p-4 sm:p-6 flex items-center justify-center bg-gray-50 animate-fade-in">
            <div className="flex gap-4 items-center justify-start lg:justify-center max-w-full overflow-x-auto">
              {store.resultUrls.map((url, i) => (
                <div key={i} className="relative group rounded-2xl overflow-hidden shadow-2xl bg-white flex-shrink-0 cursor-zoom-in"
                  style={{ maxHeight: "calc(100vh - 180px)" }}
                  onClick={() => setLightboxSrc(url)}>
                  <img src={url}
                    className="block max-h-[calc(100dvh-180px)] max-w-[calc(100vw-2rem)] lg:max-h-[calc(100vh-180px)] lg:max-w-[calc(100vw-540px)] w-auto h-auto object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext x='50' y='50' text-anchor='middle' dominant-baseline='middle' font-size='14' fill='%23999'%3E加载失败%3C/text%3E%3C/svg%3E"; }} />
                  <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); downloadImage(url, generateDownloadFilename("tryon", i)); }}
                      className="w-9 h-9 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {store.error && (
          <div className="min-h-[360px] lg:h-full flex items-center justify-center bg-gray-50 animate-fade-in px-4">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center"><X className="w-8 h-8 text-red-400" /></div>
              <p className="text-red-500 font-medium mb-1">生成失败</p>
              <p className="text-sm text-gray-400 mb-4 max-w-sm">{store.error}</p>
              <button onClick={() => { store.setError(null); handleGenerate(); }}
                className="px-5 py-2 rounded-full border text-sm font-medium hover:bg-gray-50">重试</button>
            </div>
          </div>
        )}

        {/* Bottom bar */}
        {store.resultUrls.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">AI 换装结果</span>
              {store.promptUsed && (
                <button onClick={() => setShowPromptPreview(true)}
                  className="text-xs text-purple-500 hover:text-purple-700 underline">
                  查看提示词
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => store.reset()}
                className="px-4 py-1.5 rounded-full border text-xs font-medium flex items-center gap-1.5 hover:bg-gray-50">
                <RefreshCw className="w-3 h-3" /> 重新创作
              </button>
              <a href="/history" className="px-4 py-1.5 rounded-full gradient-brand text-white text-xs font-medium flex items-center gap-1.5">
                历史记录 <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ========== 大图 Lightbox ========== */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
          <button onClick={() => setLightboxSrc(null)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ========== 提示词预览 ========== */}
      {showPromptPreview && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setShowPromptPreview(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-bold text-sm">{promptOverride || store.promptUsed ? "完整提示词" : "默认提示词模板"}</h3>
              <button onClick={() => setShowPromptPreview(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-2 bg-gray-50 border-b">
              <div className="flex gap-2 flex-wrap">
                {promptPreview.imageRoles.map((role, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-medium">
                    图{i + 1}：{role}
                  </span>
                ))}
                {customStyle && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">
                    + 风格补充
                  </span>
                )}
              </div>
            </div>

            <div className="px-5 py-4 overflow-y-auto max-h-[55vh] space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["模型", aiModel],
                  ["比例", aspectRatio],
                  ["分辨率", imageSize],
                  ["生成张数", `${genCount}`],
                  ["服装数量", `${uploadedClothingUrls.length}`],
                  ["模特脸", store.selectedModel ? "已使用" : "未使用"],
                  ["参考图", store.referenceImage ? "已使用" : "未使用"],
                  ["用户输入", customStyle || "无"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-400">{label}</p>
                    <p className="text-xs font-medium text-gray-700 break-words">{value}</p>
                  </div>
                ))}
              </div>
              <textarea
                value={finalPrompt}
                onChange={(e) => {
                  setPromptOverride(e.target.value);
                  store.setPromptUsed(e.target.value);
                }}
                className="w-full min-h-[220px] px-3 py-2 rounded-lg border text-xs text-gray-700 leading-relaxed outline-none focus:ring-2 focus:ring-purple-200 resize-y"
              />
              <button
                onClick={handleAnalyzeFullPrompt}
                disabled={optimizing || !uploadedClothingUrls.length}
                className="w-full py-2 rounded-lg border border-dashed border-purple-200 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {optimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
                视觉 AI 分析图片并优化
              </button>
            </div>

            <div className="px-5 py-3 border-t bg-gray-50 flex justify-between gap-2">
              <button onClick={() => {
                setPromptOverride(null);
                store.setPromptUsed("");
                toast.success("已重置为默认提示词");
              }}
                className="px-4 py-1.5 rounded-full border border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-purple-300 hover:text-purple-600 transition-colors">重置默认</button>
              <div className="flex gap-2">
                <button onClick={() => { navigator.clipboard.writeText(finalPrompt); toast.success("已复制"); }}
                  className="px-4 py-1.5 rounded-full border text-xs font-medium hover:bg-gray-50">复制</button>
                <button onClick={() => setShowPromptPreview(false)}
                  className="px-4 py-1.5 rounded-full gradient-brand text-white text-xs font-medium">关闭</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
