// Shared polling constants used by both the garment try-on flow and the canvas
// rehydration flow. The try-on flow keeps a thin re-export of these in
// `features/tryon/create/constants.ts` to avoid breaking existing imports.

export const POLL_BASE_BUDGET_MS = 20 * 60 * 1000; // 20 minutes wall-clock floor
export const POLL_PER_ITEM_BUDGET_MS = 4 * 60 * 1000; // 4 minutes per expected result
export const POLL_MAX_BUDGET_MS = 90 * 60 * 1000; // 90 minutes hard cap
export const POLL_FETCH_TIMEOUT_MS = 8_000; // per-request HTTP timeout
export const POLL_HIDDEN_DELAY_MS = 30_000; // applied when document.visibilityState === "hidden"

// Adaptive schedule: index = number of completed attempts; value = delay before the next poll.
// Mirrors the original try-on schedule (5s → 7s → 10s → 15s).
export const ADAPTIVE_POLL_SCHEDULE: ReadonlyArray<{ upTo: number; ms: number }> = Object.freeze([
    { upTo: 1, ms: 5_000 },
    { upTo: 3, ms: 7_000 },
    { upTo: 8, ms: 10_000 },
    { upTo: Number.POSITIVE_INFINITY, ms: 15_000 },
]);

// Convenience: clamp expected count to a sane range for budget scaling.
export const POLL_MAX_EXPECTED_COUNT = 32;
