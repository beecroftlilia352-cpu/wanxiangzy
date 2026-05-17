"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TaskSelectionReason = "manual" | "restore" | "completion";

export type TaskSelectionSession = {
  signal: AbortSignal;
  reason: TaskSelectionReason;
  isCurrent: () => boolean;
  finish: () => void;
};

export function useTaskSelectionSession() {
  const sequenceRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const begin = useCallback((taskId?: string | null, reason: TaskSelectionReason = "manual"): TaskSelectionSession => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    controllerRef.current = controller;
    setPendingId(taskId ?? null);

    const isCurrent = () =>
      sequenceRef.current === sequence &&
      controllerRef.current === controller &&
      !controller.signal.aborted;

    return {
      signal: controller.signal,
      reason,
      isCurrent,
      finish: () => {
        if (!isCurrent()) return;
        controllerRef.current = null;
        setPendingId(null);
      },
    };
  }, []);

  const cancel = useCallback(() => {
    sequenceRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPendingId(null);
  }, []);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  return { pendingId, begin, cancel };
}
