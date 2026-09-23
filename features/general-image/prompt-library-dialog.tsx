"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  PROMPT_LIBRARY_CONTENT_MAX_LENGTH,
  PROMPT_LIBRARY_DEFAULT_CREATION_TYPE,
  PROMPT_LIBRARY_DEFAULT_MODULE_KEY,
  PROMPT_LIBRARY_TITLE_MAX_LENGTH,
  type PromptLibraryItem,
  type PromptLibraryListResponse,
} from "@/lib/prompt-library/types";

/**
 * 共享词库弹窗 + 保存我的提示词弹窗。
 *
 * 数据来自 /api/prompt-library（scope=all 的共享词库：所有已登录用户看到同一份列表）。
 * 列表固定最大高度 + overflow-y-auto，条目过多时可滚动查看；支持关键词搜索与分页加载。
 *
 * 这两个组件是「纯新增」的独立组件，接入方式是在调用方挂载 + 传入回调，
 * 不修改任何既有组件的内部逻辑。
 */

type PromptLibraryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 点击「使用」把条目内容回填到提示词输入框 */
  onUse: (content: string) => void;
  /** 保存成功后由父组件自增该值即可让词库列表刷新出新条目 */
  refreshToken?: number;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
};

export function PromptLibraryDialog({
  open,
  onOpenChange,
  onUse,
  refreshToken = 0,
  returnFocusRef,
}: PromptLibraryDialogProps) {
  const t = useTranslations("PromptLibrary");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<PromptLibraryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pending, setPending] = useState<"idle" | "loading" | "more" | "error">("idle");
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async (options: { reset: boolean; cursor?: string | null }) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setPending(options.reset ? "loading" : "more");
    try {
      const params = new URLSearchParams({ scope: "all", limit: "30" });
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (!options.reset && options.cursor) params.set("cursor", options.cursor);

      const res = await fetch(`/api/prompt-library?${params.toString()}`, { cache: "no-store" });
      const payload = await res.json().catch(() => null) as PromptLibraryListResponse | null;
      if (!res.ok || !payload) {
        throw new Error(t("loadFailed"));
      }
      if (requestIdRef.current !== requestId) return;

      setItems((prev) => (options.reset ? payload.items : [...prev, ...payload.items]));
      setCursor(payload.nextCursor);
      setHasMore(Boolean(payload.hasMore));
      setPending("idle");
    } catch {
      if (requestIdRef.current !== requestId) return;
      setPending("error");
      if (options.reset) setItems([]);
    }
  }, [debouncedQuery, t]);

  useEffect(() => {
    if (!open) return;
    void load({ reset: true });
  }, [open, refreshToken, load]);

  const formatTime = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
    return (value: string) => {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? formatter.format(new Date(parsed)) : "-";
    };
  }, [locale]);

  const handleUse = (item: PromptLibraryItem) => {
    onUse(item.content);
    toast.success(t("useSuccess", { title: item.title }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        returnFocusRef={returnFocusRef}
        overlayClassName="z-[219] bg-slate-950/38 backdrop-blur-xl"
        className="z-[220] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-3xl border border-[rgba(91,124,255,0.22)] bg-white p-0 shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-[rgba(91,124,255,0.18)] sm:max-w-3xl"
      >
        <div className="px-5 py-4 pr-14">
          <DialogTitle className="text-base font-black leading-6 text-slate-950">{t("title")}</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-5 text-slate-500">
            {t("description")}
          </DialogDescription>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3">
          <div className="relative flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 80))}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchLabel")}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-800 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-[rgba(91,124,255,0.5)] focus:ring-2 focus:ring-[rgba(91,124,255,0.14)]"
            />
          </div>
          <button
            type="button"
            onClick={() => void load({ reset: true })}
            disabled={pending === "loading" || pending === "more"}
            className="inline-flex h-9 touch-manipulation items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none transition-[color,background-color,border-color,box-shadow] hover:text-[var(--codex-accent)] focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.4)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${pending === "loading" ? "animate-spin motion-reduce:animate-none" : ""}`} />
            {t("refresh")}
          </button>
        </div>

        {/* 固定最大高度 + overflow-y-auto：条目过多时可滚动查看 */}
        <div className="min-h-0 max-h-[min(56vh,32rem)] flex-1 overflow-y-auto px-5 pb-2 [overscroll-behavior:contain]">
          {pending === "loading" ? (
            <p className="flex items-center justify-center gap-2 py-10 text-xs font-bold text-slate-400">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              {t("loading")}
            </p>
          ) : null}

          {pending === "error" ? (
            <div className="py-10 text-center">
              <p className="text-sm font-bold text-slate-600">{t("loadFailed")}</p>
              <button
                type="button"
                onClick={() => void load({ reset: true })}
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 hover:text-[var(--codex-accent)]"
              >
                {t("retry")}
              </button>
            </div>
          ) : null}

          {pending !== "loading" && pending !== "error" && items.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-black text-slate-700">{t("emptyTitle")}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{t("emptyDescription")}</p>
            </div>
          ) : null}

          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-3 transition-[border-color,box-shadow] hover:border-[rgba(91,124,255,0.35)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-black text-slate-900" title={item.title}>
                    {item.title}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleUse(item)}
                    className="inline-flex h-7 flex-shrink-0 touch-manipulation items-center rounded-lg border border-[rgba(91,124,255,0.4)] bg-[rgba(91,124,255,0.08)] px-3 text-xs font-black text-[var(--codex-accent)] outline-none transition-colors hover:bg-[rgba(91,124,255,0.16)] focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.4)] focus-visible:ring-offset-2"
                  >
                    {t("use")}
                  </button>
                </div>
                {/* 内容过长时截断展示（hover 可看全文） */}
                <p
                  className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600"
                  title={item.content}
                >
                  {item.content}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                  <span className="min-w-0 truncate" title={item.createdByEmail || undefined}>
                    {t("creatorPrefix")}
                    {item.createdByEmail || t("creatorUnknown")}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="whitespace-nowrap">{formatTime(item.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>

          {items.length > 0 && hasMore ? (
            <div className="flex justify-center py-3">
              <button
                type="button"
                onClick={() => void load({ reset: false, cursor })}
                disabled={pending === "more"}
                className="inline-flex h-9 touch-manipulation items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 hover:text-[var(--codex-accent)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {pending === "more" ? (
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                ) : null}
                {t("loadMore")}
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
          <span className="text-[11px] font-semibold text-slate-400">
            {hasMore ? t("loadedHint", { count: items.length }) : t("allLoaded", { count: items.length })}
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 touch-manipulation items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 outline-none transition-[color,border-color] hover:text-[var(--codex-accent)] focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.4)] focus-visible:ring-offset-2"
          >
            {t("close")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type SavePromptDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前提示词输入框里的内容 */
  promptText: string;
  creationType?: string;
  moduleKey?: string;
  onSaved?: (item: PromptLibraryItem) => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
};

export function SavePromptDialog({
  open,
  onOpenChange,
  promptText,
  creationType = PROMPT_LIBRARY_DEFAULT_CREATION_TYPE,
  moduleKey = PROMPT_LIBRARY_DEFAULT_MODULE_KEY,
  onSaved,
  returnFocusRef,
}: SavePromptDialogProps) {
  const t = useTranslations("PromptLibrary");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const content = promptText.trim();
  const contentLength = content.length;
  const contentTooLong = contentLength > PROMPT_LIBRARY_CONTENT_MAX_LENGTH;
  const contentEmpty = contentLength === 0;
  const titleLength = title.trim().length;
  const titleInvalid = titleLength === 0 || titleLength > PROMPT_LIBRARY_TITLE_MAX_LENGTH;
  const canSubmit = !saving && !contentTooLong && !contentEmpty && !titleInvalid;

  useEffect(() => {
    if (!open) setTitle("");
  }, [open]);

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/prompt-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content,
          creationType,
          moduleKey,
        }),
      });
      const payload = await res.json().catch(() => null) as { prompt?: PromptLibraryItem; error?: string } | null;
      if (!res.ok || !payload?.prompt) {
        throw new Error(payload?.error || t("saveFailed"));
      }
      toast.success(t("saveSuccess"));
      onSaved?.(payload.prompt);
      setTitle("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        returnFocusRef={returnFocusRef}
        overlayClassName="z-[219] bg-slate-950/38 backdrop-blur-xl"
        className="z-[220] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-3xl border border-[rgba(91,124,255,0.22)] bg-white p-0 shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-[rgba(91,124,255,0.18)] sm:max-w-lg"
      >
        <div className="px-5 py-4 pr-14">
          <DialogTitle className="text-base font-black leading-6 text-slate-950">{t("saveTitle")}</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-5 text-slate-500">
            {t("saveDescription")}
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-5 [overscroll-behavior:contain]">
          <label className="block">
            <span className="text-xs font-black text-slate-700">{t("titleLabel")}</span>
            <input
              type="text"
              value={title}
              maxLength={PROMPT_LIBRARY_TITLE_MAX_LENGTH}
              onChange={(event) => setTitle(event.target.value.slice(0, PROMPT_LIBRARY_TITLE_MAX_LENGTH))}
              placeholder={t("titlePlaceholder")}
              aria-label={t("titleLabel")}
              className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-[rgba(91,124,255,0.5)] focus:ring-2 focus:ring-[rgba(91,124,255,0.14)]"
            />
            <span className="mt-1 block text-[11px] font-semibold text-slate-400">
              {t("titleCount", { current: titleLength, max: PROMPT_LIBRARY_TITLE_MAX_LENGTH })}
            </span>
          </label>

          <div>
            <span className="text-xs font-black text-slate-700">{t("contentLabel")}</span>
            <textarea
              readOnly
              value={content}
              rows={5}
              aria-label={t("contentLabel")}
              className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 outline-none"
            />
            <span
              className={`mt-1 block text-[11px] font-bold ${contentTooLong ? "text-[#d4380d]" : "text-slate-400"}`}
              aria-live="polite"
            >
              {t("contentCount", { current: contentLength, max: PROMPT_LIBRARY_CONTENT_MAX_LENGTH })}
            </span>
          </div>

          {contentTooLong ? (
            <p className="rounded-lg border border-[rgba(212,56,13,0.25)] bg-[rgba(212,56,13,0.06)] px-3 py-2 text-xs font-bold leading-5 text-[#d4380d]">
              {t("contentTooLongDescription", {
                current: contentLength,
                max: PROMPT_LIBRARY_CONTENT_MAX_LENGTH,
              })}
            </p>
          ) : null}

          {contentEmpty ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
              {t("contentEmpty")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 touch-manipulation items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 outline-none transition-[color,border-color] hover:text-[var(--codex-accent)] focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.4)] focus-visible:ring-offset-2"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            title={contentTooLong ? t("contentTooLongTitle") : undefined}
            className="gradient-brand inline-flex h-9 touch-manipulation items-center justify-center gap-1.5 rounded-lg px-5 text-sm font-black text-white shadow-lg shadow-slate-300/40 outline-none transition-[opacity,box-shadow] focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.5)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {saving ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            ) : null}
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
