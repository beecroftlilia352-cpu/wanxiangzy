"use client";

import { Download, ZoomIn, RefreshCw, CheckCircle2 } from "lucide-react";
import { downloadImage, generateDownloadFilename } from "@/lib/utils";

type Props = {
  urls: string[];
  creditsUsed?: number;
  onOpen: (url: string) => void;
  onRetry: () => void;
};

export function GeneratedResult({ urls, creditsUsed, onOpen, onRetry }: Props) {
  const gridCols = urls.length <= 1 ? "grid-cols-1" : urls.length <= 2 ? "grid-cols-2" : "grid-cols-2";

  return (
    <div className="w-full max-w-lg">
      {/* Success indicator */}
      <div className="mb-2 flex items-center gap-1.5 text-xs text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span className="font-bold">生成完成</span>
        {creditsUsed != null && creditsUsed > 0 && (
          <span className="text-slate-400">· 消耗 {creditsUsed} 积分</span>
        )}
      </div>

      {/* Image grid */}
      <div className={`grid gap-2 ${gridCols}`}>
        {urls.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="group relative cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm"
            onClick={() => onOpen(url)}
          >
            <img src={url} alt={`结果 ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/10 group-hover:opacity-100">
              <ZoomIn className="h-6 w-6 text-white drop-shadow" />
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                downloadImage(url, generateDownloadFilename("agent", i));
              }}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 opacity-0 shadow-lg transition-opacity hover:bg-white group-hover:opacity-100"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="mt-2 flex gap-2">
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-violet-200 hover:text-violet-600"
        >
          <RefreshCw className="h-3 w-3" />
          重新生成
        </button>
      </div>
    </div>
  );
}
