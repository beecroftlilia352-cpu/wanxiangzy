"use client";

import { useRef } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import type { ChatImage } from "@/lib/agent/types";

type Props = {
  images: ChatImage[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
};

export function ImageTray({ images, onAdd, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (images.length === 0) return null;

  return (
    <div className="pb-2">
      <div className="flex flex-wrap gap-1.5">
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { onAdd(Array.from(e.target.files || [])); e.target.value = ""; }} />
        {images.map((img, i) => (
          <div key={i} className="group relative" title={`图${img.index} — 在消息中输入 @图${img.index} 引用此图`}>
            <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition-all hover:border-violet-300 hover:shadow-sm">
              <img src={img.hostedUrl || img.url} alt={`图${img.index}`} className="h-full w-full object-cover" />
              {img.uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                </div>
              )}
            </div>
            {/* 编号标签 */}
            <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 rounded px-1.5 py-px text-[9px] font-bold leading-tight shadow-sm ${
              img.uploading ? "bg-slate-400 text-white" : "bg-violet-600 text-white"
            }`}>
              图{img.index}
            </span>
            {/* 删除 */}
            <button onClick={() => onRemove(i)}
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
        {images.length < 10 && (
          <button onClick={() => inputRef.current?.click()}
            className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-300 transition-all hover:border-violet-300 hover:text-violet-400 hover:bg-violet-50/50"
            title="继续添加图片">
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* @ 引用提示 */}
      <p className="mt-1.5 text-[10px] text-slate-300">
        在输入框中输入 <span className="font-bold text-violet-400">@图N</span> 引用图片，如 <span className="text-slate-400">@图1</span>
      </p>
    </div>
  );
}
