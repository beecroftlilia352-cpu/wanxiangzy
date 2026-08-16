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
        overlayClassName="z-[210] bg-codex-ink/38 backdrop-blur-xl"
        className="z-[211] flex max-h-[86dvh] w-full max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-3xl border border-white/80 bg-white/[0.96] p-0 shadow-[0_32px_100px_rgba(15,23,42,0.22)] backdrop-blur-2xl sm:max-w-5xl"
      >
          <DialogHeader className="flex-row items-start justify-between gap-4 border-b border-[var(--codex-border)] px-5 py-4 pr-14 text-left">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--codex-accent)]">{t("sourceLibrary.eyebrow")}</p>
              <DialogTitle className="mt-1 text-base font-bold leading-normal text-codex-ink">
                {t("sourceLibrary.title", { target: targetLabel })}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-codex-muted">{t("sourceLibrary.description")}</DialogDescription>
            </div>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--codex-border)] bg-white text-codex-muted transition-colors hover:border-[var(--codex-accent-30)] hover:text-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2 disabled:opacity-50"
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
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-codex-faint">
                <Loader2 aria-hidden="true" className="h-6 w-6 motion-safe:animate-spin" />
                <p className="text-sm">{t("sourceLibrary.loading")}</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--codex-border)] bg-[var(--codex-surface-soft)]/70 px-5 text-center">
                <FolderOpen aria-hidden="true" className="h-8 w-8 text-codex-faint" />
                <p className="mt-3 text-sm font-semibold text-codex-ink">{t("sourceLibrary.emptyTitle")}</p>
                <p className="mt-1 text-xs text-codex-faint">{t("sourceLibrary.emptyDescription")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item)}
                    className="group overflow-hidden rounded-2xl border border-[var(--codex-border)] bg-white text-left shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[var(--codex-accent-30)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent-22)] focus-visible:ring-offset-2"
                    aria-label={t("sourceLibrary.selectImage", { label: item.label })}
                  >
                    <div className="studio-checkerboard aspect-[4/5] overflow-hidden">
                      <RawPreviewImage src={getImageVariantUrl(item.url, "card")} alt={t("sourceLibrary.imageAlt", { label: item.label })} width={320} height={400} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    </div>
                    <div className="px-3 py-2">
                      <p className="truncate text-xs font-bold text-codex-ink">{item.label}</p>
                      <p className="mt-0.5 truncate text-[11px] text-codex-faint">{item.moduleLabel}</p>
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
