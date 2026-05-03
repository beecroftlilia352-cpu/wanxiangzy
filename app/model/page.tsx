"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, ChevronRight, Eye, FolderOpen, Loader2, Sparkles, Upload, UserRound, Wand, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { RepairPromptPanel } from "@/components/RepairPromptPanel";
import { ModelPromptPreview } from "@/components/ModelPromptPreview";
import { ClientPortal } from "@/components/ClientPortal";
import { StyleChoiceGrid } from "@/components/StyleChoiceGrid";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { createClient, getCachedProfileCredits, setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { takeApplyPayload } from "@/lib/history-apply";
import { applyRepairPrompt } from "@/lib/generation-repair";
import {
  MODEL_AGE_TEXTURE_RULE,
  MODEL_FACE_SHAPE_RULE,
  MODEL_FACE_STYLE_RULE,
  MODEL_FEATURE_IDENTITY_RULE,
  MODEL_FUSION_RULE,
  MODEL_MAKEUP_RULE,
  MODEL_SKIN_TONE_RULE,
} from "@/lib/model-prompt";
import {
  DEFAULT_MODEL_SHOOT_STYLE,
  MODEL_SHOOT_STYLES,
  applyModelShootStylePrompt,
  buildModelShootStylePrompt,
  normalizeModelShootStyle,
  type ModelShootStyle,
} from "@/lib/module-style-presets";
import { MODEL_UPLOAD_RULE, type ModelRuleDemo } from "@/lib/model-upload-rules";

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
const MODEL_QUALITY =
  "photorealistic, 8K ultra-detailed, commercial portrait quality, cinematic color grade, sharp facial details, sharp hair details, raw photo quality";

export default function ModelPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hairInputRef = useRef<HTMLInputElement>(null);
  const hairColorInputRef = useRef<HTMLInputElement>(null);
  const rulesButtonRef = useRef<HTMLButtonElement>(null);
  const rulesHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [gender, setGender] = useState<Gender>("female");
  const [modelStyle, setModelStyle] = useState<ModelShootStyle>(DEFAULT_MODEL_SHOOT_STYLE);
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
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showModelRules, setShowModelRules] = useState(false);
  const [rulesPopoverStyle, setRulesPopoverStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const cost = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = cost * genCount;
  const defaultPrompt = useMemo(
    () => buildDefaultPrompt(referenceUrls.length || 1, gender, hairStyle, hairColor, !!hairReferenceUrl, !!hairColorReferenceUrl, modelStyle),
    [referenceUrls.length, gender, hairStyle, hairColor, hairReferenceUrl, hairColorReferenceUrl, modelStyle]
  );

  const cancelRulesHide = () => {
    if (rulesHideTimerRef.current) {
      clearTimeout(rulesHideTimerRef.current);
      rulesHideTimerRef.current = null;
    }
  };

  const openRulesPopover = () => {
    cancelRulesHide();
    const rect = rulesButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(760, window.innerWidth - 32);
    const top = Math.max(16, Math.min(rect.top - 10, window.innerHeight - 360));
    const left = Math.max(16, Math.min(rect.right + 12, window.innerWidth - width - 16));
    setRulesPopoverStyle({
      top,
      left,
      maxHeight: Math.max(320, window.innerHeight - top - 16),
    });
    setShowModelRules(true);
  };

  const scheduleRulesHide = () => {
    cancelRulesHide();
    rulesHideTimerRef.current = setTimeout(() => {
      setShowModelRules(false);
      setRulesPopoverStyle(null);
    }, 120);
  };

  useEffect(() => {
    if (!promptTouched) {
      setPrompt(defaultPrompt);
    }
  }, [defaultPrompt, promptTouched]);

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
    return () => cancelRulesHide();
  }, []);

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  useEffect(() => {
    const payload = takeApplyPayload("model");
    if (!payload) return;

    setReferenceUrls(payload.referenceUrls);
    setHairReferenceUrl(payload.hairReferenceUrl || null);
    setHairColorReferenceUrl(payload.hairColorReferenceUrl || null);
    setGender(payload.gender || "female");
    setModelStyle(normalizeModelShootStyle(payload.modelStyle));
    setHairStyle(payload.hairStyle || null);
    setHairColor(payload.hairColor || null);
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setGenCount(payload.genCount);
    setPromptTouched(true);
    setPrompt(payload.prompt);
    setResultUrls([]);
    setError("");
    toast.success("已套用历史参数");
  }, []);

  async function addFiles(files?: FileList | File[]) {
    if (!files) return;
    const incoming = Array.from(files).slice(0, 3 - referenceUrls.length);
    if (!incoming.length) {
      toast.error("最多上传 3 张参考图");
      return;
    }
    toast.info(`正在上传 ${incoming.length} 张参考图...`);
    const next: string[] = [];
    for (const file of incoming) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} 超过 ${MAX_FILE_SIZE_MB}MB`);
        continue;
      }
      try {
        const result = await uploadImage(file);
        next.push(result.url);
      } catch {
        toast.error(`${file.name} 上传失败，请重试`);
      }
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

  function selectModelStyle(nextStyle: ModelShootStyle) {
    setModelStyle(nextStyle);
    if (promptTouched) {
      setPrompt((prev) => applyModelShootStylePrompt(prev, nextStyle));
    }
  }

  async function uploadHairReference(files?: FileList | File[]) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`${file.name} 超过 ${MAX_FILE_SIZE_MB}MB`);
      return;
    }
    setHairStyle(null);
    setResultUrls([]);
    setError("");

    toast.info("正在上传发型参考图...");
    try {
      const result = await uploadImage(file);
      setHairReferenceUrl(result.url);
      toast.success("已上传发型参考图");
    } catch {
      setHairReferenceUrl(null);
      toast.error("发型参考图上传失败，请重试");
    }
  }

  async function uploadHairColorReference(files?: FileList | File[]) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`${file.name} 超过 ${MAX_FILE_SIZE_MB}MB`);
      return;
    }
    setHairColor(null);
    setResultUrls([]);
    setError("");

    toast.info("正在上传发色参考图...");
    try {
      const result = await uploadImage(file);
      setHairColorReferenceUrl(result.url);
      toast.success("已上传发色参考图");
    } catch {
      setHairColorReferenceUrl(null);
      toast.error("发色参考图上传失败，请重试");
    }
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
        body: JSON.stringify({ reference_urls: referenceUrls, hair_reference_url: hairReferenceUrl, hair_color_reference_url: hairColorReferenceUrl, gender, hair_style: hairStyle, hair_color: hairColor, model_style: modelStyle, prompt }),
      });
      const data = await res.json();
      if (data.prompt) {
        setPromptTouched(true);
        setPrompt(data.prompt);
        toast.success("视觉分析已优化提示词");
      } else {
        toast.error("视觉优化失败，已保留当前提示词");
      }
    } catch {
      toast.error("视觉优化失败");
    } finally {
      setIsOptimizing(false);
    }
  }

  async function generate(promptForRun?: string) {
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
          gender,
          model_style: modelStyle,
          hair_style: hairStyle,
          hair_color: hairColor,
          prompt: typeof promptForRun === "string" ? promptForRun : prompt,
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
          throw new Error(state.error || "生成失败");
        }
      }
      throw new Error("生成超时");
    } catch (err: any) {
      setError(err.message || "生成失败");
      setIsGenerating(false);
      toast.error(err.message || "生成失败");
    }
  }

  function handleRepairGenerate(repairValue: string) {
    const repairedPrompt = applyRepairPrompt(prompt, "model", repairValue);
    setPromptTouched(true);
    setPrompt(repairedPrompt);
    toast.info("已加入修复指令，正在重新生成...");
    generate(repairedPrompt);
  }

  function applyRuleDemo(demo: ModelRuleDemo) {
    setReferenceUrls(demo.imageUrls.slice(0, 3));
    setPromptTouched(false);
    setResultUrls([]);
    setError("");
    setShowModelRules(false);
    setRulesPopoverStyle(null);
    toast.success(`已套用${demo.title}`);
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="model" />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-4 sm:p-5 space-y-6">
          <ModuleHeader
            title="专属模特"
            tooltip="上传 1-3 张人物参考图，融合脸型、五官比例、肤色、妆感和气质，生成稳定可复用的品牌模特形象。"
          />
          <section>
            <div className="studio-upload-header">
              <h3 className="studio-upload-title">
                <Upload className="w-4 h-4 text-purple-500" /> 上传参考图
              </h3>
              <button
                ref={rulesButtonRef}
                type="button"
                onMouseEnter={openRulesPopover}
                onMouseLeave={scheduleRulesHide}
                onFocus={openRulesPopover}
                onBlur={scheduleRulesHide}
                aria-expanded={showModelRules}
                className="studio-upload-rule-button"
              >
                图片规则 <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files || undefined)} />
            <div className="flex min-h-44 flex-col rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-center">
              {referenceUrls.length > 0 ? (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3 text-left">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">已上传 {referenceUrls.length}/3 张参考图</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">图片已进入融合参考，可继续补充或移除单张</p>
                    </div>
                    {referenceUrls.length < 3 && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="shrink-0 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-600 shadow-sm hover:border-violet-300 hover:bg-violet-50"
                      >
                        继续上传
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {referenceUrls.map((url, index) => (
                      <div key={index} className="group relative overflow-hidden rounded-xl border border-white bg-white shadow-sm ring-1 ring-slate-100">
                        <img src={url} alt={`专属模特参考图${index + 1}`} className="h-[150px] w-full object-cover" />
                        <span className="absolute left-2 top-2 rounded-full border border-white/70 bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow-sm backdrop-blur">图{index + 1}</span>
                        <button
                          type="button"
                          onClick={() => setReferenceUrls((prev) => prev.filter((_, i) => i !== index))}
                          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/70 text-white opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100"
                          aria-label={`移除图${index + 1}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-violet-700">
                      <Upload className="h-3.5 w-3.5" /> 从本地上传
                    </button>
                    <button type="button" onClick={() => toast.info("作品库选择即将接入")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300">
                      <FolderOpen className="h-3.5 w-3.5" /> 从作品选择
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center py-2">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <UserRound className="h-7 w-7 text-violet-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">上传 1-3 张人物参考图</p>
                  <p className="mt-1 text-[11px] text-slate-400">可来自同一人，也可来自不同人物，用于融合脸型、肤色、妆感和气质</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-violet-700">
                      <Upload className="h-3.5 w-3.5" /> 从本地上传
                    </button>
                    <button type="button" onClick={() => toast.info("作品库选择即将接入")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300">
                      <FolderOpen className="h-3.5 w-3.5" /> 从作品选择
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">{MODEL_UPLOAD_RULE.uploadSpecText}</p>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="shrink-0 text-[11px] font-medium text-slate-400">试一试</span>
              <div className="studio-scrollbar-hide flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                {MODEL_UPLOAD_RULE.demos.map((demo) => (
                  <button
                    key={demo.title}
                    type="button"
                    onClick={() => applyRuleDemo(demo)}
                    className="group flex h-14 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 shadow-sm transition-all hover:border-violet-200"
                    title={demo.description}
                  >
                    {demo.imageUrls.map((url) => (
                      <span key={url} className="flex h-14 w-14 items-center justify-center bg-slate-50">
                        <img src={url} alt={demo.title} className="h-full w-full object-contain p-1" />
                      </span>
                    ))}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">模特风格</h3>
            <StyleChoiceGrid options={MODEL_SHOOT_STYLES} value={modelStyle} onChange={selectModelStyle} />
            <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
              风格只决定妆造、光线和商业气质；多图融合、肤色、脸型骨相和五官辨识度优先级更高。
            </p>
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
                  hairReferenceUrl
                    ? "border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200 shadow-[0_14px_34px_rgba(124,58,237,0.18)]"
                    : "border-slate-200 bg-slate-50/70 text-slate-400 hover:border-purple-300 hover:bg-purple-50/60 hover:text-purple-500"
                }`}
              >
                {hairReferenceUrl ? (
                  <>
                    <img src={hairReferenceUrl} className="absolute inset-0 w-full h-full object-cover" alt="上传发型参考" />
                    <span className="absolute inset-0 bg-gradient-to-t from-purple-950/38 via-transparent to-transparent" />
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-emerald-500 shadow">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <span className="absolute bottom-0 left-0 right-0 bg-white/94 px-1.5 py-1 text-center backdrop-blur">
                      <span className="block text-[10px] font-bold text-purple-700">已上传发型参考</span>
                      <span className="block truncate text-[9px] text-slate-400">只参考发型轮廓</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5 mb-1.5" />
                    <span className="text-[10px] font-bold">上传发型参考</span>
                    <span className="mt-1 max-w-[78px] text-[9px] leading-snug text-slate-400">
                      只参考发型，不参考脸
                    </span>
                    <span className="mt-1 text-[8px] text-slate-300">≤15MB</span>
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
                  hairColorReferenceUrl
                    ? "border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200 shadow-[0_14px_34px_rgba(124,58,237,0.18)]"
                    : "border-slate-200 bg-slate-50/70 text-slate-400 hover:border-purple-300 hover:bg-purple-50/60 hover:text-purple-500"
                }`}
              >
                {hairColorReferenceUrl ? (
                  <>
                    <img src={hairColorReferenceUrl} className="absolute inset-0 w-full h-full object-cover" alt="上传发色参考" />
                    <span className="absolute inset-0 bg-gradient-to-t from-purple-950/38 via-transparent to-transparent" />
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-emerald-500 shadow">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <span className="absolute bottom-0 left-0 right-0 bg-white/94 px-1.5 py-1 text-center backdrop-blur">
                      <span className="block text-[10px] font-bold text-purple-700">已上传发色参考</span>
                      <span className="block truncate text-[9px] text-slate-400">只提取发色明暗</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5 mb-1.5" />
                    <span className="text-[10px] font-bold">上传发色参考</span>
                    <span className="mt-1 max-w-[78px] text-[9px] leading-snug text-slate-400">
                      只提取发色，不参考身份
                    </span>
                    <span className="mt-1 text-[8px] text-slate-300">≤15MB</span>
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
              <Sparkles className="w-4 h-4 text-purple-500" /> 生成模型
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
            <button
              type="button"
              data-prompt-trigger="model"
              aria-label="查看完整提示词"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowPromptPreview(true);
              }}
              className="studio-prompt-trigger flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all"
            >
              <Eye className="w-3.5 h-3.5" />
              查看完整提示词
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

        <div className="studio-runbar border-t p-3 sm:p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{referenceUrls.length} 张参考图 · {cost} × {genCount}</span>
            {isAuthenticated
              ? <span className="font-bold text-amber-600">消耗 {totalCost} · 余额 {credits ?? "-"}</span>
              : <span className="text-gray-400">登录后查看积分</span>
            }
          </div>
          <button onClick={() => generate()} disabled={isGenerating || !referenceUrls.length}
            className="w-full py-3 rounded-xl gradient-brand text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 shadow-lg shadow-purple-200">
            <Sparkles className="w-4 h-4" />
            {!isAuthenticated ? "登录后生成" : isGenerating ? "生成中..." : `生成 ${genCount} 张`}
          </button>
        </div>
      </div>

      <div className="studio-canvas min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title="创建专属模特"
              subtitle="从人像参考中提取稳定身份，再用风格和外观设置生成可复用的品牌模特。"
              imageSrc="/home-showcase/exclusive-model-02.png"
              imageAlt="专属模特指引"
              steps={[
                { title: "上传参考人像", desc: "上传 1-3 张清晰人像，用于锁定脸型、五官和人物气质。" },
                { title: "选择外观设置", desc: "调整肤色、年龄、发型、发色、妆容和拍摄风格。" },
                { title: "生成专属模特", desc: "得到统一人物形象，后续可继续用于服装上身和商品视觉。" },
              ]}
            />
          </div>
        )}

        {isGenerating && (
          <div className="studio-loading-stage min-h-[360px] lg:h-full p-4 sm:p-8 flex items-center justify-center">
            <div style={{
              position: "absolute", top: "10%", left: "20%", width: "300px", height: "300px",
              borderRadius: "50%", filter: "blur(80px)", opacity: 0.4,
              background: "radial-gradient(circle, #e879f9, #a78bfa, transparent)",
            }} />
            <div style={{
              position: "absolute", bottom: "15%", right: "15%", width: "250px", height: "250px",
              borderRadius: "50%", filter: "blur(80px)", opacity: 0.3,
              background: "radial-gradient(circle, #f472b6, #a78bfa, transparent)",
            }} />

            <div className="flex flex-wrap justify-center gap-3 sm:gap-5 w-full relative z-10">
              {Array.from({ length: genCount }).map((_, i) => (
                <div key={i} className={`rounded-2xl overflow-hidden ${genCount <= 2 ? "max-w-[min(420px,calc(50%-12px))] w-full sm:max-w-[min(420px,calc(50%-20px))]" : "max-w-[min(340px,calc(50%-12px))] w-full sm:max-w-[min(340px,calc(50%-20px))]"}`}
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
                        {progress < 20 ? "准备中..." : progress < 90 ? "生成中..." : "即将完成..."}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {resultUrls.length > 0 && (
          <div className="studio-result-stage min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <ResultImageGrid urls={resultUrls} filenamePrefix="model" extension="jpg" onOpen={setLightboxSrc} />
            </div>
            <div className="mt-4 flex justify-center">
              <RepairPromptPanel
                kind="model"
                onRepair={handleRepairGenerate}
                disabled={isGenerating}
                className="w-full max-w-3xl"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="studio-result-stage min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center"><X className="w-8 h-8 text-red-400" /></div>
              <p className="text-red-500 font-medium mb-1">生成失败</p>
              <p className="text-sm text-gray-400 mb-4 max-w-sm">{error}</p>
              <RepairPromptPanel
                kind="model"
                onRepair={handleRepairGenerate}
                disabled={isGenerating}
                className="mb-3 max-w-md"
              />
              <button onClick={() => setError("")} className="px-5 py-2 rounded-full border text-sm font-medium hover:bg-gray-50">重试</button>
            </div>
          </div>
        )}
      </div>

      {showModelRules && rulesPopoverStyle && (
        <ClientPortal>
          <div
            className="fixed z-[240] w-[min(760px,calc(100vw-32px))] overflow-hidden rounded-[24px] border border-white/80 bg-white/[0.96] shadow-[0_28px_90px_rgba(15,23,42,0.18)] backdrop-blur-2xl animate-fade-in"
            style={{
              top: rulesPopoverStyle.top,
              left: rulesPopoverStyle.left,
              maxHeight: rulesPopoverStyle.maxHeight,
            }}
            onMouseEnter={cancelRulesHide}
            onMouseLeave={scheduleRulesHide}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-500">{MODEL_UPLOAD_RULE.shortTitle}</p>
                <h3 className="mt-1 text-base font-bold text-slate-950">{MODEL_UPLOAD_RULE.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{MODEL_UPLOAD_RULE.uploadSpecText}</p>
              </div>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-600">Hover 预览</span>
            </div>

            <div className="studio-scrollbar-hide overflow-y-auto px-5 py-4" style={{ maxHeight: rulesPopoverStyle.maxHeight - 88 }}>
              <div className="grid gap-3 md:grid-cols-3">
                {MODEL_UPLOAD_RULE.demos.map((demo) => (
                  <div key={demo.title} className="flex min-h-[300px] flex-col rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
                    <div className={`grid h-36 gap-1 ${demo.imageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                      {demo.imageUrls.slice(0, 4).map((url) => (
                        <div key={url} className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-xl bg-white">
                          <img src={url} alt={demo.title} className="h-full w-full object-cover object-top" />
                          <CheckCircle2 className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white text-emerald-500" />
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs font-bold text-slate-800">{demo.title}</p>
                    <p className="mt-1 line-clamp-2 min-h-[34px] text-[10px] leading-relaxed text-slate-400">{demo.description}</p>
                    <button
                      type="button"
                      onClick={() => applyRuleDemo(demo)}
                      className="mt-auto w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-violet-200 hover:text-violet-600"
                    >
                      试一试
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-red-50/40 p-3">
                <p className="mb-3 text-center text-xs font-medium text-slate-500">{MODEL_UPLOAD_RULE.deprecatedTitle}</p>
                <div className="mx-auto grid max-w-lg grid-cols-3 gap-3">
                  {MODEL_UPLOAD_RULE.deprecatedImages.map((image) => (
                    <div key={image.title} className="rounded-2xl border border-red-100 bg-white/70 p-2 text-center">
                      <div className="relative h-36 overflow-hidden rounded-xl bg-white">
                        <img src={image.url} alt={image.title} className="h-full w-full object-cover object-top" />
                        <XCircle className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white text-red-500" />
                      </div>
                      <p className="mt-2 text-xs font-medium text-slate-600">{image.title}</p>
                    </div>
                  ))}
                </div>
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
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="text-sm font-bold">完整提示词</h3>
              <button onClick={() => setShowPromptPreview(false)} className="rounded p-1 hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[64dvh] space-y-3 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["模块", "专属模特"],
                  ["模型", aiModel],
                  ["比例", aspectRatio],
                  ["分辨率", imageSize],
                  ["生成张数", `${genCount}`],
                  ["融合参考", `${referenceUrls.length} 张`],
                  ["发型参考", hairReferenceUrl ? "已使用" : hairStyle || "未使用"],
                  ["发色参考", hairColorReferenceUrl ? "已使用" : hairColor || "未使用"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-400">{label}</p>
                    <p className="break-words text-xs font-medium text-gray-700">{value}</p>
                  </div>
                ))}
              </div>
              <textarea
                value={prompt}
                onChange={(e) => {
                  setPromptTouched(true);
                  setPrompt(e.target.value);
                }}
                className="min-h-[320px] w-full resize-y rounded-lg border px-3 py-2 text-xs leading-relaxed text-gray-700 outline-none focus:ring-2 focus:ring-purple-200"
              />
              <ModelPromptPreview kind="model" model={aiModel} prompt={prompt} />
              <button
                onClick={optimizePrompt}
                disabled={isOptimizing || !referenceUrls.length}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-purple-200 py-2 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-40"
              >
                {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
                分析图片并优化提示词
              </button>
              <button
                onClick={() => {
                  setPromptTouched(false);
                  setPrompt(defaultPrompt);
                }}
                className="w-full rounded-lg border py-2 text-xs font-medium text-gray-500 hover:border-purple-300 hover:text-purple-600"
              >
                恢复默认模板
              </button>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(prompt);
                  toast.success("已复制");
                }}
                className="rounded-full border px-4 py-1.5 text-xs font-medium hover:bg-gray-50"
              >
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
          <div className="fixed inset-0 z-[180] flex cursor-zoom-out items-center justify-center bg-slate-950/66 p-4 backdrop-blur-xl sm:p-8"
            onClick={() => setLightboxSrc(null)}>
            <img src={lightboxSrc} className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_32px_120px_rgba(0,0,0,0.45)]" />
            <button onClick={() => setLightboxSrc(null)}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/85 bg-white/90 text-slate-700 shadow-[0_12px_34px_rgba(15,23,42,0.22)] backdrop-blur transition-colors hover:bg-white hover:text-slate-950 sm:right-6 sm:top-6">
              <X className="w-5 h-5" />
            </button>
          </div>
        </ClientPortal>
      )}
    </div>
  );
}

function buildDefaultPrompt(
  refCount: number,
  gender: Gender,
  hairStyle: string | null,
  hairColor: string | null,
  hasHairReference: boolean,
  hasHairColorReference: boolean,
  modelStyle: ModelShootStyle
) {
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
    ? `图像角色：${refs} 是专属模特的人脸与风格融合参考图，可能来自同一个人，也可能来自不同人物；用于融合脸型、五官比例、肤色、气质、妆感、面部氛围和真实面部特征，生成一个新的稳定专属模特身份；${extraRoles}。`
    : `图像角色：${refs} 是专属模特的人脸与风格融合参考图，可能来自同一个人，也可能来自不同人物；用于融合脸型、五官比例、肤色、气质、妆感、面部氛围和真实面部特征，生成一个新的稳定专属模特身份。`;

  return `${imageRoleText}
任务：融合 ${refs} 的人物特征、长相风格、模特气质和妆容审美，生成一张真实摄影质感的${genderText}专属模特半身头像/模特卡照片。${hairStyleText}；${hairColorText}。最终模特必须是融合后的单一新身份，不要只复制其中某一张参考图。
${buildModelShootStylePrompt(modelStyle)}
${MODEL_FUSION_RULE}
${MODEL_FACE_STYLE_RULE}
${MODEL_MAKEUP_RULE}
${MODEL_SKIN_TONE_RULE}
${MODEL_FACE_SHAPE_RULE}
${MODEL_FEATURE_IDENTITY_RULE}
${MODEL_AGE_TEXTURE_RULE}
白色基础上衣，干净浅灰棚拍背景，柔和商业摄影布光，皮肤保留自然纹理和轻微瑕疵，发丝细节真实。图像质量：${MODEL_QUALITY}。
负面约束：不要生成多个人，不要换成随机陌生脸，不要只像单张参考图，不要无妆感，不要丢失参考图的面部氛围，不要默认美白，不要雪白皮或冷白皮，不要标准鹅蛋脸、小V脸、尖下巴、大眼高鼻网红审美，不要把发型/发色参考图当成人脸身份，不要过度磨皮，不要塑料皮肤，不要蜡像感，不要卡通感，不要畸形五官，不要文字水印。`;
}
