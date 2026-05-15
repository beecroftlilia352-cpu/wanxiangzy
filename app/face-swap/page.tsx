"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  RotateCcw,
  ScanFace,
  Settings2,
  Sparkles,
  UserRoundCheck,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ClientPortal } from "@/components/ClientPortal";
import { ModuleHeader } from "@/components/ModuleHeader";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import {
  FACE_SWAP_LIBRARY,
  FACE_SWAP_NOTE,
  FACE_SWAP_SAMPLE_IMAGES,
  buildFaceSwapPrompt,
  normalizeFaceSwapCount,
} from "@/lib/face-swap";
import {
  getCreditCost,
  getSupportedImageSizes,
  normalizeImageSize,
  type AspectRatio,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import {
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB,
  downloadImage,
  generateDownloadFilename,
  uploadImage,
} from "@/lib/utils";
import { createClient, getCachedProfileCredits, setCachedProfileCredits } from "@/lib/supabase/client";
import { fetchHistoryApplyDetail, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import type { TaskQueueItem } from "@/lib/task-queue";

const MODELS: Array<{ value: LingyaModel; label: string; desc: string; icon: string; badge?: string }> = [
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4分/次", icon: "/model-icons/openai.svg", badge: "最新" },
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3分/次", icon: "/model-icons/gemini.png", badge: "推荐" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4分/次", icon: "/model-icons/gemini.png", badge: "推荐" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "4K · 2分/次", icon: "/model-icons/doubao.png", badge: "新" },
];

const ASPECT_RATIOS: Array<{ value: AspectRatio; label: string }> = [
  { value: "3:4", label: "3:4 竖版" },
  { value: "4:3", label: "4:3 横版" },
  { value: "1:1", label: "1:1 方形" },
  { value: "16:9", label: "16:9 宽屏" },
  { value: "9:16", label: "9:16 手机" },
  { value: "2:3", label: "2:3" },
  { value: "3:2", label: "3:2" },
  { value: "4:5", label: "4:5" },
  { value: "5:4", label: "5:4" },
  { value: "21:9", label: "21:9" },
  { value: "auto", label: "自动" },
];

type GenerationStatus = "idle" | "running" | "completed" | "failed";
type GenderFilter = "female" | "male";
type FaceSwapHistoryPayload = Extract<HistoryJobPayload, { kind: "faceSwap" }>;
type ActiveFaceSwapJob = {
  generationId: string;
  sourceUrl: string;
  faceUrl: string;
  resultUrls: string[];
  progress: number;
  status: GenerationStatus;
  textureEnhance?: boolean;
};

export default function FaceSwapPage() {
  const router = useRouter();
  const supabase = createClient();
  const originalInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipActiveRestoreRef = useRef(false);
  const historyApplyConsumedRef = useRef(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [faceUrl, setFaceUrl] = useState("");
  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [textureEnhance, setTextureEnhance] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("female");
  const [isUploadingOriginal, setIsUploadingOriginal] = useState(false);
  const [isUploadingFace, setIsUploadingFace] = useState(false);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [generationId, setGenerationId] = useState("");
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const supportedSizes = useMemo(() => getSupportedImageSizes(aiModel, aspectRatio), [aiModel, aspectRatio]);
  const imageSizeValue = normalizeImageSize(aiModel, imageSize, aspectRatio);
  const unitCost = getCreditCost(aiModel, imageSizeValue, aspectRatio);
  const totalCost = unitCost * normalizeFaceSwapCount(genCount);
  const faceLibrary = FACE_SWAP_LIBRARY.filter((item) => item.gender === genderFilter);
  const previewSource = sourceUrl || FACE_SWAP_SAMPLE_IMAGES[0]?.url || "";
  const previewFace = faceUrl || FACE_SWAP_LIBRARY[0]?.url || "";
  const finalPrompt = buildFaceSwapPrompt(prompt, textureEnhance);
  const validationHint = !sourceUrl
    ? "请先上传或选择原始模特图"
    : !faceUrl
      ? "请选择目标脸图"
      : sourceUrl === faceUrl
        ? "原始模特图和目标脸图不能是同一张"
        : credits !== null && credits < totalCost
          ? `积分不足，生成需要 ${totalCost} 积分`
          : "";
  const canGenerate = status !== "running" && !validationHint;

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
    if (!supportedSizes.includes(imageSize)) setImageSize(supportedSizes[0] || "1K");
  }, [supportedSizes, imageSize]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const detail = await takeApplyDetail("faceSwap");
      if (cancelled || !detail) return;
      const payload = detail.payload;
      historyApplyConsumedRef.current = true;
      setSourceUrl(payload.sourceUrl);
      setFaceUrl(payload.faceUrl);
      setAiModel(payload.aiModel);
      setAspectRatio(payload.aspectRatio);
      setImageSize(payload.imageSize);
      setPrompt(payload.prompt);
      setGenCount(normalizeFaceSwapCount(payload.genCount));
      setTextureEnhance(Boolean(payload.textureEnhance));
      setResultUrls(detail.resultUrls);
      setProgress(detail.resultUrls.length ? 100 : 0);
      setStatus(detail.resultUrls.length ? "completed" : "idle");
      setGenerationId("");
      setError("");
      toast.success("已套用历史换脸参数");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const resetGenerationForInputChange = useCallback(() => {
    skipActiveRestoreRef.current = true;
    clearPolling();
    setResultUrls([]);
    setProgress(0);
    setStatus("idle");
    setGenerationId("");
    setError("");
  }, [clearPolling]);

  const applyFaceSwapHistoryPayload = useCallback((payload: FaceSwapHistoryPayload, historyResultUrls: string[] = []) => {
    clearPolling();
    historyApplyConsumedRef.current = true;
    skipActiveRestoreRef.current = true;
    setSourceUrl(payload.sourceUrl);
    setFaceUrl(payload.faceUrl);
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setPrompt(payload.prompt);
    setGenCount(normalizeFaceSwapCount(payload.genCount));
    setTextureEnhance(Boolean(payload.textureEnhance));
    setResultUrls(historyResultUrls);
    setProgress(historyResultUrls.length ? 100 : 0);
    setStatus(historyResultUrls.length ? "completed" : "idle");
    setGenerationId("");
    setError("");
    toast.success("已套用历史换脸参数");
  }, [clearPolling]);

  const pollGeneration = useCallback(async (id: string, immediate = false) => {
    clearPolling();
    const run = async () => {
      try {
        const res = await fetch(`/api/face-swap?generation_id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "查询生成进度失败");

        const nextProgress = Number.isFinite(Number(data.progress)) ? Number(data.progress) : progress;
        const nextUrls = Array.isArray(data.result_urls) ? data.result_urls : [];
        setProgress(Math.min(Math.max(Math.round(nextProgress), 0), 100));
        if (nextUrls.length) setResultUrls(nextUrls);

        if (data.status === "completed") {
          setStatus("completed");
          setProgress(100);
          setResultUrls(nextUrls);
          toast.success("AI 换脸完成");
          return;
        }

        if (data.status === "failed") {
          setStatus("failed");
          setError(data.error || "换脸生成失败");
          return;
        }

        setStatus("running");
        pollTimerRef.current = setTimeout(() => pollGeneration(id), 2200);
      } catch (err) {
        setStatus("failed");
        setError(err instanceof Error ? err.message : "查询生成进度失败");
      }
    };
    if (immediate) void run();
    else pollTimerRef.current = setTimeout(run, 2200);
  }, [clearPolling, faceUrl, progress, sourceUrl, textureEnhance]);

  useEffect(() => {
    if (!isAuthenticated || status !== "idle" || generationId || sourceUrl || faceUrl) return;
    if (skipActiveRestoreRef.current) return;
    if (historyApplyConsumedRef.current) return;
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("apply")) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/face-swap?active=1", { cache: "no-store" });
        const data = await res.json().catch(() => ({})) as { job?: ActiveFaceSwapJob | null; error?: string };
        if (!res.ok || cancelled || !data.job?.generationId) return;

        const job = data.job;
        if (
          isLegacyRemoteAssetUrl(job.sourceUrl) ||
          isLegacyRemoteAssetUrl(job.faceUrl) ||
          (job.resultUrls || []).some(isLegacyRemoteAssetUrl)
        ) {
          return;
        }

        setGenerationId(job.generationId);
        setSourceUrl(job.sourceUrl);
        setFaceUrl(job.faceUrl);
        setResultUrls(job.resultUrls || []);
        setProgress(job.progress || 0);
        setTextureEnhance(Boolean(job.textureEnhance));
        setStatus("running");
        pollGeneration(job.generationId, true);
      } catch {
        // 恢复进行中任务失败不阻断正常使用。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [faceUrl, generationId, isAuthenticated, pollGeneration, sourceUrl, status]);

  useEffect(() => () => clearPolling(), [clearPolling]);

  async function handleUpload(file: File | undefined, kind: "source" | "face") {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传 PNG / JPG / WebP 图片");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`图片不能超过 ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    const setUploading = kind === "source" ? setIsUploadingOriginal : setIsUploadingFace;
    setUploading(true);
    try {
      const uploaded = await uploadImage(file);
      if (kind === "source") setSourceUrl(uploaded.url);
      else setFaceUrl(uploaded.url);
      resetGenerationForInputChange();
      toast.success(kind === "source" ? "原始模特图已上传" : "目标脸图已上传");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败，请重试");
    } finally {
      setUploading(false);
    }
  }

  async function generate() {
    if (!isAuthenticated) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (!sourceUrl) {
      toast.error("请先上传或选择原始模特图");
      return;
    }
    if (!faceUrl) {
      toast.error("请先选择目标模特脸");
      return;
    }
    if (sourceUrl === faceUrl) {
      toast.error("原始模特图和目标脸图不能是同一张");
      return;
    }
    if (credits !== null && credits < totalCost) {
      toast.error(`积分不足，需要 ${totalCost}，当前 ${credits}`);
      return;
    }

    clearPolling();
    skipActiveRestoreRef.current = false;
    setStatus("running");
    setProgress(1);
    setResultUrls([]);
    setError("");
    window.dispatchEvent(new CustomEvent("wanxiang:task-queue-refresh"));

    try {
      const res = await fetch("/api/face-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_url: sourceUrl,
          face_url: faceUrl,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSizeValue,
          gen_count: normalizeFaceSwapCount(genCount),
          prompt,
          texture_enhance: textureEnhance,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          const nextCredits = data.balance ?? 0;
          setCredits(nextCredits);
          if (userId) setCachedProfileCredits(userId, nextCredits);
        }
        throw new Error(data.error || "提交换脸任务失败");
      }
      setGenerationId(data.generation_id);
      window.dispatchEvent(new CustomEvent("wanxiang:task-queue-refresh"));
      if (typeof data.credits_remaining === "number") {
        setCredits(data.credits_remaining);
        if (userId) setCachedProfileCredits(userId, data.credits_remaining);
      }
      pollGeneration(data.generation_id, true);
    } catch (err) {
      setStatus("failed");
      setError(err instanceof Error ? err.message : "提交换脸任务失败");
      toast.error(err instanceof Error ? err.message : "提交换脸任务失败");
    }
  }

  function clearAll() {
    skipActiveRestoreRef.current = true;
    clearPolling();
    setSourceUrl("");
    setFaceUrl("");
    setPrompt("");
    setTextureEnhance(false);
    setResultUrls([]);
    setProgress(0);
    setStatus("idle");
    setGenerationId("");
    setError("");
  }

  function handleRunningTask(item: TaskQueueItem) {
    const urls = item.resultThumbnails || [];
    const nextProgress = Number.isFinite(Number(item.progress)) ? Number(item.progress) : 8;
    clearPolling();
    setGenerationId(item.id);
    setStatus("running");
    setProgress(Math.min(Math.max(Math.round(nextProgress), 1), 99));
    setResultUrls(urls);
    setError("");
    pollGeneration(item.id, true);
  }

  async function handleCompletedTask(item: TaskQueueItem) {
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "faceSwap");
      applyFaceSwapHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : item.resultThumbnails);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "历史任务加载失败");
      return true;
    }
  }

  return (
    <div className="studio-workbench face-swap-workbench flex min-h-[calc(100dvh-64px)] flex-col lg:h-[calc(100vh-64px)] lg:flex-row">
      <FeatureTabs active="faceSwap" />
      <ModuleTaskRail
        module="faceSwap"
        moduleLabel="AI 换脸"
        onRunningTask={handleRunningTask}
        onCompletedTask={handleCompletedTask}
      />

      <aside className="studio-parameters flex w-full flex-col overflow-visible border-b lg:w-[472px] lg:overflow-hidden lg:border-b-0 lg:border-r">
        <div className="studio-parameters-scroll flex-1 space-y-4 overflow-visible p-3 sm:space-y-6 sm:p-5 lg:overflow-y-auto">
          <ModuleHeader
            title="AI 换脸"
            tooltip="上传原始模特图与目标脸图，只迁移五官身份，保留原图肤色、发型、服装、姿势和场景。"
          />

          <section className="face-swap-identity-card">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-normal text-cyan-600">Identity Transfer</p>
                <p className="mt-1 text-sm font-black text-slate-950">双图身份迁移</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">左侧锁定画面，右侧只提供五官身份。</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <MiniPreviewImage src={previewSource} alt="source preview" />
                <span className="face-swap-flow-arrow">
                  <ScanFace className="h-4 w-4" />
                </span>
                <MiniPreviewImage src={previewFace} alt="face preview" square />
              </div>
            </div>
          </section>

          <section>
            <PanelTitle title="原始模特图" />
            <StudioUploadTile
              title="上传需要处理的原图"
              description="图1作为身体、服装和构图基础，建议主体完整、画面清晰。"
              imageUrl={sourceUrl || null}
              imageAlt="已上传的原始模特图"
              loading={isUploadingOriginal}
              onUploadClick={() => originalInputRef.current?.click()}
              onPreview={sourceUrl ? () => setLightboxSrc(sourceUrl) : undefined}
              onRemove={sourceUrl ? () => {
                setSourceUrl("");
                resetGenerationForInputChange();
              } : undefined}
              onDropFile={(file) => handleUpload(file, "source")}
              uploadLabel="从本地上传"
              footnote="文件大小 20KB-15MB，分辨率大于 400×400，支持 jpg/jpeg/png/webp"
            />
            <input
              ref={originalInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const input = event.currentTarget;
                void handleUpload(input.files?.[0], "source").finally(() => {
                  input.value = "";
                });
              }}
            />
            <div className="mt-3 flex items-center gap-2">
              <span className="w-12 shrink-0 text-[11px] font-semibold leading-tight text-slate-500">示例图</span>
              <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                {FACE_SWAP_SAMPLE_IMAGES.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => {
                      setSourceUrl(sample.url);
                      resetGenerationForInputChange();
                    }}
                    className={`h-16 w-14 shrink-0 overflow-hidden rounded-xl border bg-white p-1 shadow-sm transition-all hover:border-violet-300 ${sourceUrl === sample.url ? "border-violet-500 ring-2 ring-violet-100" : "border-slate-200"}`}
                  >
                    <img src={sample.url} alt={`sample ${sample.id}`} className="h-full w-full rounded-lg object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <PanelTitle title="目标脸图" />
              <button type="button" onClick={() => setDrawerOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700">
                模特脸库 <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <StudioUploadTile
              title="上传目标脸图"
              description={faceUrl ? "已选择目标脸图，可更换、预览或删除。" : FACE_SWAP_NOTE}
              imageUrl={faceUrl || null}
              imageAlt="已上传的目标脸图"
              loading={isUploadingFace}
              onUploadClick={() => faceInputRef.current?.click()}
              onLibraryClick={() => setDrawerOpen(true)}
              onPreview={faceUrl ? () => setLightboxSrc(faceUrl) : undefined}
              onRemove={faceUrl ? () => {
                setFaceUrl("");
                resetGenerationForInputChange();
              } : undefined}
              onDropFile={(file) => handleUpload(file, "face")}
              uploadLabel="上传脸图"
              libraryLabel="选择官方脸"
              footnote="只提取五官身份，不改变原图肤色、发型、身体、服装和背景。"
            />
            <input
              ref={faceInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const input = event.currentTarget;
                void handleUpload(input.files?.[0], "face").finally(() => {
                  input.value = "";
                });
              }}
            />
          </section>

          <ControlSection title="生成模型" icon={<Sparkles className="h-4 w-4" />}>
            <div className="studio-model-grid">
              {MODELS.map((model) => (
                <button
                  key={model.value}
                  type="button"
                  onClick={() => setAiModel(model.value)}
                  className={`studio-model-card ${aiModel === model.value ? "studio-model-card-active" : ""}`}
                >
                  <span className="studio-model-card-main">
                    <span className="studio-model-icon">
                      <img src={model.icon} alt="" />
                    </span>
                    <span className="min-w-0">
                      <span className="studio-model-title-row">
                        <span className="truncate">{model.label}</span>
                        {model.badge && <span className="studio-model-badge">{model.badge}</span>}
                      </span>
                      <span className="studio-model-desc">
                        {model.desc} · 当前{getCreditCost(model.value, normalizeImageSize(model.value, imageSizeValue, aspectRatio), aspectRatio)}分
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </ControlSection>

          <ControlSection title="画面比例">
            <OptionPillGrid
              options={ASPECT_RATIOS}
              value={aspectRatio}
              onChange={(value) => setAspectRatio(value as AspectRatio)}
            />
          </ControlSection>

          <ControlSection title="分辨率">
            <OptionPillGrid
              options={supportedSizes.map((size) => ({
                value: size,
                label: `${size} · ${getCreditCost(aiModel, size, aspectRatio)}积分`,
              }))}
              value={imageSizeValue}
              onChange={(value) => setImageSize(value as ImageSize)}
            />
          </ControlSection>

          <ControlSection title="生成数量">
            <OptionPillGrid
              options={[1, 2, 3, 4].map((count) => ({ value: String(count), label: String(count) }))}
              value={String(genCount)}
              onChange={(value) => setGenCount(Number(value))}
            />
          </ControlSection>

          <ControlSection title="质感增强">
            <button
              type="button"
              onClick={() => setTextureEnhance((value) => !value)}
              className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-all ${textureEnhance ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
            >
              <span>
                <span className="block text-sm font-black">服装质感增强</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                  默认保持原图质感；开启后只强化布料纹理、印花清晰度和光影层次，不磨皮、不改表情、不移除眼镜配饰。
                </span>
              </span>
              <span className={`ml-3 flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${textureEnhance ? "bg-violet-600" : "bg-slate-200"}`}>
                <span className={`h-5 w-5 rounded-full bg-white shadow transition ${textureEnhance ? "translate-x-5" : "translate-x-0"}`} />
              </span>
            </button>
          </ControlSection>

          <details className="rounded-2xl border border-slate-100 bg-white p-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black text-slate-800">
              <Settings2 className="h-4 w-4 text-violet-500" />
              高级提示词
            </summary>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={5}
              className="mt-3 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-xs leading-relaxed outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              placeholder="可选：补充保留眼镜、雀斑、配饰、冷感表情等细节。默认模板已锁定只换五官身份，不换肤色/发型/表情/配饰。"
            />
            <div className="mt-2 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
              {finalPrompt.slice(0, 360)}...
            </div>
          </details>
        </div>

        <div className="studio-runbar sticky bottom-0 z-10 space-y-2 border-t p-3 sm:p-4 lg:static">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{genCount} 张 · {imageSizeValue} · {aspectRatio}</span>
            {isAuthenticated
              ? <span className="font-black text-amber-600">消耗 {totalCost} · 余额 {credits ?? "-"}</span>
              : <span className="text-slate-400">登录后查看积分</span>}
          </div>
          <div className="grid grid-cols-[1fr_68px] gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate}
              className="gradient-brand flex h-11 items-center justify-center gap-2 rounded-2xl text-sm font-black text-white shadow-lg shadow-violet-200 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {status === "running" ? "生成中" : !isAuthenticated ? "登录后生成" : "开始换脸"}
            </button>
            <button type="button" onClick={clearAll} className="h-11 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-violet-600 hover:border-violet-200">
              清空
            </button>
          </div>
          {validationHint && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              {validationHint}
            </p>
          )}
        </div>
      </aside>

      <main className="studio-canvas relative mt-3 mb-6 min-h-[260px] flex-1 overflow-hidden sm:min-h-[360px] lg:mt-0 lg:mb-0 lg:min-h-0">
        {status === "running" || resultUrls.length > 0 ? (
          <ResultsPanel
            urls={resultUrls}
            isGenerating={status === "running"}
            expectedCount={status === "running" ? genCount : undefined}
            onOpen={setLightboxSrc}
            onUseAsSource={(url) => {
              setSourceUrl(url);
              resetGenerationForInputChange();
              toast.success("已设为原始模特图");
            }}
            onUseAsFace={(url) => {
              setFaceUrl(url);
              resetGenerationForInputChange();
              toast.success("已设为目标脸图");
            }}
            onCopyUrl={async (url) => {
              await navigator.clipboard.writeText(url);
              toast.success("图片链接已复制");
            }}
            onRegenerate={generate}
          />
        ) : error ? (
          <div className="studio-result-stage flex min-h-[260px] items-center justify-center px-4 sm:min-h-[360px] lg:h-full">
            <div className="max-w-md rounded-2xl border border-white/80 bg-white/[0.84] p-6 text-center shadow-[0_24px_76px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                <X className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-black text-slate-950">生成失败</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{error}</p>
              <button type="button" onClick={generate} className="gradient-brand mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white hover:opacity-95">
                <RotateCcw className="h-4 w-4" /> 重新生成
              </button>
            </div>
          </div>
        ) : (
          <IntroPanel sourceUrl={previewSource} faceUrl={previewFace} />
        )}
      </main>

      {drawerOpen && (
        <ClientPortal>
          <aside className="fixed bottom-0 left-0 right-0 top-[64px] z-[230] flex flex-col border-l border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.16)] lg:left-[584px]">
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-black text-slate-950">模特脸库</h2>
                <p className="mt-1 text-xs text-slate-500">选择一张脸作为身份参考，只替换五官特征，不改变肤色和发型。</p>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4">
              {(["female", "male"] as GenderFilter[]).map((gender) => (
                <button
                  key={gender}
                  type="button"
                  onClick={() => setGenderFilter(gender)}
                  className={`rounded-xl border py-2 text-sm font-black ${genderFilter === gender ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500"}`}
                >
                  {gender === "female" ? "女模特" : "男模特"}
                </button>
              ))}
            </div>
            <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-4 pt-0 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {faceLibrary.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setFaceUrl(item.url);
                    setDrawerOpen(false);
                    resetGenerationForInputChange();
                  }}
                  className={`group relative aspect-[3/4] overflow-hidden rounded-2xl border bg-slate-50 p-1 shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-300 ${faceUrl === item.url ? "border-violet-500 ring-2 ring-violet-100" : "border-slate-200"}`}
                >
                  <img src={item.url} alt={`face ${item.id}`} className="h-full w-full rounded-xl object-cover" />
                  {faceUrl === item.url && (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white shadow">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </aside>
        </ClientPortal>
      )}

      {lightboxSrc && (
        <ClientPortal>
          <div className="fixed inset-0 z-[240] flex cursor-zoom-out items-center justify-center bg-slate-950/70 p-6 backdrop-blur-xl" onClick={() => setLightboxSrc(null)}>
            <img src={lightboxSrc} alt="result preview" className="max-h-full max-w-full rounded-3xl object-contain shadow-[0_32px_120px_rgba(0,0,0,0.5)]" />
            <button type="button" onClick={() => setLightboxSrc(null)} className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg">
              <X className="h-5 w-5" />
            </button>
          </div>
        </ClientPortal>
      )}
    </div>
  );
}

function PanelTitle({ title }: { title: string }) {
  return <h2 className="mb-3 text-sm font-black text-slate-950">{title}</h2>;
}

function ControlSection({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h3 className="face-swap-control-title">
        {icon}
        <span>{title}</span>
      </h3>
      {children}
    </section>
  );
}

function OptionPillGrid({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="studio-option-pill-grid">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`studio-option-pill ${value === option.value ? "studio-option-pill-active" : ""}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MiniPreviewImage({ src, alt, square }: { src: string; alt: string; square?: boolean }) {
  return (
    <span className={`${square ? "aspect-square" : "aspect-[3/4]"} relative block w-11 overflow-hidden rounded-xl border border-white/80 bg-cyan-50 shadow-sm`}>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-cyan-500">
        <ScanFace className="h-4 w-4" />
      </span>
      <img
        src={src}
        alt={alt}
        className="relative h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </span>
  );
}

function IntroPanel({ sourceUrl, faceUrl }: { sourceUrl: string; faceUrl: string }) {
  return (
    <div className="studio-empty-stage face-swap-empty-stage flex min-h-[260px] items-center justify-center px-4 py-6 sm:min-h-[360px] lg:h-full">
      <div className="face-swap-flow-card face-swap-intro-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-normal text-cyan-600">AI 换脸流程</p>
            <h2 className="mt-2 text-lg font-black text-slate-950">开始制作 AI 换脸图</h2>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-500">
              先锁定原始模特画面，再选择目标脸图；输出会保留原图的肤色、发型、服装、姿势和场景。
            </p>
          </div>
          <span className="face-swap-flow-arrow h-12 w-12">
            <ScanFace className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_42px_1fr] items-center gap-3">
          <DemoImage src={sourceUrl} label="Original model" />
          <span className="face-swap-flow-arrow h-10 w-10">
            <ScanFace className="h-4 w-4" />
          </span>
          <DemoImage src={faceUrl} label="Target face" square />
        </div>

        <div className="face-swap-intro-steps mt-5">
          {[
            ["1", "上传原始模特图", "决定身体、服装、背景、光线和最终构图。"],
            ["2", "选择目标脸图", "只提供五官身份，不带走发型、肤色或配饰。"],
            ["3", "开始换脸", "保持商品与场景稳定，快速得到新模特成片。"],
          ].map(([step, title, desc]) => (
            <div key={step} className="face-swap-intro-step">
              <span>{step}</span>
              <p>
                <strong>{title}</strong>
                <small>{desc}</small>
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-2 text-xs font-semibold leading-relaxed text-cyan-800">
          {FACE_SWAP_NOTE}
        </div>
      </div>
    </div>
  );
}

function DemoImage({ src, label, square }: { src: string; label: string; square?: boolean }) {
  return (
    <div className={`${square ? "aspect-square" : "aspect-[3/4]"} relative overflow-hidden rounded-2xl border border-white/80 bg-cyan-50 shadow-sm`}>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-cyan-500">
        <ScanFace className="h-8 w-8" />
      </span>
      <img
        src={src}
        alt={label}
        className="relative h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

function ResultsPanel({
  urls,
  expectedCount,
  isGenerating,
  onOpen,
  onUseAsSource,
  onUseAsFace,
  onCopyUrl,
  onRegenerate,
}: {
  urls: string[];
  expectedCount?: number;
  isGenerating: boolean;
  onOpen: (url: string) => void;
  onUseAsSource: (url: string) => void;
  onUseAsFace: (url: string) => void;
  onCopyUrl: (url: string) => void;
  onRegenerate: () => void;
}) {
  const count = Math.max(urls.length, expectedCount || 0, 1);
  const slots = Array.from({ length: count }, (_, index) => urls[index] || "");
  const gridClass = count <= 1
    ? "grid-cols-1 max-w-[min(280px,100%)]"
    : count === 2
      ? "grid-cols-1 sm:grid-cols-2 max-w-[min(572px,100%)]"
      : count === 3
        ? "grid-cols-1 sm:grid-cols-3 max-w-[min(864px,100%)]"
        : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 max-w-[min(1156px,100%)]";

  return (
    <div className="studio-result-stage h-full overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-28">
      <div className="face-swap-result-banner mx-auto mb-5 flex max-w-5xl items-center justify-between gap-3 rounded-2xl border px-4 py-3">
        <div>
          <p className="text-sm font-black text-cyan-800">{isGenerating ? "换脸生成中" : "换脸完成"}</p>
          <p className="mt-1 text-xs text-cyan-700">{urls.length}/{count} 张结果，鼠标悬停可下载、继续编辑或设为参考图。</p>
        </div>
        <button type="button" onClick={onRegenerate} disabled={isGenerating} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-violet-600 shadow-sm disabled:opacity-50">
          <RotateCcw className="h-3.5 w-3.5" /> 再来一组
        </button>
      </div>
      <div className={`mx-auto grid w-full gap-4 ${gridClass}`}>
        {slots.map((url, index) => (
          <div key={`${url || "pending"}-${index}`} className="group relative min-w-0 overflow-hidden rounded-2xl bg-white shadow-[0_22px_70px_rgba(15,23,42,0.16)] ring-1 ring-white/80 transition-transform duration-200 hover:-translate-y-0.5">
            <div className="flex aspect-[3/4] items-center justify-center bg-white">
              {url ? (
                <img src={url} alt={`face swap result ${index + 1}`} className="h-full w-full cursor-zoom-in object-contain" onClick={() => onOpen(url)} />
              ) : (
                <div className="gen-card flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-rose-50 via-violet-50 to-blue-50 text-rose-500">
                  <Sparkles className="relative z-[1] h-7 w-7 animate-pulse" />
                  <p className="relative z-[1] text-xs font-semibold text-slate-500">预计1-2分钟</p>
                </div>
              )}
            </div>
            {url && (
              <div className="absolute inset-x-3 bottom-3 flex translate-y-2 flex-wrap justify-center gap-2 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                <ActionButton icon={<Download className="h-3.5 w-3.5" />} label="下载" onClick={() => downloadImage(url, generateDownloadFilename("face-swap", index, "png"))} />
                <ActionButton icon={<Copy className="h-3.5 w-3.5" />} label="复制链接" onClick={() => onCopyUrl(url)} />
                <ActionButton icon={<Wand2 className="h-3.5 w-3.5" />} label="设为原图" onClick={() => onUseAsSource(url)} />
                <ActionButton icon={<UserRoundCheck className="h-3.5 w-3.5" />} label="设为脸图" onClick={() => onUseAsFace(url)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function isLegacyRemoteAssetUrl(url?: string) {
  return typeof url === "string" && (
    url.includes("zhiyi-image.oss-cn-hangzhou.aliyuncs.com") ||
    url.includes("aliyuncs.com/devops/comfyui")
  );
}

function ActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full bg-white/92 px-3 py-2 text-xs font-bold text-slate-700 shadow-lg ring-1 ring-slate-200/80 backdrop-blur transition hover:text-violet-600">
      {icon}
      {label}
    </button>
  );
}
