"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Eye, FolderOpen, Loader2, PersonStanding, Sparkles, Upload, Wand, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { createClient, getCachedProfileCredits, setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { FeatureTabs } from "@/components/FeatureTabs";
import { RepairPromptPanel } from "@/components/RepairPromptPanel";
import { ModelPromptPreview } from "@/components/ModelPromptPreview";
import { ClientPortal } from "@/components/ClientPortal";
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

const DEFAULT_POSE_PROMPT = `High-end fashion magazine editorial photography, same person from 图1, same face identity, hairstyle, body proportion, clothing, fabric texture, color, pattern, scene, lighting and photography quality. Four-panel pose variation from the same fashion photo series, consistent framing, same camera distance, same lens style, same background and color grade. Professional studio lighting with soft key light and natural fill. Hyper-realistic skin texture with natural pores. photorealistic, 8K ultra-detailed, cinematic color grade, sharp details.

时装大片连贯性规则：四个分格必须像同一套商业时装大片的连续 pose sheet，而不是四张不同照片拼贴；保持统一构图、统一背景、统一光线、统一肤色质感、统一色彩管理和统一服装展示尺度。
服装展示规则：四个姿势都要清楚展示同一套服装的版型、腰线、肩线、袖长、下摆、面料垂坠、纹理和图案；允许动作造成自然褶皱、遮挡和张力变化，但绝不能改变服装结构、颜色、图案、长度、开口位置或搭配关系。
身体动作规则：动作变化要自然、可信、符合真人关节运动，避免夸张扭腰、断手、错位手指、肢体拉长、身体比例漂移；每个姿势都要稳定站立并服务于服装展示。
肤色和色彩规则：四个分格必须保留图1人物的自然肤色、肤色明暗、冷暖调、局部红润、阴影层次和真实皮肤质感；保持准确白平衡和真实曝光，不要自动美白、不要雪白皮、不要冷白皮、不要过度提亮肤色。
脸型五官规则：四个分格必须保持图1人物的脸型骨相、脸长宽比例、颧骨、下颌线、下巴形状、眼型、眼距、鼻翼宽度、唇形和真实五官辨识度；不要自动变成标准鹅蛋脸、小V脸、尖下巴、大眼高鼻的网红脸。

姿势1：正面自然站立，双手自然下垂或轻触口袋，表情平静自然，眼神直视镜头，完整展示服装正面版型。镜头：consistent medium full-body framing, 50mm lens, eye level angle
姿势2：身体轻微侧转30度，肩线放松，一手轻抚头发或整理衣领，柔和浅笑，展示服装侧面轮廓和肩颈线条。镜头：consistent medium full-body framing, 50mm lens, eye level angle
姿势3：重心轻微偏移，一手叉腰或扶腰，另一只手自然下垂，自信微笑，展示服装腰线、廓形和面料垂坠。镜头：consistent medium full-body framing, 50mm lens, eye level angle
姿势4：轻微迈步或转身的自然动态，专注或轻微回眸的自然表情，衣服产生真实褶皱、张力和垂坠，不改变服装结构。镜头：consistent medium full-body framing, 50mm lens, eye level angle

表情控制：保持同一个人、同一张脸、不要换脸，但四个分格需要轻微自然的表情差异，避免复制粘贴脸；建议分别呈现平静自然、自信微笑、柔和浅笑、专注或轻微回眸的眼神表情。
负面约束：不要换脸，不要换衣服，不要改变场景，不要生成多余人物，不要扭曲手指和肢体，不要塑料皮肤，不要AI渲染感。`;

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
  const [poseStyle, setPoseStyle] = useState<PoseSeriesStyle>(DEFAULT_POSE_SERIES_STYLE);
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
  const cost = getCreditCost(aiModel, imageSize, "3:4");

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
    const payload = takeApplyPayload("pose");
    if (!payload) return;

    setMainImage(payload.mainImageUrl);
    setAiModel(payload.aiModel);
    setImageSize(payload.imageSize);
    setPrompt(payload.prompt);
    setVaryExpression(payload.varyExpression !== false);
    setPoseStyle(normalizePoseSeriesStyle(payload.poseStyle));
    setResultUrls([]);
    setError("");
    toast.success("已套用历史参数");
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
    setPrompt((prev) => applyPoseSeriesStylePrompt(prev, nextStyle));
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
          prompt: stripLegacyRuleDemoText(typeof promptForRun === "string" ? promptForRun : prompt),
          vary_expression: varyExpression,
          pose_style: poseStyle,
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
            <h3 className="font-bold text-sm mb-3">表情控制</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setVaryExpression(true)}
                className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  varyExpression ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                自然变化
              </button>
              <button
                onClick={() => setVaryExpression(false)}
                className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  !varyExpression ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                尽量一致
              </button>
            </div>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">拍摄风格</h3>
            <StyleChoiceGrid options={POSE_SERIES_STYLES} value={poseStyle} onChange={selectPoseStyle} />
            <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
              风格只控制四宫格整体拍摄方向，人物身份、服装结构、镜头距离和系列一致性仍然优先。
            </p>
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
            <span className="text-gray-400">四宫格 · 单张结果</span>
            {isAuthenticated
              ? <span className="font-bold text-amber-600">消耗 {cost} · 余额 {credits ?? "-"}</span>
              : <span className="text-gray-400">登录后查看积分</span>
            }
          </div>
          <button onClick={() => generate()} disabled={isGenerating || !mainImage}
            className="w-full py-3 rounded-xl gradient-brand text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 shadow-lg shadow-purple-200">
            <Sparkles className="w-4 h-4" />
            {!isAuthenticated ? "登录后生成" : isGenerating ? "生成中..." : "生成四宫格"}
          </button>
        </div>
      </div>

      <div className="studio-canvas min-h-[260px] sm:min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title="开始姿势裂变"
              subtitle="用一张主图生成同人物、同服装、同场景的多姿势四宫格。"
              imageSrc="/home-showcase/pose-grid-black-outfit.png"
              imageAlt="姿势裂变指引"
              steps={[
                { title: "上传主图", desc: "人物身份、服装、背景和镜头关系都会作为硬参考保留。" },
                { title: "选择姿势风格", desc: "可切换自然站姿、走动感、商拍动作等裂变方向。" },
                { title: "生成四宫格", desc: "输出同一套画面逻辑下的 4 个动作变化，适合商品详情和内容矩阵。" },
              ]}
            />
          </div>
        )}

        {isGenerating && (
          <LoadingStage genCount={4} progress={progress} />
        )}

        {resultUrls.length > 0 && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <ResultImageGrid urls={resultUrls} filenamePrefix="pose" extension="jpg" onOpen={setLightboxSrc} />
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
                  ["表情控制", varyExpression ? "自然变化" : "尽量一致"],
                  ["主图", mainImage ? "已上传" : "未上传"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-400">{label}</p>
                    <p className="break-words text-xs font-medium text-gray-700">{value}</p>
                  </div>
                ))}
              </div>
              <textarea
                value={stripLegacyRuleDemoText(prompt)}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[320px] w-full resize-y rounded-lg border px-3 py-2 text-xs leading-relaxed text-gray-700 outline-none focus:ring-2 focus:ring-purple-200"
              />
              <ModelPromptPreview kind="pose" model={aiModel} prompt={stripLegacyRuleDemoText(prompt)} />
              <button
                onClick={optimizePrompt}
                disabled={isOptimizing || !mainImage}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-purple-200 py-2 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-40"
              >
                {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
                分析图片并优化提示词
              </button>
              <button
                onClick={() => setPrompt(applyPoseSeriesStylePrompt(DEFAULT_POSE_PROMPT, poseStyle))}
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
