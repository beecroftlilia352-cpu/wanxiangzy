export type NormalizedGenerationState = {
  status: string;
  statusGroup: "running" | "finished";
  progress: number;
  resultCount: number;
  expectedCount: number;
  completedAt?: string | null;
  providerStatus?: string | null;
  taskId?: string | null;
};

type NormalizeGenerationStateInput = {
  status?: string | null;
  resultUrls?: unknown;
  payload?: unknown;
  completedAt?: string | null;
};

export function normalizeGenerationState(input: NormalizeGenerationStateInput): NormalizedGenerationState {
  const status = typeof input.status === "string" && input.status.length > 0 ? input.status.toLowerCase() : "pending";
  const payload = isRecord(input.payload) ? input.payload : {};
  const asyncTask = readAsyncTask(payload);
  const resultCount = stringArray(input.resultUrls).length;
  const expectedCount = readExpectedCount(payload, resultCount);
  const providerStatus = asyncTask?.status || null;
  const providerDone = isProviderDone(providerStatus);
  const hasEnoughResults = resultCount > 0 && resultCount >= expectedCount;
  const explicitCompleted = status === "completed" || status === "succeeded" || status === "success";
  const explicitFailed = status === "failed" || status === "error" || status === "cancelled" || status === "canceled";
  const completed = !explicitFailed && (explicitCompleted || hasEnoughResults || (providerDone && resultCount > 0));
  const normalizedStatus = completed ? "completed" : status;
  const progress = completed ? 100 : readRunningProgress({
    asyncProgress: asyncTask?.progress,
    resultCount,
    expectedCount,
  });

  return {
    status: normalizedStatus,
    statusGroup: explicitFailed || completed || !isRunningStatus(normalizedStatus) ? "finished" : "running",
    progress,
    resultCount,
    expectedCount,
    completedAt: input.completedAt || (completed ? asyncTask?.updatedAt || null : null),
    providerStatus,
    taskId: asyncTask?.taskId || null,
  };
}

export function isRunningStatus(status: string) {
  const normalized = status.toLowerCase();
  return normalized === "pending" || normalized === "queued" || normalized === "running" || normalized === "processing" || normalized === "processing_tryon" || normalized.startsWith("processing_");
}

function readExpectedCount(payload: Record<string, unknown>, resultCount: number) {
  const direct = firstFiniteNumber([
    payload.genCount,
    payload.gen_count,
    payload.outputCount,
    payload.count,
  ]);
  if (direct) return Math.max(1, Math.min(Math.round(direct), 24));
  return Math.max(1, resultCount || 1);
}

function readRunningProgress(params: { asyncProgress?: unknown; resultCount: number; expectedCount: number }) {
  const providerProgress = clampProgress(params.asyncProgress);
  const partialProgress = params.resultCount > 0
    ? Math.floor((Math.min(params.resultCount, params.expectedCount) / Math.max(1, params.expectedCount)) * 100)
    : 0;
  return Math.min(99, Math.max(providerProgress, partialProgress));
}

function readAsyncTask(payload: Record<string, unknown>) {
  if (!isRecord(payload.asyncTask)) return null;
  return {
    taskId: typeof payload.asyncTask.taskId === "string"
      ? payload.asyncTask.taskId
      : typeof payload.asyncTask.task_id === "string"
        ? payload.asyncTask.task_id
        : undefined,
    status: typeof payload.asyncTask.status === "string" ? payload.asyncTask.status : undefined,
    progress: payload.asyncTask.progress,
    updatedAt: typeof payload.asyncTask.updatedAt === "string" ? payload.asyncTask.updatedAt : undefined,
  };
}

function isProviderDone(status?: string | null) {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return normalized === "success" || normalized === "succeeded" || normalized === "completed" || normalized === "done" || normalized === "sync_completed";
}

function firstFiniteNumber(values: unknown[]) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
}

function clampProgress(value: unknown) {
  const num = typeof value === "string"
    ? Number(value.match(/\d+(?:\.\d+)?/)?.[0])
    : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(Math.max(Math.round(num), 0), 99);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
