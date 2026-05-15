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
