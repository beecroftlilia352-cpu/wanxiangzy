"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";

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
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowLeft" && hasMultiple) setIndex((value) => (value - 1 + images.length) % images.length);
      if (event.key === "ArrowRight" && hasMultiple) setIndex((value) => (value + 1) % images.length);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [hasMultiple, images.length, open]);

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
        className={`${triggerClassName} focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-fg)] focus-visible:ring-offset-2`}
      >
        {countLabel ? (
          <span className="flex h-full w-full items-center justify-center text-[11px] font-black text-[var(--admin-muted)]">{countLabel}</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={images[safeInitialIndex]} alt="" className={imageClassName} loading="lazy" />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--admin-fg)]/90 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div className="absolute left-4 top-4 rounded-lg border border-white/10 bg-[var(--admin-surface)]/10 px-3 py-2 text-xs font-black tabular-nums text-white/85 shadow-lg backdrop-blur">
            {images.length > 1 ? `${index + 1} / ${images.length}` : label}
          </div>

          <div className="absolute right-4 top-4 flex items-center gap-2">
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-[var(--admin-surface)]/10 px-3 text-xs font-black text-white hover:bg-[var(--admin-surface)]/20"
            >
              <ExternalLink className="h-4 w-4" />
              原图
            </a>
            <button
              type="button"
              aria-label="关闭预览"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[var(--admin-surface)]/10 text-white hover:bg-[var(--admin-surface)]/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {hasMultiple && (
            <>
              <button
                type="button"
                aria-label="上一张"
                onClick={(event) => {
                  event.stopPropagation();
                  move(-1);
                }}
                className="absolute left-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-white/15 bg-[var(--admin-surface)]/10 text-white hover:bg-[var(--admin-surface)]/20"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="下一张"
                onClick={(event) => {
                  event.stopPropagation();
                  move(1);
                }}
                className="absolute right-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-white/15 bg-[var(--admin-surface)]/10 text-white hover:bg-[var(--admin-surface)]/20"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <div className="max-h-[82vh] max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentUrl} alt={label} className="max-h-[82vh] max-w-[92vw] rounded-lg object-contain shadow-2xl" />
          </div>

          {hasMultiple && (
            <div
              className="absolute bottom-4 left-1/2 flex max-w-[min(92vw,760px)] -translate-x-1/2 gap-2 overflow-x-auto rounded-xl border border-white/10 bg-[var(--admin-surface)]/10 p-2 shadow-2xl backdrop-blur"
              onClick={(event) => event.stopPropagation()}
            >
              {images.map((url, itemIndex) => (
                <button
                  key={`${url}-${itemIndex}`}
                  type="button"
                  aria-label={`切换到第 ${itemIndex + 1} 张`}
                  aria-current={itemIndex === index ? "true" : undefined}
                  onClick={() => setIndex(itemIndex)}
                  className={`h-12 w-12 shrink-0 overflow-hidden rounded-md border transition-colors ${
                    itemIndex === index ? "border-white ring-2 ring-white/70" : "border-white/20 opacity-70 hover:opacity-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
