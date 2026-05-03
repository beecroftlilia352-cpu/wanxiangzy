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
    <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { onAdd(Array.from(e.target.files || [])); e.target.value = ""; }} />
      {images.map((img, i) => (
        <div key={i} className="group relative shrink-0" title={`图${img.index}`}>
          <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition-all hover:border-violet-300">
            <img src={img.hostedUrl || img.url} alt={`图${img.index}`} className="h-full w-full object-cover" />
            {img.uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-3 w-3 animate-spin text-white" />
              </div>
            )}
          </div>
          {/* 编号角标 — 固定在右下角，不换行 */}
          <span className="absolute -bottom-0.5 -right-0.5 rounded bg-violet-600 px-1 text-[8px] font-bold leading-none text-white shadow-sm">
            {img.index}
          </span>
          <button onClick={() => onRemove(i)}
            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
      {images.length < 10 && (
        <button onClick={() => inputRef.current?.click()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-300 transition-all hover:border-violet-300 hover:text-violet-400"
          title="添加图片">
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
