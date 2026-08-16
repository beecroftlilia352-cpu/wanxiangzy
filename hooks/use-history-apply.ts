"use client";

import { useEffect, useRef, useState } from "react";
import {
  takeApplyDetail,
  type HistoryApplyDetail,
  type HistoryJobPayload,
} from "@/lib/history-apply";

/**
 * One-shot hydration of `?apply=<id>` on module mount.
 *
 * Replaces the copy-pasted `useEffect(() => { ... takeApplyDetail("kind"); ... },
 * [])` block found in every studio page-client. The caller passes the
 * module-specific kind, an `apply(payload, resultUrls, options)` function
 * that restores its own state, and an optional `error` callback for when the
 * apply itself fails (network mismatch, row missing, etc.).
 *
 * The hook handles:
 *   - URL detection (`?apply=…`) — no-op when the param is absent
 *   - One-shot execution — re-runs only when `kind` or `enabled` flips
 *   - Unmount cancellation — `cancelled` flag prevents setState on stale data
 *   - Single shared `consumed` flag — so the caller's own
 *     `applyXxxHistoryPayload(..., { silent: true })` and an external
 *     "re-apply" button can both signal that the URL has been consumed.
 *
 * The hook does NOT:
 *   - Strip the URL — that's already done by `takeApplyDetail`
 *   - Touch module state directly — that's the caller's job
 */
export type UseHistoryApplyOptions<K extends HistoryJobPayload["kind"]> = {
  /** Module kind matching the history row's `job_payload.kind`. */
  kind: K;
  /** Apply the payload to module state. Called exactly once when a row is found. */
  apply: (
    payload: Extract<HistoryJobPayload, { kind: K }>,
    resultUrls: string[],
    options: { silent: true; row: HistoryApplyDetail<K>["row"] }
  ) => void;
  /** Optional handler for the (rare) case where apply fails inside the caller's logic. */
  onError?: (error: Error) => void;
  /** Set to false to disable (e.g. while the module is still initializing). Defaults to true. */
  enabled?: boolean;
  /** Ref the caller can read to know whether the apply already ran on this mount. */
  consumedRef?: React.MutableRefObject<boolean>;
};

export type UseHistoryApplyResult = {
  /** True while the fetch is in-flight. */
  loading: boolean;
  /** Last detail that was applied (or null if none yet). */
  detail: HistoryApplyDetail | null;
  /** True once a row has been applied (whether or not the row was empty). */
  consumed: boolean;
};

/**
 * Hydrate module state from `?apply=<id>` exactly once on mount.
 *
 * @example
 *   const historyApply = useHistoryApply({
 *     kind: "model",
 *     apply: (payload, resultUrls) => applyModelHistoryPayload(payload, resultUrls, { silent: true }),
 *     onError: (err) => toast.error(err.message),
 *   });
 */
export function useHistoryApply<K extends HistoryJobPayload["kind"]>(
  options: UseHistoryApplyOptions<K>
): UseHistoryApplyResult {
  const { kind, apply, onError, enabled = true, consumedRef } = options;

  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<HistoryApplyDetail | null>(null);
  const [consumed, setConsumed] = useState(false);
  const ranRef = useRef(false);

  // Keep latest callbacks in a ref so the effect can stay `[]`-deps.
  const cbRef = useRef({ apply, onError, consumedRef });
  cbRef.current = { apply, onError, consumedRef };

  useEffect(() => {
    if (!enabled) return;
    if (ranRef.current) return;
    if (typeof window === "undefined") return;

    // Skip the round-trip if there's no `?apply=` param on the URL.
    const url = new URL(window.location.href);
    if (!url.searchParams.get("apply")) return;

    ranRef.current = true;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const result = await takeApplyDetail(kind);
        if (cancelled) return;
        if (!result) return;
        setDetail(result as unknown as HistoryApplyDetail);
        cbRef.current.consumedRef && (cbRef.current.consumedRef.current = true);
        try {
          cbRef.current.apply(
            result.payload as Extract<HistoryJobPayload, { kind: K }>,
            result.resultUrls,
            { silent: true, row: result.row }
          );
        } catch (error) {
          cbRef.current.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
        setConsumed(true);
      } catch (error) {
        cbRef.current.onError?.(error instanceof Error ? error : new Error(String(error)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, enabled]);

  return { loading, detail, consumed };
}