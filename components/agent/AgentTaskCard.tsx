"use client";

import { Loader2 } from "lucide-react";
import type { AgentTask } from "@/lib/agent/types";

const STATUS_TEXT: Record<string, string> = {
  uploading: "上传中...",
  calling_api: "提交任务...",
  polling: "生成中...",
};

type Props = {
  task: AgentTask;
};

export function AgentTaskCard({ task }: Props) {
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200/80 bg-white/90 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
          {task.label}生成中...
        </div>
        {task.creditsCost > 0 && (
          <span className="text-xs text-slate-400">{task.creditsCost} 分</span>
        )}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-500"
          style={{ width: `${Math.max(task.progress, 5)}%` }}
        />
      </div>

      <p className="text-xs text-slate-400">
        {task.progress}% · {STATUS_TEXT[task.status] || "处理中..."}
      </p>
    </div>
  );
}
