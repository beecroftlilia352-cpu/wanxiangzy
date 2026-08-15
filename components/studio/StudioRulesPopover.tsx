"use client";

import { CheckCircle2, X, XCircle } from "lucide-react";

import { ClientPortal } from "@/components/ClientPortal";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import type { RulesPopoverPosition } from "@/hooks/use-rules-popover";

export type StudioRulesDemo = {
  key: string;
  title: string;
  description?: string;
  imageUrls: string[];
  onApply: () => void;
};

export type StudioRulesExample = {
  key: string;
  title: string;
  imageUrl: string;
};

/**
 * 上传规则气泡的共享渲染层：model/pose/grass/model-background/garment-3d
 * 此前各自内联 40-60 行 JSX，样式已漂移（grass/model-background 缺 dark 模式、
 * demo 图 aspect 不一致、关闭按钮 vs 预览徽标混用）。统一收敛到这里，
 * 配合 hooks/use-rules-popover 的状态机使用。
 */
export function StudioRulesPopover({
  open,
  style,
  width = 720,
  demoGridClassName = "md:grid-cols-5",
  examplesGridClassName = "mx-auto grid max-w-lg grid-cols-3 gap-3",
  shortTitle,
  title,
  specText,
  hoverPreviewLabel,
  tryItLabel,
  closeLabel,
  onClose,
  demos,
  examples,
  examplesTitle,
  examplesTip,
  onMouseEnter,
  onMouseLeave,
}: {
  open: boolean;
  style: RulesPopoverPosition | null;
  width?: number;
  demoGridClassName?: string;
  examplesGridClassName?: string;
  shortTitle?: string;
  title: string;
  specText?: string;
  hoverPreviewLabel?: string;
  tryItLabel: string;
  closeLabel?: string;
  onClose?: () => void;
  demos: StudioRulesDemo[];
  examples?: StudioRulesExample[];
  examplesTitle?: string;
  examplesTip?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  if (!open || !style) return null;

  return (
    <ClientPortal>
      <div
        role="region"
        aria-label={title}
        className="fixed z-[240] overflow-hidden rounded-3xl border border-white/80 dark:border-white/10 bg-white/[0.96] dark:bg-[var(--codex-surface)]/95 shadow-[0_28px_90px_rgba(15,23,42,0.18)] backdrop-blur-2xl animate-fade-in"
        style={{
          top: style.top,
          left: style.left,
          maxHeight: style.maxHeight,
          width: `min(${width}px, calc(100vw - 32px))`,
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-white/5 px-5 py-4">
          <div>
            {shortTitle ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--codex-accent)]">{shortTitle}</p>
            ) : null}
            <h3 className={`${shortTitle ? "mt-1 " : ""}text-base font-bold text-slate-950 dark:text-stone-100`}>{title}</h3>
            {specText ? <p className="mt-1 text-xs text-slate-500 dark:text-stone-400">{specText}</p> : null}
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)]"
            >
              <X className="h-4 w-4" />
            </button>
          ) : hoverPreviewLabel ? (
            <span className="rounded-full bg-[rgba(91,124,255,0.1)] px-2.5 py-1 text-[11px] font-medium text-[var(--codex-accent)]">{hoverPreviewLabel}</span>
          ) : null}
        </div>

        <div className="studio-scrollbar-hide overflow-y-auto px-5 py-4" style={{ maxHeight: style.maxHeight - 88 }}>
          <div className={`grid gap-3 ${demoGridClassName}`}>
            {demos.map((demo) => (
              <div key={demo.key} className="flex flex-col rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-white/4 p-2">
                <div className={`grid gap-1 ${demo.imageUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {demo.imageUrls.slice(0, 4).map((url) => (
                    <div key={url} className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-xl bg-white dark:bg-white/5">
                      <RawPreviewImage
                        src={url}
                        alt={demo.title}
                        className={demo.imageUrls.length > 1 ? "h-36 w-full object-cover object-top" : "aspect-[3/4] w-full object-cover"}
                      />
                      <CheckCircle2 className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white dark:bg-white/5 text-emerald-500" />
                    </div>
                  ))}
                </div>
                <p className="mt-2 line-clamp-1 text-xs font-medium text-slate-700 dark:text-stone-300">{demo.title}</p>
                {demo.description ? (
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-400 dark:text-stone-500">{demo.description}</p>
                ) : null}
                <button
                  type="button"
                  onClick={demo.onApply}
                  className="mt-auto w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-stone-300 hover:border-[rgba(91,124,255,0.3)] hover:text-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)]"
                >
                  {tryItLabel}
                </button>
              </div>
            ))}
          </div>

          {examples && examples.length > 0 ? (
            <div className="mt-5 rounded-2xl bg-red-50/40 p-3">
              {examplesTitle ? (
                <p className="mb-3 text-center text-xs font-medium text-slate-500 dark:text-stone-400">{examplesTitle}</p>
              ) : null}
              {examplesTip ? (
                <p className="mb-3 text-center text-xs font-medium text-slate-500 dark:text-stone-400">{examplesTip}</p>
              ) : null}
              <div className={examplesGridClassName}>
                {examples.map((example) => (
                  <div key={example.key} className="rounded-2xl border border-red-100 dark:border-red-400/30 bg-white/70 dark:bg-white/5 p-2 text-center">
                    <div className="relative overflow-hidden rounded-xl bg-white dark:bg-white/5">
                      <RawPreviewImage src={example.imageUrl} alt={example.title} className="aspect-square w-full object-cover" />
                      <XCircle className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white dark:bg-white/5 text-red-500" />
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-600 dark:text-stone-300">{example.title}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </ClientPortal>
  );
}
