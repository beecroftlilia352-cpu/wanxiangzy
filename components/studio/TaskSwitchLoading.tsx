"use client";

import { TaskFlowIndicator } from "@/components/studio/TaskFlowIndicator";

export function TaskSwitchLoading({ label }: { label: string }) {
  return (
    <div className="studio-task-switch-loading inline-flex items-center gap-2.5 text-sm font-medium text-codex-muted">
      <TaskFlowIndicator />
      <span>{label}</span>
    </div>
  );
}
