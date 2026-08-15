"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, ImageIcon, Loader2, RefreshCw, XCircle } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useTranslations } from "next-intl";
import type { TaskQueueItem, TaskQueuePayload } from "@/lib/task-queue";
import { isTaskFinished, isTaskRunning } from "@/lib/task-queue";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";

type QueueSummary = {
  totalTaskNum: number;
  finishedTaskNum: number;
  finishedNeedReadTaskNum: number;
  runningTaskNum: number;
  failedTaskNum: number;
};

const EMPTY_QUEUE_SUMMARY: QueueSummary = {
  totalTaskNum: 0,
  finishedTaskNum: 0,
  finishedNeedReadTaskNum: 0,
  runningTaskNum: 0,
  failedTaskNum: 0,
};

const TASK_QUEUE_BADGE_RUNNING_POLL_MS = 15_000;
const TASK_QUEUE_BADGE_IDLE_POLL_MS = 180_000;
const TASK_QUEUE_MENU_RUNNING_POLL_MS = 20_000;
const TASK_QUEUE_MENU_IDLE_POLL_MS = 120_000;

export function TaskQueueButton() {
  const t = useTranslations("Shared");
  const [rows, setRows] = useState<TaskQueueItem[]>([]);
  const [summary, setSummary] = useState<QueueSummary>(EMPTY_QUEUE_SUMMARY);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"running" | "finished">("running");
  const [loading, setLoading] = useState(false);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const detailsLoadedRef = useRef(false);
  const summaryInFlightRef = useRef(false);
  const queueInFlightRef = useRef(false);
  const rowsSignatureRef = useRef("");
  const summarySignatureRef = useRef("");

  const running = rows.filter(isTaskRunning);
  const finished = rows.filter(isTaskFinished);
  const runningCount = detailsLoaded
    ? summaryLoaded
      ? Math.min(running.length, summary.runningTaskNum)
      : running.length
    : summaryLoaded
      ? summary.runningTaskNum
      : 0;
  const finishedCount = Math.max(summary.finishedTaskNum + summary.failedTaskNum, finished.length);
  const visibleRunning = detailsLoaded && summaryLoaded ? running.slice(0, runningCount) : running;
  const activeRows = activeTab === "running" ? visibleRunning : finished;
  const groupedRows = groupQueueRows(activeRows.slice(0, 12), t);
  const isRunning = runningCount > 0;
  const totalCount = Math.max(summary.totalTaskNum, runningCount + finishedCount);

  const applySummary = useCallback((payload: TaskQueuePayload) => {
    const nextSummary = normalizeSummaryPayload(payload);
    setSummaryLoaded(true);
    const summarySignature = JSON.stringify(nextSummary);
    if (summarySignature !== summarySignatureRef.current) {
      summarySignatureRef.current = summarySignature;
      setSummary(nextSummary);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (summaryInFlightRef.current) return;
    summaryInFlightRef.current = true;
    try {
      const res = await fetch("/api/task-queue?summary=1", { cache: "no-store" });
      const payload = await res.json().catch(() => ({})) as TaskQueuePayload;
      if (!res.ok) return;
      applySummary(payload);
    } catch {
      // Keep the last good count; this poll is intentionally lightweight.
    } finally {
      summaryInFlightRef.current = false;
    }
  }, [applySummary]);

  const loadQueue = useCallback(async (showSpinner = false) => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (queueInFlightRef.current) return;
    queueInFlightRef.current = true;
    if (showSpinner || !detailsLoadedRef.current) setLoading(true);
    try {
      const res = await fetch("/api/task-queue", { cache: "no-store" });
      const payload = await res.json().catch(() => ({})) as TaskQueuePayload;
      if (!res.ok) return;
      const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
      const rowsSignature = JSON.stringify(nextRows.map((item) => [
        item.id,
        item.status,
        item.statusGroup,
        item.progress,
        item.updatedAt,
        item.resultCount,
        item.expectedCount,
        item.error,
        safeTaskUrls(item.thumbnails).join("|"),
      ]));
      if (rowsSignature !== rowsSignatureRef.current) {
        rowsSignatureRef.current = rowsSignature;
        setRows(nextRows);
      }
      detailsLoadedRef.current = true;
      setDetailsLoaded(true);
      applySummary(payload);
    } catch {
      // Detail loading is best-effort; summary polling keeps the badge fresh.
    } finally {
      queueInFlightRef.current = false;
      setLoading(false);
    }
  }, [applySummary]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const serverRunningCount = Math.max(0, summary.runningTaskNum);
    const needsVerification = serverRunningCount > 0 && (!detailsLoadedRef.current || serverRunningCount !== running.length);
    const needsClear = serverRunningCount === 0 && detailsLoadedRef.current && running.length > 0;
    if (needsVerification || needsClear) void loadQueue();
  }, [loadQueue, running.length, summary.runningTaskNum]);

  useEffect(() => {
    if (open) return;
    const timer = window.setInterval(loadSummary, isRunning ? TASK_QUEUE_BADGE_RUNNING_POLL_MS : TASK_QUEUE_BADGE_IDLE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [isRunning, loadSummary, open]);

  useEffect(() => {
    if (!open) return;
    loadQueue();
    const timer = window.setInterval(loadQueue, isRunning ? TASK_QUEUE_MENU_RUNNING_POLL_MS : TASK_QUEUE_MENU_IDLE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [isRunning, loadQueue, open]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "hidden") return;
      loadSummary();
      if (open) loadQueue();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [loadQueue, loadSummary, open]);

  useEffect(() => {
    if (runningCount > 0) setActiveTab("running");
    else if (finishedCount > 0) setActiveTab("finished");
  }, [finishedCount, runningCount]);

  const buttonLabel = useMemo(() => (
    isRunning
      ? t("taskWithCount", { count: Math.max(runningCount, 1) })
      : t("taskWithCount", { count: summary.finishedNeedReadTaskNum || totalCount || 0 })
  ), [isRunning, runningCount, summary.finishedNeedReadTaskNum, totalCount, t]);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="mac-button inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-[var(--mac-accent)]"
        >
          {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--mac-accent)] motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          {buttonLabel}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="mac-surface z-[90] w-[min(320px,calc(100vw-24px))] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_24px_90px_rgba(15,23,42,0.18)]"
        >
          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("finished")}
              className={`h-8 rounded-lg text-xs font-bold transition ${activeTab === "finished" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
            >
              {t("finishedTabCount", { count: finishedCount })}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("running")}
              className={`h-8 rounded-lg text-xs font-bold transition ${activeTab === "running" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
            >
              {t("runningTabCount", { count: runningCount })}
            </button>
          </div>

          <div className="mt-3 max-h-[360px] space-y-1 overflow-y-auto">
            {loading && !detailsLoaded ? (
              <div className="flex h-28 items-center justify-center text-xs font-semibold text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {t("loadingTasks")}
              </div>
            ) : activeRows.length ? (
              groupedRows.map((group) => (
                <div key={group.label}>
                  <div className="px-2 pb-1 pt-2 text-[11px] font-bold text-slate-400">{group.label}</div>
                  <div className="space-y-1">
                    {group.rows.map((item) => (
                      <DropdownMenu.Item key={item.id} asChild>
                        <Link
                          href={getTaskQueueHref(item)}
                          className="flex items-center gap-3 rounded-xl px-2 py-2 outline-none transition hover:bg-slate-50"
                        >
                          <StatusDot item={item} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
                            <p className="mt-0.5 line-clamp-1 break-words text-xs text-slate-400">{item.error || getQueueMeta(item)}</p>
                          </div>
                          <ThumbnailStack urls={item.thumbnails} />
                        </Link>
                      </DropdownMenu.Item>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex h-28 flex-col items-center justify-center text-center text-xs text-slate-400">
                <Clock3 className="mb-2 h-5 w-5" aria-hidden="true" />
                {activeTab === "running" ? t("noRunningTasks") : t("noFinishedTasks")}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => void loadQueue(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
              {t("refresh")}
            </button>
            <DropdownMenu.Item asChild>
              <Link href="/history" className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white outline-none">
                {t("viewAllTasks")}
              </Link>
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ThumbnailStack({ urls }: { urls: unknown }) {
  const safeUrls = safeTaskUrls(urls).slice(0, 2);
  if (!safeUrls.length) {
    return (
      <span className="flex h-10 w-8 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-[10px] font-black text-slate-300">
        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex -space-x-2">
      {safeUrls.map((url, index) => (
        <RawPreviewImage
          key={`${url}-${index}`}
          src={url}
          alt=""
          width={32}
          height={40}
          loading="lazy"
          decoding="async"
          className="h-10 w-8 rounded-lg border border-white bg-slate-100 object-cover shadow-sm"
        />
      ))}
    </span>
  );
}

function safeTaskUrls(value: unknown) {
  return Array.isArray(value) ? value.filter((url): url is string => typeof url === "string" && url.trim().length > 0) : [];
}

function getTaskQueueHref(item: TaskQueueItem) {
  if (isTaskRunning(item)) return `/history?detail=${encodeURIComponent(item.id)}`;
  return item.applyUrl || `/history?detail=${encodeURIComponent(item.id)}`;
}

function StatusDot({ item }: { item: TaskQueueItem }) {
  if (isTaskRunning(item)) {
    const progress = clampProgress(item.progress);
    return (
      <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-[var(--mac-accent-soft)] text-[var(--mac-accent)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {progress > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-[10px] font-black leading-3 text-[var(--mac-accent)] shadow-sm">
            {progress}
          </span>
        )}
      </span>
    );
  }
  if (item.statusGroup === "failed" || isFailedQueueStatus(item.status)) {
    return <XCircle className="h-5 w-5 text-red-400" aria-hidden="true" />;
  }
  return <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />;
}

function getQueueMeta(item: TaskQueueItem) {
  if (isTaskRunning(item)) {
    const progress = clampProgress(item.progress);
    return progress > 0 ? `${progress}% · ${item.time || item.status}` : item.time || item.status;
  }
  return item.time || item.status;
}

function clampProgress(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(Math.max(Math.round(num), 0), 100);
}

function normalizeSummaryPayload(payload: TaskQueuePayload): QueueSummary {
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const rowRunningCount = rows.filter(isTaskRunning).length;
  const rowFailedCount = rows.filter((row) => row.statusGroup === "failed").length;
  const rowFinishedCount = rows.filter((row) => row.statusGroup === "completed").length;
  const hasDetailRows = Array.isArray(payload.rows);
  const failedTaskNum = firstFiniteNumber(data.failedTaskNum, payload.failedTaskNum, payload.failedCount, rowFailedCount);
  const finishedTaskNum = firstFiniteNumber(
    data.finishedTaskNum,
    payload.finishedTaskNum,
    typeof payload.finishedCount === "number" ? Math.max(payload.finishedCount - failedTaskNum, 0) : undefined,
    rowFinishedCount
  );
  const runningTaskNum = hasDetailRows
    ? rowRunningCount
    : firstFiniteNumber(data.runningTaskNum, payload.runningTaskNum, payload.runningCount, rowRunningCount);
  const totalTaskNum = firstFiniteNumber(
    data.totalTaskNum,
    payload.totalTaskNum,
    payload.totalCount,
    runningTaskNum + finishedTaskNum + failedTaskNum
  );

  return {
    totalTaskNum,
    finishedTaskNum,
    finishedNeedReadTaskNum: firstFiniteNumber(data.finishedNeedReadTaskNum, payload.finishedNeedReadTaskNum, 0),
    runningTaskNum,
    failedTaskNum,
  };
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0) return Math.round(num);
  }
  return 0;
}

function isFailedQueueStatus(status: string) {
  const normalized = status.toLowerCase();
  return normalized === "failed" || normalized === "error" || normalized === "cancelled" || normalized === "canceled";
}

function groupQueueRows(items: TaskQueueItem[], t: (key: string) => string) {
  const groups: { label: string; rows: TaskQueueItem[] }[] = [];
  for (const item of items) {
    const label = getQueueDateLabel(item.createdAt, t);
    const group = groups.find((entry) => entry.label === label);
    if (group) group.rows.push(item);
    else groups.push({ label, rows: [item] });
  }
  return groups;
}

function getQueueDateLabel(value: string, t: (key: string) => string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return t("dateEarlier");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((today - target) / 86400000);
  if (diffDays === 0) return t("dateToday");
  if (diffDays === 1) return t("dateYesterday");
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
