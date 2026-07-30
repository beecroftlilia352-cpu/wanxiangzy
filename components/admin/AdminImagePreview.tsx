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
  strip?: boolean;
};

export function AdminImagePreview({
  urls,
  initialIndex = 0,
  label = "预览图片",
  triggerClassName = "relative h-9 w-9 overflow-hidden rounded-md border border-white bg-[var(--admin-surface-soft)] shadow-sm",
  imageClassName = "h-full w-full object-cover",
  countLabel,
  strip = false,
}: AdminImagePreviewProps) {
  const previewId = useId();
  const images = useMemo(() => urls.map((url) => url.trim()).filter(Boolean), [urls]);
  const safeInitialIndex = Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0));
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(safeInitialIndex);
  const currentUrl = images[index] || "";
  const hasMultiple = images.length > 1;
  const visibleCount = images.length > 4 ? 3 : Math.min(images.length, 4);
  const visibleImages = images.slice(0, visibleCount);
  const remaining = images.length - visibleImages.length;

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

  const openAt = (nextIndex: number) => {
    window.dispatchEvent(new CustomEvent(ADMIN_IMAGE_PREVIEW_OPEN_EVENT, { detail: previewId }));
    setIndex(nextIndex);
    setOpen(true);
  };

  return (
    <>
      {strip ? (
        <div className="admin-task-thumb-strip" aria-label={`${label} ${images.length} 张`}>
          {visibleImages.map((url, itemIndex) => (
            <button
              key={`${url}-${itemIndex}`}
              type="button"
              aria-label={`${label} ${itemIndex + 1}/${images.length}`}
              title={`${label} ${itemIndex + 1}/${images.length}`}
              onClick={() => openAt(itemIndex)}
              className="admin-task-thumb-trigger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-fg)] focus-visible:ring-offset-2"
            >
              <RawPreviewImage src={url} alt="" width={48} height={48} className={imageClassName} loading="lazy" decoding="async" />
            </button>
          ))}
          {remaining > 0 ? (
            <button
              type="button"
              aria-label={`预览更多${label}`}
              title={`预览更多${label}`}
              onClick={() => openAt(visibleImages.length)}
              className="admin-task-thumb-more-trigger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-fg)] focus-visible:ring-offset-2"
            >
              <span className="flex h-full w-full items-center justify-center text-[11px] font-black text-[var(--admin-muted)]">+{remaining}</span>
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={() => openAt(safeInitialIndex)}
          className={`${triggerClassName} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-fg)] focus-visible:ring-offset-2`}
        >
          {countLabel ? (
            <span className="flex h-full w-full items-center justify-center text-[11px] font-black text-[var(--admin-muted)]">{countLabel}</span>
          ) : (
            <RawPreviewImage src={images[safeInitialIndex]} alt="" width={48} height={48} className={imageClassName} loading="lazy" decoding="async" />
          )}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="z-[80] bg-[var(--admin-fg)]/90 backdrop-blur-sm"
          className="z-[81] h-dvh max-h-dvh w-screen max-w-none place-items-center gap-0 overflow-hidden bg-transparent p-0 text-white ring-0 shadow-none sm:max-w-none [overscroll-behavior:contain]"
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

          <div className="absolute left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] z-20 rounded-md border border-white/15 bg-black/55 px-3 py-2 text-xs font-black tabular-nums text-white shadow-lg backdrop-blur-md">
            {hasMultiple ? `${index + 1} / ${images.length}` : label}
          </div>

          <div className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-20 flex items-center gap-2">
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden h-10 items-center gap-2 rounded-md border border-white/20 bg-black/55 px-3 text-xs font-black text-white transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:inline-flex"
            >
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
              原图
            </a>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="关闭预览"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/20 bg-black/65 text-white shadow-lg transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
                className="absolute left-[max(.75rem,env(safe-area-inset-left))] top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md border border-white/20 bg-black/60 text-white shadow-lg transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-6"
              >
                <ChevronLeft aria-hidden="true" className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="下一张"
                onClick={() => move(1)}
                className="absolute right-[max(.75rem,env(safe-area-inset-right))] top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md border border-white/20 bg-black/60 text-white shadow-lg transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6"
              >
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </button>
            </>
          ) : null}

          <RawPreviewImage src={currentUrl} alt={label} width={1600} height={1200} className="max-h-[calc(100dvh-8rem)] max-w-[calc(100vw-7rem)] rounded-md object-contain shadow-2xl sm:max-h-[calc(100dvh-7rem)] sm:max-w-[calc(100vw-10rem)]" />

          {hasMultiple ? (
            <div className="absolute bottom-[max(.75rem,env(safe-area-inset-bottom))] left-1/2 z-20 flex max-w-[min(calc(100vw-2rem),760px)] -translate-x-1/2 gap-2 overflow-x-auto rounded-md border border-white/15 bg-black/60 p-2 shadow-2xl backdrop-blur-md [overscroll-behavior:contain]">
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
