"use client";

import { useCallback, useMemo } from "react";
import type { TaskQueueItem, TaskStatusGroup } from "@/lib/task-queue";
import {
  createOptimisticTaskQueueItem,
  type TaskQueueOptimisticInput,
  useTaskQueueStore,
} from "@/lib/task-queue-client-store";

export type TaskQueueGenerationConfig = {
  module: string;
  title: string;
  defaultExpectedCount?: number;
  applyPath?: string;
  buildApplyUrl?: (taskId: string) => string;
};

export type TaskQueueGenerationInput = Omit<TaskQueueOptimisticInput, "module" | "title">;

type RequiredTaskQueueGenerationConfig = TaskQueueGenerationConfig & {
  defaultExpectedCount: number;
};

export function useTaskQueueGeneration(config: TaskQueueGenerationConfig) {
  const { applyPath, buildApplyUrl, defaultExpectedCount, module, title } = config;
  const resolvedConfig = useMemo(
    () => normalizeTaskQueueGenerationConfig({
      applyPath,
      buildApplyUrl,
      defaultExpectedCount,
      module,
      title,
    }),
    [applyPath, buildApplyUrl, defaultExpectedCount, module, title]
  );
  const createOptimisticTask = useTaskQueueStore((state) => state.createOptimisticTask);
  const replaceStoreTask = useTaskQueueStore((state) => state.replaceTask);
  const patchStoreTask = useTaskQueueStore((state) => state.patchTask);
  const removeStoreTask = useTaskQueueStore((state) => state.removeTask);
  const upsertStoreTask = useTaskQueueStore((state) => state.upsertTask);
  const requestRefresh = useTaskQueueStore((state) => state.requestRefresh);

  const startTask = useCallback((input: TaskQueueGenerationInput = {}) => {
    return createOptimisticTask({
      ...input,
      module: resolvedConfig.module,
      title: resolvedConfig.title,
      status: input.status || "submitting",
      statusGroup: input.statusGroup || "queued",
      progress: input.progress ?? 5,
      expectedCount: input.expectedCount ?? resolvedConfig.defaultExpectedCount,
      applyUrl: input.applyUrl || "",
    });
  }, [createOptimisticTask, resolvedConfig.defaultExpectedCount, resolvedConfig.module, resolvedConfig.title]);

  const replaceWithServerTask = useCallback((temporaryId: string, input: TaskQueueGenerationInput) => {
    const item = buildTaskQueueGenerationItem(resolvedConfig, {
      ...input,
      status: input.status || "processing",
      statusGroup: input.statusGroup || "running",
      progress: input.progress ?? 25,
    });
    replaceStoreTask(resolvedConfig.module, temporaryId, item);
    return item;
  }, [replaceStoreTask, resolvedConfig]);

  const upsertTask = useCallback((input: TaskQueueGenerationInput) => {
    const item = buildTaskQueueGenerationItem(resolvedConfig, input);
    upsertStoreTask(item);
    return item;
  }, [resolvedConfig, upsertStoreTask]);

  const patchTask = useCallback((taskId: string, patch: TaskQueueGenerationInput) => {
    const normalizedPatch = normalizeTaskQueuePatch(resolvedConfig, taskId, patch);
    const patched = patchStoreTask(resolvedConfig.module, taskId, normalizedPatch);
    if (patched) return patched;

    const fallback = buildTaskQueueGenerationItem(resolvedConfig, { ...patch, id: taskId });
    upsertStoreTask(fallback);
    return fallback;
  }, [patchStoreTask, resolvedConfig, upsertStoreTask]);

  const markRunning = useCallback((taskId: string, patch: TaskQueueGenerationInput = {}) => {
    return patchTask(taskId, {
      ...patch,
      status: patch.status || "processing",
      statusGroup: "running",
      progress: patch.progress ?? 25,
    });
  }, [patchTask]);

  const markCompleted = useCallback((taskId: string, patch: TaskQueueGenerationInput = {}) => {
    return patchTask(taskId, {
      ...patch,
      status: patch.status || "completed",
      statusGroup: "completed",
      progress: 100,
      completedAt: patch.completedAt ?? new Date().toISOString(),
    });
  }, [patchTask]);

  const markFailed = useCallback((taskId: string, error: string, patch: TaskQueueGenerationInput = {}) => {
    return patchTask(taskId, {
      ...patch,
      status: patch.status || "failed",
      statusGroup: "failed",
      progress: patch.progress ?? 100,
      error,
      completedAt: patch.completedAt ?? new Date().toISOString(),
    });
  }, [patchTask]);

  const removeTask = useCallback((taskId: string) => {
    removeStoreTask(resolvedConfig.module, taskId);
  }, [removeStoreTask, resolvedConfig.module]);

  const refresh = useCallback(() => {
    requestRefresh(resolvedConfig.module);
  }, [requestRefresh, resolvedConfig.module]);

  return useMemo(() => ({
    startTask,
    replaceWithServerTask,
    upsertTask,
    patchTask,
    markRunning,
    markCompleted,
    markFailed,
    removeTask,
    refresh,
  }), [
    markCompleted,
    markFailed,
    markRunning,
    patchTask,
    refresh,
    removeTask,
    replaceWithServerTask,
    startTask,
    upsertTask,
  ]);
}

export function buildTaskQueueGenerationItem(
  config: TaskQueueGenerationConfig,
  input: TaskQueueGenerationInput
): TaskQueueItem {
  const resolvedConfig = normalizeTaskQueueGenerationConfig(config);
  const statusGroup = input.statusGroup || "running";
  const resultThumbnails = safeStringArray(input.resultThumbnails);
  const inputThumbnails = safeStringArray(input.inputThumbnails);
  const thumbnails = safeStringArray(input.thumbnails);
  const resultCount = input.resultCount ?? resultThumbnails.length;
  const id = input.id || `local-${resolvedConfig.module}-${Date.now()}`;

  return createOptimisticTaskQueueItem({
    ...input,
    id,
    module: resolvedConfig.module,
    title: resolvedConfig.title,
    status: input.status || getDefaultStatus(statusGroup),
    statusGroup,
    progress: input.progress ?? getDefaultProgress(statusGroup),
    expectedCount: input.expectedCount ?? resolvedConfig.defaultExpectedCount,
    resultCount,
    inputThumbnails,
    resultThumbnails,
    thumbnails: thumbnails.length
      ? thumbnails
      : Array.from(new Set([...(resultThumbnails.length ? resultThumbnails : inputThumbnails)])).slice(0, 2),
    applyUrl: input.applyUrl || getApplyUrl(resolvedConfig, id),
  });
}

function normalizeTaskQueuePatch(
  config: RequiredTaskQueueGenerationConfig,
  taskId: string,
  patch: TaskQueueGenerationInput
): Partial<TaskQueueItem> {
  const resultThumbnails = safeStringArray(patch.resultThumbnails);
  const inputThumbnails = safeStringArray(patch.inputThumbnails);
  const thumbnails = safeStringArray(patch.thumbnails);
  const statusGroup = patch.statusGroup;
  return {
    ...patch,
    id: taskId,
    module: config.module,
    title: config.title,
    status: patch.status || (statusGroup ? getDefaultStatus(statusGroup) : undefined),
    statusGroup,
    progress: patch.progress !== undefined ? clampProgress(patch.progress) : undefined,
    expectedCount: patch.expectedCount,
    resultCount: patch.resultCount ?? (resultThumbnails.length ? resultThumbnails.length : undefined),
    inputThumbnails: patch.inputThumbnails ? inputThumbnails : undefined,
    resultThumbnails: patch.resultThumbnails ? resultThumbnails : undefined,
    thumbnails: patch.thumbnails
      ? thumbnails
      : resultThumbnails.length
        ? resultThumbnails.slice(0, 2)
        : undefined,
    applyUrl: patch.applyUrl || getApplyUrl(config, taskId),
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };
}

function normalizeTaskQueueGenerationConfig(config: TaskQueueGenerationConfig): RequiredTaskQueueGenerationConfig {
  return {
    ...config,
    defaultExpectedCount: Math.max(1, Math.round(Number(config.defaultExpectedCount) || 1)),
  };
}

function getApplyUrl(config: TaskQueueGenerationConfig, taskId: string) {
  if (!taskId || taskId.startsWith("local-")) return "";
  if (config.buildApplyUrl) return config.buildApplyUrl(taskId);
  if (config.applyPath) return `${config.applyPath}?apply=${encodeURIComponent(taskId)}`;
  return "";
}

function getDefaultStatus(statusGroup: TaskStatusGroup) {
  if (statusGroup === "completed") return "completed";
  if (statusGroup === "failed") return "failed";
  if (statusGroup === "queued") return "queued";
  return "processing";
}

function getDefaultProgress(statusGroup: TaskStatusGroup) {
  if (statusGroup === "completed" || statusGroup === "failed") return 100;
  if (statusGroup === "queued") return 5;
  return 25;
}

function clampProgress(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(Math.max(Math.round(numeric), 0), 100);
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}
