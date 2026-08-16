"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { cn } from "@/lib/utils";

type StudioMediaLightboxProps = {
  src: string | null;
  alt: string;
  onClose: () => void;
  kind?: "image" | "video";
  caption?: string;
  mediaClassName?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onPrev?: () => void;
  onNext?: () => void;
};

export function StudioMediaLightbox({
  src,
  alt,
  onClose,
  kind = "image",
  caption,
  mediaClassName,
  returnFocusRef,
  onPrev,
  onNext,
}: StudioMediaLightboxProps) {
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    if (!src) setZoomed(false);
  }, [src]);

  return (
    <Dialog
      open={Boolean(src)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        returnFocusRef={returnFocusRef}
        onDoubleClick={() => setZoomed((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onPrev?.();
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            onNext?.();
          }
        }}
        overlayClassName="z-[240] bg-codex-ink/70 backdrop-blur-xl"
        className="z-[241] max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] place-items-center gap-0 overflow-hidden bg-transparent p-0 text-white ring-0 shadow-none sm:max-w-[calc(100vw-3rem)]"
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <DialogDescription className="sr-only">
          {caption || alt}
        </DialogDescription>
        {src ? (
          kind === "video" ? (
            <video
              src={src}
              controls
              playsInline
              preload="metadata"
              aria-label={alt}
              className={cn(
                "max-h-[calc(100dvh-3rem)] max-w-full rounded-2xl bg-black object-contain shadow-[0_32px_120px_rgba(0,0,0,0.45)]",
                mediaClassName
              )}
            />
          ) : (
            <div className={cn("max-h-[calc(100dvh-3rem)] max-w-full", zoomed && "overflow-auto")}>
              <RawPreviewImage
                src={src}
                alt={alt}
                decoding="async"
                style={{ transform: zoomed ? "scale(1.9)" : undefined, transformOrigin: "center center", transition: "transform 220ms ease" }}
                className={cn(
                  "max-h-[calc(100dvh-3rem)] max-w-full cursor-zoom-in rounded-2xl object-contain shadow-[0_32px_120px_rgba(0,0,0,0.45)]",
                  zoomed && "cursor-zoom-out",
                  mediaClassName
                )}
              />
            </div>
          )
        ) : null}
        {caption ? (
          <p className="absolute bottom-4 left-1/2 max-w-[min(42rem,calc(100vw-6rem))] -translate-x-1/2 truncate rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white backdrop-blur">
            {caption}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
