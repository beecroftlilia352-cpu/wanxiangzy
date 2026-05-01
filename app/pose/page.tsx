"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, PersonStanding, Sparkles, Upload, Wand, X } from "lucide-react";
import { toast } from "sonner";
import { createClient, getCachedProfileCredits, setCachedProfileCredits } from "@/lib/supabase/client";
import { downloadImage, fileToBase64, generateDownloadFilename, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { FeatureTabs } from "@/components/FeatureTabs";

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4分/次", badge: "最新", icon: "/model-icons/openai.svg" },
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "4K · 2分/次", badge: "新", icon: "/model-icons/doubao.png" },
];

const DEFAULT_POSE_PROMPT = `保持图1中的场景、人物身份、脸部特征、发型、服装、服装材质、颜色、图案、光影和摄影质感一致，生成一张四宫格图片。四个格子分别展示同一人物的四个不同姿势：正面自然站立、侧身回头、手扶头发、轻微行走转身。要求真实商业摄影质感，人物比例一致，服装褶皱自然，背景透视一致。负面约束：不要换脸，不要换衣服，不要改变场景，不要生成多余人物，不要扭曲手指和肢体，不要塑料皮肤，不要AI渲染感。`;

export default function PosePage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [mainImage, setMainImage] = useState<string>("");
  const [prompt, setPrompt] = useState(DEFAULT_POSE_PROMPT);
  const [isDragging, setIsDragging] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const imageSizes = getSupportedImageSizes(aiModel, "3:4");
  const cost = getCreditCost(aiModel, imageSize, "3:4");

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
    const nextSizes = getSupportedImageSizes(aiModel, "3:4");
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, imageSize]);

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片不能超过 10MB");
      return;
    }
    const base64 = await fileToBase64(file);
    setMainImage(base64);
    setResultUrls([]);
    setError("");

    toast.info("正在上传主图...");
    try {
      const result = await uploadImage(file);
      setMainImage(result.url);
    } catch {
      // 保留 base64 作为降级
    }
    toast.success("主图已选择");
  }

  async function optimizePrompt() {
    if (!mainImage) {
      toast.error("请先上传主图");
      return;
    }
    setIsOptimizing(true);
    try {
      const res = await fetch("/api/pose/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ main_image_url: mainImage, prompt }),
      });
      const data = await res.json();
      if (data.prompt) {
        setPrompt(data.prompt);
        toast.success("视觉 AI 已优化提示词");
      } else {
        toast.error("视觉优化失败，已保留当前提示词");
      }
    } catch {
      toast.error("视觉优化失败");
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
    if (!mainImage) {
      toast.error("请先上传主图");
      return;
    }
    if (credits !== null && credits < cost) {
      toast.error(`积分不足，需要 ${cost}，余额 ${credits}`);
      return;
    }

    setIsGenerating(true);
    setProgress(10);
    setError("");
    setResultUrls([]);

    try {
      const res = await fetch("/api/pose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          main_image_url: mainImage,
          ai_model: aiModel,
          image_size: imageSize,
          prompt,
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

      let attempts = 0;
      while (attempts < 120) {
        await new Promise((r) => setTimeout(r, 2000));
        attempts++;
        const poll = await fetch(`/api/pose?generation_id=${data.generation_id}`);
        if (!poll.ok) continue;
        const state = await poll.json();
        if (state.status === "processing_tryon") {
          setProgress(Math.min(25 + attempts * 1.5, 90));
        } else if (state.status === "completed") {
          setProgress(100);
          setResultUrls(state.result_urls || []);
          toast.success("姿势裂变完成");
          setIsGenerating(false);
          return;
        } else if (state.status === "failed") {
          throw new Error(state.error || "AI 生成失败");
        }
      }
      throw new Error("生成超时");
    } catch (err: any) {
      setError(err.message || "生成失败");
      toast.error(err.message || "生成失败");
      setIsGenerating(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-56px)] lg:h-[calc(100vh-56px)] flex flex-col lg:flex-row bg-gray-50 lg:bg-white">
      <FeatureTabs active="pose" />
      <div className="w-full lg:w-[460px] border-b lg:border-b-0 lg:border-r bg-white flex flex-col overflow-visible lg:overflow-hidden">
        <div className="flex-1 overflow-visible lg:overflow-y-auto p-4 sm:p-5 space-y-6">
          <section
            onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className={`relative rounded-xl transition-all ${isDragging ? "ring-2 ring-purple-400 ring-offset-2" : ""}`}
          >
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Upload className="w-4 h-4 text-purple-500" /> 上传主图
            </h3>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            {mainImage ? (
              <div className="relative group">
                <img src={mainImage} className="w-full aspect-[3/4] object-cover rounded-xl border bg-gray-50" />
                <button onClick={() => setMainImage("")}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 hover:border-purple-300 rounded-xl p-8 text-center transition-all">
                <Upload className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                <span className="text-xs text-gray-500">点击上传或拖拽主图</span>
              </button>
            )}
          </section>

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
                    <span className="text-[11px] font-bold truncate min-w-0">{opt.label}</span>
                    {opt.badge && <span className="text-[9px] px-1 rounded bg-purple-100 text-purple-600 flex-shrink-0">{opt.badge}</span>}
                  </div>
                  <p className="text-[10px] text-gray-400 pl-5 leading-tight truncate">{opt.desc} · 当前{getCreditCost(opt.value, imageSize, "3:4")}分</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">比例</h3>
            <div className="px-3 py-2 rounded-lg border border-purple-200 bg-purple-50 text-xs font-medium text-purple-600">固定 3:4 竖版</div>
          </section>

          {imageSizes.length > 1 && (
            <section>
              <h3 className="font-bold text-sm mb-3">分辨率</h3>
              <div className="flex gap-2">
                {imageSizes.map((s) => (
                  <button key={s} onClick={() => setImageSize(s)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                      imageSize === s ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"
                    }`}>{s} · {getCreditCost(aiModel, s, "3:4")}积分</button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="font-bold text-sm mb-3">提示词</h3>
            <div className="relative">
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                className="w-full h-40 px-3 py-2 pr-10 rounded-lg border text-xs focus:ring-2 focus:ring-purple-200 outline-none resize-none leading-relaxed" />
              <button onClick={optimizePrompt} disabled={isOptimizing || !mainImage}
                className="absolute right-2 top-2 p-1.5 rounded-md bg-purple-50 text-purple-500 hover:bg-purple-100 disabled:opacity-30"
                title="视觉 AI 优化提示词">
                {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button onClick={() => setPrompt(DEFAULT_POSE_PROMPT)}
              className="mt-2 px-3 py-1.5 rounded-lg border text-xs text-gray-500 hover:text-purple-600 hover:border-purple-300">
              恢复默认模板
            </button>
          </section>
        </div>

        <div className="border-t p-3 sm:p-4 space-y-2 bg-white">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">四宫格 · 单张结果</span>
            {isAuthenticated
              ? <span className="font-bold text-amber-600">消耗 {cost} · 余额 {credits ?? "-"}</span>
              : <span className="text-gray-400">登录后查看积分</span>
            }
          </div>
          <button onClick={generate} disabled={isGenerating || !mainImage}
            className="w-full py-3 rounded-xl gradient-brand text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 shadow-lg shadow-purple-200">
            <Sparkles className="w-4 h-4" />
            {!isAuthenticated ? "登录后生成" : isGenerating ? "生成中..." : "生成四宫格"}
          </button>
        </div>
      </div>

      <div className="min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="min-h-[360px] lg:h-full flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 px-4">
            <div className="text-center">
              <div className="w-28 h-28 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center shadow-lg shadow-purple-100">
                <PersonStanding className="w-12 h-12 text-purple-400" />
              </div>
              <p className="text-gray-500 text-base font-medium mb-1">开始姿势裂变</p>
              <p className="text-gray-400 text-sm">上传主图，生成同人物同场景的四个姿势四宫格</p>
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="min-h-[360px] lg:h-full p-4 sm:p-8 flex items-center justify-center" style={{ background: "#f0f0f5" }}>
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
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden"
                  style={{
                    background: "rgba(255, 255, 255, 0.25)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    border: "1px solid rgba(255, 255, 255, 0.4)",
                    boxShadow: "0 8px 32px rgba(168, 85, 247, 0.15), inset 0 1px 0 rgba(255,255,255,0.5)",
                  }}>
                  <div className="aspect-[3/4] relative overflow-hidden"
                    style={{ background: "linear-gradient(135deg, rgba(232,121,249,0.15), rgba(167,139,250,0.2), rgba(244,114,182,0.15))" }}>
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
                    <div style={{
                      position: "absolute", inset: 0, opacity: 0.03,
                      backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                    }} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="relative w-16 h-16 mb-4">
                        <svg className="w-full h-full" viewBox="0 0 100 100"
                          style={{ animation: "spin 5s linear infinite", transformOrigin: "center", filter: "drop-shadow(0 0 8px rgba(232,121,249,0.4))" }}>
                          <defs>
                            <linearGradient id={`pose-g${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#e879f9">
                                <animate attributeName="stop-color" values="#e879f9;#a78bfa;#f472b6;#e879f9" dur="4s" repeatCount="indefinite" />
                              </stop>
                              <stop offset="100%" stopColor="#a78bfa">
                                <animate attributeName="stop-color" values="#a78bfa;#f472b6;#e879f9;#a78bfa" dur="4s" repeatCount="indefinite" />
                              </stop>
                            </linearGradient>
                          </defs>
                          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                          <circle cx="50" cy="50" r="42" fill="none" stroke={`url(#pose-g${i})`} strokeWidth="4"
                            strokeLinecap="round" strokeDasharray="180 264" />
                          <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-black" style={{
                            background: "linear-gradient(135deg, #e879f9, #a78bfa, #f472b6)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
                          }}>{Math.round(progress)}</span>
                          <span className="text-xs font-bold ml-0.5" style={{ color: "rgba(168,85,247,0.5)" }}>%</span>
                        </div>
                      </div>
                      <p className="text-xs font-medium" style={{ color: "rgba(168,85,247,0.7)" }}>
                        {progress < 20 ? "准备中..." : progress < 90 ? "AI 生成中..." : "即将完成..."}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {resultUrls.length > 0 && (
          <div className="min-h-[360px] lg:h-full p-4 sm:p-6 flex items-center justify-center bg-gray-50 animate-fade-in">
            {resultUrls.map((url, i) => (
              <div key={url} className="relative group rounded-2xl overflow-hidden shadow-2xl bg-white cursor-zoom-in"
                onClick={() => setLightboxSrc(url)}>
                <img src={url} className="block max-h-[calc(100dvh-180px)] max-w-[calc(100vw-2rem)] lg:max-h-[calc(100vh-180px)] lg:max-w-[calc(100vw-540px)] w-auto h-auto object-contain" />
                <button onClick={(e) => { e.stopPropagation(); downloadImage(url, generateDownloadFilename("pose", i, "jpg")); }}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="min-h-[360px] lg:h-full flex items-center justify-center bg-gray-50 px-4">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center"><X className="w-8 h-8 text-red-400" /></div>
              <p className="text-red-500 font-medium mb-1">生成失败</p>
              <p className="text-sm text-gray-400 mb-4 max-w-sm">{error}</p>
              <button onClick={() => setError("")} className="px-5 py-2 rounded-full border text-sm font-medium hover:bg-gray-50">重试</button>
            </div>
          </div>
        )}
      </div>

      {lightboxSrc && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
          <button onClick={() => setLightboxSrc(null)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
