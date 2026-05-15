"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Grid2X2,
  History,
  ImageIcon,
  Layers3,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskDisplayMode, TaskQueueItem, TaskQueuePayload, TaskQueueSummary } from "@/lib/task-queue";
import { isTaskRunning, TASK_DISPLAY_MODE_KEY } from "@/lib/task-queue";

type StudioTaskRailProps = {
  module: string;
  moduleLabel?: string;
  onContinue?: () => void;
  onSelectTask?: (item: TaskQueueItem) => void | Promise<void>;
  optimisticTask?: TaskQueueItem | null;
  className?: string;
};

const EMPTY_SUMMARY: TaskQueueSummary = {
  totalTaskNum: 0,
  finishedTaskNum: 0,
  finishedNeedReadTaskNum: 0,
  runningTaskNum: 0,
  failedTaskNum: 0,
};

const PAGE_SIZE = 24;
const RECENT_TASK_LIMIT = 20;
const CONTINUE_CARD_ID = "__continue__";

export function StudioTaskRail({
  module,
  moduleLabel = "当前模块",
  onContinue,
  onSelectTask,
  optimisticTask,
  className,
}: StudioTaskRailProps) {
  const [rows, setRows] = useState<TaskQueueItem[]>([]);
  const [summary, setSummary] = useState<TaskQueueSummary>(EMPTY_SUMMARY);
  const [expanded, setExpanded] = useState(false);
  const [moduleOnly, setModuleOnly] = useState(true);
  const [displayMode, setDisplayMode] = useState<TaskDisplayMode>("flat");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(CONTINUE_CARD_ID);

  const mergedRows = useMemo(() => {
    if (!optimisticTask) return rows;
    if (rows.some((item) => item.id === optimisticTask.id)) {
      return rows.map((item) => item.id === optimisticTask.id ? { ...item, ...optimisticTask } : item);
    }
    return [optimisticTask, ...rows];
  }, [optimisticTask, rows]);

  const hasRunningTask = mergedRows.some(isTaskRunning) || summary.runningTaskNum > 0;

  const loadQueue = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", expanded ? "80" : String(RECENT_TASK_LIMIT));
      if (!expanded || moduleOnly) params.set("module", module);
      if (expanded && query.trim()) params.set("q", query.trim());

      const res = await fetch(`/api/task-queue?${params.toString()}`, { cache: "no-store" });
      const payload = await res.json().catch(() => ({})) as TaskQueuePayload;
      if (!res.ok) return;

      setRows(Array.isArray(payload.rows) ? payload.rows : []);
      setSummary(normalizeSummary(payload));
    } catch {
      // Keep the last successful task list visible; the next poll will try again.
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [expanded, module, moduleOnly, query]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(TASK_DISPLAY_MODE_KEY);
      if (saved === "flat" || saved === "grouped") setDisplayMode(saved);
    } catch {
      // Local storage can be unavailable in private contexts.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(TASK_DISPLAY_MODE_KEY, displayMode);
    } catch {
      // Best-effort preference persistence.
    }
  }, [displayMode]);

  useEffect(() => {
    setPage(1);
  }, [displayMode, expanded, moduleOnly, query]);

  useEffect(() => {
    loadQueue();
    const timer = window.setInterval(loadQueue, hasRunningTask ? 3000 : 10000);
    return () => window.clearInterval(timer);
  }, [hasRunningTask, loadQueue]);

  useEffect(() => {
    const refresh = () => {
      window.setTimeout(loadQueue, 150);
      window.setTimeout(loadQueue, 1500);
    };
    const refreshVisible = () => {
      if (document.visibilityState === "hidden") return;
      loadQueue();
    };
    window.addEventListener("wanxiang:task-queue-refresh", refresh);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("wanxiang:task-queue-refresh", refresh);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [loadQueue]);

  const recentRows = useMemo(
    () => mergedRows.filter((item) => item.module === module).slice(0, RECENT_TASK_LIMIT),
    [mergedRows, module]
  );

  const expandedRows = useMemo(() => mergedRows.slice(), [mergedRows]);
  const totalPages = Math.max(1, Math.ceil(expandedRows.length / PAGE_SIZE));
  const pagedRows = expandedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const visibleRows = expanded ? pagedRows : recentRows;

  const handleSelect = (item: TaskQueueItem) => {
    setSelectedId(item.id);
    void onSelectTask?.(item);
  };

  const handleContinue = () => {
    setSelectedId(CONTINUE_CARD_ID);
    onContinue?.();
  };

  if (!expanded && !optimisticTask && (!hasLoaded || recentRows.length === 0)) return null;

  return (
    <aside className={cn("studio-task-rail", expanded && "studio-task-rail-expanded", className)} aria-label="任务列表">
      <div className="flex h-full min-h-0 flex-col">
        <div
          className={cn(
            "flex items-center justify-between border-b border-slate-100 py-3",
            expanded ? "gap-2 px-3" : "gap-0.5 px-1.5"
          )}
        >
          <div className="min-w-0 flex-1">
            <div className={cn("flex items-center font-black text-slate-900", expanded ? "gap-1.5 text-sm" : "text-[12px] leading-4")}>
              {expanded && <History className="h-4 w-4 text-rose-500" />}
              <span className="whitespace-nowrap">{expanded ? "全部任务" : "最近任务"}</span>
            </div>
            {expanded && (
              <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">
                {moduleOnly ? moduleLabel : "全部模块"} · {summary.totalTaskNum} 个任务
              </p>
            )}
          </div>
          {expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="收起全部任务"
              title="收起全部任务"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {expanded ? (
          <div className="space-y-3 border-b border-slate-100 px-3 py-3">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-500">
              <Search className="h-3.5 w-3.5" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent font-semibold text-slate-700 outline-none placeholder:text-slate-300"
                placeholder="搜索任务号"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <SegmentButton active={moduleOnly} onClick={() => setModuleOnly(true)}>
                {moduleLabel}
              </SegmentButton>
              <SegmentButton active={!moduleOnly} onClick={() => setModuleOnly(false)}>
                全部模块
              </SegmentButton>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SegmentButton active={displayMode === "flat"} onClick={() => setDisplayMode("flat")} icon={<Grid2X2 className="h-3.5 w-3.5" />}>
                平铺图片
              </SegmentButton>
              <SegmentButton active={displayMode === "grouped"} onClick={() => setDisplayMode("grouped")} icon={<Layers3 className="h-3.5 w-3.5" />}>
                任务拼图
              </SegmentButton>
            </div>
          </div>
        ) : null}

        <div className={cn("min-h-0 flex-1 overflow-y-auto custom-scroll", expanded ? "space-y-2 px-3 py-3" : "space-y-2 px-2 py-2")}>
          {loading && !mergedRows.length ? (
            <TaskRailEmpty loading />
          ) : visibleRows.length ? (
            <>
              {!expanded && <ContinueCard selected={selectedId === CONTINUE_CARD_ID} onClick={handleContinue} />}
              {visibleRows.map((item) => (
                <TaskCard
                  key={item.id}
                  item={item}
                  compact={!expanded}
                  selected={selectedId === item.id}
                  displayMode={displayMode}
                  onClick={() => handleSelect(item)}
                />
              ))}
            </>
          ) : (
            <TaskRailEmpty />
          )}
        </div>

        <div className="border-t border-slate-100 px-3 py-3">
          {expanded ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={loadQueue}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                刷新
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="上一页"
                  title="上一页"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-12 text-center text-xs font-black text-slate-600">
                  {page}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="下一页"
                  title="下一页"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex h-9 w-full items-center justify-center gap-0.5 whitespace-nowrap rounded-lg px-1 text-[12px] font-black text-slate-700 transition hover:bg-slate-100"
            >
              全部任务
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function ContinueCard({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-[68px] w-full items-center justify-center rounded border bg-white px-1 text-center text-[12px] font-medium leading-4 text-slate-600 transition hover:border-blue-300 hover:bg-blue-50/50",
        selected ? "border-blue-500 bg-blue-50/60 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]" : "border-slate-100"
      )}
    >
      <span className="max-w-[3.5em] whitespace-normal break-keep">继续创建</span>
      {selected && <span className="absolute -right-2 top-2 h-[54px] w-1 rounded-full bg-rose-500" />}
    </button>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-black transition",
        active
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200 hover:text-slate-800"
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

function TaskCard({
  item,
  compact,
  selected,
  displayMode,
  onClick,
}: {
  item: TaskQueueItem;
  compact: boolean;
  selected: boolean;
  displayMode: TaskDisplayMode;
  onClick: () => void;
}) {
  const running = isTaskRunning(item);
  const failed = item.statusGroup === "failed";
  const cover = item.resultThumbnails[0] || item.inputThumbnails[0] || item.thumbnails[0] || "";
  const progress = clampProgress(item.progress);

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group relative flex h-[68px] w-full items-center justify-center rounded border bg-white p-1 text-left transition hover:border-blue-300 hover:bg-blue-50/40",
          running && "border-rose-100 bg-rose-50/50",
          selected ? "border-blue-500 bg-blue-50/60 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]" : "border-slate-100"
        )}
        title={item.title || item.id}
      >
        <TaskThumb url={cover} running={running} failed={failed} compact className="h-full w-full" />
        {selected && <span className="absolute -right-2 top-2 h-[54px] w-1 rounded-full bg-rose-500" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full rounded-lg border bg-white p-2 text-left transition hover:border-rose-200 hover:bg-rose-50/40",
        selected ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-100",
        failed && "border-red-200 bg-red-50/60"
      )}
    >
      <div className="flex items-start gap-3">
        <TaskThumb url={cover} running={running} failed={failed} className="h-16 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">{item.title}</p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{item.id}</p>
            </div>
            <StatusPill item={item} />
          </div>
          <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500">
            {failed ? item.error || "任务失败，可重新生成" : getTaskMeta(item, progress)}
          </p>
          <TaskPreviewStrip item={item} displayMode={displayMode} />
        </div>
      </div>
    </button>
  );
}

function TaskThumb({
  url,
  running,
  failed,
  compact = false,
  className,
}: {
  url: string;
  running: boolean;
  failed: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn(
      "relative block overflow-hidden",
      compact ? "rounded bg-white" : "gen-card rounded-lg bg-gradient-to-br from-slate-100 via-rose-50 to-blue-50",
      className
    )}>
      {url ? (
        <img src={url} alt="" className="relative z-[1] h-full w-full object-cover" />
      ) : (
        <span className="relative z-[1] flex h-full w-full items-center justify-center text-slate-300">
          <ImageIcon className="h-4 w-4" />
        </span>
      )}
      {running && (
        <span className="absolute inset-0 z-[2] flex items-center justify-center gap-1 bg-white/58 text-[10px] font-semibold text-slate-600 backdrop-blur-[1px]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-500" />
          {compact && <span>生成中</span>}
        </span>
      )}
      {failed && <span className="absolute inset-x-0 bottom-0 z-[2] h-1 bg-red-400" />}
    </span>
  );
}

function TaskPreviewStrip({ item, displayMode }: { item: TaskQueueItem; displayMode: TaskDisplayMode }) {
  const running = isTaskRunning(item);
  const resultUrls = item.resultThumbnails.slice(0, 4);
  const inputUrls = item.inputThumbnails.slice(0, 2);
  const expectedCount = Math.max(1, Math.min(item.expectedCount || 1, 4));

  if (displayMode === "grouped") {
    const slots = [
      ...inputUrls.map((url) => ({ url, kind: "input" as const })),
      ...resultUrls.map((url) => ({ url, kind: "result" as const })),
    ];
    while (running && slots.length < expectedCount + inputUrls.length) slots.push({ url: "", kind: "result" });
    return (
      <div className="mt-2 flex gap-1 overflow-hidden">
        {slots.slice(0, 6).map((slot, index) => (
          <span
            key={`${slot.url || slot.kind}-${index}`}
            className={cn(
              "relative h-9 w-9 shrink-0 overflow-hidden rounded-md border",
              slot.kind === "input" ? "border-slate-200" : "border-rose-100"
            )}
          >
            {slot.url ? <img src={slot.url} alt="" className="h-full w-full object-cover" /> : <span className="gen-card block h-full w-full bg-gradient-to-br from-rose-50 to-blue-50" />}
          </span>
        ))}
      </div>
    );
  }

  const slots = resultUrls.length ? resultUrls : running ? Array.from({ length: expectedCount }, () => "") : inputUrls;
  return (
    <div className="mt-2 grid grid-cols-4 gap-1">
      {slots.slice(0, 4).map((url, index) => (
        <span key={`${url || "pending"}-${index}`} className="aspect-square w-full overflow-hidden rounded-md border border-slate-100 bg-slate-50">
          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="gen-card block h-full w-full bg-gradient-to-br from-rose-50 to-blue-50" />}
        </span>
      ))}
    </div>
  );
}

function StatusPill({ item }: { item: TaskQueueItem }) {
  const progress = clampProgress(item.progress);
  const className = item.statusGroup === "failed"
    ? "bg-red-50 text-red-600"
    : item.statusGroup === "completed"
      ? "bg-emerald-50 text-emerald-600"
      : "bg-rose-50 text-rose-600";
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-black", className)}>
      {isTaskRunning(item) && <Loader2 className="h-3 w-3 animate-spin" />}
      {statusText(item, progress)}
    </span>
  );
}

function TaskRailEmpty({ loading = false }: { loading?: boolean }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-center text-xs font-semibold text-slate-400">
      {loading ? <Loader2 className="mb-2 h-5 w-5 animate-spin text-rose-400" /> : <Clock3 className="mb-2 h-5 w-5" />}
      {loading ? "正在加载任务" : "暂无任务"}
    </div>
  );
}

function statusText(item: TaskQueueItem, progress: number) {
  if (item.statusGroup === "queued") return "排队中";
  if (item.statusGroup === "running") return progress > 0 ? `${progress}%` : "生成中";
  if (item.statusGroup === "failed") return "失败";
  return "已完成";
}

function getTaskMeta(item: TaskQueueItem, progress: number) {
  if (isTaskRunning(item)) {
    const pieces = ["预计 1-2 分钟"];
    if (progress > 0) pieces.unshift(`${progress}%`);
    return pieces.join(" · ");
  }
  if (item.resultCount > 0) return `${item.resultCount}/${item.expectedCount} 张 · ${item.time || "已完成"}`;
  return item.time || item.status;
}

function normalizeSummary(payload: TaskQueuePayload): TaskQueueSummary {
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  return {
    totalTaskNum: firstFiniteNumber(data.totalTaskNum, payload.totalTaskNum, payload.totalCount, 0),
    finishedTaskNum: firstFiniteNumber(data.finishedTaskNum, payload.finishedTaskNum, 0),
    finishedNeedReadTaskNum: firstFiniteNumber(data.finishedNeedReadTaskNum, payload.finishedNeedReadTaskNum, 0),
    runningTaskNum: firstFiniteNumber(data.runningTaskNum, payload.runningTaskNum, payload.runningCount, 0),
    failedTaskNum: firstFiniteNumber(data.failedTaskNum, payload.failedTaskNum, payload.failedCount, 0),
  };
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0) return Math.round(num);
  }
  return 0;
}

function clampProgress(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(Math.max(Math.round(num), 0), 100);
}

function shortId(value: string) {
  return value.length > 8 ? value.slice(0, 8) : value;
}
