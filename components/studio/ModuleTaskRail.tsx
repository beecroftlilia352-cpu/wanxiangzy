"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { StudioTaskRail } from "@/components/studio/StudioTaskRail";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import type { TaskQueueItem } from "@/lib/task-queue";
import { isTaskRunning } from "@/lib/task-queue";

type ModuleTaskRailProps = {
  module: string;
  moduleLabel: string;
  onContinue?: () => void;
  onRunningTask?: (item: TaskQueueItem, session: TaskSelectionSession) => void | Promise<void>;
  onCompletedTask?: (item: TaskQueueItem, session: TaskSelectionSession) => boolean | void | Promise<boolean | void>;
};

export function ModuleTaskRail({
  module,
  moduleLabel,
  onContinue,
  onRunningTask,
  onCompletedTask,
}: ModuleTaskRailProps) {
  const router = useRouter();
  const t = useTranslations("Shared");
  const handleContinue = onContinue ?? (() => undefined);

  const applyTask = async (item: TaskQueueItem, session: TaskSelectionSession) => {
    if (onCompletedTask) {
      const handled = await onCompletedTask(item, session);
      if (!session.isCurrent()) return true;
      if (handled === true) return true;
    }
    if (!item.applyUrl) return false;
    const target = new URL(item.applyUrl, window.location.origin);
    if (target.pathname === window.location.pathname) {
      window.history.replaceState(window.history.state, "", `${target.pathname}${target.search}${target.hash}`);
      window.dispatchEvent(new CustomEvent("wanxiang:history-apply", { detail: { id: item.id, module: item.module } }));
    } else {
      router.push(`${target.pathname}${target.search}${target.hash}`);
    }
    return true;
  };

  const handleSelectTask = async (item: TaskQueueItem, session: TaskSelectionSession) => {
    // 其他模块的任务：不调用本页 handler 污染页面状态，直接跳转到任务所属模块
    if (item.module && item.module !== module) {
      if (item.applyUrl) {
        const target = new URL(item.applyUrl, window.location.origin);
        if (target.pathname === window.location.pathname) {
          window.history.replaceState(window.history.state, "", `${target.pathname}${target.search}${target.hash}`);
          window.dispatchEvent(new CustomEvent("wanxiang:history-apply", { detail: { id: item.id, module: item.module } }));
        } else {
          router.push(`${target.pathname}${target.search}${target.hash}`);
        }
      }
      return;
    }

    if (isTaskRunning(item)) {
      await onRunningTask?.(item, session);
      const applied = await applyTask(item, session);
      if (!session.isCurrent()) return;
      if (applied) await onRunningTask?.(item, session);
      return;
    }

    if (item.statusGroup === "completed" || item.statusGroup === "failed") {
      const applied = await applyTask(item, session);
      if (!applied && item.statusGroup === "failed") {
        toast.error(item.error || t("taskFailedRetry"));
      }
      return;
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
