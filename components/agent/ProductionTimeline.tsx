"use client";

import { Loader2, CheckCircle2, XCircle, Clock, Zap } from "lucide-react";
import type { ProductionTask } from "@/lib/agent/types";
import { TaskProgressCard } from "./TaskProgressCard";

type Props = {
  tasks: ProductionTask[];
  completedCount: number;
  totalCount: number;
  overallProgress: number;
  onRetry: (taskId: string) => void;
  onOpenImage: (url: string) => void;
};

export function ProductionTimeline({ tasks, completedCount, totalCount, overallProgress, onRetry, onOpenImage }: Props) {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        {/* 整体进度 */}
        <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-bold text-slate-800">
                生产进度 · {completedCount}/{totalCount} 完成
              </span>
            </div>
            <span className="text-sm font-bold text-violet-600">{overallProgress}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-700"
              style={{ width: `${Math.max(overallProgress, 2)}%` }}
            />
          </div>
        </div>

        {/* 任务卡片列表 */}
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskProgressCard
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
