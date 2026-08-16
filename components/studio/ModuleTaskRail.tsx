"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { StudioTaskRail } from "@/components/studio/StudioTaskRail";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import type { TaskQueueItem } from "@/lib/task-queue";
import { isTaskRunning } from "@/lib/task-queue";
import { requestStudioNavigation } from "@/lib/studio-navigation";

type ModuleTaskRailProps = {
  module: string;
  taskScope?: string;
  moduleLabel: string;
  onContinue?: () => void;
  onRunningTask?: (item: TaskQueueItem, session: TaskSelectionSession) => void | Promise<void>;
  onCompletedTask?: (item: TaskQueueItem, session: TaskSelectionSession) => boolean | void | Promise<boolean | void>;
};

export function ModuleTaskRail({
  module,
  taskScope,
  moduleLabel,
  onContinue,
  onRunningTask,
  onCompletedTask,
}: ModuleTaskRailProps) {
  const router = useRouter();
  const t = useTranslations("Shared");
  const handleContinue = onContinue ?? (() => undefined);

  const navigateToTask = async (item: TaskQueueItem) => {
    const href = getTaskApplyHref(item);
    if (!href) return false;
    const target = new URL(href, window.location.origin);
    const nextHref = `${target.pathname}${target.search}${target.hash}`;
    if (target.pathname === window.location.pathname) {
      window.history.replaceState(window.history.state, "", nextHref);
      window.dispatchEvent(new CustomEvent("wanxiang:history-apply", { detail: { id: item.id, module: item.module } }));
      return true;
    }
    return requestStudioNavigation(nextHref, () => router.push(nextHref));
  };

  const applyTask = async (item: TaskQueueItem, session: TaskSelectionSession) => {
    const href = getTaskApplyHref(item);
    if (href) {
      const target = new URL(href, window.location.origin);
      if (target.pathname !== window.location.pathname) {
        return navigateToTask(item);
      }
    }
    if (onCompletedTask) {
      const handled = await onCompletedTask(item, session);
      if (!session.isCurrent()) return true;
      if (handled === true) return true;
    }
    return navigateToTask(item);
  };

  const handleSelectTask = async (item: TaskQueueItem, session: TaskSelectionSession) => {
    // 其他模块的任务：不调用本页 handler 污染页面状态，直接跳转到任务所属模块
    if (item.module && item.module !== module) {
      return navigateToTask(item);
    }

    if (taskScope && item.scope && item.scope !== taskScope) {
      return navigateToTask(item);
    }

    if (isTaskRunning(item)) {
      await onRunningTask?.(item, session);
      const applied = await applyTask(item, session);
      if (!session.isCurrent()) return;
      if (applied) await onRunningTask?.(item, session);
      return applied;
    }

    if (item.statusGroup === "completed" || item.statusGroup === "failed") {
      const applied = await applyTask(item, session);
      if (!applied && item.statusGroup === "failed") {
        toast.error(item.error || t("taskFailedRetry"));
      }
      return applied;
    }
    return false;
  };

  return (
    <StudioTaskRail
      module={module}
      taskScope={taskScope}
      moduleLabel={moduleLabel}
      onContinue={handleContinue}
      onSelectTask={handleSelectTask}
    />
  );
}

function getTaskApplyHref(item: TaskQueueItem) {
  if (item.module === "generalImage" && item.scope) {
    const path = item.scope === "image-to-image"
      ? "/general-image/image-to-image"
      : "/general-image";
    return `${path}?apply=${encodeURIComponent(item.id)}`;
  }
  return item.applyUrl;
}
