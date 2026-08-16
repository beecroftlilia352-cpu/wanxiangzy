"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Lower-level polling primitive used by every studio module's generation
 * status loop. Replaces the copy-pasted `while (attempts < 120) { await sleep(2000); ... }`
 * block found in 8+ page-client.tsx files.
 *
 * The caller is responsible for:
 *   - building the poll URL via `buildUrl`
 *   - deciding when a state is terminal via `isTerminal`
 *   - mutating its own state via `onTick` (for progress / partial results)
 *     and `onComplete` (for final result URLs + error)
 *
 * The primitive handles:
 *   - interval / max-attempt limits
 *   - abort propagation (so a component unmount cancels the loop)
 *   - retrying on any non-2xx (matches the old inline loops' behavior —
 *     transient 4xx like a worker-race 404 or mid-session 401 must NOT
 *     be treated as terminal; if a 4xx is truly fatal, isTerminal will
 *     see status='failed' in a later successful poll)
 */
export type GenerationPollConfig<T> = {
  /** Identifier (generation_id / task_id) used by `buildUrl`. */
  id: string;
  /** Build the full poll URL for `id`. */
  buildUrl: (id: string) => string;
  /** Decide whether the polled state means "done" (success or terminal failure). */
  isTerminal: (state: T) => boolean;
  /** Called for every intermediate state (e.g. progress update). */
  onTick?: (state: T) => void;
  /** Called once when `isTerminal` returns true. */
  onComplete: (state: T) => void;
  /** Called when the loop aborts / errors out. */
  onError?: (error: Error) => void;
  /** Sleep between polls, default 2000ms. */
  intervalMs?: number;
  /** Max attempts before giving up, default 120 (≈ 4 minutes). */
  maxAttempts?: number;
  /** Max consecutive 5xx responses before bailing, default 5. */
  maxConsecutiveServerErrors?: number;
  /** Abort signal — pass `useAbortSignal()` from the component if you want
   *  to cancel mid-flight (e.g. on unmount). */
  signal?: AbortSignal;
};

const DEFAULTS = {
  intervalMs: 2000,
  maxAttempts: 120,
  maxConsecutiveServerErrors: 5,
};

export function useGenerationPolling<T>(config: GenerationPollConfig<T>) {
  const abortRef = useRef<AbortController | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const start = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = config.signal ? linkSignals(controller.signal, config.signal) : controller.signal;

    const settings = {
      intervalMs: DEFAULTS.intervalMs,
      maxAttempts: DEFAULTS.maxAttempts,
      maxConsecutiveServerErrors: DEFAULTS.maxConsecutiveServerErrors,
      ...configRef.current,
    };

    void runLoop<T>({ ...settings, signal });
  }, [config.signal]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { start, stop };
}

async function runLoop<T>(opts: GenerationPollConfig<T> & { signal: AbortSignal }) {
  const {
    id,
    buildUrl,
    isTerminal,
    onTick,
    onComplete,
    onError,
    intervalMs,
    maxAttempts,
    maxConsecutiveServerErrors,
    signal,
  } = opts;

  let attempts = 0;
  let consecutiveServerErrors = 0;
  const attemptLimit = maxAttempts ?? DEFAULTS.maxAttempts;
  while (attempts < attemptLimit) {
    if (signal.aborted) return;
    await sleep(intervalMs ?? DEFAULTS.intervalMs, signal);
    if (signal.aborted) return;
    attempts += 1;
    let response: Response;
    try {
      response = await fetch(buildUrl(id), { signal });
    } catch (error) {
      if (signal.aborted) return;
      onError?.(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    if (!response.ok) {
      consecutiveServerErrors += 1;
      if (consecutiveServerErrors >= (maxConsecutiveServerErrors ?? DEFAULTS.maxConsecutiveServerErrors)) {
        let message = `Service returned ${response.status}`;
        try {
          const body = await response.json();
          if (body && typeof body.error === "string") message = body.error;
        } catch {
          /* swallow */
        }
        onError?.(new Error(message));
        return;
      }
      continue;
    }
    consecutiveServerErrors = 0;
    let state: T;
    try {
      state = (await response.json()) as T;
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    onTick?.(state);
    if (isTerminal(state)) {
      onComplete(state);
      return;
    }
  }
  onError?.(new Error("Generation timed out"));
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function linkSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (a.aborted || b.aborted) controller.abort();
  else {
    a.addEventListener("abort", onAbort, { once: true });
    b.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}