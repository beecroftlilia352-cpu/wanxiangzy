"use client";

import { useRef, useState } from "react";
import { Plus, X, Loader2, ZoomIn } from "lucide-react";
import type { ChatImage } from "@/lib/agent/types";

type Props = {
  images: ChatImage[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  onPreview?: (url: string) => void;
};

export function ImageTray({ images, onAdd, onRemove, onPreview }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (images.length === 0) return null;

  return (
    <div className="mb-2">
      <div className="flex flex-wrap gap-2">
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { onAdd(Array.from(e.target.files || [])); e.target.value = ""; }} />
        {images.map((img, i) => (
          <div key={i} className="group relative shrink-0">
            {/* 图片缩略图 — 点击放大 */}
            <div
              className="relative h-14 w-14 cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition-all hover:border-violet-300 hover:shadow-sm"
              onClick={() => onPreview?.(img.hostedUrl || img.url)}
            >
              <img src={img.hostedUrl || img.url} alt={`图${img.index}`} className="h-full w-full object-cover" />
              {img.uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                </div>
              )}
              {/* 放大提示 */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                <ZoomIn className="h-4 w-4 text-white drop-shadow" />
              </div>
            </div>
            {/* 编号角标 */}
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-violet-600 px-1.5 text-[9px] font-bold leading-tight text-white shadow-sm">
              图{img.index}
            </span>
            {/* 删除按钮 — 圆形，不被遮挡 */}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(i); }}
              className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {images.length < 10 && (
          <button onClick={() => inputRef.current?.click()}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-300 transition-all hover:border-violet-300 hover:text-violet-400"
            title="添加图片">
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
