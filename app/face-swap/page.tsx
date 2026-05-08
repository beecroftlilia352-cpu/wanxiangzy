"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  ImagePlus,
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
import { PreviewGuide } from "@/components/PreviewGuide";
import { LoadingStage } from "@/components/studio/LoadingStage";
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
import { takeApplyPayload } from "@/lib/history-apply";

const MODELS: Array<{ value: LingyaModel; label: string; desc: string }> = [
  { value: "gpt-image-2", label: "GPT Image", desc: "稳定换脸与高清质感" },
  { value: "nano-banana-2", label: "Nano Banana 2", desc: "速度较快，适合多图" },
  { value: "nano-banana-pro", label: "Nano Banana Pro", desc: "细节更强，适合精修" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "自然商业摄影" },
];

const ASPECT_RATIOS: Array<{ value: AspectRatio; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "1:1", label: "1:1" },
  { value: "3:4", label: "3:4" },
  { value: "9:16", label: "9:16" },
];

type GenerationStatus = "idle" | "running" | "completed" | "failed";
type GenderFilter = "female" | "male";
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
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
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
    const payload = await takeApplyPayload("faceSwap");
    if (cancelled || !payload) return;
    historyApplyConsumedRef.current = true;
    setSourceUrl(payload.sourceUrl);
    setFaceUrl(payload.faceUrl);
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setPrompt(payload.prompt);
    setGenCount(normalizeFaceSwapCount(payload.genCount));
    setTextureEnhance(Boolean(payload.textureEnhance));
    setResultUrls([]);
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

  return (
    <div className="studio-workbench face-swap-workbench flex min-h-[calc(100dvh-64px)] flex-col lg:h-[calc(100vh-64px)] lg:flex-row">
      <FeatureTabs active="faceSwap" />

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
            <UploadBox
              url={sourceUrl}
              title="点击或拖拽上传"
              desc="PNG、JPG 或 WebP · 单张图片"
              icon={<ImagePlus className="h-7 w-7 text-violet-500" />}
              loading={isUploadingOriginal}
              onPick={() => originalInputRef.current?.click()}
              onClear={() => {
                setSourceUrl("");
                resetGenerationForInputChange();
              }}
              onDropFile={(file) => handleUpload(file, "source")}
            />
            <input ref={originalInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0], "source")} />
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
            <div
              className={`face-swap-target-card grid grid-cols-[112px_1fr_42px] items-center gap-3 rounded-2xl border p-3 transition-all ${faceUrl ? "border-cyan-200 bg-cyan-50/45" : "border-slate-100 bg-slate-50"}`}
              onDragEnter={(event) => event.preventDefault()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleUpload(event.dataTransfer.files?.[0], "face");
              }}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => faceInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    faceInputRef.current?.click();
                  }
                }}
                className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl text-center text-xs font-semibold shadow-inner ${faceUrl ? "border border-white bg-white" : "border border-dashed border-slate-300 bg-slate-200 text-white"}`}
              >
                {faceUrl ? (
                  <>
                    <img src={faceUrl} alt="target face" className="h-full w-full object-cover" />
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        setFaceUrl("");
                        resetGenerationForInputChange();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          setFaceUrl("");
                          resetGenerationForInputChange();
                        }
                      }}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600"
                      aria-label="删除目标脸图"
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </>
                ) : isUploadingFace ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <span>点击或拖拽<br />上传脸图</span>
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">{faceUrl ? "更换目标脸图" : "选择一张目标脸参考"}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {faceUrl ? "已选择目标脸图，可更换或删除。" : FACE_SWAP_NOTE}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => faceInputRef.current?.click()} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-600">
                    上传脸图
                  </button>
                  <button type="button" onClick={() => setDrawerOpen(true)} className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700">
                    选择官方脸
                  </button>
                  {faceUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setFaceUrl("");
                        resetGenerationForInputChange();
                      }}
                      className="rounded-full border border-red-100 bg-white px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
              <button type="button" onClick={() => setDrawerOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm hover:text-violet-600">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <input ref={faceInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0], "face")} />
          </section>

          <ControlSection title="生成模型">
            <div className="grid grid-cols-2 gap-2">
              {MODELS.map((model) => (
                <button
                  key={model.value}
                  type="button"
                  onClick={() => setAiModel(model.value)}
                  className={`rounded-xl border px-3 py-2 text-left transition-all ${aiModel === model.value ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                >
                  <p className="truncate text-xs font-black">{model.label}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">{model.desc}</p>
                </button>
              ))}
            </div>
          </ControlSection>

          <ControlSection title="画面比例">
            <SegmentedControl
              options={ASPECT_RATIOS}
              value={aspectRatio}
              onChange={(value) => setAspectRatio(value as AspectRatio)}
            />
          </ControlSection>

          <ControlSection title="分辨率">
            <SegmentedControl
              options={supportedSizes.map((size) => ({ value: size, label: size }))}
              value={imageSizeValue}
              onChange={(value) => setImageSize(value as ImageSize)}
            />
          </ControlSection>

          <ControlSection title="生成数量">
            <SegmentedControl
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
        {status === "running" && resultUrls.length === 0 ? (
          <LoadingStage genCount={genCount} progress={progress} moduleName="AI 换脸" />
        ) : resultUrls.length > 0 ? (
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
  return <h2 className="mb-3 text-base font-black text-slate-950">{title}</h2>;
}

function ControlSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-black text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`h-10 rounded-xl border text-sm font-bold transition-all ${value === option.value ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function UploadBox({
  url,
  title,
  desc,
  icon,
  loading,
  onPick,
  onClear,
  onDropFile,
}: {
  url: string;
  title: string;
  desc: string;
  icon: ReactNode;
  loading: boolean;
  onPick: () => void;
  onClear: () => void;
  onDropFile: (file?: File) => void;
}) {
  return (
    <div
      onDragEnter={(event) => event.preventDefault()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDropFile(event.dataTransfer.files?.[0]);
      }}
      className="relative overflow-hidden rounded-2xl border border-dashed border-violet-200 bg-white"
    >
      {url ? (
        <div className="group relative h-[278px] bg-slate-50">
          <img src={url} alt="original model" className="h-full w-full object-contain p-3" />
          <button type="button" onClick={onClear} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 opacity-0 shadow transition group-hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={onPick} className="flex min-h-[278px] w-full flex-col items-center justify-center px-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100">
            {loading ? <Loader2 className="h-6 w-6 animate-spin text-violet-500" /> : icon}
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-700">{title}</p>
          <p className="mt-1 text-xs text-slate-400">{desc}</p>
          <span className="mt-4 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-600">选择图片</span>
        </button>
      )}
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
    <div className="studio-empty-stage flex min-h-[260px] items-center justify-center px-4 py-6 sm:min-h-[360px] lg:h-full">
      <div className="grid w-full max-w-5xl items-center gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <PreviewGuide
          title="开始制作 AI 换脸图"
          subtitle="先锁定原始模特画面，再选择目标脸图；输出会保留原图肤色、发型、服装和镜头。"
          icon={<ScanFace className="h-10 w-10 text-cyan-500" />}
          steps={[
            { title: "上传原始模特图", desc: "这张图决定身体、服装、背景、光线和最终构图。" },
            { title: "选择目标脸图", desc: "目标图只作为五官身份参考，不带走发型、肤色或配饰。" },
            { title: "生成换脸结果", desc: "适合快速替换模特身份，同时保持商品图和场景稳定。" },
          ]}
        />

        <div className="face-swap-flow-card">
          <p className="text-[11px] font-black uppercase tracking-normal text-cyan-600">Face Swap Signature</p>
          <div className="mt-4 grid grid-cols-[1fr_44px_1fr] items-center gap-3">
            <DemoImage src={sourceUrl} label="Original model" />
            <span className="face-swap-flow-arrow h-11 w-11">
              <ScanFace className="h-5 w-5" />
            </span>
            <DemoImage src={faceUrl} label="Target face" square />
          </div>
          <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-2 text-xs font-semibold leading-relaxed text-cyan-800">
            {FACE_SWAP_NOTE}
          </div>
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
  const gridClass = count <= 1 ? "grid-cols-1 max-w-[min(760px,100%)]" : count === 2 ? "grid-cols-1 md:grid-cols-2 max-w-[min(1120px,100%)]" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 max-w-[min(1180px,100%)]";

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
            <div className="flex h-[min(58dvh,720px)] min-h-[300px] items-center justify-center bg-slate-50">
              {url ? (
                <img src={url} alt={`face swap result ${index + 1}`} className="h-full w-full cursor-zoom-in object-contain" onClick={() => onOpen(url)} />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-violet-50 to-pink-50 text-violet-500">
                  <Sparkles className="h-7 w-7 animate-pulse" />
                  <p className="mt-3 text-xs font-semibold text-slate-500">等待第 {index + 1} 张</p>
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
