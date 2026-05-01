"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, ChevronRight, Download, Loader2, Plus, Sparkles, Upload, Wand, X, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { createClient, getCachedProfileCredits, setCachedProfileCredits } from "@/lib/supabase/client";
import { downloadImage, fileToBase64 } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";

type GarmentType = "上装" | "下装" | "连体衣" | "其他";
type OutputMode = "reference" | "prompt";

const DEFAULT_PROMPT = "衣服变为类似穿在人身上的立体效果，向左微微旋转，使用干净白色背景。";

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4积分", badge: "最新", icon: "/model-icons/openai.svg" },
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3积分", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4积分", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "4K · 2积分", badge: "新", icon: "/model-icons/doubao.png" },
];

const REFERENCE_PRESETS = [
  { id: "r1", label: "灰色连帽", url: "/garment-3d-refs/ref-01.webp" },
  { id: "r2", label: "立体牛仔", url: "/garment-3d-refs/ref-02.png" },
  { id: "r3", label: "棒球外套", url: "/garment-3d-refs/ref-03.png" },
  { id: "r4", label: "直筒裤装", url: "/garment-3d-refs/ref-04.png" },
  { id: "r5", label: "纹理卫衣", url: "/garment-3d-refs/ref-05.png" },
  { id: "r6", label: "敞开夹克", url: "/garment-3d-refs/ref-06.png" },
  { id: "r7", label: "侧身外套", url: "/garment-3d-refs/ref-07.png" },
  { id: "r8", label: "羽绒厚度", url: "/garment-3d-refs/ref-08.png" },
  { id: "r9", label: "背面廓形", url: "/garment-3d-refs/ref-09.jpg" },
  { id: "r10", label: "短外套", url: "/garment-3d-refs/ref-10.png" },
];

export default function Garment3dPage() {
  const router = useRouter();
  const supabase = createClient();
  const garmentInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  const [garmentUrl, setGarmentUrl] = useState("");
  const [garmentName, setGarmentName] = useState("");
  const [garmentType, setGarmentType] = useState<GarmentType>("上装");
  const [customGarmentType, setCustomGarmentType] = useState("");
  const [outputMode, setOutputMode] = useState<OutputMode>("reference");
  const [selectedReference, setSelectedReference] = useState(REFERENCE_PRESETS[0]);
  const [customReferenceUrl, setCustomReferenceUrl] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);

  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<Extract<AspectRatio, "1:1" | "3:4">>("1:1");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);

  const [isDragging, setIsDragging] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const costPerImage = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = costPerImage * genCount;
  const activeReferenceUrl = customReferenceUrl || selectedReference.url;

  const builtPrompt = useMemo(() => {
    return buildGarment3dPrompt({
      garmentType: garmentType === "其他" ? customGarmentType || "其他服装" : garmentType,
      outputMode,
      hasReference: outputMode === "reference" && !!activeReferenceUrl,
      prompt,
    });
  }, [activeReferenceUrl, customGarmentType, garmentType, outputMode, prompt]);
  const finalPrompt = promptOverride ?? builtPrompt;

  const imageRoles = outputMode === "reference"
    ? ["图1：用户上传服装图", "图2：3D立体效果参考图"]
    : ["图1：用户上传服装图"];

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

  async function handleGarmentFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("图片不能超过 12MB");
      return;
    }

    const base64 = await fileToBase64(file);
    setGarmentUrl(base64);
    setGarmentName(file.name);
    setResultUrls([]);
    setError(null);
    toast.success("服装图已准备");
  }

  async function handleCustomReference(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    const base64 = await fileToBase64(file);
    setCustomReferenceUrl(base64);
    setPromptOverride(null);
    toast.success("参考图已选择");
  }

  async function urlToBase64(url: string) {
    if (url.startsWith("data:")) return url;
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  async function optimizePrompt() {
    if (!garmentUrl) {
      toast.error("请先上传服装图");
      return;
    }

    setIsOptimizing(true);
    try {
      const res = await fetch("/api/garment-3d/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garment_url: garmentUrl,
          garment_type: garmentType,
          custom_garment_type: customGarmentType,
          prompt: finalPrompt,
        }),
      });
      const data = await res.json();
      if (data.prompt) {
        const optimizedPrompt = buildGarment3dPrompt({
          garmentType: garmentType === "其他" ? customGarmentType || "其他服装" : garmentType,
          outputMode,
          hasReference: outputMode === "reference" && !!activeReferenceUrl,
          prompt: data.prompt,
        });
        setPrompt(data.prompt);
        setPromptOverride(optimizedPrompt);
        toast.success("视觉 AI 已优化提示词");
      } else {
        toast.error("AI 暂时没有返回优化结果");
      }
    } catch {
      toast.error("优化失败");
    } finally {
      setIsOptimizing(false);
    }
  }

  async function generate() {
    if (!isAuthenticated) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (!garmentUrl) {
      toast.error("请上传服装图");
      return;
    }
    if (garmentType === "其他" && !customGarmentType.trim()) {
      toast.error("请输入自定义服装类型");
      return;
    }
    if (credits !== null && credits < totalCost) {
      toast.error(`积分不足，需要 ${totalCost}，余额 ${credits}`);
      return;
    }

    setIsGenerating(true);
    setProgress(12);
    setResultUrls([]);
    setError(null);

    try {
      const referencePayload = outputMode === "reference" ? await urlToBase64(activeReferenceUrl) : null;
      const res = await fetch("/api/garment-3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garment_url: garmentUrl,
          garment_type: garmentType,
          custom_garment_type: customGarmentType,
          output_mode: outputMode,
          reference_url: referencePayload,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          prompt,
          final_prompt: finalPrompt,
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

      if (data.status === "completed") {
        setProgress(100);
        setResultUrls(data.result_urls || []);
        toast.success("服装转3D完成");
        return;
      }

      let attempts = 0;
      while (attempts < 120) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts++;
        setProgress(Math.min(18 + attempts * 1.6, 92));

        const poll = await fetch(`/api/garment-3d?generation_id=${data.generation_id}`);
        if (!poll.ok) continue;
        const pollData = await poll.json();

        if (pollData.status === "completed") {
          setProgress(100);
          setResultUrls(pollData.result_urls || []);
          toast.success("服装转3D完成");
          return;
        }
        if (pollData.status === "failed") {
          throw new Error(pollData.error || "生成失败");
        }
      }
      throw new Error("生成超时");
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="h-[calc(100vh-56px)] flex">
      <FeatureTabs active="garment3d" />
      <div className="w-[460px] border-r bg-white flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <section
            onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleGarmentFiles(e.dataTransfer.files);
            }}
            className={`rounded-xl transition-all ${isDragging ? "ring-2 ring-purple-400 ring-offset-2" : ""}`}
          >
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Upload className="w-4 h-4 text-purple-500" /> 上传服装图
            </h3>
            <input
              ref={garmentInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files && handleGarmentFiles(e.target.files)}
            />
            {garmentUrl ? (
              <div className="relative group">
                <img src={garmentUrl} className="w-full max-h-[260px] object-contain rounded-xl border bg-gray-50" />
                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                  <span className="truncate">{garmentName || "已上传图片"}</span>
                  <button onClick={() => garmentInputRef.current?.click()} className="text-purple-600 hover:text-purple-700">
                    重新上传
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => garmentInputRef.current?.click()}
                className="w-full border-2 border-dashed border-purple-200 hover:border-purple-400 rounded-xl p-8 text-center transition-colors"
              >
                <Upload className="w-6 h-6 mx-auto mb-2 text-purple-300" />
                <span className="text-xs text-gray-500">上传单张平面衣服图或人台衣服图</span>
              </button>
            )}
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">上传的服装类型</h3>
            <div className="grid grid-cols-4 gap-2">
              {(["上装", "下装", "连体衣", "其他"] as GarmentType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setGarmentType(type)}
                  className={`py-2 rounded-lg border text-xs font-medium transition-all ${
                    garmentType === type ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            {garmentType === "其他" && (
              <input
                value={customGarmentType}
                onChange={(e) => setCustomGarmentType(e.target.value)}
                placeholder="例如：斗篷、围巾、礼服套装"
                className="mt-2 w-full px-3 py-2 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-purple-200"
              />
            )}
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">出图模式</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => { setOutputMode("reference"); setPromptOverride(null); }}
                className={`py-2 rounded-lg border text-xs font-medium ${outputMode === "reference" ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200"}`}
              >
                选择参考图
              </button>
              <button
                onClick={() => { setOutputMode("prompt"); setPromptOverride(null); }}
                className={`py-2 rounded-lg border text-xs font-medium ${outputMode === "prompt" ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200"}`}
              >
                自定义提示词
              </button>
            </div>

            {outputMode === "reference" && (
              <div className="space-y-3">
                <div className="grid grid-cols-5 gap-2">
                  {REFERENCE_PRESETS.map((ref) => (
                    <button
                      key={ref.id}
                      onClick={() => { setSelectedReference(ref); setCustomReferenceUrl(""); setPromptOverride(null); }}
                      className={`group relative aspect-square rounded-lg overflow-hidden border bg-gray-50 ${
                        !customReferenceUrl && selectedReference.id === ref.id ? "border-purple-500 ring-2 ring-purple-100" : "border-gray-200"
                      }`}
                      title={ref.label}
                    >
                      <img src={ref.url} alt={ref.label} className="w-full h-full object-cover" />
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setLightboxSrc(ref.url); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setLightboxSrc(ref.url);
                          }
                        }}
                        className="absolute right-1.5 top-1.5 w-7 h-7 rounded-full bg-white/90 text-gray-700 shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center hover:bg-white"
                        title="放大预览"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => referenceInputRef.current?.click()}
                    className={`aspect-square rounded-lg border-2 border-dashed flex items-center justify-center ${
                      customReferenceUrl ? "border-purple-500 bg-purple-50" : "border-gray-200"
                    }`}
                    title="上传参考图"
                  >
                    <Plus className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
                <input
                  ref={referenceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleCustomReference(e.target.files?.[0])}
                />
                <p className="text-[11px] text-gray-400">参考图用于锁定立体风格和角度，不会替换用户服装的款式和颜色。</p>
              </div>
            )}

            {outputMode === "prompt" && (
              <div className="mt-3">
                <h3 className="font-bold text-sm mb-3">描述3D效果</h3>
                <div className="relative">
                  <textarea
                    value={prompt}
                    onChange={(e) => { setPrompt(e.target.value); setPromptOverride(null); }}
                    placeholder="描述衣服的立体角度、厚度、旋转方向、背景风格等"
                    className="w-full px-3 py-2 pr-10 rounded-lg border text-xs focus:ring-2 focus:ring-purple-200 outline-none resize-none h-24"
                  />
                  <button
                    onClick={optimizePrompt}
                    disabled={isOptimizing || !garmentUrl}
                    className="absolute right-2 top-2 p-1.5 rounded-md bg-purple-50 text-purple-500 hover:bg-purple-100 disabled:opacity-30"
                    title="视觉 AI 优化提示词"
                  >
                    {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">AI 模型</h3>
            <div className="grid grid-cols-2 gap-2">
              {MODELS.map((model) => (
                <button
                  key={model.value}
                  onClick={() => setAiModel(model.value)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    aiModel === model.value ? "border-purple-500 bg-purple-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <img src={model.icon} className="w-4 h-4 rounded-full" />
                    <span className="text-xs font-bold">{model.label}</span>
                    {model.badge && <span className="text-[10px] text-purple-500 font-bold">{model.badge}</span>}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">{model.desc}</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">图片比例</h3>
            <div className="grid grid-cols-2 gap-2">
              {(["1:1", "3:4"] as const).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`py-2 rounded-lg border text-xs font-medium ${aspectRatio === ratio ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200"}`}
                >
                  {ratio === "1:1" ? "1:1 方图" : "3:4 竖版"}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">分辨率</h3>
            <div className="flex gap-2">
              {imageSizes.map((size) => (
                <button
                  key={size}
                  onClick={() => setImageSize(size)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium ${
                    imageSize === size ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200"
                  }`}
                >
                  {size} · {getCreditCost(aiModel, size, aspectRatio)}积分
                </button>
              ))}
            </div>
          </section>

          <button
            onClick={() => setShowPromptPreview(true)}
            className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-purple-300 hover:text-purple-600 transition-all flex items-center justify-center gap-1.5"
          >
            <ZoomIn className="w-3.5 h-3.5" /> 查看完整提示词
          </button>

          <section>
            <h3 className="font-bold text-sm mb-3">生成数量</h3>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setGenCount(n)}
                  className={`py-2 rounded-lg border text-sm font-medium ${genCount === n ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200"}`}
                >
                  {n} 张
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="border-t p-4 space-y-2 bg-white">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{costPerImage} × {genCount} 张</span>
            {isAuthenticated
              ? <span className="font-bold text-amber-600">消耗 {totalCost} · 余额 {credits ?? "-"}</span>
              : <span className="text-gray-400">登录后查看积分</span>
            }
          </div>
          <button
            onClick={generate}
            disabled={isGenerating || !garmentUrl}
            className="w-full py-3 rounded-xl gradient-brand text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 shadow-lg shadow-purple-200"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {!isAuthenticated ? "登录后生成" : isGenerating ? "生成中..." : `生成 ${genCount} 张`}
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-gray-50">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="h-full flex items-center justify-center bg-gradient-to-br from-white via-purple-50 to-pink-50">
            <div className="text-center">
              <div className="w-28 h-28 mx-auto mb-6 rounded-3xl bg-white shadow-lg shadow-purple-100 flex items-center justify-center">
                <Box className="w-12 h-12 text-purple-400" />
              </div>
              <p className="text-gray-600 text-base font-medium mb-1">服装转3D</p>
              <p className="text-gray-400 text-sm">上传单张服装图，生成更有体积感的商品展示图</p>
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="h-full flex items-center justify-center">
            <div className="w-[260px] rounded-2xl bg-white border shadow-sm p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-50 flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-purple-500 animate-spin" />
              </div>
              <p className="font-bold text-sm text-gray-700 mb-2">正在生成立体服装图</p>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full gradient-brand transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-2">{Math.round(progress)}%</p>
            </div>
          </div>
        )}

        {resultUrls.length > 0 && (
          <div className="h-full p-6 flex items-center justify-center animate-fade-in">
            <div className="flex gap-4 items-center justify-center max-w-full overflow-x-auto">
              {resultUrls.map((url, index) => (
                <div
                  key={index}
                  className="relative group rounded-2xl overflow-hidden shadow-2xl bg-white flex-shrink-0 cursor-zoom-in"
                  onClick={() => setLightboxSrc(url)}
                >
                  <img src={url} className="block max-h-[calc(100vh-180px)] max-w-[calc(100vw-540px)] w-auto h-auto object-contain" />
                  <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadImage(url, `garment-3d-${index + 1}.png`); }}
                      className="w-9 h-9 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t px-6 py-3 flex items-center justify-between">
              <span className="text-xs text-gray-400">服装转3D结果</span>
              <button onClick={() => { setResultUrls([]); setProgress(0); }} className="px-4 py-1.5 rounded-full border text-xs font-medium hover:bg-gray-50">
                重新创作 <ChevronRight className="inline w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
                <X className="w-8 h-8 text-red-400" />
              </div>
              <p className="text-red-500 font-medium mb-1">生成失败</p>
              <p className="text-sm text-gray-400 mb-4 max-w-sm">{error}</p>
              <button onClick={generate} className="px-5 py-2 rounded-full border text-sm font-medium hover:bg-gray-50">重试</button>
            </div>
          </div>
        )}
      </div>

      {showPromptPreview && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShowPromptPreview(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-bold text-sm">完整提示词</h3>
              <button onClick={() => setShowPromptPreview(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-2 bg-gray-50 border-b flex gap-2 flex-wrap">
              {imageRoles.map((role) => (
                <span key={role} className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-medium">
                  {role}
                </span>
              ))}
            </div>
            <div className="px-5 py-4 overflow-y-auto max-h-[55vh] space-y-3">
              <textarea
                value={finalPrompt}
                onChange={(e) => setPromptOverride(e.target.value)}
                className="w-full min-h-[220px] px-3 py-2 rounded-lg border text-xs text-gray-700 leading-relaxed outline-none focus:ring-2 focus:ring-purple-200 resize-y"
              />
              <button
                onClick={optimizePrompt}
                disabled={isOptimizing || !garmentUrl}
                className="w-full py-2 rounded-lg border border-dashed border-purple-200 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
                视觉 AI 分析图片并优化
              </button>
            </div>
            <div className="px-5 py-3 border-t bg-gray-50 flex justify-end gap-2">
              <button onClick={() => { navigator.clipboard.writeText(finalPrompt); toast.success("已复制"); }} className="px-4 py-1.5 rounded-full border text-xs font-medium hover:bg-gray-50">
                复制
              </button>
              <button onClick={() => setShowPromptPreview(false)} className="px-4 py-1.5 rounded-full gradient-brand text-white text-xs font-medium">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxSrc && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 cursor-zoom-out" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
          <button onClick={() => setLightboxSrc(null)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function buildGarment3dPrompt(params: {
  garmentType: string;
  outputMode: OutputMode;
  hasReference: boolean;
  prompt: string;
}) {
  const roles = params.hasReference
    ? "图像角色：图1是用户上传的服装图，图2是3D立体效果参考图。"
    : "图像角色：图1是用户上传的服装图。";
  const referenceLine = params.hasReference
    ? "参考图2的立体角度、布料厚度、阴影结构、背景风格和商业棚拍质感，但不要复制图2的颜色、图案、文字或具体款式。"
    : "按照用户提示生成类似穿在人身上的3D立体展示效果，使用干净白色背景。";
  const backgroundLine = params.hasReference
    ? "画面要求：主体居中，边缘干净，真实商业棚拍质感，柔和自然阴影，背景参考图2的背景风格、明暗和空间感。"
    : "画面要求：主体居中，边缘干净，真实商业棚拍质感，柔和自然阴影，干净白色背景。";

  return `${roles}
任务：将图1的${params.garmentType || "服装"}从平面图或人台图转换为无真人、无头部、无脸、无手的3D立体服装展示图。
${referenceLine}
严格保留图1服装的版型、颜色、材质、纹理、图案、纽扣、拉链、口袋、帽绳、袖口、裤腰、裤脚等细节。
用户要求：${params.prompt.trim() || DEFAULT_PROMPT}
${backgroundLine}
负面约束：不要生成真人身体，不要生成模特脸，不要多件衣服，不要改变服装品类，不要改变主要颜色，不要扭曲文字和 logo。`;
}
