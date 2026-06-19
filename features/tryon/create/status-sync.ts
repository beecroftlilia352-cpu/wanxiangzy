import { safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import {
    createAdaptivePollDelay,
    fetchWithAbortAndTimeout,
    getTotalPollBudgetMs,
    isAbortLikeError,
    StatusWatchers,
    waitForAbortableDelay,
    type AdaptivePollSchedule,
} from "@/lib/poll/status-poll";
import {
    POLL_BASE_BUDGET_MS,
    POLL_FETCH_TIMEOUT_MS,
    POLL_HIDDEN_DELAY_MS,
    POLL_MAX_BUDGET_MS,
    POLL_PER_ITEM_BUDGET_MS,
} from "@/lib/poll/constants";
import {
    MAX_TRYON_OUTPUT_IMAGES,
    TRYON_STATUS_HIDDEN_POLL_MS,
    TRYON_STATUS_POLL_BASE_TIMEOUT_MS,
    TRYON_STATUS_POLL_MAX_TIMEOUT_MS,
    TRYON_STATUS_POLL_PER_IMAGE_MS,
} from "./constants";

export {
    isAbortLikeError,
    waitForAbortableDelay,
    StatusWatchers,
    fetchWithAbortAndTimeout,
    getTotalPollBudgetMs,
};

// Keep the historical try-on name. The shared registry is a generic class — using
// `string` as the key preserves the previous Map-of-string behavior exactly.
export const activeTryOnStatusWatchers = new StatusWatchers<string>();

const TRYON_ADAPTIVE_SCHEDULE: AdaptivePollSchedule = [
    { upTo: 1, ms: 5_000 },
    { upTo: 3, ms: 7_000 },
    { upTo: 8, ms: 10_000 },
    { upTo: Number.POSITIVE_INFINITY, ms: 15_000 },
];

export async function fetchTryOnGenerationStatus(
    generationId: string,
    watcherSignal: AbortSignal,
    timeoutMs: number = POLL_FETCH_TIMEOUT_MS,
) {
    return fetchWithAbortAndTimeout(
        `/api/tryon?generation_id=${encodeURIComponent(generationId)}`,
        watcherSignal,
        timeoutMs,
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
    // Backwards-compatible: keep the old "5/7/10/15" table-driven behavior.
    if (attempts < 1) return 5_000;
    if (attempts < 3) return 7_000;
    if (attempts < 8) return 10_000;
    return 15_000;
}

export function waitForTryOnStatusPoll(attempts: number, signal: AbortSignal) {
    return createAdaptivePollDelay(TRYON_ADAPTIVE_SCHEDULE, TRYON_STATUS_HIDDEN_POLL_MS)(attempts, signal);
}

export function getTryOnStatusPollTimeoutMs(expectedCount: number) {
    // Preserve the original ceiling/floor/clamp semantics.
    const count = Math.max(1, Math.min(Math.round(Number(expectedCount) || 1), MAX_TRYON_OUTPUT_IMAGES));
    const dynamicTimeout = TRYON_STATUS_POLL_BASE_TIMEOUT_MS + count * TRYON_STATUS_POLL_PER_IMAGE_MS;
    return Math.min(Math.max(dynamicTimeout, TRYON_STATUS_POLL_BASE_TIMEOUT_MS), TRYON_STATUS_POLL_MAX_TIMEOUT_MS);
}

// Re-export the shared timeouts so any external reader of the old module keeps
// working even if they imported from the wrong place.
export {
    POLL_BASE_BUDGET_MS,
    POLL_PER_ITEM_BUDGET_MS,
    POLL_MAX_BUDGET_MS,
    POLL_FETCH_TIMEOUT_MS,
    POLL_HIDDEN_DELAY_MS,
};
