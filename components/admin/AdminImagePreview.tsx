"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const ADMIN_IMAGE_PREVIEW_OPEN_EVENT = "admin-image-preview-open";

type AdminImagePreviewProps = {
  urls: string[];
  initialIndex?: number;
  label?: string;
  triggerClassName?: string;
  imageClassName?: string;
  countLabel?: string;
};

export function AdminImagePreview({
  urls,
  initialIndex = 0,
  label = "预览图片",
  triggerClassName = "relative h-9 w-9 overflow-hidden rounded-md border border-white bg-[var(--admin-surface-soft)] shadow-sm",
  imageClassName = "h-full w-full object-cover",
  countLabel,
}: AdminImagePreviewProps) {
  const previewId = useId();
  const images = useMemo(() => urls.map((url) => url.trim()).filter(Boolean), [urls]);
  const safeInitialIndex = Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0));
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(safeInitialIndex);
  const currentUrl = images[index] || "";
  const hasMultiple = images.length > 1;

  useEffect(() => {
    const onPreviewOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== previewId) setOpen(false);
    };
    window.addEventListener(ADMIN_IMAGE_PREVIEW_OPEN_EVENT, onPreviewOpen);
    return () => window.removeEventListener(ADMIN_IMAGE_PREVIEW_OPEN_EVENT, onPreviewOpen);
  }, [previewId]);

  useEffect(() => {
    if (!open) setIndex(safeInitialIndex);
  }, [open, safeInitialIndex]);

  if (!images.length) return null;

  const move = (direction: -1 | 1) => {
    setIndex((value) => (value + direction + images.length) % images.length);
  };

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => {
          window.dispatchEvent(new CustomEvent(ADMIN_IMAGE_PREVIEW_OPEN_EVENT, { detail: previewId }));
          setIndex(safeInitialIndex);
          setOpen(true);
        }}
        className={`${triggerClassName} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-fg)] focus-visible:ring-offset-2`}
      >
        {countLabel ? (
          <span className="flex h-full w-full items-center justify-center text-[11px] font-black text-[var(--admin-muted)]">{countLabel}</span>
        ) : (
          <RawPreviewImage src={images[safeInitialIndex]} alt="" width={48} height={48} className={imageClassName} loading="lazy" decoding="async" />
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="z-[80] bg-[var(--admin-fg)]/90 backdrop-blur-sm"
          className="z-[81] h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] place-items-center gap-0 bg-transparent p-0 text-white ring-0 shadow-none sm:max-w-[calc(100vw-2rem)]"
          onKeyDown={(event) => {
            if (!hasMultiple) return;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            }
          }}
        >
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <DialogDescription className="sr-only">
            {hasMultiple ? `图片预览，第 ${index + 1} 张，共 ${images.length} 张。可使用左右方向键切换。` : "图片预览"}
          </DialogDescription>

          <div className="absolute left-4 top-4 rounded-lg border border-white/10 bg-[var(--admin-surface)]/10 px-3 py-2 text-xs font-black tabular-nums text-white/85 shadow-lg backdrop-blur">
            {hasMultiple ? `${index + 1} / ${images.length}` : label}
          </div>

          <div className="absolute right-4 top-4 flex items-center gap-2">
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-[var(--admin-surface)]/10 px-3 text-xs font-black text-white transition-colors hover:bg-[var(--admin-surface)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
              原图
            </a>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="关闭预览"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[var(--admin-surface)]/10 text-white transition-colors hover:bg-[var(--admin-surface)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </DialogClose>
          </div>

          {hasMultiple ? (
            <>
              <button
                type="button"
                aria-label="上一张"
                onClick={() => move(-1)}
                className="absolute left-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-white/15 bg-[var(--admin-surface)]/10 text-white transition-colors hover:bg-[var(--admin-surface)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronLeft aria-hidden="true" className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="下一张"
                onClick={() => move(1)}
                className="absolute right-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-white/15 bg-[var(--admin-surface)]/10 text-white transition-colors hover:bg-[var(--admin-surface)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </button>
            </>
          ) : null}

          <RawPreviewImage src={currentUrl} alt={label} width={1600} height={1200} className="max-h-[82dvh] max-w-[92vw] rounded-lg object-contain shadow-2xl" />

          {hasMultiple ? (
            <div className="absolute bottom-4 left-1/2 flex max-w-[min(92vw,760px)] -translate-x-1/2 gap-2 overflow-x-auto rounded-xl border border-white/10 bg-[var(--admin-surface)]/10 p-2 shadow-2xl backdrop-blur [overscroll-behavior:contain]">
              {images.map((url, itemIndex) => (
                <button
                  key={`${url}-${itemIndex}`}
                  type="button"
                  aria-label={`切换到第 ${itemIndex + 1} 张`}
                  aria-current={itemIndex === index ? "true" : undefined}
                  onClick={() => setIndex(itemIndex)}
                  className={`h-12 w-12 shrink-0 overflow-hidden rounded-md border transition-[border-color,box-shadow,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    itemIndex === index ? "border-white ring-2 ring-white/70" : "border-white/20 opacity-70 hover:opacity-100"
                  }`}
                >
                  <RawPreviewImage src={url} alt="" width={48} height={48} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
