"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Download, Loader2, Sparkles, Upload, UserRound, Wand, X } from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { createClient, getCachedProfileCredits } from "@/lib/supabase/client";
import { downloadImage, fileToBase64 } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";

type Gender = "female" | "male";

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4分/次", badge: "最新", icon: "/model-icons/openai.svg" },
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "4K · 2分/次", badge: "新", icon: "/model-icons/doubao.png" },
];

const ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: "3:4", label: "3:4 竖版" },
  { value: "1:1", label: "1:1 头像" },
  { value: "4:3", label: "4:3 横版" },
];

const HAIR_STYLES = {
  female: [
    { value: "自然黑长直发，偏分，发丝顺滑垂落", label: "黑长直", image: "/exclusive-model/female-black-long-side.png" },
    { value: "齐肩短波波头，空气刘海，发尾内扣", label: "短波波", image: "/exclusive-model/female-short-bob.png" },
    { value: "高丸子头，干净利落，露出脸部轮廓", label: "丸子头", image: "/exclusive-model/female-high-bun.png" },
    { value: "侧边低马尾，柔和自然，发束垂在肩侧", label: "侧马尾", image: "/exclusive-model/female-side-ponytail.png" },
    { value: "长卷发，大波浪，发丝蓬松有层次", label: "大波浪", image: "/exclusive-model/female-black-wavy.png" },
  ],
  male: [
    { value: "短寸头，清爽硬朗，发际线自然", label: "寸头", image: "/exclusive-model/male-buzz-cut.png" },
    { value: "短碎发，顶部自然蓬松，干净少年感", label: "短碎发", image: "/exclusive-model/male-short-textured.png" },
    { value: "蓬松微卷短发，前额自然碎刘海", label: "微卷发", image: "/exclusive-model/male-wavy-volume.png" },
  ],
};

const HAIR_COLORS = [
  { value: "自然黑色", label: "黑色", image: "/exclusive-model/female-black-long-side.png" },
  { value: "深棕色", label: "深棕", image: "/exclusive-model/female-brown-straight.png" },
  { value: "冷灰色", label: "灰色", image: "/exclusive-model/female-gray-long.png" },
  { value: "铂金白色", label: "白金", image: "/exclusive-model/female-platinum-long.png" },
  { value: "柔粉色", label: "粉色", image: "/exclusive-model/female-pink-long.png" },
];

export default function ModelPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hairInputRef = useRef<HTMLInputElement>(null);
  const hairColorInputRef = useRef<HTMLInputElement>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [gender, setGender] = useState<Gender>("female");
  const [hairStyle, setHairStyle] = useState<string | null>(null);
  const [hairColor, setHairColor] = useState<string | null>(null);
  const [hairReferenceUrl, setHairReferenceUrl] = useState<string | null>(null);
  const [hairColorReferenceUrl, setHairColorReferenceUrl] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const cost = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = cost * genCount;
  const defaultPrompt = useMemo(
    () => buildDefaultPrompt(referenceUrls.length || 1, gender, hairStyle, hairColor, !!hairReferenceUrl, !!hairColorReferenceUrl),
    [referenceUrls.length, gender, hairStyle, hairColor, hairReferenceUrl, hairColorReferenceUrl]
  );

  useEffect(() => {
    if (!promptTouched) {
      setPrompt(defaultPrompt);
    }
  }, [defaultPrompt, promptTouched]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setIsAuthenticated(true);
        getCachedProfileCredits(data.user.id).then(setCredits);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
        getCachedProfileCredits(session.user.id).then(setCredits);
      } else {
        setIsAuthenticated(false);
        setCredits(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  async function addFiles(files?: FileList | File[]) {
    if (!files) return;
    const incoming = Array.from(files).slice(0, 3 - referenceUrls.length);
    if (!incoming.length) {
      toast.error("最多上传 3 张参考图");
      return;
    }
    const next: string[] = [];
    for (const file of incoming) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} 超过 10MB`);
        continue;
      }
      next.push(await fileToBase64(file));
    }
    if (next.length) {
      setReferenceUrls((prev) => [...prev, ...next].slice(0, 3));
      setResultUrls([]);
      setError("");
      toast.success(`已添加 ${next.length} 张参考图`);
    }
  }

  function selectGender(nextGender: Gender) {
    setGender(nextGender);
    setHairStyle(null);
  }

  async function uploadHairReference(files?: FileList | File[]) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(`${file.name} 超过 10MB`);
      return;
    }
    setHairReferenceUrl(await fileToBase64(file));
    setHairStyle(null);
    setResultUrls([]);
    setError("");
    toast.success("已上传发型参考图");
  }

  async function uploadHairColorReference(files?: FileList | File[]) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(`${file.name} 超过 10MB`);
      return;
    }
    setHairColorReferenceUrl(await fileToBase64(file));
    setHairColor(null);
    setResultUrls([]);
    setError("");
    toast.success("已上传发色参考图");
  }

  async function optimizePrompt() {
    if (!referenceUrls.length) {
      toast.error("请先上传参考图");
      return;
    }
    setIsOptimizing(true);
    try {
      const res = await fetch("/api/model/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference_urls: referenceUrls, hair_reference_url: hairReferenceUrl, hair_color_reference_url: hairColorReferenceUrl, gender, hair_style: hairStyle, hair_color: hairColor, prompt }),
      });
      const data = await res.json();
      if (data.prompt) {
        setPromptTouched(true);
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
    if (!referenceUrls.length) {
      toast.error("请上传至少 1 张参考图");
      return;
    }
    if (credits !== null && credits < totalCost) {
      toast.error(`积分不足，需要 ${totalCost}，余额 ${credits}`);
      return;
    }

    setIsGenerating(true);
    setProgress(10);
    setError("");
    setResultUrls([]);

    try {
      const res = await fetch("/api/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference_urls: referenceUrls,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          gen_count: genCount,
          hair_reference_url: hairReferenceUrl,
          hair_color_reference_url: hairColorReferenceUrl,
          prompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) setCredits(data.balance ?? 0);
        throw new Error(data.error || "生成失败");
      }
      if (data.credits_remaining !== undefined) setCredits(data.credits_remaining);
      setProgress(25);

      let attempts = 0;
      while (attempts < 120) {
        await new Promise((r) => setTimeout(r, 2000));
        attempts++;
        const poll = await fetch(`/api/model?generation_id=${data.generation_id}`);
        if (!poll.ok) continue;
        const state = await poll.json();
        if (state.status === "processing_tryon") {
          setProgress(Math.min(25 + attempts * 1.5, 90));
        } else if (state.status === "completed") {
          setProgress(100);
          setResultUrls(state.result_urls || []);
          setIsGenerating(false);
          toast.success("专属模特生成完成");
          return;
        } else if (state.status === "failed") {
          throw new Error(state.error || "AI 生成失败");
        }
      }
      throw new Error("生成超时");
    } catch (err: any) {
      setError(err.message || "生成失败");
      setIsGenerating(false);
      toast.error(err.message || "生成失败");
    }
  }

  return (
    <div className="h-[calc(100vh-56px)] flex">
      <FeatureTabs active="model" />
      <div className="w-[460px] border-r bg-white flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <section>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Upload className="w-4 h-4 text-purple-500" /> 上传参考图
            </h3>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files || undefined)} />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 hover:border-purple-300 rounded-xl p-5 text-center transition-all">
              <Upload className="w-5 h-5 mx-auto mb-1 text-gray-300" />
              <span className="text-xs text-gray-500">上传 1-3 张人物参考图</span>
            </button>
            {referenceUrls.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {referenceUrls.map((url, index) => (
                  <div key={index} className="relative group">
                    <img src={url} className="w-full aspect-[3/4] object-cover rounded-lg border bg-gray-50" />
                    <span className="absolute left-1 top-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px]">图{index + 1}</span>
                    <button onClick={() => setReferenceUrls((prev) => prev.filter((_, i) => i !== index))}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">性别</h3>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-50 p-1">
              <button onClick={() => selectGender("female")}
                className={`py-2 rounded-lg text-xs font-medium ${gender === "female" ? "bg-white text-purple-600 shadow-sm" : "text-gray-500"}`}>
                女
              </button>
              <button onClick={() => selectGender("male")}
                className={`py-2 rounded-lg text-xs font-medium ${gender === "male" ? "bg-white text-purple-600 shadow-sm" : "text-gray-500"}`}>
                男
              </button>
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">参考发型</h3>
            <input
              ref={hairInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => uploadHairReference(e.target.files || undefined)}
            />
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => { setHairStyle(null); setHairReferenceUrl(null); }}
                className={`rounded-lg border p-2 text-center transition-all aspect-[3/4] flex flex-col items-center justify-center ${
                  !hairStyle && !hairReferenceUrl ? "border-purple-500 bg-purple-50 text-purple-600 ring-1 ring-purple-200" : "border-gray-100 text-gray-500 hover:border-gray-300"
                }`}
              >
                <UserRound className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-medium">不选默认</span>
              </button>
              {HAIR_STYLES[gender].map((item) => (
                <button key={item.value} onClick={() => { setHairStyle(item.value); setHairReferenceUrl(null); }}
                  className={`rounded-lg overflow-hidden border text-left transition-all ${
                    hairStyle === item.value && !hairReferenceUrl ? "border-purple-500 ring-1 ring-purple-200" : "border-gray-100 hover:border-gray-300"
                  }`}>
                  <img src={item.image} className="w-full aspect-[3/4] object-cover bg-gray-50" />
                  <div className="px-1 py-1 text-[10px] text-center font-medium">{item.label}</div>
                </button>
              ))}
              <button
                onClick={() => hairInputRef.current?.click()}
                className={`relative rounded-lg border-2 border-dashed p-2 text-center transition-all aspect-[3/4] flex flex-col items-center justify-center overflow-hidden ${
                  hairReferenceUrl ? "border-purple-500 text-purple-600 ring-1 ring-purple-200" : "border-gray-200 text-gray-400 hover:border-purple-300 hover:text-purple-500"
                }`}
              >
                {hairReferenceUrl ? (
                  <>
                    <img src={hairReferenceUrl} className="absolute inset-0 w-full h-full object-cover" alt="上传发型参考" />
                    <span className="absolute bottom-0 left-0 right-0 py-1 bg-white/90 text-[10px] font-medium">上传发型</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-medium">点击上传</span>
                  </>
                )}
              </button>
            </div>
            {hairReferenceUrl && (
              <button
                onClick={() => setHairReferenceUrl(null)}
                className="mt-2 text-xs text-gray-400 hover:text-red-500"
              >
                移除上传的发型参考
              </button>
            )}
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">参考发色</h3>
            <input
              ref={hairColorInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => uploadHairColorReference(e.target.files || undefined)}
            />
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => { setHairColor(null); setHairColorReferenceUrl(null); }}
                className={`rounded-lg border p-2 text-center transition-all aspect-[3/4] flex flex-col items-center justify-center ${
                  !hairColor && !hairColorReferenceUrl ? "border-purple-500 bg-purple-50 text-purple-600 ring-1 ring-purple-200" : "border-gray-100 text-gray-500 hover:border-gray-300"
                }`}
              >
                <UserRound className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-medium">不选默认</span>
              </button>
              {HAIR_COLORS.map((item) => (
                <button key={item.value} onClick={() => { setHairColor(item.value); setHairColorReferenceUrl(null); }}
                  className={`rounded-lg overflow-hidden border text-left transition-all ${
                    hairColor === item.value && !hairColorReferenceUrl ? "border-purple-500 ring-1 ring-purple-200" : "border-gray-100 hover:border-gray-300"
                  }`}>
                  <img src={item.image} className="w-full aspect-[3/4] object-cover bg-gray-50" />
                  <div className="px-1 py-1 text-[10px] text-center font-medium">{item.label}</div>
                </button>
              ))}
              <button
                onClick={() => hairColorInputRef.current?.click()}
                className={`relative rounded-lg border-2 border-dashed p-2 text-center transition-all aspect-[3/4] flex flex-col items-center justify-center overflow-hidden ${
                  hairColorReferenceUrl ? "border-purple-500 text-purple-600 ring-1 ring-purple-200" : "border-gray-200 text-gray-400 hover:border-purple-300 hover:text-purple-500"
                }`}
              >
                {hairColorReferenceUrl ? (
                  <>
                    <img src={hairColorReferenceUrl} className="absolute inset-0 w-full h-full object-cover" alt="上传发色参考" />
                    <span className="absolute bottom-0 left-0 right-0 py-1 bg-white/90 text-[10px] font-medium">上传发色</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-medium">点击上传</span>
                  </>
                )}
              </button>
            </div>
            {hairColorReferenceUrl && (
              <button
                onClick={() => setHairColorReferenceUrl(null)}
                className="mt-2 text-xs text-gray-400 hover:text-red-500"
              >
                移除上传的发色参考
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
                  <p className="text-[10px] text-gray-400 pl-5 leading-tight truncate">{opt.desc} · 当前{getCreditCost(opt.value, imageSize, aspectRatio)}分</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">比例</h3>
            <div className="flex gap-2">
              {ASPECTS.map((a) => (
                <button key={a.value} onClick={() => setAspectRatio(a.value)}
                  className={`flex-1 px-2 py-2 rounded-lg border text-[11px] font-medium transition-all ${
                    aspectRatio === a.value ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"
                  }`}>{a.label}</button>
              ))}
            </div>
          </section>

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

          <section>
            <h3 className="font-bold text-sm mb-3">提示词</h3>
            <div className="relative">
              <textarea value={prompt} onChange={(e) => { setPromptTouched(true); setPrompt(e.target.value); }}
                className="w-full h-44 px-3 py-2 pr-10 rounded-lg border text-xs focus:ring-2 focus:ring-purple-200 outline-none resize-none leading-relaxed" />
              <button onClick={optimizePrompt} disabled={isOptimizing || !referenceUrls.length}
                className="absolute right-2 top-2 p-1.5 rounded-md bg-purple-50 text-purple-500 hover:bg-purple-100 disabled:opacity-30"
                title="视觉 AI 优化提示词">
                {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button onClick={() => { setPromptTouched(false); setPrompt(defaultPrompt); }}
              className="mt-2 px-3 py-1.5 rounded-lg border text-xs text-gray-500 hover:text-purple-600 hover:border-purple-300">
              恢复默认模板
            </button>
          </section>

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

        <div className="border-t p-4 space-y-2 bg-white">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{referenceUrls.length} 张参考图 · {cost} × {genCount}</span>
            {isAuthenticated
              ? <span className="font-bold text-amber-600">消耗 {totalCost} · 余额 {credits ?? "-"}</span>
              : <span className="text-gray-400">登录后查看积分</span>
            }
          </div>
          <button onClick={generate} disabled={isGenerating || !referenceUrls.length}
            className="w-full py-3 rounded-xl gradient-brand text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 shadow-lg shadow-purple-200">
            <Sparkles className="w-4 h-4" />
            {!isAuthenticated ? "登录后生成" : isGenerating ? "生成中..." : `生成 ${genCount} 张`}
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="h-full flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50">
            <div className="text-center">
              <div className="w-28 h-28 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center shadow-lg shadow-purple-100">
                <Sparkles className="w-12 h-12 text-purple-400" />
              </div>
              <p className="text-gray-500 text-base font-medium mb-1">创建专属模特</p>
              <p className="text-gray-400 text-sm">上传 1-3 张参考图，选择发型和发色后生成统一人物形象</p>
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="h-full p-8 flex items-center justify-center" style={{ background: "#f0f0f5" }}>
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

            <div className={`${genCount === 1 ? "max-w-sm" : "grid grid-cols-2 gap-5 max-w-lg"} w-full relative z-10`}>
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
                            <linearGradient id={`model-g${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#e879f9">
                                <animate attributeName="stop-color" values="#e879f9;#a78bfa;#f472b6;#e879f9" dur="4s" repeatCount="indefinite" />
                              </stop>
                              <stop offset="100%" stopColor="#a78bfa">
                                <animate attributeName="stop-color" values="#a78bfa;#f472b6;#e879f9;#a78bfa" dur="4s" repeatCount="indefinite" />
                              </stop>
                            </linearGradient>
                          </defs>
                          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                          <circle cx="50" cy="50" r="42" fill="none" stroke={`url(#model-g${i})`} strokeWidth="4"
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
          <div className="h-full p-6 flex items-center justify-center bg-gray-50 animate-fade-in">
            {resultUrls.map((url, i) => (
              <div key={url} className="relative group rounded-2xl overflow-hidden shadow-2xl bg-white cursor-zoom-in"
                onClick={() => setLightboxSrc(url)}>
                <img src={url} className="block max-h-[calc(100vh-180px)] max-w-[calc(100vw-560px)] w-auto h-auto object-contain" />
                <button onClick={(e) => { e.stopPropagation(); downloadImage(url, `exclusive-model-${i + 1}.jpg`); }}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="h-full flex items-center justify-center bg-gray-50">
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

function buildDefaultPrompt(refCount: number, gender: Gender, hairStyle: string | null, hairColor: string | null, hasHairReference: boolean, hasHairColorReference: boolean) {
  const refs = Array.from({ length: refCount }, (_, i) => `图${i + 1}`).join("、");
  const genderText = gender === "male" ? "男性" : "女性";
  const hairImageIndex = refCount + 1;
  const hairColorImageIndex = refCount + (hasHairReference ? 2 : 1);
  const hairStyleText = hasHairReference
    ? `发型参考图${hairImageIndex}，还原图${hairImageIndex}的发型轮廓、长度、刘海/分缝、蓬松度和发丝走向`
    : hairStyle
      ? `发型使用：${hairStyle}`
      : "发型不指定，由模型根据人物脸型自然适配";
  const hairColorText = hasHairColorReference
    ? `发色参考图${hairColorImageIndex}，只提取头发颜色、明暗层次和染发质感`
    : hairColor
      ? `发色使用：${hairColor}`
      : "发色不指定，保持自然真实";
  const extraRoles = [
    hasHairReference ? `图${hairImageIndex} 是发型参考图，只参考发型，不参考身份` : "",
    hasHairColorReference ? `图${hairColorImageIndex} 是发色参考图，只参考发色，不参考身份` : "",
  ].filter(Boolean).join("；");
  const imageRoleText = extraRoles
    ? `图像角色：${refs} 是同一个专属模特的人物参考图，用于提取共同的人物身份、脸型、五官比例、肤色、气质和真实面部特征；${extraRoles}。`
    : `图像角色：${refs} 是同一个专属模特的参考图，用于提取共同的人物身份、脸型、五官比例、肤色、气质和真实面部特征。`;

  return `${imageRoleText}任务：融合 ${refs} 的人物特征，生成一张真实摄影质感的${genderText}专属模特半身头像/模特卡照片。${hairStyleText}；${hairColorText}。保持人物身份一致，白色基础上衣，干净浅灰棚拍背景，柔和商业摄影布光，皮肤保留自然纹理和轻微瑕疵，发丝细节真实。负面约束：不要生成多个人，不要换成陌生脸，不要把发型/发色参考图当成人脸身份，不要过度磨皮，不要塑料皮肤，不要蜡像感，不要卡通感，不要畸形五官，不要文字水印。`;
}
