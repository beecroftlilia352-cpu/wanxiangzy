"use client";

import { FolderOpen, Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getImageVariantUrl } from "@/lib/image-variants";
import type { TryOnSourceLibraryItem } from "@/lib/tryon-source-library";

type TryOnSourceLibraryDialogProps = {
  open: boolean;
  targetLabel: string;
  items: TryOnSourceLibraryItem[];
  isLoading: boolean;
  error: string;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (item: TryOnSourceLibraryItem) => void;
};

export function TryOnSourceLibraryDialog({
  open,
  targetLabel,
  items,
  isLoading,
  error,
  onClose,
  onRefresh,
  onSelect,
}: TryOnSourceLibraryDialogProps) {
  const t = useTranslations("TryonShared");
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent
        overlayClassName="z-[210] bg-slate-950/38 backdrop-blur-xl"
        className="z-[211] flex max-h-[86dvh] w-full max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-[28px] border border-white/80 bg-white/[0.96] p-0 shadow-[0_32px_100px_rgba(15,23,42,0.22)] backdrop-blur-2xl sm:max-w-5xl"
      >
          <DialogHeader className="flex-row items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 pr-14 text-left">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--codex-accent)]">{t("sourceLibrary.eyebrow")}</p>
              <DialogTitle className="mt-1 text-base font-bold leading-normal text-slate-950">
                {t("sourceLibrary.title", { target: targetLabel })}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-slate-500">{t("sourceLibrary.description")}</DialogDescription>
            </div>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-[rgba(91,124,255,0.3)] hover:text-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2 disabled:opacity-50"
                aria-label={t("sourceLibrary.refresh")}
                title={t("sourceLibrary.refresh")}
              >
                {isLoading ? <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
              </button>
            </div>
          </DialogHeader>

          <div className="min-h-[320px] overflow-y-auto px-5 py-4">
            {error ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-red-100 bg-red-50/40 px-5 text-center">
                <p className="text-sm font-semibold text-red-600">{error}</p>
                <button
                  type="button"
                  onClick={onRefresh}
                  className="mt-4 rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  {t("sourceLibrary.retry")}
                </button>
              </div>
            ) : isLoading ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 aria-hidden="true" className="h-6 w-6 motion-safe:animate-spin" />
                <p className="text-sm">{t("sourceLibrary.loading")}</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 text-center">
                <FolderOpen aria-hidden="true" className="h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">{t("sourceLibrary.emptyTitle")}</p>
                <p className="mt-1 text-xs text-slate-400">{t("sourceLibrary.emptyDescription")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item)}
                    className="group overflow-hidden rounded-2xl border border-slate-100 bg-white text-left shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[rgba(91,124,255,0.3)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.22)] focus-visible:ring-offset-2"
                    aria-label={t("sourceLibrary.selectImage", { label: item.label })}
                  >
                    <div className="studio-checkerboard aspect-[4/5] overflow-hidden">
                      <RawPreviewImage src={getImageVariantUrl(item.url, "card")} alt={t("sourceLibrary.imageAlt", { label: item.label })} width={320} height={400} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    </div>
                    <div className="px-3 py-2">
                      <p className="truncate text-xs font-bold text-slate-800">{item.label}</p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">{item.moduleLabel}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
      </DialogContent>
    </Dialog>
  );
}
