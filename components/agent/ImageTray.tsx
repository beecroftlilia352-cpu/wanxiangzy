"use client";

import { useRef } from "react";
import { Images, Loader2, Plus, ShieldCheck, X, ZoomIn } from "lucide-react";
import type { ChatImage, ChatImageRole } from "@/lib/agent/types";

type Props = {
  images: ChatImage[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  onClear?: () => void;
  onRoleChange?: (index: number, role: ChatImageRole) => void;
  onPreview?: (url: string) => void;
};

const ROLE_OPTIONS: Array<{ value: ChatImageRole; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "clothing", label: "服装" },
  { value: "reference", label: "参考" },
  { value: "face", label: "脸图" },
  { value: "background", label: "背景" },
  { value: "source", label: "原图" },
];

const ROLE_TEXT: Record<ChatImageRole, string> = {
  auto: "自动判断",
  clothing: "服装图",
  reference: "参考图",
  face: "模特脸",
  background: "背景图",
  source: "原图",
};

export function ImageTray({ images, onAdd, onRemove, onClear, onRoleChange, onPreview }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (images.length === 0) return null;

  const hasUploading = images.some((img) => img.uploading);

  return (
    <div className="mb-2 rounded-2xl border border-violet-100/80 bg-violet-50/35 p-2 shadow-sm shadow-violet-100/30">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-violet-500 shadow-sm">
          <Images className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700">本次会使用 {images.length} 张附件图</span>
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-violet-500">
              独立上下文
            </span>
          </div>
          <p className="truncate text-[11px] text-slate-400">
            只有这里的图片会参与下一次判断；新任务可一键清空。
          </p>
        </div>
        {hasUploading && (
          <span className="hidden items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-amber-500 sm:flex">
            <Loader2 className="h-3 w-3 animate-spin" />
            上传中
          </span>
        )}
        {onClear && (
          <button
            onClick={onClear}
            className="rounded-full px-2 py-1 text-[11px] font-semibold text-slate-400 transition-all hover:bg-white hover:text-red-500"
          >
            清空
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onAdd(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />

        {images.map((img, i) => {
          const role = img.role || "auto";
          return (
            <div key={`${img.index}-${img.url}`} className="group relative shrink-0">
              <button
                type="button"
                className="relative h-16 w-16 cursor-pointer overflow-hidden rounded-xl border border-white bg-slate-50 shadow-sm transition-all hover:border-violet-300 hover:shadow-md"
                onClick={() => onPreview?.(img.hostedUrl || img.url)}
              >
                <img src={img.hostedUrl || img.url} alt={`图${img.index}`} className="h-full w-full object-cover" />
                {img.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                  <ZoomIn className="h-4 w-4 text-white drop-shadow" />
                </div>
              </button>

              <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow-sm">
                <ShieldCheck className="h-2.5 w-2.5" />
                图{img.index}
              </span>

              <select
                value={role}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onRoleChange?.(img.index, e.target.value as ChatImageRole)}
                className="absolute left-1 top-1 z-10 max-w-[58px] rounded-md bg-black/60 px-1 py-0.5 text-[9px] font-bold leading-none text-white outline-none backdrop-blur transition-colors hover:bg-violet-600/90"
                title={`图片角色：${ROLE_TEXT[role]}`}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(i);
                }}
                className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-400 opacity-0 shadow-md ring-1 ring-slate-200 transition-all hover:bg-red-500 hover:text-white group-hover:opacity-100"
                aria-label={`移除图${img.index}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        {images.length < 10 && (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-violet-200 bg-white/70 text-violet-300 transition-all hover:border-violet-300 hover:bg-white hover:text-violet-500"
            title="添加图片"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
