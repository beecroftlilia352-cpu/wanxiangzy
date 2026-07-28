"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  StatusWatchers,
  createAdaptivePollDelay,
  fetchWithAbortAndTimeout,
  getTotalPollBudgetMs,
  isAbortLikeError,
} from "@/lib/poll/status-poll";
import type { ProductRetouchBatch } from "@/lib/product-retouch";

const waitForNextPoll = createAdaptivePollDelay([
  { upTo: 4, ms: 1_500 },
  { upTo: 12, ms: 3_000 },
  { upTo: 40, ms: 6_000 },
  { upTo: Number.POSITIVE_INFINITY, ms: 12_000 },
]);

type WatchOptions = {
  expectedCount?: number;
  signal?: AbortSignal;
  onUpdate: (batch: ProductRetouchBatch) => void;
};

export function useProductRetouchBatch() {
  const watchersRef = useRef(new StatusWatchers<string>());

  useEffect(() => {
    const watchers = watchersRef.current;
    return () => watchers.abort();
  }, []);

  const loadBatch = useCallback(async (id: string, signal?: AbortSignal) => {
    const controller = new AbortController();
    const relayAbort = () => controller.abort();
    signal?.addEventListener("abort", relayAbort, { once: true });
    try {
      const response = await fetchWithAbortAndTimeout(
        `/api/product-retouch/${encodeURIComponent(id)}`,
        controller.signal,
        15_000,
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "商品精修批次读取失败");
      }
      if (!isProductRetouchBatch(payload.batch)) {
        throw new Error("商品精修批次响应无效");
      }
      return payload.batch;
    } finally {
      signal?.removeEventListener("abort", relayAbort);
    }
  }, []);

  const watchBatch = useCallback(async (id: string, options: WatchOptions) => {
    const controller = new AbortController();
    const relayAbort = () => controller.abort();
    options.signal?.addEventListener("abort", relayAbort, { once: true });
    watchersRef.current.set(id, controller);

    const startedAt = Date.now();
    const budget = getTotalPollBudgetMs(options.expectedCount || 1, {
      baseMs: 15 * 60_000,
      perItemMs: 12_000,
      maxMs: 40 * 60_000,
      cap: 120,
    });
    let attempts = 0;

    try {
      while (!controller.signal.aborted) {
        const batch = await loadBatch(id, controller.signal);
        options.onUpdate(batch);
        if (isTerminalBatch(batch)) return batch;
        if (Date.now() - startedAt > budget) {
          throw new Error("批次仍在后台生产，可稍后从左侧任务栏继续查看");
        }
        attempts += 1;
        await waitForNextPoll(attempts, controller.signal);
      }
      throw new DOMException("Aborted", "AbortError");
    } catch (error) {
      if (isAbortLikeError(error)) return null;
      throw error;
    } finally {
      options.signal?.removeEventListener("abort", relayAbort);
      watchersRef.current.delete(id, controller);
    }
  }, [loadBatch]);

  const stopWatching = useCallback((id?: string) => {
    watchersRef.current.abort(id);
  }, []);

  return { loadBatch, watchBatch, stopWatching };
}

export function isTerminalBatch(batch: Pick<ProductRetouchBatch, "status">) {
  return batch.status === "completed"
    || batch.status === "partially_completed"
    || batch.status === "failed";
}

function isProductRetouchBatch(value: unknown): value is ProductRetouchBatch {
  if (!value || typeof value !== "object") return false;
  const batch = value as Partial<ProductRetouchBatch>;
  return typeof batch.id === "string"
    && typeof batch.parentGenerationId === "string"
    && typeof batch.expectedCount === "number"
    && Array.isArray(batch.outputs);
}
