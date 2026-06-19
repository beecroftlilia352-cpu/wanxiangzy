// Shared status-polling primitives, lifted from the garment try-on flow
// (`features/tryon/create/status-sync.ts`). The try-on module keeps a thin
// re-export of these so existing callers don't change.

import {
    ADAPTIVE_POLL_SCHEDULE,
    POLL_BASE_BUDGET_MS,
    POLL_FETCH_TIMEOUT_MS,
    POLL_HIDDEN_DELAY_MS,
    POLL_MAX_BUDGET_MS,
    POLL_MAX_EXPECTED_COUNT,
    POLL_PER_ITEM_BUDGET_MS,
} from "./constants";

/**
 * Sleep for `ms` milliseconds, but reject early with an AbortError if `signal`
 * aborts. Uses `globalThis.setTimeout` so the module works in both the browser
 * and Node (unit tests), and timers can be stubbed via `globalThis.setTimeout`.
 */
export function waitForAbortableDelay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }

        const timer = globalThis.setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
        }, ms);
        const abort = () => {
            globalThis.clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        };
        signal.addEventListener("abort", abort, { once: true });
    });
}

/** True when `error` represents a user/parent abort rather than a real failure. */
export function isAbortLikeError(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError")
    );
}

/** A single adaptive backoff bucket: poll every `ms` while attempts < `upTo`. */
export type AdaptivePollScheduleBucket = { upTo: number; ms: number };
export type AdaptivePollSchedule = ReadonlyArray<AdaptivePollScheduleBucket>;

/**
 * Resolve the delay before the next poll given the number of completed attempts.
 * The final bucket (with `upTo = +Infinity`) is the steady-state delay.
 */
export function getAdaptivePollDelayMs(
    attempts: number,
    schedule: AdaptivePollSchedule = ADAPTIVE_POLL_SCHEDULE,
    fallbackMs = 15_000,
): number {
    for (const bucket of schedule) {
        if (attempts < bucket.upTo) return bucket.ms;
    }
    return fallbackMs;
}

/**
 * Build a `(attempts, signal) => Promise<void>` waiter that respects the
 * adaptive schedule and falls back to `hiddenMs` when the tab is hidden.
 */
export function createAdaptivePollDelay(
    schedule: AdaptivePollSchedule = ADAPTIVE_POLL_SCHEDULE,
    hiddenMs: number = POLL_HIDDEN_DELAY_MS,
) {
    return function wait(attempts: number, signal: AbortSignal): Promise<void> {
        const delay =
            typeof document !== "undefined" && document.visibilityState === "hidden"
                ? hiddenMs
                : getAdaptivePollDelayMs(attempts, schedule);
        return waitForAbortableDelay(delay, signal);
    };
}

/**
 * Compute the overall wall-clock budget for a polling session as a function
 * of expected result count: `baseMs + perItemMs * count`, clamped to
 * `[baseMs, maxMs]`.
 */
export function getTotalPollBudgetMs(
    expectedCount: number,
    options: { baseMs?: number; perItemMs?: number; maxMs?: number; cap?: number } = {},
): number {
    const baseMs = options.baseMs ?? POLL_BASE_BUDGET_MS;
    const perItemMs = options.perItemMs ?? POLL_PER_ITEM_BUDGET_MS;
    const maxMs = options.maxMs ?? POLL_MAX_BUDGET_MS;
    const cap = options.cap ?? POLL_MAX_EXPECTED_COUNT;
    const count = Math.max(1, Math.min(Math.round(Number(expectedCount) || 1), cap));
    const dynamic = baseMs + count * perItemMs;
    return Math.min(Math.max(dynamic, baseMs), maxMs);
}

/**
 * Typed registry of in-flight status watchers keyed by an arbitrary ID.
 * Used to dedupe concurrent watchers across components and to abort them
 * cleanly on unmount.
 */
export class StatusWatchers<TKey> {
    private readonly map = new Map<TKey, AbortController>();

    set(key: TKey, controller: AbortController): void {
        const existing = this.map.get(key);
        if (existing && existing !== controller && !existing.signal.aborted) {
            existing.abort();
        }
        this.map.set(key, controller);
    }

    get(key: TKey): AbortController | undefined {
        return this.map.get(key);
    }

    has(key: TKey): boolean {
        const controller = this.map.get(key);
        return Boolean(controller && !controller.signal.aborted);
    }

    delete(key: TKey, controller?: AbortController): void {
        const current = this.map.get(key);
        if (!current) return;
        if (controller && current !== controller) return;
        this.map.delete(key);
    }

    abort(key?: TKey): void {
        if (key === undefined) {
            for (const controller of this.map.values()) controller.abort();
            this.map.clear();
            return;
        }
        const controller = this.map.get(key);
        if (controller) {
            controller.abort();
            this.map.delete(key);
        }
    }

    get size(): number {
        return this.map.size;
    }

    forEach(callback: (controller: AbortController, key: TKey) => void): void {
        for (const [key, controller] of this.map) callback(controller, key);
    }
}

/**
 * Issue a `fetch` that respects both the parent `watcherSignal` and a per-request
 * `timeoutMs`. Always uses `cache: "no-store"` because status responses are
 * time-sensitive and must not be cached by the browser or any intermediate proxy.
 */
export async function fetchWithAbortAndTimeout(
    url: string,
    watcherSignal: AbortSignal,
    timeoutMs: number = POLL_FETCH_TIMEOUT_MS,
    init: RequestInit = {},
): Promise<Response> {
    const controller = new AbortController();
    const relayAbort = () => controller.abort();
    watcherSignal.addEventListener("abort", relayAbort, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...init,
            cache: "no-store",
            signal: controller.signal,
        });
    } finally {
        globalThis.clearTimeout(timeout);
        watcherSignal.removeEventListener("abort", relayAbort);
    }
}
