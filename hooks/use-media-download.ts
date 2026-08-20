"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { downloadMediaFile, downloadMediaFiles, type MediaDownloadProgress } from "@/lib/media-download";

export type MediaDownloadActionState = {
  status: "idle" | "running" | "success" | "error";
  progress: MediaDownloadProgress | null;
};

const IDLE_STATE: MediaDownloadActionState = { status: "idle", progress: null };
const SUCCESS_HOLD_MS = 1_500;
const ERROR_HOLD_MS = 2_400;

export function useMediaDownload() {
  const [singleState, setSingleState] = useState<MediaDownloadActionState>(IDLE_STATE);
  const [batchState, setBatchState] = useState<MediaDownloadActionState>(IDLE_STATE);
  const singleControllerRef = useRef<AbortController | null>(null);
  const batchControllerRef = useRef<AbortController | null>(null);
  const singleResetRef = useRef<number | null>(null);
  const batchResetRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    // A user-started download should survive closing the preview or navigating
    // between studio modules. Only stop component state updates after unmount;
    // the browser transfer/local ZIP is allowed to finish in the background.
    mountedRef.current = false;
    if (singleResetRef.current !== null) window.clearTimeout(singleResetRef.current);
    if (batchResetRef.current !== null) window.clearTimeout(batchResetRef.current);
  }, []);

  const scheduleReset = useCallback((kind: "single" | "batch", setter: typeof setSingleState, delay: number) => {
    const timerRef = kind === "single" ? singleResetRef : batchResetRef;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setter(IDLE_STATE);
      timerRef.current = null;
    }, delay);
  }, []);

  const downloadOne = useCallback(async (input: {
    url: string;
    filename: string;
    errorFallback: string;
  }) => {
    if (singleControllerRef.current) return false;
    if (singleResetRef.current !== null) {
      window.clearTimeout(singleResetRef.current);
      singleResetRef.current = null;
    }
    const controller = new AbortController();
    singleControllerRef.current = controller;
    setSingleState({
      status: "running",
      progress: { phase: "saving", completed: 1, total: 1, percent: 100 },
    });

    try {
      await downloadMediaFile(input.url, input.filename, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (mountedRef.current) setSingleState({ status: "running", progress });
        },
      });
      if (!mountedRef.current) return true;
      setSingleState({
        status: "success",
        progress: { phase: "completed", completed: 1, total: 1, percent: 100 },
      });
      scheduleReset("single", setSingleState, SUCCESS_HOLD_MS);
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      if (!mountedRef.current) return false;
      setSingleState({ status: "error", progress: null });
      toast.error(error instanceof Error ? error.message : input.errorFallback);
      scheduleReset("single", setSingleState, ERROR_HOLD_MS);
      return false;
    } finally {
      if (singleControllerRef.current === controller) singleControllerRef.current = null;
    }
  }, [scheduleReset]);

  const downloadBatch = useCallback(async (input: {
    urls: string[];
    filename: string;
    label: string;
    preparedDownloads?: Array<{ url: string; filename: string }>;
  }) => {
    if (batchControllerRef.current) return false;
    if (batchResetRef.current !== null) {
      window.clearTimeout(batchResetRef.current);
      batchResetRef.current = null;
    }
    const controller = new AbortController();
    batchControllerRef.current = controller;
    setBatchState({
      status: "running",
      progress: { phase: "saving", completed: 0, total: input.urls.length, percent: 0 },
    });

    try {
      const result = await downloadMediaFiles({
        urls: input.urls,
        filenamePrefix: input.filename,
        preparedDownloads: input.preparedDownloads,
        signal: controller.signal,
        onProgress: (progress) => {
          if (mountedRef.current) setBatchState({ status: "running", progress });
        },
      });
      if (!mountedRef.current) return Boolean(result?.successCount);
      if (!result?.successCount) {
        setBatchState({ status: "error", progress: null });
        scheduleReset("batch", setBatchState, ERROR_HOLD_MS);
        return false;
      }
      setBatchState({
        status: "success",
        progress: {
          phase: "completed",
          completed: result.successCount,
          total: input.urls.length,
          percent: 100,
        },
      });
      scheduleReset("batch", setBatchState, SUCCESS_HOLD_MS);
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      if (!mountedRef.current) return false;
      setBatchState({ status: "error", progress: null });
      toast.error(error instanceof Error ? error.message : "下载失败，请重试");
      scheduleReset("batch", setBatchState, ERROR_HOLD_MS);
      return false;
    } finally {
      if (batchControllerRef.current === controller) batchControllerRef.current = null;
    }
  }, [scheduleReset]);

  return {
    singleState,
    batchState,
    downloadOne,
    downloadBatch,
  };
}

export function getBatchDownloadStatusLabel(
  defaultLabel: string,
  state: MediaDownloadActionState,
) {
  if (state.status === "success") return defaultLabel;
  if (state.status === "error") return defaultLabel;
  const progress = state.progress;
  if (state.status !== "running" || !progress) return defaultLabel;
  if ((progress.phase === "downloading" || progress.phase === "saving") && progress.completed > 0) {
    return `${progress.completed}/${progress.total}`;
  }
  if (progress.phase === "packing" && progress.percent !== null) {
    return `${progress.percent}%`;
  }
  return `${defaultLabel}…`;
}
