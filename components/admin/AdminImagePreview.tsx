"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";

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
  triggerClassName = "relative h-9 w-9 overflow-hidden rounded-md border border-white bg-slate-100 shadow-sm",
  imageClassName = "h-full w-full object-cover",
  countLabel,
}: AdminImagePreviewProps) {
  const images = useMemo(() => urls.map((url) => url.trim()).filter(Boolean), [urls]);
  const safeInitialIndex = Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0));
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(safeInitialIndex);
  const currentUrl = images[index] || "";
  const hasMultiple = images.length > 1;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowLeft" && hasMultiple) setIndex((value) => (value - 1 + images.length) % images.length);
      if (event.key === "ArrowRight" && hasMultiple) setIndex((value) => (value + 1) % images.length);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
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
          setIndex(safeInitialIndex);
          setOpen(true);
        }}
        className={`${triggerClassName} focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2`}
      >
        {countLabel ? (
          <span className="flex h-full w-full items-center justify-center text-[11px] font-black text-slate-500">{countLabel}</span>
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
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 text-xs font-black text-white hover:bg-white/20"
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white hover:bg-white/20"
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
                className="absolute left-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white hover:bg-white/20"
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
                className="absolute right-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white hover:bg-white/20"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <div className="max-h-[86vh] max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentUrl} alt="" className="max-h-[86vh] max-w-[92vw] rounded-lg object-contain shadow-2xl" />
            {hasMultiple && (
              <p className="mt-3 text-center text-xs font-black tabular-nums text-white/80">
                {index + 1} / {images.length}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
