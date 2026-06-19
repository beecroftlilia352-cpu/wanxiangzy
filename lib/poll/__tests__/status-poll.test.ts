import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    POLL_BASE_BUDGET_MS,
    POLL_FETCH_TIMEOUT_MS,
    POLL_HIDDEN_DELAY_MS,
    POLL_MAX_BUDGET_MS,
    POLL_PER_ITEM_BUDGET_MS,
} from "@/lib/poll/constants";
import {
    StatusWatchers,
    createAdaptivePollDelay,
    fetchWithAbortAndTimeout,
    getAdaptivePollDelayMs,
    getTotalPollBudgetMs,
    isAbortLikeError,
    waitForAbortableDelay,
} from "@/lib/poll/status-poll";

// The shared polling primitives are browser-first (they use window.setTimeout
// and document.visibilityState). Provide a minimal Node-compatible stub for
// the unit tests so we don't need happy-dom/jsdom.
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

interface StubTimer {
    id: number;
    fireAt: number;
    callback: () => void;
}

function installFakeTimers() {
    const timers = new Map<number, StubTimer>();
    let nextId = 1;
    let now = 0;

    const setTimeoutStub = ((callback: () => void, ms: number) => {
        const id = nextId++;
        timers.set(id, { id, fireAt: now + ms, callback });
        return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    const clearTimeoutStub = ((id: ReturnType<typeof setTimeout>) => {
        timers.delete(Number(id));
    }) as typeof clearTimeout;

    globalThis.setTimeout = setTimeoutStub;
    globalThis.clearTimeout = clearTimeoutStub;

    return {
        advance(ms: number) {
            now += ms;
            const due = [...timers.values()].filter((t) => t.fireAt <= now).sort((a, b) => a.fireAt - b.fireAt);
            for (const timer of due) {
                timers.delete(timer.id);
                timer.callback();
            }
        },
        pending(): number {
            return timers.size;
        },
        now: () => now,
        restore() {
            globalThis.setTimeout = realSetTimeout;
            globalThis.clearTimeout = realClearTimeout;
        },
    };
}

afterEach(() => {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    vi.restoreAllMocks();
});

describe("getAdaptivePollDelayMs", () => {
    it("matches the original 5/7/10/15 schedule", () => {
        const schedule = [
            { upTo: 1, ms: 5_000 },
            { upTo: 3, ms: 7_000 },
            { upTo: 8, ms: 10_000 },
            { upTo: Number.POSITIVE_INFINITY, ms: 15_000 },
        ];
        expect(getAdaptivePollDelayMs(0, schedule)).toBe(5_000);
        expect(getAdaptivePollDelayMs(1, schedule)).toBe(7_000);
        expect(getAdaptivePollDelayMs(2, schedule)).toBe(7_000);
        expect(getAdaptivePollDelayMs(3, schedule)).toBe(10_000);
        expect(getAdaptivePollDelayMs(7, schedule)).toBe(10_000);
        expect(getAdaptivePollDelayMs(8, schedule)).toBe(15_000);
        expect(getAdaptivePollDelayMs(999, schedule)).toBe(15_000);
    });

    it("falls back when the schedule is empty", () => {
        expect(getAdaptivePollDelayMs(0, [], 9_999)).toBe(9_999);
    });

    it("uses the default schedule when none is provided", () => {
        expect(getAdaptivePollDelayMs(0)).toBe(5_000);
        expect(getAdaptivePollDelayMs(50)).toBe(15_000);
    });
});

describe("getTotalPollBudgetMs", () => {
    it("scales linearly with expected count, clamped to [base, max]", () => {
        const base = POLL_BASE_BUDGET_MS;
        const per = POLL_PER_ITEM_BUDGET_MS;
        const max = POLL_MAX_BUDGET_MS;

        // Single image: base + 1*per.
        expect(getTotalPollBudgetMs(1)).toBe(base + per);
        // Two images: base + 2*per.
        expect(getTotalPollBudgetMs(2)).toBe(base + 2 * per);
        // Way above cap: max.
        expect(getTotalPollBudgetMs(1_000)).toBe(max);
    });

    it("clamps invalid expected counts to 1", () => {
        const base = POLL_BASE_BUDGET_MS;
        const per = POLL_PER_ITEM_BUDGET_MS;
        expect(getTotalPollBudgetMs(0)).toBe(base + per);
        expect(getTotalPollBudgetMs(Number.NaN)).toBe(base + per);
        expect(getTotalPollBudgetMs(-3)).toBe(base + per);
    });

    it("respects custom base/per/max overrides", () => {
        const budget = getTotalPollBudgetMs(2, { baseMs: 10_000, perItemMs: 5_000, maxMs: 100_000 });
        expect(budget).toBe(20_000);
    });
});

describe("waitForAbortableDelay", () => {
    it("resolves after the requested delay", async () => {
        const timers = installFakeTimers();
        const signal = new AbortController().signal;
        let resolved = false;
        const promise = waitForAbortableDelay(1_000, signal).then(() => {
            resolved = true;
        });
        // Not yet resolved.
        await Promise.resolve();
        expect(resolved).toBe(false);
        timers.advance(999);
        await Promise.resolve();
        expect(resolved).toBe(false);
        timers.advance(1);
        await promise;
        expect(resolved).toBe(true);
        timers.restore();
    });

    it("rejects with AbortError when the signal aborts mid-flight", async () => {
        const timers = installFakeTimers();
        const controller = new AbortController();
        let rejection: unknown;
        const promise = waitForAbortableDelay(1_000, controller.signal).catch((err) => {
            rejection = err;
        });
        await Promise.resolve();
        controller.abort();
        await promise;
        expect(isAbortLikeError(rejection)).toBe(true);
        expect(timers.pending()).toBe(0); // listener cleaned up the timer
        timers.restore();
    });

    it("rejects immediately when the signal is already aborted", async () => {
        const timers = installFakeTimers();
        const controller = new AbortController();
        controller.abort();
        await expect(waitForAbortableDelay(1_000, controller.signal)).rejects.toBeInstanceOf(DOMException);
        timers.restore();
    });
});

describe("createAdaptivePollDelay", () => {
    const originalDocument = (globalThis as { document?: unknown }).document;
    afterEach(() => {
        if (originalDocument === undefined) {
            delete (globalThis as { document?: unknown }).document;
        } else {
            (globalThis as { document?: unknown }).document = originalDocument;
        }
    });

    it("uses the adaptive delay when the tab is visible", () => {
        (globalThis as { document?: unknown }).document = { visibilityState: "visible" };
        const wait = createAdaptivePollDelay(
            [
                { upTo: 1, ms: 5_000 },
                { upTo: Number.POSITIVE_INFINITY, ms: 10_000 },
            ],
            30_000,
        );
        const timers = installFakeTimers();
        const promise = wait(0, new AbortController().signal);
        timers.advance(4_999);
        timers.advance(1);
        return promise.then(() => {
            expect(timers.pending()).toBe(0);
            timers.restore();
        });
    });

    it("uses the hidden-tab override when document.visibilityState is 'hidden'", () => {
        (globalThis as { document?: unknown }).document = { visibilityState: "hidden" };
        const wait = createAdaptivePollDelay(
            [{ upTo: Number.POSITIVE_INFINITY, ms: 5_000 }],
            30_000,
        );
        const timers = installFakeTimers();
        const promise = wait(0, new AbortController().signal);
        // 5s adaptive hasn't fired yet.
        timers.advance(4_999);
        return Promise.race([
            promise.then(() => {
                throw new Error("resolved too early — should be hidden 30s");
            }),
            new Promise<void>((resolve) => {
                realSetTimeout(resolve, 5);
            }),
        ]).finally(() => {
            timers.restore();
        });
    });
});

describe("isAbortLikeError", () => {
    it("returns true for AbortError", () => {
        expect(isAbortLikeError(new DOMException("Aborted", "AbortError"))).toBe(true);
        // Plain Error objects whose name was overridden to "AbortError".
        const overridden = new Error("Aborted");
        overridden.name = "AbortError";
        expect(isAbortLikeError(overridden)).toBe(true);
        // Plain Errors with default name "Error" should NOT be treated as aborts.
        expect(isAbortLikeError(new Error("Aborted"))).toBe(false);
        // Non-Error shapes (no prototype) should not match.
        expect(isAbortLikeError({ name: "AbortError", message: "Aborted" })).toBe(false);
    });

    it("returns false for non-abort errors", () => {
        expect(isAbortLikeError(new TypeError("network"))).toBe(false);
        expect(isAbortLikeError(null)).toBe(false);
        expect(isAbortLikeError(undefined)).toBe(false);
    });
});

describe("StatusWatchers", () => {
    it("stores and retrieves controllers by key", () => {
        const watchers = new StatusWatchers<string>();
        const controller = new AbortController();
        watchers.set("a", controller);
        expect(watchers.get("a")).toBe(controller);
        expect(watchers.has("a")).toBe(true);
        expect(watchers.has("b")).toBe(false);
        expect(watchers.size).toBe(1);
    });

    it("aborts an existing watcher when set() is called with a different controller for the same key", () => {
        const watchers = new StatusWatchers<string>();
        const old = new AbortController();
        const fresh = new AbortController();
        watchers.set("a", old);
        watchers.set("a", fresh);
        expect(old.signal.aborted).toBe(true);
        expect(watchers.get("a")).toBe(fresh);
    });

    it("delete() only removes the matching controller", () => {
        const watchers = new StatusWatchers<string>();
        const a = new AbortController();
        const b = new AbortController();
        watchers.set("a", a);
        watchers.set("b", b);
        watchers.delete("a", a);
        expect(watchers.has("a")).toBe(false);
        expect(watchers.has("b")).toBe(true);
        // Mismatched controller: should be a no-op.
        watchers.delete("b", a);
        expect(watchers.has("b")).toBe(true);
    });

    it("abort() with no key aborts every watcher and clears the registry", () => {
        const watchers = new StatusWatchers<string>();
        const a = new AbortController();
        const b = new AbortController();
        watchers.set("a", a);
        watchers.set("b", b);
        watchers.abort();
        expect(a.signal.aborted).toBe(true);
        expect(b.signal.aborted).toBe(true);
        expect(watchers.size).toBe(0);
    });

    it("abort(key) aborts only the named watcher", () => {
        const watchers = new StatusWatchers<string>();
        const a = new AbortController();
        const b = new AbortController();
        watchers.set("a", a);
        watchers.set("b", b);
        watchers.abort("a");
        expect(a.signal.aborted).toBe(true);
        expect(b.signal.aborted).toBe(false);
        expect(watchers.size).toBe(1);
    });

    it("has() returns false for aborted controllers", () => {
        const watchers = new StatusWatchers<string>();
        const controller = new AbortController();
        watchers.set("a", controller);
        expect(watchers.has("a")).toBe(true);
        controller.abort();
        expect(watchers.has("a")).toBe(false);
    });

    it("forEach iterates live watchers", () => {
        const watchers = new StatusWatchers<string>();
        const a = new AbortController();
        const b = new AbortController();
        watchers.set("a", a);
        watchers.set("b", b);
        const seen: string[] = [];
        watchers.forEach((_controller, key) => seen.push(key));
        expect(seen.sort()).toEqual(["a", "b"]);
    });
});

describe("fetchWithAbortAndTimeout", () => {
    let originalFetch: typeof globalThis.fetch;
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("returns the response and forces cache: no-store", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

        const response = await fetchWithAbortAndTimeout("https://example.test/v1/models", new AbortController().signal, 5_000);
        expect(response).toBeInstanceOf(Response);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://example.test/v1/models");
        expect(init.cache).toBe("no-store");
        expect(init.signal).toBeDefined();
    });

    it("aborts the inner request when the watcher signal aborts", async () => {
        let capturedInit: RequestInit | undefined;
        globalThis.fetch = vi.fn((_url, init) => {
            capturedInit = init;
            return new Promise<Response>((_, reject) => {
                init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            });
        }) as unknown as typeof globalThis.fetch;

        const controller = new AbortController();
        const promise = fetchWithAbortAndTimeout("https://example.test/v1/models", controller.signal, 5_000);
        controller.abort();
        await expect(promise).rejects.toBeInstanceOf(DOMException);
        expect(capturedInit?.signal).toBeDefined();
    });

    it("aborts the inner request when the per-request timeout elapses", async () => {
        globalThis.fetch = vi.fn((_url, init) => {
            return new Promise<Response>((_, reject) => {
                init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            });
        }) as unknown as typeof globalThis.fetch;

        await expect(
            fetchWithAbortAndTimeout("https://example.test/v1/models", new AbortController().signal, 50),
        ).rejects.toBeInstanceOf(DOMException);
    });
});

describe("POLL_* constants", () => {
    it("uses the documented defaults", () => {
        expect(POLL_BASE_BUDGET_MS).toBe(20 * 60 * 1000);
        expect(POLL_PER_ITEM_BUDGET_MS).toBe(4 * 60 * 1000);
        expect(POLL_MAX_BUDGET_MS).toBe(90 * 60 * 1000);
        expect(POLL_FETCH_TIMEOUT_MS).toBe(8_000);
        expect(POLL_HIDDEN_DELAY_MS).toBe(30_000);
    });
});
