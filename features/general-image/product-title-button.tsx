"use client";

/**
 * 「商品标题」按钮 + 弹窗（第四版：按 SHEIN 欧洲站规范产出 3 条纯英文标题 + 逐条字符数）。
 *
 * 放在结果图右侧、下载按钮正下方（由 ResultImageGrid 的 besideImageExtra 插槽渲染）：
 * 点击打开弹窗，里面可以 ① 上传最多 5 张图片（浏览器侧 canvas 压到长边 ≤1024 / jpeg 0.8）
 * ② 在一个文本框里写商品名称/商品信息 ③ 选择 deepseek 模型版本，然后点「生成」，
 * 由 /api/product-title 按「图片 + 文本框内容 + 模型」多重条件产出 **3 条**可直接上架的
 * 纯英文标题（每条 ≤250 字符）。
 *
 * 文本框默认内容 = 运营给定的整段规范原文（与 prompt.ts 的 PRODUCT_TITLE_SPEC 同源，
 * PRODUCT_TITLE_DEFAULT_DESCRIPTION），用户在后面接着写补充描述即可；发送时把文本框里的
 * 全部内容一起发出去。旁边有一个「恢复默认文案」小按钮可一键还原；用户手动清空或改写
 * 都按实际内容走，绝不强行回填。
 *
 * 关键行为：
 *  · 不再自动读取旁边的结果图，也不传任何图片参数 —— 用户点「生成」才发请求；
 *  · 关闭弹窗不丢结果、已选图片、文本框内容与模型选择，再次打开也不会自动重新请求；
 *  · 请求中可取消（AbortController）；再次点「生成」用当前条件重新生成并覆盖旧结果。
 *  · 弹窗打开期间支持**直接 Ctrl+V 粘贴图片**（截图 / 从文件夹复制的图片文件）：与点击选择、
 *    拖拽走完全同一条管道（类型校验 → 浏览器侧压缩 → 最多 5 张）；焦点在描述文本框时只让
 *    「纯图片」的粘贴被收下，带文本的粘贴一律放行给文本框；非图片内容完全忽略、不提示。
 *    监听器只在弹窗打开期间挂在 document 上，关闭即清理（不留全局监听器）。
 *  · 模型下拉在每次打开弹窗时拉取 GET /api/product-title/models；拉不到就用内置两个选项，绝不阻塞。
 *  · 结果区是 3 条英文标题（每条可选中）+ 每条下方一行中文对照（次要样式）+ 每条一个「字符数」
 *    （服务端复算）+ 单条复制按钮，顶部一个「复制全部」（3 条以换行分隔）；中文对照缺失时那一行
 *    不渲染（不留空占位）；不显示卖点角度、不显示任何分析。
 *    逐条超长或本地 lint 命中时给低对比度提示。
 *
 * 所有文案走 next-intl（命名空间 ProductTitle），组件内不硬编码中文。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Copy, ImagePlus, Loader2, RefreshCw, RotateCcw, Tags, Trash2 } from "lucide-react";
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
  readProductTitleClipboardPaste,
} from "@/lib/product-title/client";
import { PRODUCT_TITLE_DEFAULT_DESCRIPTION } from "@/lib/product-title/prompt";
import {
  PRODUCT_TITLE_DEFAULT_MODEL,
  PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH,
  PRODUCT_TITLE_FALLBACK_MODELS,
  PRODUCT_TITLE_IMAGE_DATA_URL_MAX_LENGTH,
  PRODUCT_TITLE_MAX_CHARS,
  PRODUCT_TITLE_MAX_IMAGES,
  type ProductTitleLint,
  type ProductTitleModelInfo,
  type ProductTitleModelsResponse,
  type ProductTitleResponse,
  type ProductTitleTitleItem,
} from "@/lib/product-title/types";

type RequestStatus = "idle" | "loading" | "success" | "error";
type ImageErrorKey = "" | "imageLimitReached" | "imageTooLarge" | "imageNotSupported" | "imageReadFailed";

type SelectedImage = {
  id: string;
  name: string;
  dataUrl: string;
  bytes: number;
};

/** 结果区展示用的单条标题（字符数一律用服务端复算的值；zh = 中文对照，空串表示没有）。 */
type ProductTitleResultItem = {
  title: string;
  zh: string;
  charCount: number;
  overLimit: boolean;
  lint: ProductTitleLint;
};

/** 结果区数据：3 条候选 + 是否经过重写重试。 */
type ProductTitleResult = {
  titles: ProductTitleResultItem[];
  repaired?: boolean;
};

/** 校验/归一化服务端的 titles[]：丢空项、逐条兜底，字符数用服务端值，zh 缺失按空串。 */
function readResultItems(raw: ProductTitleTitleItem[] | undefined): ProductTitleResultItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ProductTitleResultItem[] = [];
  for (const entry of raw as Array<Partial<ProductTitleTitleItem> | null | undefined>) {
    const title = typeof entry?.title === "string" ? entry.title.trim() : "";
    if (!title) continue;
    const hits = entry?.lint && Array.isArray(entry.lint.hits) ? entry.lint.hits : [];
    // 中文对照只作展示：缺失/非字符串/空串一律当没有（那一行不渲染），绝不影响标题与复制。
    const zh = typeof entry?.zh === "string" ? entry.zh.trim() : "";
    items.push({
      title,
      zh,
      // 字符数一律用服务端复算的值（模型自报的数字不可信）；缺失时才退回前端按标题长度算。
      charCount: typeof entry?.charCount === "number" && Number.isFinite(entry.charCount)
        ? entry.charCount
        : title.length,
      overLimit: entry?.overLimit === true || title.length > PRODUCT_TITLE_MAX_CHARS,
      lint: { hasForbidden: entry?.lint?.hasForbidden === true || hits.length > 0, hits },
    });
  }
  return items;
}

export type ProductTitleButtonProps = {
  className?: string;
  disabled?: boolean;
  /**
   * 文本框默认内容；不传时用 prompt.ts 的 PRODUCT_TITLE_DEFAULT_DESCRIPTION
   * （= 当前放置方式下的规范原文，与上游拼装同一个常量来源）。
   */
  defaultDescription?: string;
};

/** 内置下拉选项（模型清单拉取失败时使用，与 types.ts 的兜底清单同一份数据）。 */
function fallbackModelOptions(): ProductTitleModelInfo[] {
  return PRODUCT_TITLE_FALLBACK_MODELS.map((model) => ({ ...model, effortLevels: [...model.effortLevels] }));
}

function defaultModelId(models: readonly ProductTitleModelInfo[]): string {
  return models.find((model) => model.vision)?.id ?? models[0]?.id ?? PRODUCT_TITLE_DEFAULT_MODEL;
}

/**
 * 粘贴事件的落点是否是「可编辑控件」（描述文本框 / 任何 input / textarea / contenteditable）。
 * 是的话：带文本的剪贴板一律放行，让浏览器按原本的方式插字，绝不拦截。
 */
function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as HTMLElement;
  if (element.isContentEditable === true) return true;
  const tag = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  return tag === "INPUT" || tag === "TEXTAREA";
}

export function ProductTitleButton({ className, disabled = false, defaultDescription }: ProductTitleButtonProps) {
  const t = useTranslations("ProductTitle");
  const initialDescription = defaultDescription ?? PRODUCT_TITLE_DEFAULT_DESCRIPTION;
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<SelectedImage[]>([]);
  // 只初始化一次：用户之后清空或改写都按实际内容走，绝不强行回填默认值。
  const [description, setDescription] = useState<string>(() => initialDescription);
  const [models, setModels] = useState<ProductTitleModelInfo[]>(() => fallbackModelOptions());
  const [model, setModel] = useState<string>(PRODUCT_TITLE_DEFAULT_MODEL);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsFallback, setModelsFallback] = useState(false);
  const [imageError, setImageError] = useState<ImageErrorKey>("");
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [result, setResult] = useState<ProductTitleResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

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

  // 打开弹窗时把光标放到文本框末尾：默认值是一整段规范，用户接着往后写更顺手。
  // 用回调 ref（挂载即定位）而不是 effect，避免依赖 Portal 的挂载时机。
  const attachDescriptionNode = useCallback((node: HTMLTextAreaElement | null) => {
    descriptionRef.current = node;
    if (!node) return;
    const end = node.value.length;
    if (typeof node.setSelectionRange === "function") node.setSelectionRange(end, end);
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

  // 弹窗打开期间支持直接把图片 Ctrl+V 贴进上传区（截图、从文件夹复制的图片文件都算）。
  // · 监听器只在 open 期间挂在 document 上，关闭/卸载时立即移除 —— 不留全局监听器；
  // · 收下的文件直接交给 addFiles，走的是和「点击选择 / 拖拽」完全同一条管道
  //   （类型校验 → 浏览器侧压缩 → 最多 5 张 / 单张 2MB 上限，提示文案也完全复用）；
  // · 焦点在文本框 / 输入框（或 contenteditable）时：只要剪贴板带文本就一律放行，
  //   绝不抢文本框的正常粘贴；只有「纯图片」才拦下来当待上传图片（并阻止默认插入）；
  // · 非图片内容（纯文本 / PDF 等）完全忽略：不报错、不提示、不插队。
  useEffect(() => {
    if (!open) return;
    const handlePaste = (event: Event) => {
      const clipboardEvent = event as ClipboardEvent;
      const { imageFiles, hasText } = readProductTitleClipboardPaste(clipboardEvent.clipboardData);
      // 文本框里的正常粘贴优先：不拦截、不 preventDefault，让浏览器照常插字。
      if (hasText && isEditablePasteTarget(clipboardEvent.target)) return;
      if (!imageFiles.length) return;
      clipboardEvent.preventDefault();
      void addFiles(imageFiles);
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [open, addFiles]);

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
      const titles = readResultItems(payload.titles);
      if (!titles.length) {
        setStatus("error");
        setErrorMessage(t("loadFailed"));
        return;
      }
      setResult({ titles, repaired: payload.repaired });
      setCopiedIndex(null);
      setStatus("success");
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      if (error instanceof Error && error.name === "AbortError") {
        // 用户主动取消：不报错，保留旧结果。
        setStatus(result ? "success" : "idle");
        setErrorMessage("");
        return;
      }
      setStatus("error");
      setErrorMessage(t("networkFailed"));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [description, images, model, result, t]);

  const cancelGenerate = useCallback(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus((current) => (current === "loading" ? (result ? "success" : "idle") : current));
    setErrorMessage("");
  }, [result]);

  const copyText = useCallback(async (text: string, message: string) => {
    const ok = await writeClipboard(text);
    if (ok) toast.success(message);
    else toast.error(t("copyFailed"));
    return ok;
  }, [t]);

  /** 单条复制：只复制纯英文标题（不带字符数、不带任何中文），并短暂高亮那一行。 */
  const copyTitleAt = useCallback(async (item: ProductTitleResultItem, index: number) => {
    const ok = await copyText(item.title, t("copyIndexSuccess", { index: index + 1 }));
    if (!ok) return;
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1600);
  }, [copyText, t]);

  /** 「复制全部」：3 条以换行分隔（只复制英文标题本身）。 */
  const allTitlesText = result ? result.titles.map((item) => item.title).join("\n") : "";

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
              <p className="text-xs text-muted-foreground">{t("imagesPasteHint")}</p>
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

          {/* ② 商品名称 / 商品信息（默认已带整段规范，用户接着往后补充） */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="product-title-description">
                {t("descriptionLabel")}
              </label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                  aria-label={t("resetDescription")}
                  title={t("resetDescription")}
                  onClick={() => setDescription(PRODUCT_TITLE_DEFAULT_DESCRIPTION)}
                >
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{t("resetDescription")}</span>
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t("descriptionCounter", {
                    count: description.length,
                    max: PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH,
                  })}
                </span>
              </div>
            </div>
            <Textarea
              ref={attachDescriptionNode}
              id="product-title-description"
              value={description}
              maxLength={PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH}
              placeholder={t("descriptionPlaceholder")}
              aria-label={t("descriptionLabel")}
              className="min-h-40"
              onChange={(event) => setDescription(event.target.value.slice(0, PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH))}
            />
            <p className="text-xs text-muted-foreground">{t("descriptionHint")}</p>
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

          {status === "success" && result ? (
            <div className="flex flex-col gap-2" data-testid="product-title-results">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{t("countLabel", { count: result.titles.length })}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!allTitlesText}
                  aria-label={t("copyAll")}
                  title={t("copyAll")}
                  onClick={() => void copyText(allTitlesText, t("copyAllSuccess"))}
                >
                  <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{t("copyAll")}</span>
                </Button>
              </div>

              <ul className="flex flex-col gap-2">
                {result.titles.map((item, index) => (
                  <li
                    key={`product-title-${index}-${item.title.slice(0, 24)}`}
                    className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p
                          data-testid={`product-title-title-${index + 1}`}
                          className="select-text text-sm font-semibold leading-relaxed text-foreground break-words"
                        >
                          {item.title}
                        </p>
                        {/* 该条英文标题的中文对照（次要样式：更小字号 + 降低对比度，可选中、可换行）。
                            缺失时整行不渲染（不留空白占位）；它不参与任何合规判定，复制也不带它。 */}
                        {item.zh ? (
                          <p
                            data-testid={`product-title-zh-${index + 1}`}
                            className="mt-1 select-text text-xs leading-relaxed text-muted-foreground/90 break-words"
                          >
                            {item.zh}
                          </p>
                        ) : null}
                        <p
                          data-testid={`product-title-char-count-${index + 1}`}
                          className="mt-2 text-xs text-muted-foreground"
                        >
                          {t("charCountLabel", { count: item.charCount })}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={copiedIndex === index ? t("copied") : t("copyIndex", { index: index + 1 })}
                        title={copiedIndex === index ? t("copied") : t("copyIndex", { index: index + 1 })}
                        onClick={() => void copyTitleAt(item, index)}
                      >
                        {copiedIndex === index
                          ? <Check className="h-4 w-4" aria-hidden="true" />
                          : <Copy className="h-4 w-4" aria-hidden="true" />}
                      </Button>
                    </div>
                    {/* 该条超长 / 命中材质词·尺寸数字·禁词：只做低对比度提醒，不自动改写标题。 */}
                    {item.overLimit ? (
                      <p className="text-xs text-muted-foreground/80" role="status">
                        {t("overLimitWarning", { max: PRODUCT_TITLE_MAX_CHARS })}
                      </p>
                    ) : null}
                    {item.lint.hasForbidden ? (
                      <p className="text-xs text-muted-foreground/80" role="status">
                        {t("lintWarning")}
                        {item.lint.hits.length ? `（${item.lint.hits.join("、")}）` : ""}
                      </p>
                    ) : null}
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
