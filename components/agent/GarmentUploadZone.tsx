"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, Plus, X, Loader2, Sparkles } from "lucide-react";
import type { GarmentAnalysis } from "@/lib/agent/types";

type Props = {
  garments: GarmentAnalysis[];
  maxCount?: number;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
};

export function GarmentUploadZone({ garments, maxCount = 20, onAdd, onRemove }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
      if (files.length > 0) onAdd(files.slice(0, maxCount - garments.length));
    },
    [onAdd, maxCount, garments.length]
  );

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) onAdd(files.slice(0, maxCount - garments.length));
      e.target.value = "";
    },
    [onAdd, maxCount, garments.length]
  );

  const analyzingCount = garments.filter((g) => g.status === "analyzing" || g.status === "pending").length;
  const doneCount = garments.filter((g) => g.status === "done").length;

  return (
    <section>
      <div className="studio-upload-header">
        <h3 className="studio-upload-title">
          <Upload className="h-4 w-4 text-purple-500" />
          上传服装
          {garments.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              {garments.length}/{maxCount}
            </span>
          )}
        </h3>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleSelect}
      />

      {/* 已上传图片网格 */}
      {garments.length > 0 && (
        <div className="mb-3 grid grid-cols-4 gap-2">
          {garments.map((g, i) => (
            <div
              key={`${g.imageUrl}-${i}`}
              className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
            >
              <img
                src={g.imageUrl}
                alt={g.fileName}
                className="h-full w-full object-cover"
              />
              {/* 分析中遮罩 */}
              {(g.status === "analyzing" || g.status === "pending") && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
              {/* 分析完成标签 */}
              {g.status === "done" && g.category !== "服装" && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3">
                  <span className="text-[10px] font-bold text-white">{g.category}</span>
                </div>
              )}
              {/* 删除按钮 */}
              <button
                onClick={() => onRemove(i)}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {/* 添加按钮 */}
          {garments.length < maxCount && (
            <button
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-slate-300 transition-colors hover:border-violet-300 hover:text-violet-400"
            >
              <Plus className="h-6 w-6" />
            </button>
          )}
        </div>
      )}

      {/* 拖拽上传区（无图片时） */}
      {garments.length === 0 && (
        <div
          onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-all ${
            isDragging
              ? "border-violet-400 bg-violet-50/50 ring-2 ring-violet-200"
              : "border-slate-200 bg-slate-50/70 hover:border-violet-300 hover:bg-violet-50/30"
          }`}
        >
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
            <Sparkles className="h-7 w-7 text-violet-400" />
          </div>
          <p className="text-sm font-semibold text-slate-800">拖入或点击上传服装图</p>
          <p className="mt-1 text-xs text-slate-400">支持 JPG/PNG，最多 {maxCount} 张</p>
        </div>
      )}

      {/* 分析状态 */}
      {garments.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          {analyzingCount > 0 ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
              AI 分析中... ({doneCount}/{garments.length})
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3 text-violet-400" />
              AI 分析完成 · {doneCount} 张就绪
            </>
          )}
        </div>
      )}
    </section>
  );
}
