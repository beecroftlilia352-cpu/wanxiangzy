"use client";

/**
 * 「商品标题」按钮 + 弹窗（第二版：由用户给出条件，点「生成」才请求）。
 *
 * 放在结果图右侧、下载按钮正下方（由 ResultImageGrid 的 besideImageExtra 插槽渲染）：
 * 点击打开弹窗，里面可以 ① 上传最多 5 张图片（浏览器侧 canvas 压到长边 ≤1024 / jpeg 0.8）
 * ② 填写文字描述 ③ 选择 deepseek 模型版本，然后点「生成」，由 /api/product-title 按
 * 「图片 + 描述 + 模型」多重条件产出 3 条双语（英文 + 中文对照 + 卖点角度）标题，可逐条复制。
 *
 * 关键行为：
 *  · 不再自动读取旁边的结果图，也不传任何图片参数 —— 用户点「生成」才发请求；
 *  · 关闭弹窗不丢结果、已选图片、描述与模型选择，再次打开也不会自动重新请求；
 *  · 请求中可取消（AbortController）；再次点「生成」用当前条件重新生成并覆盖旧结果。
 *  · 模型下拉在每次打开弹窗时拉取 GET /api/product-title/models；拉不到就用内置两个选项，绝不阻塞。
 *
 * 所有文案走 next-intl（命名空间 ProductTitle），组件内不硬编码中文。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Copy, ImagePlus, Loader2, RefreshCw, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  compressProductTitleFile,
  estimateProductTitleDataUrlBytes,
  isSupportedProductTitleImageFile,
} from "@/lib/product-title/client";
import {
  PRODUCT_TITLE_DEFAULT_MODEL,
  PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH,
  PRODUCT_TITLE_FALLBACK_MODELS,
  PRODUCT_TITLE_IMAGE_DATA_URL_MAX_LENGTH,
  PRODUCT_TITLE_MAX_IMAGES,
  type ProductTitleCandidate,
  type ProductTitleModelInfo,
  type ProductTitleModelsResponse,
  type ProductTitleResponse,
} from "@/lib/product-title/types";

type RequestStatus = "idle" | "loading" | "success" | "error";
type ImageErrorKey = "" | "imageLimitReached" | "imageTooLarge" | "imageNotSupported" | "imageReadFailed";

type SelectedImage = {
  id: string;
  name: string;
  dataUrl: string;
  bytes: number;
};

export type ProductTitleButtonProps = {
  className?: string;
  disabled?: boolean;
};

/** 内置下拉选项（模型清单拉取失败时使用，与 types.ts 的兜底清单同一份数据）。 */
function fallbackModelOptions(): ProductTitleModelInfo[] {
  return PRODUCT_TITLE_FALLBACK_MODELS.map((model) => ({ ...model, effortLevels: [...model.effortLevels] }));
}

function defaultModelId(models: readonly ProductTitleModelInfo[]): string {
  return models.find((model) => model.vision)?.id ?? models[0]?.id ?? PRODUCT_TITLE_DEFAULT_MODEL;
}

export function ProductTitleButton({ className, disabled = false }: ProductTitleButtonProps) {
  const t = useTranslations("ProductTitle");
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [description, setDescription] = useState("");
  const [models, setModels] = useState<ProductTitleModelInfo[]>(() => fallbackModelOptions());
  const [model, setModel] = useState<string>(PRODUCT_TITLE_DEFAULT_MODEL);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsFallback, setModelsFallback] = useState(false);
  const [imageError, setImageError] = useState<ImageErrorKey>("");
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [titles, setTitles] = useState<ProductTitleCandidate[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmedDescription = description.trim();
  const hasInput = images.length > 0 || trimmedDescription.length > 0;
  const loading = status === "loading";
  const selectedModel = models.find((item) => item.id === model);
  const visionSupported = selectedModel?.vision === true;

  // 打开弹窗时拉一次模型清单（拉不到就用内置两个选项，绝不阻塞使用）。
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    setModelsLoading(true);
    void (async () => {
      const apply = (list: ProductTitleModelInfo[], isFallback: boolean) => {
        if (!active) return;
        setModels(list);
        setModelsFallback(isFallback);
        setModel((current) => (list.some((item) => item.id === current) ? current : defaultModelId(list)));
      };
      try {
        const response = await fetch("/api/product-title/models", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as ProductTitleModelsResponse | null;
        if (!active) return;
        if (!response.ok || !payload || payload.ok !== true || !Array.isArray(payload.models) || !payload.models.length) {
          apply(fallbackModelOptions(), true);
          return;
        }
        apply(payload.models, payload.fallback === true);
      } catch (error) {
        if (!active) return;
        if (error instanceof Error && error.name === "AbortError") return;
        apply(fallbackModelOptions(), true);
      } finally {
        if (active) setModelsLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [open]);

  // 卸载时中止在途请求（弹窗开关不算卸载，结果与已选条件都保留）。
  useEffect(() => () => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const addFiles = useCallback(async (fileList: FileList | File[] | null | undefined) => {
    const files = fileList ? Array.from(fileList as ArrayLike<File>) : [];
    if (!files.length) return;

    setImageError("");
    let room = PRODUCT_TITLE_MAX_IMAGES - images.length;
    if (room <= 0) {
      setImageError("imageLimitReached");
      return;
    }

    const accepted: SelectedImage[] = [];
    let limitRejected = false;
    let sizeRejected = false;
    let typeRejected = false;
    let readFailed = false;

    for (const file of files) {
      if (room <= 0) {
        limitRejected = true;
        break;
      }
      if (!isSupportedProductTitleImageFile(file)) {
        typeRejected = true;
        continue;
      }
      try {
        const compressed = await compressProductTitleFile(file);
        const bytes = compressed.bytes || estimateProductTitleDataUrlBytes(compressed.dataUrl);
        if (bytes > PRODUCT_TITLE_IMAGE_DATA_URL_MAX_LENGTH || compressed.dataUrl.length > PRODUCT_TITLE_IMAGE_DATA_URL_MAX_LENGTH) {
          sizeRejected = true;
          continue;
        }
        accepted.push({
          id: `product-title-image-${Date.now()}-${accepted.length}-${file.name}`,
          name: file.name,
          dataUrl: compressed.dataUrl,
          bytes,
        });
        room -= 1;
      } catch {
        readFailed = true;
      }
    }

    if (accepted.length) {
      setImages((current) => [...current, ...accepted].slice(0, PRODUCT_TITLE_MAX_IMAGES));
    }
    if (limitRejected) setImageError("imageLimitReached");
    else if (sizeRejected) setImageError("imageTooLarge");
    else if (typeRejected) setImageError("imageNotSupported");
    else if (readFailed) setImageError("imageReadFailed");
  }, [images.length]);

  const removeImage = useCallback((id: string) => {
    setImages((current) => current.filter((item) => item.id !== id));
    setImageError("");
  }, []);

  const generate = useCallback(async () => {
    const targetDescription = description.trim();
    if (!images.length && !targetDescription) {
      setStatus("error");
      setErrorMessage(t("needInput"));
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setErrorMessage("");
    try {
      const response = await fetch("/api/product-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          images: images.map((item) => item.dataUrl),
          description: targetDescription,
          model,
        }),
      });
      const payload = (await response.json().catch(() => null)) as ProductTitleResponse | null;
      if (requestIdRef.current !== requestId) return;
      if (!response.ok || !payload || payload.ok !== true) {
        setStatus("error");
        setErrorMessage(payload && payload.ok === false && payload.error ? payload.error : t("loadFailed"));
        return;
      }
      setTitles(payload.titles);
      setCopiedIndex(null);
      setStatus("success");
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      if (error instanceof Error && error.name === "AbortError") {
        // 用户主动取消：不报错，保留旧结果。
        setStatus(titles.length ? "success" : "idle");
        setErrorMessage("");
        return;
      }
      setStatus("error");
      setErrorMessage(t("networkFailed"));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [description, images, model, t, titles.length]);

  const cancelGenerate = useCallback(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus((current) => (current === "loading" ? (titles.length ? "success" : "idle") : current));
    setErrorMessage("");
  }, [titles.length]);

  const copyText = useCallback(async (text: string, message: string) => {
    const ok = await writeClipboard(text);
    if (ok) toast.success(message);
    else toast.error(t("copyFailed"));
    return ok;
  }, [t]);

  const allTitlesText = titles.map((item) => `${item.en}\n${item.zh}`).join("\n\n");

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        aria-label={t("button")}
        title={t("button")}
        className={cn(
          "studio-result-primary-download studio-result-beside-download w-full",
          className,
        )}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {loading
          ? <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          : <Tags className="h-4 w-4 shrink-0" aria-hidden="true" />}
        <span>{t("button")}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[85vh] max-w-2xl overflow-y-auto sm:max-w-2xl"
          returnFocusRef={triggerRef}
        >
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescriptionInput")}</DialogDescription>
          </DialogHeader>

          {/* ① 图片上传（最多 5 张） */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{t("imagesLabel")}</span>
              <span className="text-xs text-muted-foreground">
                {t("imagesCount", { count: images.length, max: PRODUCT_TITLE_MAX_IMAGES })}
              </span>
            </div>
            <div
              data-testid="product-title-dropzone"
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 p-3 text-center",
                dragActive ? "border-primary bg-muted/60" : "bg-card/40",
              )}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                void addFiles(event.dataTransfer?.files ?? null);
              }}
            >
              <p className="text-xs text-muted-foreground">{t("imagesDropHint")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={images.length >= PRODUCT_TITLE_MAX_IMAGES}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
                <span>{t("addImages")}</span>
              </Button>
              <input
                ref={fileInputRef}
                data-testid="product-title-file-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("imagesHint", { max: PRODUCT_TITLE_MAX_IMAGES })}</p>
            {imageError ? (
              <p className="flex items-start gap-2 text-xs text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{t(imageError, { max: PRODUCT_TITLE_MAX_IMAGES })}</span>
              </p>
            ) : null}

            {images.length ? (
              <ul className="flex flex-wrap gap-2">
                {images.map((item, index) => (
                  <li
                    key={item.id}
                    className="relative h-20 w-20 overflow-hidden rounded-lg border border-border/60 bg-muted"
                  >
                    {/* data URL 缩略图：next/image 不支持 data URL，这里用原生 img */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.dataUrl} alt={item.name} className="h-full w-full object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={t("removeImage")}
                      title={t("removeImage")}
                      className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white hover:bg-black/80"
                      onClick={() => removeImage(item.id)}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* ② 文字描述 */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="product-title-description">
                {t("descriptionLabel")}
              </label>
              <span className="text-xs text-muted-foreground">
                {t("descriptionCounter", {
                  count: description.length,
                  max: PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH,
                })}
              </span>
            </div>
            <Textarea
              id="product-title-description"
              value={description}
              maxLength={PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH}
              placeholder={t("descriptionPlaceholder")}
              aria-label={t("descriptionLabel")}
              className="min-h-20"
              onChange={(event) => setDescription(event.target.value.slice(0, PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH))}
            />
          </section>

          {/* ③ 模型版本 */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="product-title-model">
                {t("modelLabel")}
              </label>
              {modelsLoading ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  {t("modelLoading")}
                </span>
              ) : null}
            </div>
            <NativeSelect
              id="product-title-model"
              data-testid="product-title-model-select"
              value={model}
              aria-label={t("modelLabel")}
              onChange={(event) => setModel(event.target.value)}
            >
              {models.map((item) => (
                <option key={item.id} value={item.id}>
                  {`${item.name}（${item.vision ? t("modelVisionTag") : t("modelTextOnlyTag")}）`}
                </option>
              ))}
            </NativeSelect>
            {modelsFallback ? (
              <p className="text-xs text-muted-foreground">{t("modelFallbackNote")}</p>
            ) : null}
            {!visionSupported ? (
              <p className="text-xs text-amber-600 dark:text-amber-500">{t("textOnlyHint")}</p>
            ) : null}
          </section>

          {/* ④ 生成 / 取消 */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!hasInput || loading}
              onClick={() => void generate()}
            >
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                : <Tags className="h-4 w-4" aria-hidden="true" />}
              <span>{loading ? t("generating") : t("generate")}</span>
            </Button>
            {loading ? (
              <Button type="button" variant="outline" size="sm" onClick={cancelGenerate}>
                <span>{t("cancel")}</span>
              </Button>
            ) : null}
            <span className="text-xs text-muted-foreground">{t("inputHint")}</span>
          </div>

          {loading ? (
            <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {t("loadingGeneric")}
              </p>
              {[0, 1, 2].map((index) => (
                <div key={`product-title-skeleton-${index}`} className="space-y-2 rounded-lg border border-border/60 p-3">
                  <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">{t("loadingHint")}</p>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="flex flex-col gap-3" role="alert">
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorMessage || t("loadFailed")}</span>
              </p>
              <div>
                <Button type="button" variant="outline" size="sm" disabled={!hasInput} onClick={() => void generate()}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span>{t("retry")}</span>
                </Button>
              </div>
            </div>
          ) : null}

          {status === "success" && titles.length ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{t("countLabel", { count: titles.length })}</span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" disabled={!hasInput} onClick={() => void generate()}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    <span>{t("regenerate")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!allTitlesText}
                    onClick={() => void copyText(allTitlesText, t("copyAllSuccess"))}
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    <span>{t("copyAll")}</span>
                  </Button>
                </div>
              </div>

              <ul className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto pr-1">
                {titles.map((item, index) => (
                  <li
                    key={`product-title-${index}-${item.en.slice(0, 24)}`}
                    className="rounded-lg border border-border/60 bg-card/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-relaxed text-foreground break-words">{item.en}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground break-words">{item.zh}</p>
                        {item.angle ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/70">{t("angleLabel")}：</span>
                            {item.angle}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t("copy")}
                        title={t("copy")}
                        onClick={() => void copyText(`${item.en}\n${item.zh}`, t("copySuccess")).then((ok) => {
                          if (ok) {
                            setCopiedIndex(index);
                            setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1600);
                          }
                        })}
                      >
                        {copiedIndex === index
                          ? <Check className="h-4 w-4" aria-hidden="true" />
                          : <Copy className="h-4 w-4" aria-hidden="true" />}
                        <span>{copiedIndex === index ? t("copied") : t("copy")}</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{t("aiDisclaimer")}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 复制到剪贴板：优先 navigator.clipboard，失败时降级到临时 textarea + execCommand。 */
async function writeClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续走降级方案
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
