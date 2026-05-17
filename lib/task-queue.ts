export type TaskStatusGroup = "queued" | "running" | "completed" | "failed";

export type TaskDisplayMode = "flat" | "grouped";

export type TaskQueueItem = {
  id: string;
  module: string;
  title: string;
  status: string;
  statusGroup: TaskStatusGroup;
  time: string;
  createdAt: string;
  updatedAt?: string | null;
  completedAt?: string | null;
  error: string;
  progress: number;
  expectedCount: number;
  resultCount: number;
  inputThumbnails: string[];
  resultThumbnails: string[];
  thumbnails: string[];
  applyUrl: string;
};

export type TaskQueueSummary = {
  totalTaskNum: number;
  finishedTaskNum: number;
  finishedNeedReadTaskNum: number;
  runningTaskNum: number;
  failedTaskNum: number;
};

export type TaskQueuePayload = {
  rows?: TaskQueueItem[];
  data?: Partial<TaskQueueSummary>;
  totalTaskNum?: number;
  finishedTaskNum?: number;
  finishedNeedReadTaskNum?: number;
  runningTaskNum?: number;
  failedTaskNum?: number;
  totalCount?: number;
  runningCount?: number;
  finishedCount?: number;
  failedCount?: number;
  hasMore?: boolean;
  nextCursor?: string | null;
};

export const TASK_DISPLAY_MODE_KEY = "wanxiang:task-display-mode";

export function isTaskRunning(item: Pick<TaskQueueItem, "statusGroup">) {
  return item.statusGroup === "running" || item.statusGroup === "queued";
}

export function isTaskFinished(item: Pick<TaskQueueItem, "statusGroup">) {
  return item.statusGroup === "completed" || item.statusGroup === "failed";
}

type TaskCountSource = {
  expectedCount?: unknown;
  resultCount?: unknown;
  resultThumbnails?: unknown;
};

export function getTaskExpectedCount(item: TaskCountSource, fallback = 1) {
  const candidates = [
    Number(item.expectedCount),
    Number(item.resultCount),
    safeTaskQueueUrls(item.resultThumbnails).length,
    Number(fallback),
  ];
  const value = candidates.find((candidate) => Number.isFinite(candidate) && candidate > 0) || 1;
  return Math.max(1, Math.round(value));
}

export function clampTaskExpectedCount(item: TaskCountSource, min = 1, max = 4, fallback = 1) {
  const lower = Math.max(1, Math.round(min));
  const upper = Math.max(lower, Math.round(max));
  return Math.min(Math.max(getTaskExpectedCount(item, fallback), lower), upper);
}

export function safeTaskQueueUrls(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    : [];
}
