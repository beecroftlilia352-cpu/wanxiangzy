"use client";

import { create } from "zustand";
import type { TaskQueueItem, TaskQueueSummary } from "@/lib/task-queue";
import { isTaskRunning, safeTaskQueueUrls } from "@/lib/task-queue";

export const TASK_QUEUE_RECENT_LIMIT = 12;
export const TASK_QUEUE_PAGE_SIZE = 24;
export const TASK_QUEUE_CACHE_PREFIX = "wanxiang:task-rail:";
export const TASK_QUEUE_CACHE_TTL_MS = 5 * 60 * 1000;
export const TASK_QUEUE_RUNNING_CACHE_TTL_MS = 15_000;
export const TASK_QUEUE_LOCAL_PENDING_TTL_MS = 2 * 60 * 1000;

export const EMPTY_TASK_QUEUE_SUMMARY: TaskQueueSummary = {
  totalTaskNum: 0,
  finishedTaskNum: 0,
  finishedNeedReadTaskNum: 0,
  runningTaskNum: 0,
  failedTaskNum: 0,
};

export const TASK_QUEUE_CONTINUE_ID = "__continue__";

export type TaskQueueModuleState = {
  rows: TaskQueueItem[];
  summary: TaskQueueSummary;
  hasLoaded: boolean;
  loadError: boolean;
  selectedId: string;
  lastLoadedAt: number;
  refreshVersion: number;
};

export type TaskQueueOptimisticInput = {
  id?: string;
  module: string;
  title: string;
  status?: string;
  statusGroup?: TaskQueueItem["statusGroup"];
  progress?: number;
  expectedCount?: number;
  resultCount?: number;
  inputThumbnails?: string[];
  resultThumbnails?: string[];
  thumbnails?: string[];
  applyUrl?: string;
  error?: string;
  time?: string;
  createdAt?: string;
  updatedAt?: string | null;
  completedAt?: string | null;
};

type ApplyServerRowsOptions = {
  append?: boolean;
  preserveLocal?: boolean;
  hasMore?: boolean;
};

type TaskQueueClientState = {
  modules: Record<string, TaskQueueModuleState>;
  hydrateModule: (module: string) => void;
  resetModule: (module: string) => void;
  setSelectedTask: (module: string, taskId: string) => void;
  clearSelectedTask: (module: string) => void;
  requestRefresh: (module: string) => void;
  setModuleLoadingFailed: (module: string, failed: boolean) => void;
  applyServerRows: (
    module: string,
    rows: TaskQueueItem[],
    summary: TaskQueueSummary,
    options?: ApplyServerRowsOptions
  ) => void;
  createOptimisticTask: (input: TaskQueueOptimisticInput) => TaskQueueItem;
  upsertTask: (item: TaskQueueItem) => void;
  replaceTask: (module: string, temporaryId: string, item: TaskQueueItem) => void;
  patchTask: (module: string, taskId: string, patch: Partial<TaskQueueItem>) => TaskQueueItem | null;
  removeTask: (module: string, taskId: string) => void;
};

export const useTaskQueueStore = create<TaskQueueClientState>((set, get) => ({
  modules: {},

  hydrateModule: (module) => {
    const cached = readTaskQueueModuleCache(module);
    set((state) => ({
      modules: {
        ...state.modules,
        [module]: cached
          ? {
              rows: cached.rows,
              summary: cached.summary,
              hasLoaded: cached.rows.length > 0,
              loadError: false,
              selectedId: state.modules[module]?.selectedId || TASK_QUEUE_CONTINUE_ID,
              lastLoadedAt: cached.cachedAt,
              refreshVersion: state.modules[module]?.refreshVersion || 0,
            }
          : {
              ...getEmptyTaskQueueModuleState(),
              selectedId: state.modules[module]?.selectedId || TASK_QUEUE_CONTINUE_ID,
              refreshVersion: state.modules[module]?.refreshVersion || 0,
            },
      },
    }));
  },

  resetModule: (module) => {
    set((state) => ({
      modules: {
        ...state.modules,
        [module]: getEmptyTaskQueueModuleState(),
      },
    }));
  },

  setSelectedTask: (module, taskId) => {
    set((state) => updateModuleState(state, module, (current) => ({ ...current, selectedId: taskId })));
  },

  clearSelectedTask: (module) => {
    set((state) => updateModuleState(state, module, (current) => ({ ...current, selectedId: TASK_QUEUE_CONTINUE_ID })));
  },

  requestRefresh: (module) => {
    set((state) => updateModuleState(state, module, (current) => ({
      ...current,
      refreshVersion: current.refreshVersion + 1,
    })));
  },

  setModuleLoadingFailed: (module, failed) => {
    set((state) => updateModuleState(state, module, (current) => ({
      ...current,
      loadError: failed,
      hasLoaded: current.hasLoaded || failed,
    })));
  },

  applyServerRows: (module, rows, summary, options) => {
    set((state) => updateModuleState(state, module, (current) => {
      const normalizedRows = rows.map(normalizeCachedTaskQueueItem).filter((item): item is TaskQueueItem => Boolean(item));
      const nextRows = options?.append
        ? mergeTaskQueueRows(current.rows, normalizedRows)
        : options?.preserveLocal
          ? reconcileTaskQueueRows(current.rows, normalizedRows, module)
          : normalizedRows;
      const nextState = {
        ...current,
        rows: nextRows,
        summary,
        hasLoaded: true,
        loadError: false,
        lastLoadedAt: Date.now(),
      };
      writeTaskQueueModuleCache(module, nextState);
      return nextState;
    }));
  },

  createOptimisticTask: (input) => {
    const item = createOptimisticTaskQueueItem(input);
    get().upsertTask(item);
    return item;
  },

  upsertTask: (item) => {
    const normalizedItem = normalizeCachedTaskQueueItem(item);
    if (!normalizedItem) return;
    set((state) => updateModuleState(state, normalizedItem.module, (current) => {
      const nextRows = upsertTaskQueueRow(current.rows, normalizedItem, normalizedItem.module);
      const nextState = {
        ...current,
        rows: nextRows,
        summary: patchSummaryForTask(current.summary, current.rows.find((row) => row.id === normalizedItem.id), normalizedItem),
        hasLoaded: true,
        loadError: false,
        selectedId: isTaskRunning(normalizedItem) ? normalizedItem.id : current.selectedId,
        lastLoadedAt: Date.now(),
      };
      writeTaskQueueModuleCache(normalizedItem.module, nextState);
      return nextState;
    }));
  },

  replaceTask: (module, temporaryId, item) => {
    const normalizedItem = normalizeCachedTaskQueueItem(item);
    if (!normalizedItem) return;
    set((state) => updateModuleState(state, module, (current) => {
      const withoutTemporary = current.rows.filter((row) => row.id !== temporaryId);
      const previous = current.rows.find((row) => row.id === temporaryId || row.id === normalizedItem.id);
      const nextRows = upsertTaskQueueRow(withoutTemporary, normalizedItem, module);
      const nextState = {
        ...current,
        rows: nextRows,
        summary: patchSummaryForTask(current.summary, previous, normalizedItem),
        hasLoaded: true,
        loadError: false,
        selectedId: isTaskRunning(normalizedItem) ? normalizedItem.id : current.selectedId === temporaryId ? normalizedItem.id : current.selectedId,
        lastLoadedAt: Date.now(),
      };
      writeTaskQueueModuleCache(module, nextState);
      return nextState;
    }));
  },

  patchTask: (module, taskId, patch) => {
    const current = get().modules[module]?.rows.find((item) => item.id === taskId);
    if (!current) return null;
    const next = { ...current, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() };
    get().upsertTask(next);
    return next;
  },

  removeTask: (module, taskId) => {
    set((state) => updateModuleState(state, module, (current) => {
      const removed = current.rows.find((item) => item.id === taskId);
      const nextRows = removeTaskQueueRow(current.rows, taskId);
      const nextState = {
        ...current,
        rows: nextRows,
        summary: patchSummaryForTask(current.summary, removed, null),
        selectedId: current.selectedId === taskId ? TASK_QUEUE_CONTINUE_ID : current.selectedId,
        lastLoadedAt: Date.now(),
      };
      writeTaskQueueModuleCache(module, nextState);
      return nextState;
    }));
  },
}));

export function getEmptyTaskQueueModuleState(): TaskQueueModuleState {
  return {
    rows: [],
    summary: EMPTY_TASK_QUEUE_SUMMARY,
    hasLoaded: false,
    loadError: false,
    selectedId: TASK_QUEUE_CONTINUE_ID,
    lastLoadedAt: 0,
    refreshVersion: 0,
  };
}

export function createOptimisticTaskQueueItem(input: TaskQueueOptimisticInput): TaskQueueItem {
  const createdAt = input.createdAt || new Date().toISOString();
  const inputThumbnails = safeTaskQueueUrls(input.inputThumbnails);
  const resultThumbnails = safeTaskQueueUrls(input.resultThumbnails);
  const thumbnails = safeTaskQueueUrls(input.thumbnails);
  return {
    id: input.id || `local-${input.module}-${Date.now()}`,
    module: input.module,
    title: input.title,
    status: input.status || "submitting",
    statusGroup: input.statusGroup || "queued",
    time: input.time || "0:00",
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
    completedAt: input.completedAt ?? null,
    error: input.error || "",
    progress: clampProgress(input.progress ?? 5),
    expectedCount: Math.max(1, firstFiniteNumber(input.expectedCount, 1)),
    resultCount: firstFiniteNumber(input.resultCount, resultThumbnails.length, 0),
    inputThumbnails,
    resultThumbnails,
    thumbnails: thumbnails.length ? thumbnails : Array.from(new Set([...resultThumbnails, ...inputThumbnails])).slice(0, 2),
    applyUrl: input.applyUrl || "",
  };
}

export function mergeTaskQueueRows(currentRows: TaskQueueItem[], nextRows: TaskQueueItem[]) {
  const rowsById = new Map<string, TaskQueueItem>();
  for (const item of currentRows) rowsById.set(item.id, item);
  for (const item of nextRows) rowsById.set(item.id, item);
  return Array.from(rowsById.values()).sort(compareTaskQueueRows);
}

export function upsertTaskQueueRow(currentRows: TaskQueueItem[], item: TaskQueueItem, module: string) {
  const currentWithoutReplacedLocal = currentRows.filter((row) => {
    if (row.id === item.id) return false;
    if (item.id.startsWith("local-")) return true;
    return !(row.module === module && row.id.startsWith("local-") && isTaskRunning(row));
  });
  return mergeTaskQueueRows(currentWithoutReplacedLocal, [item]);
}

export function reconcileTaskQueueRows(currentRows: TaskQueueItem[], serverRows: TaskQueueItem[], module: string) {
  if (serverRows.length === 0) {
    const keepRows = currentRows.filter((item) => shouldKeepLocalPendingTask(item, module));
    return keepRows.length ? keepRows : serverRows;
  }

  const serverIds = new Set(serverRows.map((item) => item.id));
  const hasServerRunningForModule = serverRows.some((item) => item.module === module && isTaskRunning(item));
  const localRows = currentRows.filter((item) => {
    if (serverIds.has(item.id)) return false;
    if (!shouldKeepLocalPendingTask(item, module)) return false;
    if (item.id.startsWith("local-") && hasServerRunningForModule) return false;
    return true;
  });
  return mergeTaskQueueRows(localRows, serverRows);
}

export function removeTaskQueueRow(currentRows: TaskQueueItem[], taskId: string) {
  return currentRows.filter((item) => item.id !== taskId);
}

export function normalizeCachedTaskQueueItem(value: unknown): TaskQueueItem | null {
  if (!isTaskQueueItem(value)) return null;
  const item = value as Partial<TaskQueueItem>;
  const statusGroup = normalizeTaskStatusGroup(item.statusGroup);
  if (!statusGroup) return null;
  const inputThumbnails = safeTaskQueueUrls(item.inputThumbnails);
  const resultThumbnails = safeTaskQueueUrls(item.resultThumbnails);
  const thumbnails = safeTaskQueueUrls(item.thumbnails);
  const createdAt = typeof item.createdAt === "string" && item.createdAt ? item.createdAt : new Date(0).toISOString();
  return {
    id: value.id,
    module: value.module,
    title: typeof item.title === "string" && item.title ? item.title : "AI任务",
    status: typeof item.status === "string" && item.status ? item.status : statusGroup,
    statusGroup,
    time: typeof item.time === "string" ? item.time : "",
    createdAt,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null,
    completedAt: typeof item.completedAt === "string" ? item.completedAt : null,
    error: typeof item.error === "string" ? item.error : "",
    progress: clampProgress(item.progress),
    expectedCount: Math.max(1, firstFiniteNumber(item.expectedCount, 1)),
    resultCount: firstFiniteNumber(item.resultCount, resultThumbnails.length, 0),
    inputThumbnails,
    resultThumbnails,
    thumbnails: thumbnails.length ? thumbnails : Array.from(new Set([...resultThumbnails, ...inputThumbnails])).slice(0, 2),
    applyUrl: typeof item.applyUrl === "string" && item.applyUrl ? item.applyUrl : `/history?detail=${encodeURIComponent(value.id)}`,
  };
}

export function readTaskQueueModuleCache(module: string): ({ cachedAt: number } & Pick<TaskQueueModuleState, "rows" | "summary">) | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getTaskQueueModuleCacheKey(module));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cachedAt?: unknown; rows?: unknown; summary?: unknown };
    const cachedAt = Number(parsed.cachedAt);
    if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > TASK_QUEUE_CACHE_TTL_MS) return null;
    const rows = Array.isArray(parsed.rows)
      ? parsed.rows.map(normalizeCachedTaskQueueItem).filter((item): item is TaskQueueItem => Boolean(item))
      : [];
    const stableRows = Date.now() - cachedAt > TASK_QUEUE_RUNNING_CACHE_TTL_MS
      ? rows.filter((item) => !isTaskRunning(item))
      : rows;
    return {
      cachedAt,
      rows: stableRows.slice(0, TASK_QUEUE_RECENT_LIMIT),
      summary: normalizeCachedSummary(parsed.summary),
    };
  } catch {
    return null;
  }
}

export function writeTaskQueueModuleCache(module: string, state: Pick<TaskQueueModuleState, "rows" | "summary"> & { cachedAt?: number }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getTaskQueueModuleCacheKey(module), JSON.stringify({
      cachedAt: state.cachedAt || Date.now(),
      rows: state.rows.slice(0, TASK_QUEUE_RECENT_LIMIT),
      summary: state.summary,
    }));
  } catch {
    // Ignore storage quota/private mode failures; the live queue still refreshes.
  }
}

function updateModuleState(
  state: TaskQueueClientState,
  module: string,
  updater: (current: TaskQueueModuleState) => TaskQueueModuleState
) {
  const current = state.modules[module] || getEmptyTaskQueueModuleState();
  return {
    modules: {
      ...state.modules,
      [module]: updater(current),
    },
  };
}

function shouldKeepLocalPendingTask(item: TaskQueueItem, module: string) {
  if (item.module !== module || !isTaskRunning(item)) return false;
  const createdAt = Date.parse(item.createdAt || "");
  if (!Number.isFinite(createdAt)) return item.id.startsWith("local-");
  return item.id.startsWith("local-") || Date.now() - createdAt < TASK_QUEUE_LOCAL_PENDING_TTL_MS;
}

function patchSummaryForTask(
  summary: TaskQueueSummary,
  previous: TaskQueueItem | undefined,
  next: TaskQueueItem | null
): TaskQueueSummary {
  const delta = { total: 0, running: 0, completed: 0, failed: 0 };
  if (previous) applySummaryDelta(delta, previous, -1);
  if (next) applySummaryDelta(delta, next, 1);
  return {
    totalTaskNum: Math.max(0, summary.totalTaskNum + delta.total),
    finishedTaskNum: Math.max(0, summary.finishedTaskNum + delta.completed),
    finishedNeedReadTaskNum: summary.finishedNeedReadTaskNum,
    runningTaskNum: Math.max(0, summary.runningTaskNum + delta.running),
    failedTaskNum: Math.max(0, summary.failedTaskNum + delta.failed),
  };
}

function applySummaryDelta(delta: { total: number; running: number; completed: number; failed: number }, item: TaskQueueItem, value: 1 | -1) {
  delta.total += value;
  if (item.statusGroup === "queued" || item.statusGroup === "running") delta.running += value;
  if (item.statusGroup === "completed") delta.completed += value;
  if (item.statusGroup === "failed") delta.failed += value;
}

function compareTaskQueueRows(a: TaskQueueItem, b: TaskQueueItem) {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

function getTaskQueueModuleCacheKey(module: string) {
  return `${TASK_QUEUE_CACHE_PREFIX}${module}`;
}

function isTaskQueueItem(value: unknown): value is TaskQueueItem {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as TaskQueueItem).id === "string" &&
    typeof (value as TaskQueueItem).module === "string" &&
    typeof (value as TaskQueueItem).statusGroup === "string"
  );
}

function normalizeTaskStatusGroup(value: unknown): TaskQueueItem["statusGroup"] | null {
  return value === "queued" || value === "running" || value === "completed" || value === "failed" ? value : null;
}

function normalizeCachedSummary(value: unknown): TaskQueueSummary {
  const summary = value && typeof value === "object" ? value as Partial<TaskQueueSummary> : {};
  return {
    totalTaskNum: firstFiniteNumber(summary.totalTaskNum, 0),
    finishedTaskNum: firstFiniteNumber(summary.finishedTaskNum, 0),
    finishedNeedReadTaskNum: firstFiniteNumber(summary.finishedNeedReadTaskNum, 0),
    runningTaskNum: firstFiniteNumber(summary.runningTaskNum, 0),
    failedTaskNum: firstFiniteNumber(summary.failedTaskNum, 0),
  };
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0) return Math.round(num);
  }
  return 0;
}

function clampProgress(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(Math.max(Math.round(num), 0), 100);
}
