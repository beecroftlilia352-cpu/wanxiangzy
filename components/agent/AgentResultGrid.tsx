"use client";

import { Download, ZoomIn } from "lucide-react";
import { downloadImage, generateDownloadFilename } from "@/lib/utils";

type Props = {
  urls: string[];
  onOpen: (url: string) => void;
};

export function AgentResultGrid({ urls, onOpen }: Props) {
  if (urls.length === 0) return null;

  const gridCols = urls.length <= 1 ? "grid-cols-1" : "grid-cols-2";

  return (
    <div className={`mt-3 grid gap-2 ${gridCols}`}>
      {urls.map((url, i) => (
        <div
          key={`${url}-${i}`}
          className="group relative cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
          onClick={() => onOpen(url)}
        >
          <img src={url} alt={`结果 ${i + 1}`} className="w-full object-contain" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/10 group-hover:opacity-100">
            <ZoomIn className="h-6 w-6 text-white drop-shadow" />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              downloadImage(url, generateDownloadFilename("agent", i));
            }}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 opacity-0 shadow-lg transition-all hover:bg-white group-hover:opacity-100"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
