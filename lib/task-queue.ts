export type TaskStatusGroup = "queued" | "running" | "completed" | "failed";

export type TaskDisplayMode = "flat" | "grouped";

export type TaskQueueItem = {
  id: string;
  module: string;
  /** Optional feature-level scope for modules that contain multiple editors. */
  scope?: string;
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

export function taskMatchesScope(item: Pick<TaskQueueItem, "scope" | "applyUrl">, scope?: string) {
  if (!scope) return true;
  if (item.scope) return item.scope === scope;

  // Backward compatibility for task rows cached before `scope` was added.
  try {
    const pathname = new URL(item.applyUrl, "https://task.local").pathname;
    if (scope === "image-to-image") return pathname === "/general-image/image-to-image";
    if (scope === "text-to-image") return pathname === "/general-image";
  } catch {
    // An empty/legacy apply URL cannot prove that it belongs to this scope.
  }
  return false;
}

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
