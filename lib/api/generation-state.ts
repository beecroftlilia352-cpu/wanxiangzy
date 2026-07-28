import { isRecord } from "@/lib/utils";
import { normalizeProductSetModuleResults } from "@/lib/product-set";
import {
  GENERATION_COMPLETED_STATUS_FILTERS,
  GENERATION_FAILED_STATUS_FILTERS,
  GENERATION_PENDING_STATUS_FILTERS,
  GENERATION_PROCESSING_STATUS_FILTERS,
  isRunningStatus,
  normalizeGenerationStatus,
} from "@/lib/generation-status";

export {
  GENERATION_COMPLETED_STATUS_FILTERS,
  GENERATION_FAILED_STATUS_FILTERS,
  GENERATION_PENDING_STATUS_FILTERS,
  GENERATION_PROCESSING_STATUS_FILTERS,
  GENERATION_RUNNING_STATUS_FILTERS,
  isRunningStatus,
  normalizeGenerationStatus,
} from "@/lib/generation-status";

export type NormalizedGenerationState = {
  status: string;
  statusGroup: "running" | "finished";
  progress: number;
  resultCount: number;
  expectedCount: number;
  moduleResults?: ReturnType<typeof normalizeProductSetModuleResults>;
  completedAt?: string | null;
  providerStatus?: string | null;
  taskId?: string | null;
  requestId?: string | null;
  providerDetails?: Record<string, unknown> | null;
};

type NormalizeGenerationStateInput = {
  status?: string | null;
  resultUrls?: unknown;
  payload?: unknown;
  completedAt?: string | null;
};

export function normalizeGenerationState(input: NormalizeGenerationStateInput): NormalizedGenerationState {
  const status = normalizeStatusText(input.status);
  const canonicalStatus = normalizeGenerationStatus(status);
  const payload = isRecord(input.payload) ? input.payload : {};
  const asyncTask = readAsyncTask(payload);
  const moduleResults = normalizeProductSetModuleResults(payload.moduleResults);
  const moduleExpectedCount = moduleResults.length;
  const moduleResultCount = moduleResults.filter((item) => item.status === "completed" && Boolean(item.resultUrl)).length;
  const resultCount = moduleExpectedCount ? moduleResultCount : stringArray(input.resultUrls).length;
  const expectedCount = moduleExpectedCount || readExpectedCount(payload, resultCount);
  const providerStatus = asyncTask?.status || null;
  const providerDone = isProviderDone(providerStatus);
  const providerFailed = isProviderFailed(providerStatus);
  const hasEnoughResults = resultCount > 0 && resultCount >= expectedCount;
  const explicitCompleted = isCompletedStatus(status);
  const explicitFailed = isFailedStatus(status);
  const providerCompleted = providerDone && hasEnoughResults;
  const completedWithoutResults = explicitCompleted && resultCount <= 0 && expectedCount > 0;
  const failed = explicitFailed || providerFailed || completedWithoutResults;
  const completed = !failed && (explicitCompleted || hasEnoughResults || providerCompleted);
  const normalizedStatus = failed ? "failed" : completed ? "completed" : canonicalStatus;
  const progress = completed ? 100 : failed ? readFailedProgress({
    asyncProgress: asyncTask?.progress,
    resultCount,
    expectedCount,
    moduleProgress: moduleExpectedCount ? readModuleProgress(moduleResults) : 0,
  }) : moduleExpectedCount ? readModuleProgress(moduleResults) : readRunningProgress({
    asyncProgress: asyncTask?.progress,
    resultCount,
    expectedCount,
  });

  return {
    status: normalizedStatus,
    statusGroup: failed || completed || !isRunningStatus(normalizedStatus) ? "finished" : "running",
    progress,
    resultCount,
    expectedCount,
    moduleResults: moduleExpectedCount ? moduleResults : undefined,
    completedAt: input.completedAt || (completed ? asyncTask?.updatedAt || null : null),
    providerStatus,
    taskId: asyncTask?.taskId || null,
    requestId: asyncTask?.requestId || null,
    providerDetails: asyncTask?.providerDetails || null,
  };
}

function isProcessingStatus(status: string) {
  return GENERATION_PROCESSING_STATUS_FILTERS.includes(status as typeof GENERATION_PROCESSING_STATUS_FILTERS[number]) ||
    status.startsWith("processing_");
}

function isCompletedStatus(status: string) {
  return GENERATION_COMPLETED_STATUS_FILTERS.includes(status as typeof GENERATION_COMPLETED_STATUS_FILTERS[number]);
}

function isFailedStatus(status: string) {
  return GENERATION_FAILED_STATUS_FILTERS.includes(status as typeof GENERATION_FAILED_STATUS_FILTERS[number]);
}

function readExpectedCount(payload: Record<string, unknown>, resultCount: number) {
  if (payload.kind === "productRetouch") {
    const count = firstFiniteNumber([
      payload.expectedCount,
      payload.genCount,
      payload.gen_count,
      payload.outputCount,
      payload.count,
    ]) || 1;
    return clampExpectedCount(count, 120);
  }

  if (payload.kind === "tryon") {
    const referenceCount = payload.sceneMode === "auto_design"
      ? 1
      : Math.max(1, uniqueStrings([...stringArray(payload.referenceUrls), stringValue(payload.referenceUrl)]).length);
    const perReferenceCount = firstFiniteNumber([payload.genCount, payload.gen_count, payload.outputCount, payload.count]) || 1;
    return clampExpectedCount(perReferenceCount * referenceCount);
  }

  if (payload.kind === "faceSwap") {
    const sourceCount = Math.max(1, uniqueStrings([...stringArray(payload.sourceUrls), stringValue(payload.sourceUrl)]).length);
    const perSourceCount = firstFiniteNumber([payload.genCount, payload.gen_count, payload.outputCount, payload.count]) || 1;
    return clampExpectedCount(perSourceCount * sourceCount);
  }

  if (payload.kind === "modelBackground") {
    const sourceCount = Math.max(1, uniqueStrings([...stringArray(payload.sourceUrls), stringValue(payload.sourceUrl)]).length);
    const perSourceCount = firstFiniteNumber([payload.genCount, payload.gen_count, payload.outputCount, payload.count]) || 1;
    return clampExpectedCount(perSourceCount * sourceCount);
  }

  const direct = firstFiniteNumber([
    payload.genCount,
    payload.gen_count,
    payload.outputCount,
    payload.count,
  ]);
  if (direct) return clampExpectedCount(direct);
  return Math.max(1, resultCount || 1);
}

function clampExpectedCount(value: number, max = 24) {
  return Math.max(1, Math.min(Math.round(value), max));
}

function readRunningProgress(params: { asyncProgress?: unknown; resultCount: number; expectedCount: number }) {
  const providerProgress = clampProgress(params.asyncProgress);
  const partialProgress = params.resultCount > 0
    ? Math.floor((Math.min(params.resultCount, params.expectedCount) / Math.max(1, params.expectedCount)) * 100)
    : 0;
  return Math.min(99, Math.max(providerProgress, partialProgress));
}

function readFailedProgress(params: { asyncProgress?: unknown; resultCount: number; expectedCount: number; moduleProgress: number }) {
  const providerProgress = clampProgress(params.asyncProgress, 100);
  const partialProgress = params.resultCount > 0
    ? Math.floor((Math.min(params.resultCount, params.expectedCount) / Math.max(1, params.expectedCount)) * 100)
    : 0;
  return Math.max(providerProgress, partialProgress, params.moduleProgress);
}

function readModuleProgress(modules: ReturnType<typeof normalizeProductSetModuleResults>) {
  if (!modules.length) return 0;
  const total = modules.reduce((sum, item) => {
    if (item.status === "completed" || item.status === "failed") return sum + 100;
    return sum + Math.min(Math.max(Math.round(item.progress || 0), 0), 99);
  }, 0);
  return Math.min(99, Math.max(0, Math.round(total / modules.length)));
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
    requestId: typeof payload.asyncTask.requestId === "string"
      ? payload.asyncTask.requestId
      : typeof payload.asyncTask.request_id === "string"
        ? payload.asyncTask.request_id
        : undefined,
    providerDetails: isRecord(payload.asyncTask.providerDetails)
      ? payload.asyncTask.providerDetails
      : null,
    updatedAt: typeof payload.asyncTask.updatedAt === "string" ? payload.asyncTask.updatedAt : undefined,
  };
}

function isProviderDone(status?: string | null) {
  if (!status) return false;
  const normalized = normalizeStatusText(status);
  return normalized === "success" || normalized === "succeeded" || normalized === "completed" || normalized === "done" || normalized === "sync_completed";
}

function isProviderFailed(status?: string | null) {
  if (!status) return false;
  const normalized = normalizeStatusText(status);
  return normalized === "failed" ||
    normalized === "fail" ||
    normalized === "failure" ||
    normalized === "error" ||
    normalized === "cancelled" ||
    normalized === "canceled";
}

function normalizeStatusText(status?: string | null) {
  return typeof status === "string" && status.trim().length > 0 ? status.trim().toLowerCase() : "pending";
}

function firstFiniteNumber(values: unknown[]) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
}

function clampProgress(value: unknown, max = 99) {
  const num = typeof value === "string"
    ? Number(value.match(/\d+(?:\.\d+)?/)?.[0])
    : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(Math.max(Math.round(num), 0), max);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}
