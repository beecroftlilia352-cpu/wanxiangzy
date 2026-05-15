"use client";

import type { CSSProperties } from "react";
import { Download, Sparkles } from "lucide-react";
import { getImageVariantUrl } from "@/lib/image-variants";
import { downloadImage, generateDownloadFilename } from "@/lib/utils";
import type { TaskStatusGroup } from "@/lib/task-queue";

const FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 120'%3E%3Crect width='160' height='120' fill='%23f1f5f9'/%3E%3Ctext x='80' y='62' text-anchor='middle' dominant-baseline='middle' font-size='14' fill='%2394a3b8'%3E加载失败%3C/text%3E%3C/svg%3E";

type ResultImageGridProps = {
  urls: string[];
  filenamePrefix: string;
  onOpen: (url: string, index: number) => void;
  extension?: string;
  expectedCount?: number;
  isGenerating?: boolean;
  imageAltPrefix?: string;
  inputThumbnails?: string[];
  createdAt?: string | null;
  statusGroup?: TaskStatusGroup;
  variant?: "cards" | "task";
};

function getGridClass(count: number) {
  if (count <= 1) return "max-w-[min(280px,100%)] grid-cols-1";
  if (count === 2) return "max-w-[min(572px,100%)] grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "max-w-[min(864px,100%)] grid-cols-1 sm:grid-cols-3";
  return "max-w-[min(1156px,100%)] grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
}

function getTileStyle(): CSSProperties | undefined {
  return { aspectRatio: "3 / 4" };
}

export function ResultImageGrid({
  urls,
  filenamePrefix,
  onOpen,
  extension = "png",
  expectedCount,
  isGenerating,
  imageAltPrefix = "Generated result image",
  inputThumbnails = [],
  createdAt,
  statusGroup,
  variant = "cards",
}: ResultImageGridProps) {
  const count = Math.max(urls.length, expectedCount || 0, 1);
  const isSingle = count <= 1;
  const slots = Array.from({ length: count }, (_, index) => urls[index] || null);

  if (variant === "task") {
    const running = isGenerating || statusGroup === "running" || statusGroup === "queued";
    const referenceUrl = inputThumbnails[1] || inputThumbnails[0] || "";
    return (
      <div className="w-full max-w-[min(1480px,100%)]">
        <p className="mb-2 text-xs font-medium text-slate-400">
          因产品处于持续学习调优阶段，可能有不恰当的信息，请您谨慎甄别。
        </p>
        <p className="mb-3 text-xs font-medium text-slate-400">{formatTaskTimestamp(createdAt)}</p>
        <div className="flex w-full items-start gap-2">
          {referenceUrl && (
            <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded bg-white shadow-sm ring-1 ring-slate-100">
              <img src={referenceUrl} alt="参考图 1" className="h-full w-full object-cover" />
              <span className="absolute left-0 top-0 rounded-br bg-slate-900/55 px-1 py-0.5 text-[10px] font-semibold text-white">参考图1</span>
            </div>
          )}
          <div className={`grid min-w-0 flex-1 gap-2 ${getGridClass(count).replace("mx-auto", "")}`}>
            {slots.map((url, index) => (
              <div
                key={`${url || "pending"}-${index}`}
                role={url ? "button" : undefined}
                tabIndex={url ? 0 : undefined}
                aria-label={url ? `Preview ${imageAltPrefix.toLowerCase()} ${index + 1}` : undefined}
                title={url ? `Preview ${imageAltPrefix.toLowerCase()} ${index + 1}` : undefined}
                className={`group relative overflow-hidden bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  url ? "cursor-zoom-in" : ""
                }`}
                onClick={() => {
                  if (url) onOpen(url, index);
                }}
                onKeyDown={(event) => {
                  if (!url || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  onOpen(url, index);
                }}
              >
                <div className="aspect-[3/4] w-full">
                  {url ? (
                    <img
                      src={getImageVariantUrl(url, count <= 1 ? "preview" : "card")}
                      alt={`${imageAltPrefix} ${index + 1}`}
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        (event.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE;
                      }}
                    />
                  ) : (
                    <div className="gen-card flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-rose-50 via-violet-50 to-blue-50 text-rose-400">
                      <Sparkles className="relative z-[1] h-8 w-8 animate-pulse opacity-60" />
                      <p className="relative z-[1] text-xs font-semibold text-slate-500">
                        {running ? "预计1-2分钟" : "等待生成"}
                      </p>
                    </div>
                  )}
                </div>
                {url && (
                  <>
                    <div className="absolute inset-x-0 bottom-0 z-[2] flex translate-y-full items-center justify-center gap-2 bg-gradient-to-t from-black/68 to-black/0 px-2 pb-3 pt-12 text-[11px] font-semibold text-white transition-transform group-hover:translate-y-0 group-focus-within:translate-y-0">
                      <button type="button" className="rounded bg-white/18 px-2 py-1 backdrop-blur">查看</button>
                      <button type="button" className="rounded bg-white/18 px-2 py-1 backdrop-blur">AI修图</button>
                      <button type="button" className="rounded bg-white/18 px-2 py-1 backdrop-blur">AI视频</button>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        downloadImage(url, generateDownloadFilename(filenamePrefix, index, extension));
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                      }}
                      className="absolute right-2 top-2 z-[3] flex h-8 w-8 items-center justify-center rounded-full bg-white/92 text-slate-700 opacity-0 shadow-lg ring-1 ring-slate-200/70 backdrop-blur transition-all hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 group-hover:opacity-100 group-focus-within:opacity-100"
                      aria-label={`Download ${imageAltPrefix.toLowerCase()} ${index + 1}`}
                      title={`Download ${imageAltPrefix.toLowerCase()} ${index + 1}`}
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`mx-auto grid w-full gap-3 sm:gap-4 ${getGridClass(count)}`}>
      {slots.map((url, index) => (
        <div
          key={`${url || "pending"}-${index}`}
          role={url ? "button" : undefined}
          tabIndex={url ? 0 : undefined}
          aria-label={url ? `Preview ${imageAltPrefix.toLowerCase()} ${index + 1}` : undefined}
          title={url ? `Preview ${imageAltPrefix.toLowerCase()} ${index + 1}` : undefined}
          className={`group relative min-w-0 overflow-hidden rounded-2xl bg-white shadow-[0_22px_70px_rgba(15,23,42,0.16)] ring-1 ring-white/80 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
            url ? "cursor-zoom-in" : ""
          } ${
            isSingle ? "mx-auto max-w-full" : ""
          }`}
          onClick={() => {
            if (url) onOpen(url, index);
          }}
          onKeyDown={(event) => {
            if (!url || (event.key !== "Enter" && event.key !== " ")) return;
            event.preventDefault();
            onOpen(url, index);
          }}
        >
          <div
            className="flex items-center justify-center"
            style={getTileStyle()}
          >
            {url ? (
              <img
                src={getImageVariantUrl(url, isSingle ? "preview" : "card")}
                alt={`${imageAltPrefix} ${index + 1}`}
                className="h-full w-full object-contain"
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE;
                }}
              />
            ) : (
              <div className="gen-card flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-rose-50 via-violet-50 to-blue-50 text-rose-500">
                <div className="relative z-[1] flex h-12 w-12 items-center justify-center rounded-full bg-white/85 shadow-lg">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
                <p className="relative z-[1] text-xs font-semibold text-slate-500">
                  {isGenerating ? `生成第 ${index + 1} 张...` : "等待生成"}
                </p>
              </div>
            )}
          </div>

          {url && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                downloadImage(url, generateDownloadFilename(filenamePrefix, index, extension));
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
              }}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-slate-700 opacity-100 shadow-lg ring-1 ring-slate-200/70 backdrop-blur transition-all hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
              aria-label={`Download ${imageAltPrefix.toLowerCase()} ${index + 1}`}
              title={`Download ${imageAltPrefix.toLowerCase()} ${index + 1}`}
            >
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function formatTaskTimestamp(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
