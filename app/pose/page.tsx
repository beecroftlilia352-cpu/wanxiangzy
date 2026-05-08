"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Eye, FolderOpen, PenLine, PersonStanding, Sparkles, Upload, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { createClient, getCachedProfileCredits, setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { FeatureTabs } from "@/components/FeatureTabs";
import { RepairPromptPanel } from "@/components/RepairPromptPanel";
import { ClientPortal } from "@/components/ClientPortal";
import { enforcePosePromptRequirements, type PoseOutputMode } from "@/lib/pose-prompt";
import { StyleChoiceGrid } from "@/components/StyleChoiceGrid";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { LoadingStage } from "@/components/studio/LoadingStage";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { takeApplyPayload } from "@/lib/history-apply";
import { applyRepairPrompt } from "@/lib/generation-repair";
import {
  DEFAULT_POSE_SERIES_STYLE,
  POSE_SERIES_STYLES,
  USER_CUSTOM_POSE_DEFAULT,
  applyPoseSeriesStylePrompt,
  getPoseSeriesStyleLabel,
  normalizePoseSeriesStyle,
  type PoseSeriesStyle,
} from "@/lib/module-style-presets";
import { POSE_UPLOAD_RULE, type PoseRuleDemo } from "@/lib/pose-upload-rules";

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4分/次", badge: "最新", icon: "/model-icons/openai.svg" },
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "4K · 2分/次", badge: "新", icon: "/model-icons/doubao.png" },
];

const DEFAULT_POSE_PROMPT = "基于图1生成同一人物、同一服装、同一摄影质感的姿势变化；姿势由 AI 按所选风格自由设计，保持人物比例、脸、肤色、发型和服装结构稳定。";

function stripLegacyRuleDemoText(value: string) {
  return value
    .replace(/\n?人物和姿势气质参考：[^\n]*(?:\n|$)/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function PosePage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rulesButtonRef = useRef<HTMLButtonElement>(null);
  const rulesHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [mainImage, setMainImage] = useState<string>("");
  const [prompt, setPrompt] = useState(DEFAULT_POSE_PROMPT);
  const [varyExpression, setVaryExpression] = useState(true);
  const [outputMode, setOutputMode] = useState<PoseOutputMode>("grid");
  const [poseStyle, setPoseStyle] = useState<PoseSeriesStyle>(DEFAULT_POSE_SERIES_STYLE);
  const [customPosePrompt, setCustomPosePrompt] = useState(USER_CUSTOM_POSE_DEFAULT.prompt);
  const [customCamera, setCustomCamera] = useState(USER_CUSTOM_POSE_DEFAULT.camera);
  const [customPoses, setCustomPoses] = useState([...USER_CUSTOM_POSE_DEFAULT.poses]);
  const [isDragging, setIsDragging] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showPoseRules, setShowPoseRules] = useState(false);
  const [rulesPopoverStyle, setRulesPopoverStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const imageSizes = getSupportedImageSizes(aiModel, "3:4");
  const unitCost = getCreditCost(aiModel, imageSize, "3:4");
  const cost = unitCost * (outputMode === "separate" ? 4 : 1);
  const effectivePosePrompt = stripLegacyRuleDemoText(poseStyle === "user_custom" ? buildCustomPosePrompt() : prompt);
  const finalPosePrompt = enforcePosePromptRequirements(
    applyPoseSeriesStylePrompt(effectivePosePrompt, poseStyle),
    { varyExpression, poseStyle, outputMode }
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
    const width = Math.min(720, window.innerWidth - 32);
    const top = Math.max(16, Math.min(rect.top - 10, window.innerHeight - 360));
    const left = Math.max(16, Math.min(rect.right + 12, window.innerWidth - width - 16));
    setRulesPopoverStyle({
      top,
      left,
      maxHeight: Math.max(320, window.innerHeight - top - 16),
    });
    setShowPoseRules(true);
  };

  const scheduleRulesHide = () => {
    cancelRulesHide();
    rulesHideTimerRef.current = setTimeout(() => {
      setShowPoseRules(false);
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
    const nextSizes = getSupportedImageSizes(aiModel, "3:4");
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, imageSize]);

  useEffect(() => {
    setPrompt((prev) => stripLegacyRuleDemoText(prev));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
    const payload = await takeApplyPayload("pose");
    if (cancelled || !payload) return;

    setMainImage(payload.mainImageUrl);
    setAiModel(payload.aiModel);
    setImageSize(payload.imageSize);
    setPrompt(payload.prompt);
    setVaryExpression(payload.varyExpression !== false);
    setPoseStyle(normalizePoseSeriesStyle(payload.poseStyle));
    setResultUrls([]);
    setError("");
    toast.success("已套用历史参数");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`图片不能超过 ${MAX_FILE_SIZE_MB}MB`);
      return;
    }
    setResultUrls([]);
    setError("");

    toast.info("正在上传主图...");
    try {
      const result = await uploadImage(file);
      setMainImage(result.url);
      toast.success("主图已选择");
    } catch {
      setMainImage("");
      toast.error("主图上传失败，请重试");
    }
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
        body: JSON.stringify({ main_image_url: mainImage, prompt: stripLegacyRuleDemoText(prompt), vary_expression: varyExpression, pose_style: poseStyle }),
      });
      const data = await res.json();
      if (data.prompt) {
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

  function selectPoseStyle(nextStyle: PoseSeriesStyle) {
    setPoseStyle(nextStyle);
    if (nextStyle === "user_custom") {
      // 自定义风格：用用户编辑的值构建提示词
      setPrompt(buildCustomPosePrompt());
    } else {
      setPrompt((prev) => applyPoseSeriesStylePrompt(prev, nextStyle));
    }
  }

  function buildCustomPosePrompt(): string {
    return [
      customPosePrompt,
      "",
      customCamera,
      "",
      ...customPoses,
    ].join("\n");
  }

  function applyRuleDemo(demo: PoseRuleDemo) {
    setMainImage(demo.imageUrl);
    setPrompt((prev) => stripLegacyRuleDemoText(prev));
    setResultUrls([]);
    setError("");
    setShowPoseRules(false);
    setRulesPopoverStyle(null);
    toast.success("已套用示例图");
  }

  async function generate(promptForRun?: string) {
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
          prompt: stripLegacyRuleDemoText(
            typeof promptForRun === "string"
              ? promptForRun
              : poseStyle === "user_custom"
                ? buildCustomPosePrompt()
                : prompt
          ),
          vary_expression: varyExpression,
          pose_style: poseStyle,
          output_mode: outputMode,
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
          if (Array.isArray(state.result_urls) && state.result_urls.length) {
            setResultUrls(state.result_urls);
          }
          setProgress(Math.min(25 + attempts * 1.5, 90));
        } else if (state.status === "completed") {
          setProgress(100);
          setResultUrls(state.result_urls || []);
          toast.success("姿势裂变完成");
          setIsGenerating(false);
          return;
        } else if (state.status === "failed") {
          throw new Error(state.error || "生成失败");
        }
      }
      throw new Error("生成超时");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "生成失败");
      toast.error(err instanceof Error ? err.message : "生成失败");
      setIsGenerating(false);
    }
  }

  function handleRepairGenerate(repairValue: string) {
    const repairedPrompt = applyRepairPrompt(prompt, "pose", repairValue);
    setPrompt(repairedPrompt);
    toast.info("已加入修复指令，正在重新生成...");
    generate(repairedPrompt);
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="pose" />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          <ModuleHeader
            title="姿势裂变"
            tooltip="基于图1人物、服装、场景和光线，生成同一套视觉里的四宫格姿势变化，适合主图延展、搭配展示和社媒排版。"
          />
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
            <div className="studio-upload-header">
              <h3 className="studio-upload-title">
                <Upload className="w-4 h-4 text-purple-500" /> 上传主图
              </h3>
              <button
                ref={rulesButtonRef}
                type="button"
                onMouseEnter={openRulesPopover}
                onMouseLeave={scheduleRulesHide}
                onFocus={openRulesPopover}
                onBlur={scheduleRulesHide}
                aria-expanded={showPoseRules}
                className="studio-upload-rule-button"
              >
                图片规则 <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            {mainImage ? (
              <div className="group studio-checkerboard relative h-[320px] overflow-hidden rounded-2xl border border-dashed border-slate-200">
                <img src={mainImage} alt="姿势裂变主图" className="h-full w-full object-contain p-3" />
                <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
                  模特主图
                </span>
                <button onClick={() => setMainImage("")}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <PersonStanding className="h-7 w-7 text-violet-400" />
                </div>
                <p className="text-sm font-semibold text-slate-800">上传模特图</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-violet-700">
                    <Upload className="h-3.5 w-3.5" /> 从本地上传
                  </button>
                  <button type="button" onClick={() => toast.info("作品库选择即将接入")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300">
                    <FolderOpen className="h-3.5 w-3.5" /> 从作品选择
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">{POSE_UPLOAD_RULE.uploadSpecText}</p>
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <span className="shrink-0 text-[11px] font-medium text-slate-400">试一试</span>
              <div className="studio-scrollbar-hide flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                {POSE_UPLOAD_RULE.demos.map((demo) => (
                  <button
                    key={demo.imageUrl}
                    type="button"
                    onClick={() => applyRuleDemo(demo)}
                    className="group flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50 shadow-sm transition-all hover:border-violet-200"
                    title={demo.title}
                  >
                    <img src={demo.imageUrl} alt={demo.title} className="h-full w-full object-contain p-1" />
                  </button>
                ))}
              </div>
            </div>
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
                  <p className="text-[10px] text-gray-400 pl-5 leading-tight truncate">{opt.desc} · 单张{getCreditCost(opt.value, imageSize, "3:4")}分</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">输出方式</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "grid" as const, label: "四宫格拼图", desc: "1 张 2x2 pose sheet" },
                { value: "separate" as const, label: "每姿势一张", desc: "4 张独立图片" },
              ].map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setOutputMode(mode.value)}
                  className={`rounded-lg border px-3 py-2 text-left transition-all ${
                    outputMode === mode.value ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="text-xs font-bold">{mode.label}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-gray-400">{mode.desc}</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">画布比例</h3>
            <div className="px-3 py-2 rounded-lg border border-purple-200 bg-purple-50 text-xs font-medium text-purple-600">固定 3:4 竖版</div>
            <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              人物比例按图1保护：头身比、肩宽、腰胯、腿长、脚部大小和服装穿着尺度不变；镜头、画幅、构图未指定时由 AI 按风格自然决定。
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
                    }`}>{s} · 单张{getCreditCost(aiModel, s, "3:4")}积分</button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="font-bold text-sm mb-3">表情控制</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setVaryExpression(true)}
                className={`px-3 py-2 rounded-lg border text-left text-xs font-medium transition-all ${
                  varyExpression ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                自然变化
              </button>
              <button
                onClick={() => setVaryExpression(false)}
                className={`px-3 py-2 rounded-lg border text-left text-xs font-medium transition-all ${
                  !varyExpression ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                严格一致
              </button>
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">拍摄风格</h3>
            <StyleChoiceGrid options={POSE_SERIES_STYLES} value={poseStyle} onChange={selectPoseStyle} />
            <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
              预设只给风格方向，AI 会自由设计四个姿势；人物身份、服装结构和身体比例仍然优先。
            </p>

            {/* 用户自定义姿势编辑器 */}
            {poseStyle === "user_custom" && (
              <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-700">
                  <PenLine className="h-4 w-4" />
                  自定义姿势描述
                </div>
                <p className="text-[11px] text-amber-600">
                  编辑下方内容自定义四个姿势；镜头、画幅和构图是可选项，不填则由 AI 自然决定。
                </p>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">整体描述</label>
                  <textarea
                    value={customPosePrompt}
                    onChange={(e) => setCustomPosePrompt(e.target.value)}
                    rows={4}
                    className="custom-scroll w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs leading-relaxed outline-none focus:border-violet-300 focus:ring-1 focus:ring-violet-200"
                    placeholder="描述四宫格的整体拍摄方向..."
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">镜头/画幅补充（可选）</label>
                  <textarea
                    value={customCamera}
                    onChange={(e) => setCustomCamera(e.target.value)}
                    rows={3}
                    className="custom-scroll w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs leading-relaxed outline-none focus:border-violet-300 focus:ring-1 focus:ring-violet-200"
                    placeholder="可为空；需要时可写统一镜头，或指定某个姿势的镜头距离、焦段、景别、画幅和构图。"
                  />
                </div>

                {customPoses.map((pose, i) => (
                  <div key={i}>
                    <label className="mb-1 block text-xs font-bold text-slate-600">姿势 {i + 1}</label>
                    <textarea
                      value={pose}
                      onChange={(e) => {
                        const next = [...customPoses];
                        next[i] = e.target.value;
                        setCustomPoses(next);
                      }}
                      rows={3}
                      className="custom-scroll w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs leading-relaxed outline-none focus:border-violet-300 focus:ring-1 focus:ring-violet-200"
                    />
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    setCustomPosePrompt(USER_CUSTOM_POSE_DEFAULT.prompt);
                    setCustomCamera(USER_CUSTOM_POSE_DEFAULT.camera);
                    setCustomPoses([...USER_CUSTOM_POSE_DEFAULT.poses]);
                  }}
                  className="text-[11px] font-medium text-amber-600 hover:text-amber-800"
                >
                  恢复默认值
                </button>
              </div>
            )}
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">提示词</h3>
            <button
              type="button"
              data-prompt-trigger="pose"
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
        </div>

        <div className="studio-runbar border-t p-3 sm:p-4 space-y-2 sticky bottom-0 z-10 lg:static">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{outputMode === "separate" ? "每姿势一张 · 4 张结果" : "四宫格 · 单张结果"}</span>
            {isAuthenticated
              ? <span className="font-bold text-amber-600">消耗 {cost} · 余额 {credits ?? "-"}</span>
              : <span className="text-gray-400">登录后查看积分</span>
            }
          </div>
          <button onClick={() => generate()} disabled={isGenerating || !mainImage}
            className="w-full py-3 rounded-xl gradient-brand text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 shadow-lg shadow-purple-200">
            <Sparkles className="w-4 h-4" />
            {!isAuthenticated ? "登录后生成" : isGenerating ? "生成中..." : outputMode === "separate" ? "生成 4 张独立图" : "生成四宫格"}
          </button>
        </div>
      </div>

      <div className="studio-canvas min-h-[260px] sm:min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title="开始姿势裂变"
              subtitle="用一张主图生成同人物、同服装、同风格的多姿势图片，可输出四宫格或四张独立图。"
              imageSrc="/home-showcase/pose-grid-black-outfit.png"
              imageAlt="姿势裂变指引"
              steps={[
                { title: "上传主图", desc: "人物身份、服装、背景和镜头关系都会作为硬参考保留。" },
                { title: "选择姿势风格", desc: "可切换自然站姿、走动感、商拍动作等裂变方向。" },
                { title: "选择输出方式", desc: "可输出 2x2 四宫格，也可每个姿势单独生成一张图。" },
              ]}
            />
          </div>
        )}

        {isGenerating && resultUrls.length === 0 && (
          <LoadingStage genCount={4} progress={progress} moduleName="姿势裂变" />
        )}

        {resultUrls.length > 0 && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            {isGenerating && (
              <div className="mb-4 rounded-xl border border-purple-100 bg-white/80 px-3 py-2 text-xs font-medium text-purple-600 shadow-sm">
                已生成 {resultUrls.length}{outputMode === "separate" ? " / 4" : ""}，剩余图片生成中...
              </div>
            )}
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <ResultImageGrid
                urls={resultUrls}
                filenamePrefix="pose"
                extension="jpg"
                onOpen={setLightboxSrc}
                expectedCount={isGenerating && outputMode === "separate" ? 4 : undefined}
                isGenerating={isGenerating}
              />
            </div>
            <div className="mt-4 flex justify-center">
              <RepairPromptPanel
                kind="pose"
                onRepair={handleRepairGenerate}
                disabled={isGenerating}
                className="w-full max-w-3xl"
              />
            </div>
          </div>
        )}

        {error && (
          <ErrorStage
            error={error}
            onRetry={() => setError("")}
            onRepair={handleRepairGenerate}
            isGenerating={isGenerating}
            repairKind="pose"
          />
        )}
      </div>

      {showPoseRules && rulesPopoverStyle && (
        <ClientPortal>
          <div
            className="fixed z-[240] w-[min(720px,calc(100vw-32px))] overflow-hidden rounded-[24px] border border-white/80 bg-white/[0.96] shadow-[0_28px_90px_rgba(15,23,42,0.18)] backdrop-blur-2xl animate-fade-in"
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-500">{POSE_UPLOAD_RULE.shortTitle}</p>
                <h3 className="mt-1 text-base font-bold text-slate-950">{POSE_UPLOAD_RULE.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{POSE_UPLOAD_RULE.uploadSpecText}</p>
              </div>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-600">Hover 预览</span>
            </div>

            <div className="studio-scrollbar-hide overflow-y-auto px-5 py-4" style={{ maxHeight: rulesPopoverStyle.maxHeight - 88 }}>
              <div className="grid gap-3 md:grid-cols-5">
                {POSE_UPLOAD_RULE.demos.map((demo) => (
                  <div key={demo.imageUrl} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
                    <div className="relative overflow-hidden rounded-xl bg-white">
                      <img src={demo.imageUrl} alt={demo.title} className="aspect-[3/4] w-full object-cover" />
                      <CheckCircle2 className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white text-emerald-500" />
                    </div>
                    <p className="mt-2 truncate text-center text-xs font-medium text-slate-700">{demo.title}</p>
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
                <p className="mb-3 text-center text-xs font-medium text-slate-500">{POSE_UPLOAD_RULE.deprecatedTitle}</p>
                <div className="mx-auto grid max-w-lg grid-cols-3 gap-3">
                  {POSE_UPLOAD_RULE.deprecatedImages.map((image) => (
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
                  ["模块", "姿势裂变"],
                  ["模型", aiModel],
                  ["分辨率", imageSize],
                  ["风格", getPoseSeriesStyleLabel(poseStyle)],
                  ["输出", outputMode === "separate" ? "每姿势一张" : "四宫格拼图"],
                  ["表情控制", varyExpression ? "自然变化" : "严格一致"],
                  ["主图", mainImage ? "已上传" : "未上传"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-400">{label}</p>
                    <p className="break-words text-xs font-medium text-gray-700">{value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-emerald-700">最终执行提示词</p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(finalPosePrompt);
                      toast.success("已复制最终执行提示词");
                    }}
                    className="rounded-full border border-emerald-100 bg-white px-3 py-1 text-[10px] font-medium text-emerald-700 hover:border-emerald-300"
                  >
                    复制
                  </button>
                </div>
                <textarea
                  readOnly
                  value={finalPosePrompt}
                  className="min-h-[360px] w-full resize-y rounded-lg border border-emerald-100 bg-white/85 px-3 py-2 text-[11px] leading-relaxed text-gray-700 outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(finalPosePrompt);
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
