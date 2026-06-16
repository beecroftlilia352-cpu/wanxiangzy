import { safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import {
  MAX_TRYON_OUTPUT_IMAGES,
  TRYON_STATUS_HIDDEN_POLL_MS,
  TRYON_STATUS_POLL_BASE_TIMEOUT_MS,
  TRYON_STATUS_POLL_MAX_TIMEOUT_MS,
  TRYON_STATUS_POLL_PER_IMAGE_MS,
} from "./constants";

export const activeTryOnStatusWatchers = new Map<string, AbortController>();

export async function fetchTryOnGenerationStatus(
  generationId: string,
  watcherSignal: AbortSignal,
  timeoutMs: number
) {
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  watcherSignal.addEventListener("abort", relayAbort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`/api/tryon?generation_id=${encodeURIComponent(generationId)}`, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
    watcherSignal.removeEventListener("abort", relayAbort);
  }
}

export function isAbortLikeError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function areOrderedUrlsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((url, index) => url === right[index]);
}

export function getTaskPreviewSyncSignature(task: TaskQueueItem | null) {
  if (!task) return "";
  return [
    task.id,
    task.status,
    task.statusGroup,
    task.progress,
    task.expectedCount,
    task.resultCount,
    task.error || "",
    task.updatedAt || "",
    task.completedAt || "",
    safeTaskQueueUrls(task.inputThumbnails).join("|"),
    safeTaskQueueUrls(task.resultThumbnails).join("|"),
    safeTaskQueueUrls(task.thumbnails).join("|"),
  ].join("::");
}

export function getTryOnStatusPollDelayMs(attempts: number) {
  if (attempts < 1) return 5_000;
  if (attempts < 3) return 7_000;
  if (attempts < 8) return 10_000;
  return 15_000;
}

export function waitForTryOnStatusPoll(attempts: number, signal: AbortSignal) {
  const delay = typeof document !== "undefined" && document.visibilityState === "hidden"
    ? TRYON_STATUS_HIDDEN_POLL_MS
    : getTryOnStatusPollDelayMs(attempts);
  return waitForAbortableDelay(delay, signal);
}

export function getTryOnStatusPollTimeoutMs(expectedCount: number) {
  const count = Math.max(1, Math.min(Math.round(Number(expectedCount) || 1), MAX_TRYON_OUTPUT_IMAGES));
  const dynamicTimeout = TRYON_STATUS_POLL_BASE_TIMEOUT_MS + count * TRYON_STATUS_POLL_PER_IMAGE_MS;
  return Math.min(Math.max(dynamicTimeout, TRYON_STATUS_POLL_BASE_TIMEOUT_MS), TRYON_STATUS_POLL_MAX_TIMEOUT_MS);
}

function waitForAbortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}
