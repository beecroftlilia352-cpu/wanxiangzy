"use client";

import { useEffect, useMemo, useState } from "react";
import { ImagePlus, KeyRound, Loader2, Send, Server, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { LoadingStage } from "@/components/studio/LoadingStage";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";

const DEFAULT_API_URL = "https://yunwu.ai";
const DEFAULT_API_KEY = "";

const MODEL_OPTIONS = [
  { value: "gpt-image-2", label: "GPT-Image 2" },
  { value: "gpt-image-2-2k", label: "GPT-Image 2 2K" },
  { value: "gpt-image-2-4k", label: "GPT-Image 2 4K" },
  { value: "gpt-image-2-flatfee", label: "GPT-Image 2 Flatfee" },
  { value: "gpt-image-2-flatfee-2k", label: "GPT-Image 2 Flatfee 2K" },
  { value: "gpt-image-2-flatfee-4k", label: "GPT-Image 2 Flatfee 4K" },
  { value: "gpt-image-2-vip", label: "GPT-Image 2 VIP" },
  { value: "gpt-image-2-vip-2k", label: "GPT-Image 2 VIP 2K" },
  { value: "gpt-image-2-vip-4k", label: "GPT-Image 2 VIP 4K" },
  { value: "nano-banana-2", label: "Nano Banana 2" },
  { value: "nano-banana-2-2k", label: "Nano Banana 2 2K" },
  { value: "nano-banana-2-4k", label: "Nano Banana 2 4K" },
  { value: "nano-banana-pro", label: "Nano Banana Pro" },
  { value: "nano-banana-pro-2k", label: "Nano Banana Pro 2K" },
  { value: "nano-banana-pro-4k", label: "Nano Banana Pro 4K" },
  { value: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image" },
  { value: "gemini-3-pro-image-preview", label: "Gemini 3 Pro Image Preview" },
  { value: "gemini-3-pro-image-preview-2k", label: "Gemini 3 Pro Image Preview 2K" },
  { value: "gemini-3-pro-image-preview-4k", label: "Gemini 3 Pro Image Preview 4K" },
  { value: "gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image Preview" },
  { value: "gemini-3.1-flash-image-preview-2k", label: "Gemini 3.1 Flash Image Preview 2K" },
  { value: "gemini-3.1-flash-image-preview-4k", label: "Gemini 3.1 Flash Image Preview 4K" },
  { value: "qwen-image-edit-2509", label: "Qwen-Image-Edit-2509" },
  { value: "qwen-image-edit", label: "Qwen-Image-Edit" },
  { value: "qwen-image", label: "Qwen Image" },
  { value: "qwen-image-2.0", label: "Qwen Image 2.0" },
  { value: "qwen-image-2.0-pro", label: "Qwen Image 2.0 Pro" },
  { value: "qwen-image-plus", label: "Qwen Image Plus" },
  { value: "qwen-image-max", label: "Qwen Image Max" },
  { value: "doubao-seedream-5-0-260128", label: "Seedream 5.0" },
  { value: "doubao-seedream-4-0-250828", label: "Seedream 4.0" },
  { value: "z-image-turbo", label: "Z-Image Turbo" },
];

const ASPECT_OPTIONS = [
  { value: "3:4", label: "3:4 竖版", labelKey: "aspect.portrait" },
  { value: "4:3", label: "4:3 横版", labelKey: "aspect.landscape" },
  { value: "1:1", label: "1:1 方图", labelKey: "aspect.square" },
  { value: "9:16", label: "9:16 手机", labelKey: "aspect.phone" },
  { value: "16:9", label: "16:9 宽屏", labelKey: "aspect.widescreen" },
  { value: "2:3", label: "2:3" },
  { value: "3:2", label: "3:2" },
  { value: "4:5", label: "4:5" },
  { value: "5:4", label: "5:4" },
  { value: "21:9", label: "21:9" },
  { value: "auto", label: "智能", labelKey: "aspect.auto" },
];

const IMAGE_SIZE_OPTIONS = ["1K", "2K", "4K"] as const;
const QUALITY_OPTIONS: Array<{ value: "auto" | "low" | "medium"; label: string; labelKey: string }> = [
  { value: "auto", label: "自动", labelKey: "quality.auto" },
  { value: "low", label: "低", labelKey: "quality.low" },
  { value: "medium", label: "中", labelKey: "quality.medium" },
];

type ImageSize = typeof IMAGE_SIZE_OPTIONS[number];
type ImageQuality = typeof QUALITY_OPTIONS[number]["value"];

type InputImage = {
  id: string;
  name: string;
  dataUrl: string;
  url?: string;
  status: "uploading" | "uploaded" | "failed";
};

type TestResult = {
  ok?: boolean;
  elapsed_ms?: number;
  model?: string;
  request_body?: unknown;
  image_urls?: string[];
  b64_images?: string[];
  content?: string;
  usage?: unknown;
  raw_preview?: string;
  error?: string;
  raw?: unknown;
  status?: number;
};

export default function ApiPlatformTestPage() {
  const t = useTranslations("ApiTest");
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [model, setModel] = useState("nano-banana-2");
  const [customModel, setCustomModel] = useState("");
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [quality, setQuality] = useState<ImageQuality>("auto");
  const [prompt, setPrompt] = useState(() => t("placeholder.defaultPrompt"));
  const [inputImages, setInputImages] = useState<InputImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);

  const activeModel = customModel.trim() || model;
  const outputImages = useMemo(() => [
    ...(result?.image_urls || []),
    ...(result?.b64_images || []),
  ], [result]);

  useEffect(() => {
    if (!isLoading) return;
    setProgress(18);
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(current + Math.max(0.6, (92 - current) * 0.08), 92));
    }, 900);
    return () => window.clearInterval(timer);
  }, [isLoading]);

  async function handleImages(files?: FileList | null) {
    const selected = Array.from(files || []);
    if (selected.length === 0) return;

    const invalid = selected.find((file) => !file.type.startsWith("image/"));
    if (invalid) {
      toast.error(t("toast.selectImage"));
      return;
    }

    const tooLarge = selected.find((file) => file.size > MAX_FILE_SIZE);
    if (tooLarge) {
      toast.error(t("toast.fileTooLarge", { mb: MAX_FILE_SIZE_MB }));
      return;
    }

    const remain = Math.max(0, 6 - inputImages.length);
    const limited = selected.slice(0, remain);
    if (limited.length === 0) {
      toast.error(t("toast.maxImages"));
      return;
    }
    if (selected.length > limited.length) toast.info(t("toast.keptFirstImages"));

    const nextImages = await Promise.all(limited.map((file) => readImageFile(file)));
    setInputImages((prev) => [...prev, ...nextImages]);
    setIsUploading(true);
    toast.info(t("toast.uploading", { count: nextImages.length }));

    const uploadResults = await Promise.allSettled(limited.map((file) => uploadImage(file)));
    setInputImages((prev) => prev.map((image) => {
      const index = nextImages.findIndex((item) => item.id === image.id);
      if (index === -1) return image;
      const result = uploadResults[index];
      if (result.status === "fulfilled") {
        return { ...image, url: result.value.url, status: "uploaded" };
      }
      return { ...image, status: "failed" };
    }));
    setIsUploading(false);

    const successCount = uploadResults.filter((item) => item.status === "fulfilled").length;
    if (successCount === nextImages.length) toast.success(t("toast.uploadSuccess"));
    else toast.error(t("toast.uploadFailed", { count: nextImages.length - successCount }));
  }

  async function runTest() {
    if (!apiUrl.trim()) return toast.error(t("toast.enterApiUrl"));
    if (!apiKey.trim()) return toast.error(t("toast.enterApiKey"));
    if (!activeModel.trim()) return toast.error(t("toast.selectModel"));
    if (!prompt.trim()) return toast.error(t("toast.enterPrompt"));
    if (isUploading) return toast.error(t("toast.stillUploading"));
    if (inputImages.some((image) => image.status === "failed")) return toast.error(t("toast.removeFailedImages"));

    setIsLoading(true);
    setProgress(12);
    setResult(null);
    try {
      const res = await fetch("/api/api-platform-test/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiUrl,
          apiKey,
          model: activeModel,
          prompt,
          images: inputImages.map((image) => image.url).filter(Boolean),
          aspectRatio,
          imageSize,
          quality,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = formatTestError(data, t("format.testFailed"));
        setResult({ ...data, error: message });
        toast.error(message);
      } else if ((data.image_urls?.length || 0) + (data.b64_images?.length || 0) > 0) {
        setResult(data);
        setProgress(100);
        toast.success(t("toast.generateSuccess"));
      } else {
        setResult(data);
        toast.warning(t("toast.noImageUrl"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("format.testFailed");
      setResult({ error: msg });
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="apiTest" />
      <main className="studio-canvas min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-[calc(100vw-32px)] min-w-0 max-w-7xl gap-4 py-4 sm:w-full sm:p-4 lg:grid-cols-[460px_1fr] lg:p-6">
          <section className="studio-parameters min-w-0 rounded-2xl border p-4">
            <div className="mb-4">
              <ModuleHeader
                title={t("header.title")}
                tooltip={t("header.tooltip")}
              />
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-codex-ink">
                  <Server className="h-3.5 w-3.5 text-[var(--codex-accent)]" /> API URL
                </span>
                <input
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[var(--codex-accent-14)]"
                  placeholder="https://yunwu.ai"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-codex-ink">
                  <KeyRound className="h-3.5 w-3.5 text-[var(--codex-accent)]" /> API Key
                </span>
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  type="password"
                  className="w-full rounded-lg border px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[var(--codex-accent-14)]"
                  placeholder="sk-…"
                />
              </label>

              <div className="rounded-lg border border-[var(--codex-accent-22)] bg-[var(--codex-accent-10)] px-3 py-2 text-xs text-[var(--codex-accent)]">
                {t("field.callModeHint")}
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-codex-ink">{t("field.model")}</span>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[var(--codex-accent-14)]"
                >
                  {MODEL_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-codex-ink">{t("field.customModel")}</span>
                <input
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[var(--codex-accent-14)]"
                  placeholder={t("field.customModelPlaceholder")}
                />
              </label>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-codex-ink">{t("field.aspect")}</span>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full rounded-lg border px-2 py-2 text-xs outline-none focus:ring-2 focus:ring-[var(--codex-accent-14)]"
                  >
                    {ASPECT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{"labelKey" in item && item.labelKey ? t(item.labelKey) : item.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-codex-ink">{t("field.imageSize")}</span>
                  <select
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value as ImageSize)}
                    className="w-full rounded-lg border px-2 py-2 text-xs outline-none focus:ring-2 focus:ring-[var(--codex-accent-14)]"
                  >
                    {IMAGE_SIZE_OPTIONS.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-codex-ink">{t("field.quality")}</span>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value as ImageQuality)}
                    className="w-full rounded-lg border px-2 py-2 text-xs outline-none focus:ring-2 focus:ring-[var(--codex-accent-14)]"
                  >
                    {QUALITY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.labelKey ? t(item.labelKey) : item.label}</option>)}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-codex-ink">{t("field.prompt")}</span>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="h-28 w-full resize-y rounded-lg border px-3 py-2 text-xs leading-relaxed outline-none focus:ring-2 focus:ring-[var(--codex-accent-14)]"
                />
              </label>

              <div>
                <span className="mb-1.5 block text-xs font-bold text-codex-ink">{t("field.referenceImages")}</span>
                <label className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--codex-border)] bg-[var(--codex-surface-soft)] text-xs text-codex-muted hover:border-[var(--codex-accent-30)]">
                  <ImagePlus className="mb-2 h-6 w-6 text-codex-faint" />
                  {t("field.selectReference")}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImages(e.target.files)} />
                </label>

                {inputImages.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {inputImages.map((image) => (
                      <div key={image.id} className="relative overflow-hidden rounded-lg border bg-[var(--codex-surface-soft)]">
                        <RawPreviewImage src={image.dataUrl} className="h-24 w-full object-cover" alt={image.name} />
                        <div className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold shadow-sm ${
                          image.status === "uploaded"
                            ? "bg-emerald-50 text-emerald-600"
                            : image.status === "failed"
                              ? "bg-red-50 text-red-600"
                              : "bg-white/90 text-[var(--codex-accent)]"
                        }`}>
                          {image.status === "uploaded" ? "URL" : image.status === "failed" ? t("image.failed") : t("image.uploading")}
                        </div>
                        <button
                          type="button"
                          onClick={() => setInputImages((prev) => prev.filter((item) => item.id !== image.id))}
                          className="absolute right-1 top-1 rounded-full bg-white/90 p-1 shadow"
                          title={t("image.remove")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <p className="truncate border-t bg-white px-1.5 py-1 text-[10px] text-codex-muted" title={image.url || image.name}>
                          {image.status === "uploaded" ? image.url : image.name}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={runTest}
                disabled={isLoading || isUploading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-codex-muted to-codex-ink py-3 text-sm font-bold text-white shadow-lg shadow-[var(--codex-border)]/40 disabled:opacity-50"
              >
                {isLoading || isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isUploading ? t("button.uploading") : isLoading ? t("button.testing") : t("button.start")}
              </button>
            </div>
          </section>

          <section className="studio-glass-card min-h-[560px] min-w-0 rounded-2xl p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-codex-ink">{t("preview.title")}</h2>
                <p className="mt-1 text-xs text-codex-muted">
                  {result?.elapsed_ms
                    ? t("preview.elapsedInfo", { seconds: (result.elapsed_ms / 1000).toFixed(1), model: result.model || activeModel })
                    : t("preview.emptyHint")}
                </p>
              </div>
            </div>

            {isLoading && (
              <GenerationLoading progress={progress} model={activeModel} />
            )}

            {!isLoading && !result && outputImages.length === 0 && (
              <div className="studio-empty-stage flex min-h-[460px] items-center justify-center rounded-3xl border border-white/70 p-6 text-center shadow-inner">
                <div className="max-w-sm">
                  <div className="studio-glass-card mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-3xl">
                    <ImagePlus className="h-10 w-10 text-[var(--codex-accent)]" />
                  </div>
                  <p className="text-sm font-bold text-codex-ink">{t("preview.waitingTitle")}</p>
                  <p className="mt-2 text-xs leading-6 text-codex-muted">
                    {t("preview.waitingHint")}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] text-codex-muted">
                    <span className="rounded-full border bg-white/75 px-3 py-1">{activeModel}</span>
                    <span className="rounded-full border bg-white/75 px-3 py-1">{aspectRatio}</span>
                    <span className="rounded-full border bg-white/75 px-3 py-1">{imageSize}</span>
                  </div>
                </div>
              </div>
            )}

            {!isLoading && outputImages.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                {outputImages.map((url, index) => (
                  <a key={index} href={url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-3xl border border-white/70 bg-white/75 shadow-xl shadow-slate-200/60 transition hover:-translate-y-0.5 hover:shadow-2xl">
                    <RawPreviewImage src={url} className="h-[420px] w-full object-contain" alt={t("preview.resultAlt", { index: index + 1 })} />
                    <div className="border-t bg-white/85 px-3 py-2 text-xs font-medium text-codex-muted group-hover:text-[var(--codex-accent)]">{t("preview.openOriginal")}</div>
                  </a>
                ))}
              </div>
            )}

            {!isLoading && result?.error && (
              <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
                <p className="mb-2 font-bold">{t("preview.requestFailed", { error: result.error })}</p>
                <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap">
                  {JSON.stringify({ status: result.status, raw: result.raw, request_body: result.request_body }, null, 2)}
                </pre>
              </div>
            )}

            {!isLoading && result && !result.error && outputImages.length === 0 && (
              <pre className="max-h-[520px] overflow-auto rounded-xl border bg-[var(--codex-surface-soft)] p-3 text-xs text-codex-ink">
                {result.content || result.raw_preview || t("preview.noImageParsed")}
              </pre>
            )}

            {!isLoading && Boolean(result?.request_body) && (
              <details className="mt-4 rounded-2xl border border-white/70 bg-white/72 p-3 shadow-sm">
                <summary className="cursor-pointer text-xs font-bold text-codex-ink">{t("preview.requestBody")}</summary>
                <pre className="mt-3 max-h-64 overflow-auto text-xs text-codex-muted">{JSON.stringify(result?.request_body, null, 2)}</pre>
              </details>
            )}

            {!isLoading && result?.raw_preview && (
              <details className="mt-4 rounded-2xl border border-white/70 bg-white/72 p-3 shadow-sm">
                <summary className="cursor-pointer text-xs font-bold text-codex-ink">{t("preview.rawPreview")}</summary>
                <pre className="mt-3 max-h-64 overflow-auto text-xs text-codex-muted">{result.raw_preview}</pre>
              </details>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function readImageFile(file: File): Promise<InputImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.onload = () => resolve({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      dataUrl: String(reader.result || ""),
      status: "uploading",
    });
    reader.readAsDataURL(file);
  });
}

function GenerationLoading({ progress, model }: { progress: number; model: string }) {
  return <LoadingStage genCount={1} progress={progress} moduleName={model} />;
}

function formatTestError(result: TestResult, fallback = "Test failed") {
  const parts = [
    typeof result.status === "number" ? `HTTP ${result.status}` : "",
    result.error || "",
    extractErrorMessage(result.raw),
  ].filter(Boolean);
  return Array.from(new Set(parts)).join(" · ") || fallback;
}

function extractErrorMessage(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim().slice(0, 500);
  if (typeof value !== "object") return String(value).slice(0, 500);

  const record = value as Record<string, unknown>;
  const direct = [
    record.message,
    record.msg,
    record.detail,
    record.error_description,
  ].find((item) => typeof item === "string" && item.trim());
  if (typeof direct === "string") return direct.trim().slice(0, 500);

  const nested = record.error;
  if (typeof nested === "string") return nested.trim().slice(0, 500);
  if (nested && typeof nested === "object") {
    const nestedMessage = extractErrorMessage(nested);
    if (nestedMessage) return nestedMessage;
  }

  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return "";
  }
}
