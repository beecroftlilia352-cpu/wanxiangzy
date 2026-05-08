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
  Upload,
  UserRoundCheck,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ClientPortal } from "@/components/ClientPortal";
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
    const payload = takeApplyPayload("faceSwap");
    if (!payload) return;
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
    <div className="studio-workbench flex min-h-[calc(100dvh-64px)] flex-col lg:h-[calc(100vh-64px)] lg:flex-row">
      <FeatureTabs active="faceSwap" />

      <aside className="studio-parameters flex w-full flex-col overflow-visible border-b lg:w-[472px] lg:overflow-hidden lg:border-b-0 lg:border-r">
        <div className="studio-parameters-scroll flex-1 space-y-4 overflow-visible p-3 sm:space-y-6 sm:p-5 lg:overflow-y-auto">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">AI Face Swap</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">AI 换脸</h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              替换模特面部特征，保留原图肤色、发型、身体、服装和场景。
            </p>
          </div>

          <section>
            <PanelTitle title="Original Model" />
            <UploadBox
              url={sourceUrl}
              title="Click or drag to upload"
              desc="PNG, JPG or WebP · Up to 1 file"
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
              <span className="w-12 shrink-0 text-[11px] font-semibold leading-tight text-slate-500">Sample Images</span>
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
              <PanelTitle title="Target Model" />
              <button type="button" onClick={() => setDrawerOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700">
                模特脸库 <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div
              className={`grid grid-cols-[112px_1fr_42px] items-center gap-3 rounded-2xl border p-3 transition-all ${faceUrl ? "border-violet-100 bg-violet-50/45" : "border-slate-100 bg-slate-50"}`}
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
                  <span>Click or drag<br />to upload</span>
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">{faceUrl ? "Change Model" : "Choose a model reference image"}</p>
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

          <ControlSection title="Aspect Ratio">
            <SegmentedControl
              options={ASPECT_RATIOS}
              value={aspectRatio}
              onChange={(value) => setAspectRatio(value as AspectRatio)}
            />
          </ControlSection>

          <ControlSection title="Resolution">
            <SegmentedControl
              options={supportedSizes.map((size) => ({ value: size, label: size }))}
              value={imageSizeValue}
              onChange={(value) => setImageSize(value as ImageSize)}
            />
          </ControlSection>

          <ControlSection title="Output Count">
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

        <div className="sticky bottom-0 z-10 space-y-2 border-t bg-white/85 p-4 backdrop-blur-xl lg:static">
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
              className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-violet-600 text-sm font-black text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {status === "running" ? "生成中" : !isAuthenticated ? "登录后生成" : "Generate"}
            </button>
            <button type="button" onClick={clearAll} className="h-11 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-violet-600 hover:border-violet-200">
              Clear
            </button>
          </div>
          {validationHint && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              {validationHint}
            </p>
          )}
        </div>
      </aside>

      <main className="studio-canvas min-h-[520px] flex-1 overflow-hidden">
        {status === "running" && resultUrls.length === 0 ? (
          <div className="flex h-full min-h-[520px] items-center justify-center px-5">
            <FaceSwapLoadingStage genCount={genCount} progress={progress} />
          </div>
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
          <div className="flex h-full min-h-[520px] items-center justify-center px-5">
            <div className="max-w-md rounded-3xl border border-red-100 bg-white p-6 text-center shadow-xl">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                <X className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-black text-slate-950">生成失败</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{error}</p>
              <button type="button" onClick={generate} className="mt-5 inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">
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
          <span className="mt-4 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-600">Choose from Library</span>
        </button>
      )}
    </div>
  );
}

function IntroPanel({ sourceUrl, faceUrl }: { sourceUrl: string; faceUrl: string }) {
  return (
    <div className="flex h-full min-h-[540px] items-center justify-center px-5">
      <div className="w-full max-w-4xl text-center">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-500">Face Identity Transfer</p>
        <h2 className="mt-2 text-4xl font-black tracking-tight text-slate-950">AI 换脸工作台</h2>
        <p className="mt-3 text-base text-slate-600">上传原始模特图，再选择或上传目标脸图；系统只替换五官身份，不改变肤色、发型和服装。</p>
        <div className="mx-auto mt-7 flex max-w-3xl flex-wrap items-center justify-center gap-4 rounded-3xl border border-slate-100 bg-white p-6 text-left shadow-[0_24px_90px_rgba(15,23,42,0.08)]">
          <DemoImage src={sourceUrl} label="Original model" />
          <Sparkles className="h-8 w-8 shrink-0 text-violet-500" />
          <DemoImage src={faceUrl} label="Target face" square />
          <ChevronRight className="h-8 w-8 shrink-0 text-violet-500" />
          <div className="flex aspect-[3/4] w-32 items-center justify-center rounded-3xl border border-violet-100 bg-gradient-to-br from-white via-violet-50 to-pink-50 text-violet-500 shadow-lg">
            <ScanFace className="h-9 w-9" />
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-2xl rounded-2xl bg-violet-50 px-4 py-3 text-sm leading-relaxed text-violet-700">
          注意：{FACE_SWAP_NOTE}
        </p>
      </div>
    </div>
  );
}

function DemoImage({ src, label, square }: { src: string; label: string; square?: boolean }) {
  return (
    <div className={`${square ? "aspect-square w-32" : "aspect-[3/4] w-32"} shrink-0 overflow-hidden rounded-3xl bg-slate-50 ring-1 ring-slate-100`}>
      <img src={src} alt={label} className="h-full w-full object-contain p-1" />
    </div>
  );
}

function FaceSwapLoadingStage({ genCount, progress }: { genCount: number; progress: number }) {
  const safeCount = Math.max(1, Math.min(Math.floor(genCount || 1), 4));
  const displayProgress = Math.round(Math.max(1, Math.min(progress, 99)));
  const gridClass = safeCount <= 1
    ? "grid-cols-1 max-w-[420px]"
    : safeCount === 2
      ? "grid-cols-2 max-w-[760px]"
      : "grid-cols-2 max-w-[820px]";

  return (
    <div className="w-full px-4">
      <div className="mx-auto mb-5 flex max-w-[820px] items-center justify-between rounded-2xl border border-violet-100 bg-white/82 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <span className="absolute inset-0 rounded-2xl bg-violet-400/25 animate-ping" />
            <ScanFace className="relative h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-black text-slate-900">AI 换脸处理中</p>
            <p className="text-xs text-slate-500">正在匹配五官身份、融合光影和保留原图质感</p>
          </div>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-600">{displayProgress}%</span>
      </div>

      <div className={`mx-auto grid ${gridClass} gap-4`}>
        {Array.from({ length: safeCount }).map((_, index) => (
          <div
            key={index}
            className="relative min-h-[300px] overflow-hidden rounded-3xl border border-white/80 bg-gradient-to-br from-slate-100 via-violet-50 to-pink-50 shadow-[0_24px_70px_rgba(88,28,135,0.13)]"
            style={{ aspectRatio: safeCount === 1 ? "4 / 3" : "3 / 4" }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_34%_24%,rgba(168,85,247,0.18),transparent_34%),radial-gradient(circle_at_78%_78%,rgba(236,72,153,0.14),transparent_36%)]" />
            <div className="absolute inset-0 animate-[gen-shimmer_2.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/55 to-transparent bg-[length:220%_100%]" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="relative flex h-14 w-14 items-center justify-center">
                <div className="gen-ring absolute inset-0 rounded-full bg-violet-300/45" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg">
                  <Sparkles className="gen-icon h-6 w-6 text-violet-500" />
                </div>
              </div>
              <p className="text-sm font-black text-slate-700">生成第 {index + 1} 张</p>
              <p className="text-xs text-slate-500">请稍等，完成后会自动替换到这里</p>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-slate-200/70">
              <div
                className="h-full rounded-r-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-700"
                style={{ width: `${Math.max(displayProgress, 8)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
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
  const gridClass = count <= 1 ? "grid-cols-1 max-w-2xl" : count === 2 ? "grid-cols-1 md:grid-cols-2 max-w-5xl" : "grid-cols-2 max-w-5xl";

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-7">
      <div className="mx-auto mb-5 flex max-w-5xl items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
        <div>
          <p className="text-sm font-black text-emerald-700">{isGenerating ? "换脸生成中" : "换脸完成"}</p>
          <p className="mt-1 text-xs text-emerald-600">{urls.length}/{count} 张结果，鼠标悬停可下载、继续编辑或设为参考图。</p>
        </div>
        <button type="button" onClick={onRegenerate} disabled={isGenerating} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-violet-600 shadow-sm disabled:opacity-50">
          <RotateCcw className="h-3.5 w-3.5" /> 再来一组
        </button>
      </div>
      <div className={`mx-auto grid w-full gap-4 ${gridClass}`}>
        {slots.map((url, index) => (
          <div key={`${url || "pending"}-${index}`} className="group relative overflow-hidden rounded-3xl bg-white shadow-[0_24px_80px_rgba(15,23,42,0.14)] ring-1 ring-slate-100">
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
