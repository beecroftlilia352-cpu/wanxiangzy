"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, CheckCircle2, ChevronRight, Eye, FolderOpen, Loader2, Plus, Sparkles, Upload, Wand, X, XCircle, ZoomIn } from "lucide-react";
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
  DEFAULT_GARMENT_3D_DISPLAY_STYLE,
  GARMENT_3D_DISPLAY_STYLES,
  buildGarment3dDisplayStylePrompt,
  normalizeGarment3dDisplayStyle,
  type Garment3dDisplayStyle,
} from "@/lib/module-style-presets";
import { GARMENT_3D_UPLOAD_RULE, type Garment3dRuleDemo } from "@/lib/garment-3d-upload-rules";

type GarmentType = "上装" | "下装" | "连体衣" | "其他";
type OutputMode = "reference" | "prompt";

const DEFAULT_PROMPT = "衣服变为类似穿在人身上的立体效果，微微向左旋转，保留原始版型、面料厚度、纹理和所有细节，使用干净白色或浅灰棚拍背景。";
const GARMENT_3D_QUALITY =
  "photorealistic, 8K ultra-detailed, high contrast, commercial e-commerce catalog quality, sharp fabric details, raw photo quality";

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4积分", badge: "最新", icon: "/model-icons/openai.svg" },
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3积分", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4积分", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "4K · 2积分", badge: "新", icon: "/model-icons/doubao.png" },
];

const SUPABASE_STORAGE = "https://mtdfvnhphpulhjtnmubw.supabase.co/storage/v1/object/public";

const REFERENCE_PRESETS = [
  { id: "r1", label: "灰色连帽", url: `${SUPABASE_STORAGE}/references/garment-3d/ref-01.webp` },
  { id: "r2", label: "立体牛仔", url: `${SUPABASE_STORAGE}/references/garment-3d/ref-02.png` },
  { id: "r3", label: "棒球外套", url: `${SUPABASE_STORAGE}/references/garment-3d/ref-03.png` },
  { id: "r4", label: "直筒裤装", url: `${SUPABASE_STORAGE}/references/garment-3d/ref-04.png` },
  { id: "r5", label: "纹理卫衣", url: `${SUPABASE_STORAGE}/references/garment-3d/ref-05.png` },
  { id: "r6", label: "敞开夹克", url: `${SUPABASE_STORAGE}/references/garment-3d/ref-06.png` },
  { id: "r7", label: "侧身外套", url: `${SUPABASE_STORAGE}/references/garment-3d/ref-07.png` },
  { id: "r8", label: "羽绒厚度", url: `${SUPABASE_STORAGE}/references/garment-3d/ref-08.png` },
  { id: "r9", label: "背面廓形", url: `${SUPABASE_STORAGE}/references/garment-3d/ref-09.jpg` },
  { id: "r10", label: "短外套", url: `${SUPABASE_STORAGE}/references/garment-3d/ref-10.png` },
];

export default function Garment3dPage() {
  const router = useRouter();
  const supabase = createClient();
  const garmentInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const rulesButtonRef = useRef<HTMLButtonElement>(null);
  const rulesHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  const [garmentUrl, setGarmentUrl] = useState("");
  const [garmentName, setGarmentName] = useState("");
  const [garmentType, setGarmentType] = useState<GarmentType>("上装");
  const [customGarmentType, setCustomGarmentType] = useState("");
  const [outputMode, setOutputMode] = useState<OutputMode>("reference");
  const [displayStyle, setDisplayStyle] = useState<Garment3dDisplayStyle>(DEFAULT_GARMENT_3D_DISPLAY_STYLE);
  const [selectedReference, setSelectedReference] = useState(REFERENCE_PRESETS[0]);
  const [customReferenceUrl, setCustomReferenceUrl] = useState("");
  const [prompt, setPrompt] = useState("");
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
  const [showGarmentRules, setShowGarmentRules] = useState(false);
  const [rulesPopoverStyle, setRulesPopoverStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const costPerImage = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = costPerImage * genCount;
  const activeReferenceUrl = customReferenceUrl || selectedReference.url;

  const builtPrompt = useMemo(() => {
    return buildGarment3dPrompt({
      garmentType: garmentType === "其他" ? customGarmentType || "其他服装" : garmentType,
      outputMode,
      displayStyle,
      hasReference: outputMode === "reference" && !!activeReferenceUrl,
      prompt,
    });
  }, [activeReferenceUrl, customGarmentType, displayStyle, garmentType, outputMode, prompt]);
  const finalPrompt = promptOverride ?? builtPrompt;

  const imageRoles = outputMode === "reference"
    ? ["图1：用户上传服装图", "图2：3D立体效果参考图"]
    : ["图1：用户上传服装图"];

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
    setShowGarmentRules(true);
  };

  const scheduleRulesHide = () => {
    cancelRulesHide();
    rulesHideTimerRef.current = setTimeout(() => {
      setShowGarmentRules(false);
      setRulesPopoverStyle(null);
    }, 120);
  };

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
    const payload = takeApplyPayload("garment3d");
    if (!payload) return;

    setGarmentUrl(payload.garmentUrl);
    setGarmentName("历史服装图");
    setGarmentType(
      payload.garmentType === "上装" || payload.garmentType === "下装" || payload.garmentType === "连体衣"
        ? payload.garmentType
        : "其他"
    );
    setCustomGarmentType(
      payload.garmentType && !["上装", "下装", "连体衣"].includes(payload.garmentType)
        ? payload.garmentType
        : ""
    );
    setOutputMode(payload.outputMode || (payload.referenceUrl ? "reference" : "prompt"));
    setDisplayStyle(normalizeGarment3dDisplayStyle(payload.displayStyle));
    setCustomReferenceUrl(payload.referenceUrl || "");
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio === "1:1" ? "1:1" : "3:4");
    setImageSize(payload.imageSize);
    setGenCount(payload.genCount);
    setPrompt(payload.userPrompt || payload.prompt);
    setPromptOverride(payload.prompt);
    setResultUrls([]);
    setError(null);
    toast.success("已套用历史参数");
  }, []);

  async function handleGarmentFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`图片不能超过 ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    setGarmentName(file.name);
    setResultUrls([]);
    setError(null);

    toast.info("正在上传服装图...");
    try {
      const result = await uploadImage(file);
      setGarmentUrl(result.url);
      toast.success("服装图已准备");
    } catch {
      setGarmentUrl("");
      toast.error("服装图上传失败，请重试");
    }
  }

  async function handleCustomReference(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    setPromptOverride(null);

    toast.info("正在上传参考图...");
    try {
      const result = await uploadImage(file);
      setCustomReferenceUrl(result.url);
      toast.success("参考图已选择");
    } catch {
      setCustomReferenceUrl("");
      toast.error("参考图上传失败，请重试");
    }
  }

  const base64Cache = useRef<Map<string, string>>(new Map());
  async function urlToBase64(url: string) {
    if (url.startsWith("data:")) return url;
    if (url.startsWith("http")) return url;
    const cached = base64Cache.current.get(url);
    if (cached) return cached;
    const res = await fetch(url);
    const blob = await res.blob();
    const result = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    base64Cache.current.set(url, result);
    return result;
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
          display_style: displayStyle,
          prompt: finalPrompt,
        }),
      });
      const data = await res.json();
      if (data.prompt) {
        const optimizedPrompt = buildGarment3dPrompt({
          garmentType: garmentType === "其他" ? customGarmentType || "其他服装" : garmentType,
          outputMode,
          displayStyle,
          hasReference: outputMode === "reference" && !!activeReferenceUrl,
          prompt: data.prompt,
        });
        setPrompt(data.prompt);
        setPromptOverride(optimizedPrompt);
        toast.success("视觉分析已优化提示词");
      } else {
        toast.error("暂时没有返回优化结果");
      }
    } catch {
      toast.error("优化失败");
    } finally {
      setIsOptimizing(false);
    }
  }

  async function generate(finalPromptForRun?: string) {
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
      const submittedFinalPrompt = typeof finalPromptForRun === "string" ? finalPromptForRun : finalPrompt;
      const referencePayload = outputMode === "reference" ? await urlToBase64(activeReferenceUrl) : null;
      const res = await fetch("/api/garment-3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garment_url: garmentUrl,
          garment_type: garmentType,
          custom_garment_type: customGarmentType,
          output_mode: outputMode,
          display_style: displayStyle,
          reference_url: referencePayload,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          prompt,
          final_prompt: submittedFinalPrompt,
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

  function handleRepairGenerate(repairValue: string) {
    const repairedPrompt = applyRepairPrompt(finalPrompt, "garment3d", repairValue);
    setPromptOverride(repairedPrompt);
    toast.info("已加入修复指令，正在重新生成...");
    generate(repairedPrompt);
  }

  function applyRuleDemo(demo: Garment3dRuleDemo) {
    setGarmentUrl(demo.imageUrl);
    setGarmentName(demo.title);
    setGarmentType(demo.garmentType);
    setPromptOverride(null);
    setResultUrls([]);
    setError(null);
    setShowGarmentRules(false);
    setRulesPopoverStyle(null);
    toast.success(`已套用${demo.title}`);
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="garment3d" />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          <ModuleHeader
            title="服装 3D"
            tooltip="上传单张清晰服装图，将平铺、挂拍或人台服装转成更有厚度、体积和材质表达的商品展示图。"
          />
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
            <div className="studio-upload-header">
              <h3 className="studio-upload-title">
                <Upload className="w-4 h-4 text-purple-500" /> 上传服装图
              </h3>
              <button
                ref={rulesButtonRef}
                type="button"
                onMouseEnter={openRulesPopover}
                onMouseLeave={scheduleRulesHide}
                onFocus={openRulesPopover}
                onBlur={scheduleRulesHide}
                aria-expanded={showGarmentRules}
                className="studio-upload-rule-button"
              >
                图片规则 <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <input
              ref={garmentInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files && handleGarmentFiles(e.target.files)}
            />
            {garmentUrl ? (
              <div className="relative group">
                <div className="studio-checkerboard overflow-hidden rounded-2xl border border-dashed border-slate-200">
                  <img src={garmentUrl} className="w-full max-h-[260px] object-contain p-3" />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                  <span className="truncate">{garmentName || "已上传图片"}</span>
                  <button onClick={() => garmentInputRef.current?.click()} className="text-purple-600 hover:text-purple-700">
                    重新上传
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <Box className="h-7 w-7 text-violet-400" />
                </div>
                <p className="text-sm font-semibold text-slate-800">上传单件衣服平铺图</p>
                <p className="mt-1 text-[11px] text-slate-400">建议单件商品、主体完整、边缘清晰，避免套装和复杂背景</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => garmentInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-violet-700">
                    <Upload className="h-3.5 w-3.5" /> 从本地上传
                  </button>
                  <button type="button" onClick={() => toast.info("作品库选择即将接入")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300">
                    <FolderOpen className="h-3.5 w-3.5" /> 从作品选择
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">{GARMENT_3D_UPLOAD_RULE.uploadSpecText}</p>
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <span className="shrink-0 text-[11px] font-medium text-slate-400">试一试</span>
              <div className="studio-scrollbar-hide flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                {GARMENT_3D_UPLOAD_RULE.demos.map((demo) => (
                  <button
                    key={demo.imageUrl}
                    type="button"
                    onClick={() => applyRuleDemo(demo)}
                    className="group flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50 shadow-sm transition-all hover:border-violet-200"
                    title={demo.description}
                  >
                    <img src={demo.imageUrl} alt={demo.title} className="h-full w-full object-contain p-1" />
                  </button>
                ))}
              </div>
            </div>
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
                onClick={() => {
                  setOutputMode("reference");
                  setPromptOverride(null);
                  if (prompt.trim() === DEFAULT_PROMPT) setPrompt("");
                }}
                className={`py-2 rounded-lg border text-xs font-medium ${outputMode === "reference" ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200"}`}
              >
                选择参考图
              </button>
              <button
                onClick={() => {
                  setOutputMode("prompt");
                  setPromptOverride(null);
                  if (!prompt.trim()) setPrompt(DEFAULT_PROMPT);
                }}
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

            <div className="mt-3">
              <h3 className="font-bold text-sm mb-3">展示质感</h3>
              <StyleChoiceGrid
                options={GARMENT_3D_DISPLAY_STYLES}
                value={displayStyle}
                onChange={(nextStyle) => {
                  setDisplayStyle(nextStyle);
                  setPromptOverride(null);
                }}
              />
              <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
                质感档位只控制棚拍、体积和材质表现；图1服装款式、颜色、logo 和细节必须优先保留。
              </p>
            </div>

            <div className="mt-3">
              <h3 className="font-bold text-sm mb-3">
                {outputMode === "reference" ? "补充生成要求（可选）" : "描述3D效果"}
              </h3>
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => { setPrompt(e.target.value); setPromptOverride(null); }}
                  placeholder={outputMode === "reference"
                    ? "可补充角度、厚度、背景、布料质感等要求；参考图只负责立体结构和棚拍光影"
                    : "描述衣服的立体角度、厚度、旋转方向、背景风格等"}
                  className="w-full px-3 py-2 pr-10 rounded-lg border text-xs focus:ring-2 focus:ring-purple-200 outline-none resize-none h-24"
                />
                <button
                  onClick={optimizePrompt}
                  disabled={isOptimizing || !garmentUrl}
                  className="absolute right-2 top-2 p-1.5 rounded-md bg-purple-50 text-purple-500 hover:bg-purple-100 disabled:opacity-30"
                  title="视觉分析优化提示词"
                >
                  {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
                </button>
              </div>
              {outputMode === "reference" && (
                <p className="mt-1.5 text-[11px] text-gray-400">
                  参考图用于锁定立体感、厚度、空间角度和棚拍光影；这里输入的文字会作为额外生成要求一起进入最终提示词。
                </p>
              )}
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">生成模型</h3>
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
            type="button"
            data-prompt-trigger="garment3d"
            aria-label="查看完整提示词"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setShowPromptPreview(true);
            }}
            className="studio-prompt-trigger flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all"
          >
            <Eye className="w-3.5 h-3.5" /> 查看完整提示词
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

        <div className="studio-runbar border-t p-3 sm:p-4 space-y-2 sticky bottom-0 z-10 lg:static">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{costPerImage} × {genCount} 张</span>
            {isAuthenticated
              ? <span className="font-bold text-amber-600">消耗 {totalCost} · 余额 {credits ?? "-"}</span>
              : <span className="text-gray-400">登录后查看积分</span>
            }
          </div>
          <button
            onClick={() => generate()}
            disabled={isGenerating || !garmentUrl}
            className="w-full py-3 rounded-xl gradient-brand text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 shadow-lg shadow-purple-200"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {!isAuthenticated ? "登录后生成" : isGenerating ? "生成中..." : `生成 ${genCount} 张`}
          </button>
        </div>
      </div>

      <div className="studio-canvas min-h-[260px] sm:min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title="服装转 3D 商品图"
              subtitle="把平铺、挂拍或人台图转成更有厚度、体积和材质表现的棚拍商品图。"
              imageSrc="/home-showcase/garment-blue-hoodie-3d.png"
              imageAlt="服装3D指引"
              steps={[
                { title: "上传服装图", desc: "建议单件商品、主体完整、边缘清晰，避免复杂背景和套装。" },
                { title: "选择类型 / 风格", desc: "确认上装、下装、连体衣等类型，可上传立体参考图辅助角度。" },
                { title: "生成立体展示", desc: "保留原始版型、面料纹理和细节，输出干净商业棚拍效果。" },
              ]}
            />
          </div>
        )}

        {isGenerating && (
          <div className="studio-loading-stage min-h-[260px] sm:min-h-[360px] lg:h-full p-4 sm:p-8 flex items-center justify-center">
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
                    style={{
                      background: "linear-gradient(135deg, rgba(232,121,249,0.15), rgba(167,139,250,0.2), rgba(244,114,182,0.15))",
                    }}>
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
                            <linearGradient id={`garment3d-g${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#e879f9">
                                <animate attributeName="stop-color" values="#e879f9;#a78bfa;#f472b6;#e879f9" dur="4s" repeatCount="indefinite" />
                              </stop>
                              <stop offset="100%" stopColor="#a78bfa">
                                <animate attributeName="stop-color" values="#a78bfa;#f472b6;#e879f9;#a78bfa" dur="4s" repeatCount="indefinite" />
                              </stop>
                            </linearGradient>
                          </defs>
                          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                          <circle cx="50" cy="50" r="42" fill="none" stroke={`url(#garment3d-g${i})`} strokeWidth="4"
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
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 pb-28 sm:p-6 sm:pb-28 lg:h-full animate-fade-in">
            <div className="flex min-h-full items-center justify-center">
              <ResultImageGrid urls={resultUrls} filenamePrefix="garment-3d" onOpen={setLightboxSrc} />
            </div>
            <div className="absolute bottom-0 left-0 right-0 border-t border-white/70 bg-white/78 backdrop-blur-2xl px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-[0_-18px_45px_rgba(15,23,42,0.08)]">
              <span className="text-xs text-gray-400">服装转3D结果</span>
              <RepairPromptPanel
                kind="garment3d"
                onRepair={handleRepairGenerate}
                disabled={isGenerating}
                className="max-w-2xl flex-1"
              />
              <button onClick={() => { setResultUrls([]); setProgress(0); }} className="px-4 py-1.5 rounded-full border text-xs font-medium hover:bg-gray-50">
                重新创作 <ChevronRight className="inline w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
                <X className="w-8 h-8 text-red-400" />
              </div>
              <p className="text-red-500 font-medium mb-1">生成失败</p>
              <p className="text-sm text-gray-400 mb-4 max-w-sm">{error}</p>
              <RepairPromptPanel
                kind="garment3d"
                onRepair={handleRepairGenerate}
                disabled={isGenerating}
                className="mb-3 max-w-md"
              />
              <button onClick={() => generate()} className="px-5 py-2 rounded-full border text-sm font-medium hover:bg-gray-50">重试</button>
            </div>
          </div>
        )}
      </div>

      {showGarmentRules && rulesPopoverStyle && (
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-500">{GARMENT_3D_UPLOAD_RULE.shortTitle}</p>
                <h3 className="mt-1 text-base font-bold text-slate-950">{GARMENT_3D_UPLOAD_RULE.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{GARMENT_3D_UPLOAD_RULE.uploadSpecText}</p>
              </div>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-600">Hover 预览</span>
            </div>

            <div className="studio-scrollbar-hide overflow-y-auto px-5 py-4" style={{ maxHeight: rulesPopoverStyle.maxHeight - 88 }}>
              <div className="grid gap-3 md:grid-cols-5">
                {GARMENT_3D_UPLOAD_RULE.demos.map((demo) => (
                  <div key={demo.imageUrl} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
                    <div className="relative overflow-hidden rounded-xl bg-white">
                      <img src={demo.imageUrl} alt={demo.title} className="aspect-square w-full object-cover" />
                      <CheckCircle2 className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white text-emerald-500" />
                    </div>
                    <p className="mt-2 truncate text-xs font-medium text-slate-700">{demo.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-400">{demo.description}</p>
                    <button
                      type="button"
                      onClick={() => applyRuleDemo(demo)}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-violet-200 hover:text-violet-600"
                    >
                      试一试
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-red-50/40 p-3">
                <p className="mb-3 text-center text-xs font-medium text-slate-500">{GARMENT_3D_UPLOAD_RULE.deprecatedTitle}</p>
                <div className="mx-auto grid max-w-lg grid-cols-3 gap-3">
                  {GARMENT_3D_UPLOAD_RULE.deprecatedImages.map((image) => (
                    <div key={image.title} className="rounded-2xl border border-red-100 bg-white/70 p-2 text-center">
                      <div className="relative overflow-hidden rounded-xl bg-white">
                        <img src={image.url} alt={image.title} className="aspect-square w-full object-cover" />
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
        <div className="fixed inset-0 z-[220] flex min-h-dvh w-dvw items-center justify-center bg-slate-950/38 p-4 backdrop-blur-xl sm:p-6" onClick={() => setShowPromptPreview(false)}>
          <div className="max-h-[86dvh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/80 bg-white/[0.94] shadow-[0_32px_100px_rgba(15,23,42,0.22)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
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
            <div className="px-5 py-4 overflow-y-auto max-h-[64dvh] space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["模型", aiModel],
                  ["比例", aspectRatio],
                  ["分辨率", imageSize],
                  ["生成张数", `${genCount}`],
                  ["服装类型", garmentType === "其他" ? customGarmentType || "其他" : garmentType],
                  ["输出模式", outputMode === "reference" ? "参考图模式" : "提示词模式"],
                  ["3D参考图", outputMode === "reference" && activeReferenceUrl ? "已使用" : "未使用"],
                  ["用户输入", prompt || "无"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-400">{label}</p>
                    <p className="text-xs font-medium text-gray-700 break-words">{value}</p>
                  </div>
                ))}
              </div>
              <textarea
                value={finalPrompt}
                onChange={(e) => setPromptOverride(e.target.value)}
                className="w-full min-h-[320px] px-3 py-2 rounded-lg border text-xs text-gray-700 leading-relaxed outline-none focus:ring-2 focus:ring-purple-200 resize-y"
              />
              <ModelPromptPreview kind="garment3d" model={aiModel} prompt={finalPrompt} />
              <button
                onClick={optimizePrompt}
                disabled={isOptimizing || !garmentUrl}
                className="w-full py-2 rounded-lg border border-dashed border-purple-200 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
                分析图片并优化提示词
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

function buildGarment3dPrompt(params: {
  garmentType: string;
  outputMode: OutputMode;
  displayStyle: Garment3dDisplayStyle;
  hasReference: boolean;
  prompt: string;
}) {
  const roles = params.hasReference
    ? "图像角色：图1是用户上传的服装图，图2是3D立体效果参考图。"
    : "图像角色：图1是用户上传的服装图。";
  const referenceLine = params.hasReference
    ? "参考图2只用于学习立体角度、布料厚度、支撑形态、阴影结构和商业棚拍光影，不参考图2的背景元素、颜色、图案、文字或具体款式。"
    : "按照用户提示生成类似穿在人身上的3D立体展示效果，使用干净白色背景。";
  const backgroundLine = "画面要求：主体居中，边缘干净，真实商业棚拍质感，柔和自然阴影，背景使用干净白色或浅灰棚拍背景，不带场景杂物。";
  const userRequirement = params.prompt.trim()
    ? `用户补充要求：${params.prompt.trim()}`
    : params.hasReference
      ? "用户补充要求：无，优先按照图2的立体角度、厚度、支撑形态和棚拍光影生成。"
      : `用户要求：${DEFAULT_PROMPT}`;

  return `${roles}
任务：将图1的${params.garmentType || "服装"}从平面图或人台图转换为无真人、无头部、无脸、无手的3D立体服装展示图。
${referenceLine}
严格保留图1服装的版型、颜色、材质、纹理、图案、纽扣、拉链、口袋、帽绳、袖口、裤腰、裤脚等细节。
${buildGarment3dDisplayStylePrompt(params.displayStyle)}
${userRequirement}
${backgroundLine}
图像质量：${GARMENT_3D_QUALITY}。
负面约束：不要生成真人身体，不要生成模特脸，不要多件衣服，不要改变服装品类，不要改变主要颜色，不要扭曲文字和 logo。`;
}
