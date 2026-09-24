"use client";

/**
 * 「商品标题」按钮 + 弹窗（纯新增组件）。
 *
 * 放置在结果图右侧、下载按钮正下方（由 ResultImageGrid 的 besideImageExtra 插槽渲染）：
 * 点击后把当前结果图交给 /api/product-title，由 DeepSeek 视觉模型看图产出
 * 3 条双语（英文 + 中文对照）跨境电商商品标题，每条可单独复制，也可一键复制全部。
 *
 * 结果保存在组件内部 state：关闭弹窗不丢结果，再次打开沿用上次结果；结果图换了才重新生成。
 * 所有文案走 next-intl（命名空间 ProductTitle），组件内不硬编码中文。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Copy, Loader2, RefreshCw, RotateCcw, Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ProductTitleCandidate, ProductTitleResponse } from "@/lib/product-title/types";

type RequestStatus = "idle" | "loading" | "success" | "error";

export type ProductTitleButtonProps = {
  /** 当前结果图地址（站内相对路径或内网绝对地址都可以）。 */
  imageUrl: string;
  className?: string;
  disabled?: boolean;
};

export function ProductTitleButton({ imageUrl, className, disabled = false }: ProductTitleButtonProps) {
  const t = useTranslations("ProductTitle");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [titles, setTitles] = useState<ProductTitleCandidate[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const requestIdRef = useRef(0);
  const imageUrlRef = useRef(imageUrl);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 结果图换了（重新生成 / 切换任务）就作废上一次的标题，避免张冠李戴。
  useEffect(() => {
    if (imageUrlRef.current === imageUrl) return;
    imageUrlRef.current = imageUrl;
    requestIdRef.current += 1;
    setStatus("idle");
    setTitles([]);
    setErrorMessage("");
    setCopiedIndex(null);
  }, [imageUrl]);

  const generate = useCallback(async () => {
    const target = imageUrl.trim();
    if (!target) {
      setStatus("error");
      setErrorMessage(t("missingImage"));
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");
    setErrorMessage("");
    try {
      const response = await fetch("/api/product-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: target }),
        cache: "no-store",
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
    } catch {
      if (requestIdRef.current !== requestId) return;
      setStatus("error");
      setErrorMessage(t("networkFailed"));
    }
  }, [imageUrl, t]);

  // 打开弹窗时若还没有结果就自动请求一次；已有结果（成功/失败）则沿用，不重复请求。
  useEffect(() => {
    if (!open || status !== "idle") return;
    void generate();
  }, [open, status, generate]);

  const copyText = useCallback(async (text: string, message: string) => {
    const ok = await writeClipboard(text);
    if (ok) toast.success(message);
    else toast.error(t("copyFailed"));
    return ok;
  }, [t]);

  const allTitlesText = titles.map((item) => `${item.en}\n${item.zh}`).join("\n\n");
  const loading = status === "loading";

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
        <DialogContent className="max-w-2xl sm:max-w-2xl" returnFocusRef={triggerRef}>
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {t("loading")}
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
                <Button type="button" variant="outline" size="sm" onClick={() => void generate()}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  <span>{t("retry")}</span>
                </Button>
              </div>
            </div>
          ) : null}

          {status === "success" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{t("countLabel", { count: titles.length })}</span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => void generate()}>
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

              <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
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
