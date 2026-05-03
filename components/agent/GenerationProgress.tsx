"use client";

import { Loader2 } from "lucide-react";
import type { GenerationResult } from "@/lib/agent/types";

type Props = {
  generation: GenerationResult;
};

export function GenerationProgress({ generation }: Props) {
  const statusText =
    generation.progress < 20
      ? "准备中..."
      : generation.progress < 60
        ? "生成中..."
        : generation.progress < 90
          ? "即将完成..."
          : "处理中...";

  return (
    <div className="w-full max-w-sm rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
        <span className="text-sm font-bold text-slate-700">图片生成中</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-700"
          style={{ width: `${Math.max(generation.progress, 3)}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">
        <span>{statusText}</span>
        <span className="font-bold text-violet-600">{generation.progress}%</span>
      </div>
    </div>
  );
}
