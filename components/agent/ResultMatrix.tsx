"use client";

import { useState } from "react";
import { Download, ChevronDown, ChevronRight, CheckCircle2, ZoomIn, RefreshCw, Package } from "lucide-react";
import type { ProductionTask } from "@/lib/agent/types";
import { downloadImage, downloadImages, generateDownloadFilename } from "@/lib/utils";

type Props = {
  tasks: ProductionTask[];
  totalImages: number;
  onRetry: (taskId: string) => void;
  onOpenImage: (url: string) => void;
};

export function ResultMatrix({ tasks, totalImages, onRetry, onOpenImage }: Props) {
  const completedTasks = tasks.filter((t) => t.status === "completed");

  const allUrls = completedTasks.flatMap((t) =>
    t.steps.flatMap((s) => s.resultUrls)
  );

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        {/* 顶部操作栏 */}
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <span className="text-sm font-bold text-emerald-800">
              全部完成 · {completedTasks.length} 款服装 · {totalImages} 张图
            </span>
          </div>
          <button
            onClick={() => downloadImages(allUrls, "agent-batch")}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            <Package className="h-3.5 w-3.5" />
            打包下载
          </button>
        </div>

        {/* 结果分组 */}
        <div className="space-y-3">
          {completedTasks.map((task) => (
            <ResultGroup
              key={task.id}
              task={task}
              onRetry={() => onRetry(task.id)}
              onOpenImage={onOpenImage}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultGroup({ task, onRetry, onOpenImage }: { task: ProductionTask; onRetry: () => void; onOpenImage: (url: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const allUrls = task.steps.flatMap((s) => s.resultUrls);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      {/* 头部（可折叠） */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/50"
      >
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-100">
          <img src={task.garmentThumb} alt={task.garmentName} className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800">{task.garmentName}</p>
          <p className="text-xs text-slate-400">{task.plan.title} · {allUrls.length} 张结果</p>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {/* 结果图片网格 */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {task.steps.map((step, stepIdx) =>
              step.resultUrls.map((url, urlIdx) => (
                <div key={`${stepIdx}-${urlIdx}`} className="space-y-1.5">
                  {/* 步骤标签 */}
                  <span className="text-[11px] font-semibold text-slate-500">{step.label}</span>
                  {/* 图片卡片 */}
                  <div
                    className="group relative cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                    onClick={() => onOpenImage(url)}
                  >
                    <img src={url} alt={step.label} className="aspect-[3/4] w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/10 group-hover:opacity-100">
                      <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadImage(url, generateDownloadFilename(task.garmentName, stepIdx));
                      }}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 opacity-0 shadow transition-opacity group-hover:opacity-100"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
