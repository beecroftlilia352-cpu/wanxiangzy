"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StudioTaskRail } from "@/components/studio/StudioTaskRail";
import type { TaskQueueItem } from "@/lib/task-queue";
import { isTaskRunning } from "@/lib/task-queue";

type ModuleTaskRailProps = {
  module: string;
  moduleLabel: string;
  onContinue?: () => void;
  onRunningTask?: (item: TaskQueueItem) => void | Promise<void>;
  onCompletedTask?: (item: TaskQueueItem) => boolean | void | Promise<boolean | void>;
};

export function ModuleTaskRail({
  module,
  moduleLabel,
  onContinue,
  onRunningTask,
  onCompletedTask,
}: ModuleTaskRailProps) {
  const router = useRouter();
  const handleContinue = onContinue ?? (() => window.location.assign(window.location.pathname));

  const handleSelectTask = async (item: TaskQueueItem) => {
    if (isTaskRunning(item)) {
      await onRunningTask?.(item);
      return;
    }

    if (item.statusGroup === "completed") {
      if (onCompletedTask) {
        const handled = await onCompletedTask(item);
        if (handled !== false) return;
      }
      if (!item.applyUrl) return;
      const target = new URL(item.applyUrl, window.location.origin);
      if (target.pathname === window.location.pathname) {
        window.history.replaceState(window.history.state, "", `${target.pathname}${target.search}${target.hash}`);
        window.dispatchEvent(new CustomEvent("wanxiang:history-apply", { detail: { id: item.id, module: item.module } }));
      } else {
        router.push(`${target.pathname}${target.search}${target.hash}`);
      }
      return;
    }

    if (item.statusGroup === "failed") {
      toast.error(item.error || "任务失败，可重新生成");
    }
  };

  return (
    <StudioTaskRail
      module={module}
      moduleLabel={moduleLabel}
      onContinue={handleContinue}
      onSelectTask={handleSelectTask}
    />
  );
}
