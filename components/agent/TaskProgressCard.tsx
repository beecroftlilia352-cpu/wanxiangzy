"use client";

import { Loader2, CheckCircle2, XCircle, Clock, RefreshCw, Download, ZoomIn } from "lucide-react";
import type { ProductionTask, TaskStep } from "@/lib/agent/types";
import { downloadImage, generateDownloadFilename } from "@/lib/utils";

const STEP_STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5 text-slate-300" />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
};

type Props = {
  task: ProductionTask;
  onRetry: () => void;
  onOpenImage: (url: string) => void;
};

export function TaskProgressCard({ task, onRetry, onOpenImage }: Props) {
  const overallProgress = calculateOverallProgress(task);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      {/* 头部：缩略图 + 名称 + 进度 */}
      <div className="mb-3 flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
          <img src={task.garmentThumb} alt={task.garmentName} className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800">{task.garmentName}</p>
          <p className="text-xs text-slate-400">{task.plan.title}</p>
        </div>
        <div className="text-right">
          {task.status === "completed" && (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          )}
          {task.status === "failed" && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-100"
            >
              <RefreshCw className="h-3 w-3" />
              重试
            </button>
          )}
          {task.status === "running" && (
            <span className="text-xs font-bold text-violet-600">{overallProgress}%</span>
          )}
        </div>
      </div>

      {/* 步骤列表 */}
      <div className="flex flex-wrap gap-2">
        {task.steps.map((step, i) => (
          <StepChip key={i} step={step} onOpenImage={onOpenImage} taskName={task.garmentName} />
        ))}
      </div>

      {/* 进度条（生产中） */}
      {task.status === "running" && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-500"
            style={{ width: `${Math.max(overallProgress, 3)}%` }}
          />
        </div>
      )}

      {/* 错误信息 */}
      {task.status === "failed" && (
        <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {task.steps.find((s) => s.status === "failed")?.error || "任务失败"}
        </div>
      )}
    </div>
  );
}

function StepChip({ step, onOpenImage, taskName }: { step: TaskStep; onOpenImage: (url: string) => void; taskName: string }) {
  const hasResult = step.resultUrls.length > 0;

  return (
    <div className="flex items-center gap-1.5">
      {/* 如果有结果，显示缩略图 */}
      {hasResult ? (
        <button
          onClick={() => onOpenImage(step.resultUrls[0])}
          className="group relative h-10 w-10 overflow-hidden rounded-lg border border-slate-200"
        >
          <img src={step.resultUrls[0]} alt={step.label} className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
            <ZoomIn className="h-3 w-3 text-white" />
          </div>
        </button>
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
          {STEP_STATUS_ICONS[step.status]}
        </div>
      )}
      <div>
        <p className="text-[11px] font-semibold text-slate-700">{step.label}</p>
        <p className="text-[10px] text-slate-400">
          {step.status === "completed" ? "✓ 完成" : step.status === "running" ? `${step.progress}%` : step.status === "failed" ? "失败" : "等待中"}
        </p>
      </div>
      {/* 下载按钮 */}
      {hasResult && (
        <button
          onClick={() => downloadImage(step.resultUrls[0], generateDownloadFilename(taskName, 0))}
          className="ml-1 rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
        >
          <Download className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function calculateOverallProgress(task: ProductionTask): number {
  if (task.status === "completed") return 100;
  if (task.steps.length === 0) return 0;

  const total = task.steps.reduce((sum, s) => {
    if (s.status === "completed") return sum + 100;
    if (s.status === "running") return sum + s.progress;
    return sum;
  }, 0);

  return Math.round(total / task.steps.length);
}
