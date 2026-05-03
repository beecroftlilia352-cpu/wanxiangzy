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
    <div className="flex flex-wrap gap-2 pb-2">
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { onAdd(Array.from(e.target.files || [])); e.target.value = ""; }} />
      {images.map((img, i) => (
        <div key={i} className="group relative">
          <div className="relative h-14 w-14 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <img src={img.hostedUrl || img.url} alt={`图${img.index}`} className="h-full w-full object-cover" />
            {img.uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
              </div>
            )}
          </div>
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-1.5 py-px text-[9px] font-bold text-white shadow-sm">
            图{img.index}
          </span>
          <button onClick={() => onRemove(i)}
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
      {images.length < 10 && (
        <button onClick={() => inputRef.current?.click()}
          className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-slate-300 transition-colors hover:border-violet-300 hover:text-violet-400">
          <Plus className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
