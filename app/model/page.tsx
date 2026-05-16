"use client";

import { type CSSProperties, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { StudioGenerationCountSelector, StudioModelSelector, StudioOptionGrid, StudioPromptTextarea } from "@/components/studio/StudioFormControls";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { fetchHistoryApplyDetail, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import { clampTaskExpectedCount, type TaskQueueItem } from "@/lib/task-queue";
import { applyRepairPrompt } from "@/lib/generation-repair";
import { enforceModelPromptRequirements } from "@/lib/model-prompt";
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
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3分/次", badge: "推荐", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4分/次", badge: "最新", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/openai.svg" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4分/次", badge: "推荐", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
];

type ModelHistoryPayload = Extract<HistoryJobPayload, { kind: "model" }>;

const ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: "3:4", label: "3:4 竖版" },
  { value: "1:1", label: "1:1 头像" },
  { value: "4:3", label: "4:3 横版" },
];

const HAIR_STYLES = {
  female: [
    { value: "自然黑长直发，偏分，发丝顺滑垂落", label: "黑长直", image: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-black-long-side.png" },
    { value: "齐肩短波波头，空气刘海，发尾内扣", label: "短波波", image: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-short-bob.png" },
    { value: "高丸子头，干净利落，露出脸部轮廓", label: "丸子头", image: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-high-bun.png" },
    { value: "侧边低马尾，柔和自然，发束垂在肩侧", label: "侧马尾", image: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-side-ponytail.png" },
    { value: "长卷发，大波浪，发丝蓬松有层次", label: "大波浪", image: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-black-wavy.png" },
  ],
  male: [
    { value: "短寸头，清爽硬朗，发际线自然", label: "寸头", image: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/male-buzz-cut.png" },
    { value: "短碎发，顶部自然蓬松，干净少年感", label: "短碎发", image: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/male-short-textured.png" },
    { value: "蓬松微卷短发，前额自然碎刘海", label: "微卷发", image: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/male-wavy-volume.png" },
  ],
};

const HAIR_COLORS = [
  { value: "自然黑色", label: "黑色", image: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-black-long-side.png" },
  { value: "深棕色", label: "深棕", image: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-brown-straight.png" },
  { value: "冷灰色", label: "灰色", image: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-gray-long.png" },
  { value: "铂金白色", label: "白金", image: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-platinum-long.png" },
  { value: "柔粉色", label: "粉色", image: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-pink-long.png" },
];
export default function ModelPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hairInputRef = useRef<HTMLInputElement>(null);
  const hairColorInputRef = useRef<HTMLInputElement>(null);
  const rulesButtonRef = useRef<HTMLButtonElement>(null);
  const rulesHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    authChecked,
    isAuthenticated,
    userId,
    credits,
    setCredits,
    refreshAuth,
  } = useStudioAuth();
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [isReferenceDragging, setIsReferenceDragging] = useState(false);
  const [gender, setGender] = useState<Gender>("female");
  const [modelStyle, setModelStyle] = useState<ModelShootStyle>(DEFAULT_MODEL_SHOOT_STYLE);
  const [hairStyle, setHairStyle] = useState<string | null>(null);
  const [hairColor, setHairColor] = useState<string | null>(null);
  const [hairReferenceUrl, setHairReferenceUrl] = useState<string | null>(null);
  const [hairColorReferenceUrl, setHairColorReferenceUrl] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [userExtraPrompt, setUserExtraPrompt] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [activeResultMeta, setActiveResultMeta] = useState<{ createdAt: string; inputThumbnails: string[] } | null>(null);
  const [error, setError] = useState("");
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showModelRules, setShowModelRules] = useState(false);
  const [rulesPopoverStyle, setRulesPopoverStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const cost = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = cost * genCount;
  const authIsAnonymous = authChecked && !isAuthenticated;
  const runDisabledReason = !referenceUrls.length
    ? "请上传至少 1 张参考图"
    : credits !== null && credits < totalCost
      ? `积分不足，生成需要 ${totalCost} 积分`
      : undefined;
  const defaultPrompt = useMemo(
    () => buildDefaultPrompt(referenceUrls.length || 1, gender, hairStyle, hairColor, !!hairReferenceUrl, !!hairColorReferenceUrl, modelStyle),
    [referenceUrls.length, gender, hairStyle, hairColor, hairReferenceUrl, hairColorReferenceUrl, modelStyle]
  );
  const taskInputThumbnails = useMemo(
    () => [...referenceUrls, hairReferenceUrl, hairColorReferenceUrl].filter(Boolean) as string[],
    [referenceUrls, hairReferenceUrl, hairColorReferenceUrl]
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
    return () => cancelRulesHide();
  }, []);

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  function applyModelHistoryPayload(payload: ModelHistoryPayload, historyResultUrls: string[] = []) {
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
    setResultUrls(historyResultUrls);
    setIsGenerating(false);
    setProgress(historyResultUrls.length ? 100 : 0);
    setError("");
    toast.success("已套用历史参数");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
    const detail = await takeApplyDetail("model");
    const payload = detail?.payload;
    if (cancelled || !payload) return;

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
    setResultUrls(detail?.resultUrls || []);
    setIsGenerating(false);
    setProgress(detail?.resultUrls.length ? 100 : 0);
    setError("");
    toast.success("已套用历史参数");
    })();
    return () => {
      cancelled = true;
    };
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

  function handleReferenceDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsReferenceDragging(true);
  }

  function handleReferenceDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsReferenceDragging(false);
    }
  }

  function handleReferenceDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = referenceUrls.length >= 3 ? "none" : "copy";
  }

  function handleReferenceDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsReferenceDragging(false);
    addFiles(event.dataTransfer.files);
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
    if (!isAuthenticated && !(await refreshAuth())) {
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
    setActiveResultMeta({
      createdAt: new Date().toISOString(),
      inputThumbnails: taskInputThumbnails,
    });

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
          prompt: typeof promptForRun === "string"
            ? promptForRun
            : userExtraPrompt.trim()
              ? `${prompt}\n\n用户补充要求：${userExtraPrompt.trim()}`
              : prompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          await refreshAuth();
          router.push("/login");
          return;
        }
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
        if (state.status === "processing_tryon" || state.status === "processing" || state.status === "pending") {
          if (Array.isArray(state.result_urls) && state.result_urls.length) {
            setResultUrls(state.result_urls);
          }
          const nextProgress = Number(state.progress);
          setProgress(Number.isFinite(nextProgress)
            ? Math.min(Math.max(Math.round(nextProgress), 0), 99)
            : Math.min(25 + attempts * 1.5, 90));
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "生成失败");
      setIsGenerating(false);
      toast.error(err instanceof Error ? err.message : "生成失败");
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

  function handleRunningTask(item: TaskQueueItem) {
    setGenCount(clampTaskExpectedCount(item, 1, 4));
    setIsGenerating(true);
    setProgress(Math.min(Math.max(Math.round(Number(item.progress) || 12), 1), 99));
    setError("");
    setResultUrls(item.resultThumbnails || []);
    setActiveResultMeta({
      createdAt: item.createdAt || item.updatedAt || new Date().toISOString(),
      inputThumbnails: item.inputThumbnails || [],
    });
  }

  async function handleCompletedTask(item: TaskQueueItem, session: TaskSelectionSession) {
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "model", session.signal);
      if (!session.isCurrent()) return true;
      applyModelHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : item.resultThumbnails);
      return true;
    } catch (err) {
      if (session.signal.aborted || !session.isCurrent()) return true;
      toast.error(err instanceof Error ? err.message : "历史参数加载失败");
      return true;
    }
  }

  function handleContinueCreate() {
    setIsGenerating(false);
    setProgress(0);
    setResultUrls([]);
    setActiveResultMeta(null);
    setError("");
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="model" />
      <ModuleTaskRail module="model" moduleLabel="模特生成" onContinue={handleContinueCreate} onRunningTask={handleRunningTask} onCompletedTask={handleCompletedTask} />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          <ModuleHeader
            title="专属模特"
            tooltip="上传 1-3 张人物参考图，融合脸型、五官比例、肤色、妆感和气质，生成稳定可复用的品牌模特形象。"
            actions={(
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
            )}
          />
          <StudioUploadSection
            title="上传参考图"
            inputRef={fileInputRef}
            multiple
            isDragging={isReferenceDragging}
            setDragging={setIsReferenceDragging}
            onFiles={addFiles}
          >
            {(openFileDialog) => (
              <>
            <div
              className={`studio-upload-tile studio-model-reference-upload relative flex flex-col text-center transition-all ${
                isReferenceDragging ? "studio-upload-tile-dragging" : ""
              }`}
              style={{ "--studio-fixed-upload-height": "260px" } as CSSProperties}
            >
              {isReferenceDragging && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border border-violet-300 bg-violet-50/85 text-sm font-semibold text-violet-700 shadow-inner backdrop-blur-sm">
                  {referenceUrls.length >= 3 ? "最多 3 张参考图" : "松开即可上传图片"}
                </div>
              )}
              {referenceUrls.length > 0 ? (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3 text-left">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">已上传 {referenceUrls.length}/3 张参考图</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{referenceUrls.length < 3 ? "图片已进入融合参考，可拖入继续补充或移除单张" : "图片已进入融合参考，最多 3 张，可移除后重新拖入"}</p>
                    </div>
                    {referenceUrls.length < 3 && (
                      <button
                        type="button"
                        onClick={openFileDialog}
                        className="shrink-0 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-600 shadow-sm hover:border-violet-300 hover:bg-violet-50"
                      >
                        继续上传
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {referenceUrls.map((url, index) => (
                      <div key={index} className="studio-checkerboard group relative overflow-hidden rounded-xl border border-white shadow-sm ring-1 ring-slate-100">
                        <img src={url} alt={`专属模特参考图${index + 1}`} className="h-[150px] w-full object-contain p-1.5" />
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
                    <button type="button" onClick={openFileDialog} className="studio-upload-tile-primary">
                      <Upload className="h-3.5 w-3.5" /> 从本地上传
                    </button>
                    <button type="button" onClick={() => toast.info("作品库选择即将接入")} className="studio-upload-tile-secondary">
                      <FolderOpen className="h-3.5 w-3.5" /> 从作品选择
                    </button>
                  </div>
                </>
              ) : (
                <div className="studio-upload-tile-empty">
                  <span className="studio-upload-tile-icon">
                    <UserRound className="h-6 w-6 text-[var(--codex-accent)]" />
                  </span>
                  <span className="studio-upload-tile-title text-sm font-black leading-snug text-codex-ink">上传 / 拖入 1-3 张人物参考图</span>
                  <span className="studio-upload-tile-description mt-1.5 text-center text-[12px] leading-5 text-codex-muted">拖拽图片到这里，或从本地选择；用于融合脸型、肤色、妆感和气质</span>
                  <span className="studio-upload-tile-action-row">
                    <button type="button" onClick={openFileDialog} className="studio-upload-tile-primary">
                      <Upload className="h-3.5 w-3.5" /> 从本地上传
                    </button>
                    <button type="button" onClick={() => toast.info("作品库选择即将接入")} className="studio-upload-tile-secondary">
                      <FolderOpen className="h-3.5 w-3.5" /> 从作品选择
                    </button>
                  </span>
                  <span className="studio-upload-tile-footnote mt-2.5 text-center text-[11px] leading-5 text-codex-faint">{MODEL_UPLOAD_RULE.uploadSpecText}</span>
                </div>
              )}
            </div>
            <div className="studio-upload-demo-row">
              <span className="studio-upload-demo-label">试一试</span>
              <div className="studio-upload-demo-list studio-scrollbar-hide">
                {MODEL_UPLOAD_RULE.demos.map((demo) => (
                  <button
                    key={demo.title}
                    type="button"
                    onClick={() => applyRuleDemo(demo)}
                    className="studio-upload-demo-thumb studio-upload-demo-thumb-multi"
                    title={demo.description}
                  >
                    {demo.imageUrls.map((url) => (
                      <span key={url} className="studio-upload-demo-cell">
                        <img src={url} alt={demo.title} />
                      </span>
                    ))}
                  </button>
                ))}
              </div>
            </div>
              </>
            )}
          </StudioUploadSection>

          <section>
            <h3 className="font-bold text-sm mb-3">模特风格</h3>
            <StyleChoiceGrid options={MODEL_SHOOT_STYLES} value={modelStyle} onChange={selectModelStyle} />
            <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
              风格只决定妆造、光线和商业气质；多图融合、肤色、脸型骨相和五官辨识度优先级更高。
            </p>
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">性别</h3>
            <StudioOptionGrid<Gender>
              options={[
                { value: "female", label: "女" },
                { value: "male", label: "男" },
              ]}
              value={gender}
              onChange={selectGender}
              columns={2}
              ariaLabel="性别"
            />
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">参考发型</h3>
            <input
              ref={hairInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const input = event.currentTarget;
                const files = Array.from(input.files || []);
                void uploadHairReference(files).finally(() => {
                  input.value = "";
                });
              }}
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
                    ? "studio-checkerboard border-purple-500 text-purple-700 ring-2 ring-purple-200 shadow-[0_14px_34px_rgba(124,58,237,0.18)]"
                    : "border-slate-200 bg-slate-50/70 text-slate-400 hover:border-purple-300 hover:bg-purple-50/60 hover:text-purple-500"
                }`}
              >
                {hairReferenceUrl ? (
                  <>
                    <img src={hairReferenceUrl} className="absolute inset-0 h-full w-full object-contain p-1" alt="上传发型参考" />
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
              onChange={(event) => {
                const input = event.currentTarget;
                const files = Array.from(input.files || []);
                void uploadHairColorReference(files).finally(() => {
                  input.value = "";
                });
              }}
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
                    ? "studio-checkerboard border-purple-500 text-purple-700 ring-2 ring-purple-200 shadow-[0_14px_34px_rgba(124,58,237,0.18)]"
                    : "border-slate-200 bg-slate-50/70 text-slate-400 hover:border-purple-300 hover:bg-purple-50/60 hover:text-purple-500"
                }`}
              >
                {hairColorReferenceUrl ? (
                  <>
                    <img src={hairColorReferenceUrl} className="absolute inset-0 h-full w-full object-contain p-1" alt="上传发色参考" />
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
            <StudioModelSelector
              models={MODELS}
              value={aiModel}
              onChange={setAiModel}
              ariaLabel="生成模型"
              getMeta={(model) => `${model.desc} · 当前${getCreditCost(model.value, imageSize, aspectRatio)}分`}
            />
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3">比例</h3>
            <StudioOptionGrid
              options={ASPECTS}
              value={aspectRatio}
              onChange={setAspectRatio}
              columns={3}
              ariaLabel="比例"
            />
          </section>

          {imageSizes.length > 1 && (
            <section>
              <h3 className="font-bold text-sm mb-3">分辨率</h3>
              <StudioOptionGrid
                options={imageSizes.map((size) => ({
                  value: size,
                  label: `${size} · ${getCreditCost(aiModel, size, aspectRatio)}积分`,
                }))}
                value={imageSize}
                onChange={setImageSize}
                ariaLabel="分辨率"
              />
            </section>
          )}

          <section>
            <StudioPromptTextarea
              title="补充要求"
              badge="可选"
              value={userExtraPrompt}
              onChange={(event) => setUserExtraPrompt(event.target.value)}
              placeholder="可选：例如希望模特表情更自然、背景偏暖色调、妆容淡雅..."
              rows={4}
              description="补充说明会附加到系统提示词中，影响最终生成效果。"
            />

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
            <StudioGenerationCountSelector
              value={genCount}
              onChange={setGenCount}
              ariaLabel="生成数量"
            />
          </section>
        </div>

        <StudioRunBar
          summary={`${referenceUrls.length} 张参考图 · ${cost} × ${genCount}`}
          costLabel={authIsAnonymous ? "登录后查看积分" : `消耗 ${totalCost} · 余额 ${credits ?? "-"}`}
          disabled={isGenerating || Boolean(runDisabledReason)}
          disabledReason={runDisabledReason}
          primaryLabel={authIsAnonymous ? "登录后生成" : isGenerating ? "生成中..." : `生成 ${genCount} 张`}
          isLoading={isGenerating}
          onPrimaryAction={() => generate()}
        />
      </div>

      <div className="studio-canvas min-h-[260px] sm:min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title="创建专属模特"
              subtitle="从人像参考中提取稳定身份，再用风格和外观设置生成可复用的品牌模特。"
              imageSrc="https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/exclusive-model-02.png"
              imageAlt="专属模特指引"
              steps={[
                { title: "上传参考人像", desc: "上传 1-3 张清晰人像，用于锁定脸型、五官和人物气质。" },
                { title: "选择外观设置", desc: "调整肤色、年龄、发型、发色、妆容和拍摄风格。" },
                { title: "生成专属模特", desc: "得到统一人物形象，后续可继续用于服装上身和商品视觉。" },
              ]}
            />
          </div>
        )}

        {(isGenerating || resultUrls.length > 0) && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            <div className="flex min-h-0 flex-1 items-start justify-start">
              <ResultImageGrid
                urls={resultUrls}
                filenamePrefix="model"
                extension="jpg"
                expectedCount={isGenerating ? genCount : undefined}
                isGenerating={isGenerating}
                inputThumbnails={activeResultMeta?.inputThumbnails.length ? activeResultMeta.inputThumbnails : taskInputThumbnails}
                createdAt={activeResultMeta?.createdAt}
                statusGroup={isGenerating ? "running" : undefined}
                variant="task"
                onOpen={setLightboxSrc}
              />
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
          <ErrorStage
            error={error}
            onRetry={() => setError("")}
            onRepair={handleRepairGenerate}
            isGenerating={isGenerating}
            repairKind="model"
          />
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
              <StudioPromptTextarea
                value={prompt}
                onChange={(e) => {
                  setPromptTouched(true);
                  setPrompt(e.target.value);
                }}
                className="studio-prompt-textarea-tall"
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
  const hairImageIndex = refCount + 1;
  const hairColorImageIndex = refCount + (hasHairReference ? 2 : 1);
  return enforceModelPromptRequirements({
    prompt: buildModelShootStylePrompt(modelStyle),
    referenceCount: refCount,
    gender,
    hairStyle,
    hairColor,
    hairReferenceIndex: hasHairReference ? hairImageIndex : null,
    hairColorReferenceIndex: hasHairColorReference ? hairColorImageIndex : null,
  });
}
