"use client";

import type { CSSProperties } from "react";
import { Download } from "lucide-react";
import { downloadImage, generateDownloadFilename } from "@/lib/utils";

const FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 120'%3E%3Crect width='160' height='120' fill='%23f1f5f9'/%3E%3Ctext x='80' y='62' text-anchor='middle' dominant-baseline='middle' font-size='14' fill='%2394a3b8'%3E加载失败%3C/text%3E%3C/svg%3E";

type ResultImageGridProps = {
  urls: string[];
  filenamePrefix: string;
  onOpen: (url: string) => void;
  extension?: string;
};

function getGridClass(count: number) {
  if (count <= 1) return "max-w-[min(760px,100%)] grid-cols-1";
  if (count === 2) return "max-w-[min(1120px,100%)] grid-cols-1 md:grid-cols-2";
  if (count === 3) return "max-w-[min(1180px,100%)] grid-cols-1 sm:grid-cols-3";
  return "max-w-[min(980px,100%)] grid-cols-2";
}

function getTileStyle(count: number): CSSProperties | undefined {
  if (count <= 1) return undefined;
  if (count === 2) return { height: "min(68dvh, 720px)" };
  if (count === 3) return { height: "min(56dvh, 600px)" };
  return { height: "min(36dvh, 420px)" };
}

export function ResultImageGrid({ urls, filenamePrefix, onOpen, extension = "png" }: ResultImageGridProps) {
  const count = urls.length;
  const isSingle = count <= 1;

  return (
    <div className={`mx-auto grid w-full gap-3 sm:gap-4 ${getGridClass(count)}`}>
      {urls.map((url, index) => (
        <div
          key={`${url}-${index}`}
          className={`group relative min-w-0 cursor-zoom-in overflow-hidden rounded-2xl bg-white shadow-[0_22px_70px_rgba(15,23,42,0.16)] ring-1 ring-white/80 transition-transform duration-200 hover:-translate-y-0.5 ${
            isSingle ? "mx-auto max-w-full" : ""
          }`}
          onClick={() => onOpen(url)}
        >
          <div
            className={isSingle ? "flex max-h-[calc(100dvh-240px)] items-center justify-center" : "flex min-h-[220px] items-center justify-center"}
            style={getTileStyle(count)}
          >
            <img
              src={url}
              alt={`结果 ${index + 1}`}
              className={
                isSingle
                  ? "block max-h-[calc(100dvh-240px)] max-w-full object-contain lg:max-h-[calc(100vh-240px)]"
                  : "h-full w-full object-contain"
              }
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE;
              }}
            />
          </div>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              downloadImage(url, generateDownloadFilename(filenamePrefix, index, extension));
            }}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-slate-700 opacity-0 shadow-lg ring-1 ring-slate-200/70 backdrop-blur transition-all hover:bg-white hover:text-slate-950 group-hover:opacity-100"
            aria-label={`下载结果 ${index + 1}`}
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
