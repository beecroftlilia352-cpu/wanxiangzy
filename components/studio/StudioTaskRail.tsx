"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronRight,
  Clock3,
  Check,
  ChevronDown,
  Grid2X2,
  History,
  ImageIcon,
  Layers3,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { getImageVariantUrl } from "@/lib/image-variants";
import { isLikelyVideoUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import type { TaskDisplayMode, TaskQueueItem, TaskQueuePayload, TaskQueueSummary } from "@/lib/task-queue";
import { isTaskRunning, taskMatchesScope, TASK_DISPLAY_MODE_KEY } from "@/lib/task-queue";
import {
  TASK_QUEUE_CONTINUE_ID,
  TASK_QUEUE_PAGE_SIZE,
  TASK_QUEUE_RECENT_LIMIT,
  getEmptyTaskQueueModuleState,
  useTaskQueueStore,
} from "@/lib/task-queue-client-store";
import { useTaskSelectionSession, type TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";

type StudioTaskRailProps = {
  module: string;
  taskScope?: string;
  moduleLabel?: string;
  onContinue?: () => void;
  onSelectTask?: (item: TaskQueueItem, session: TaskSelectionSession) => boolean | void | Promise<boolean | void>;
  className?: string;
};

type TaskQueueLoadResult = {
  rowCount: number;
  hasMore: boolean;
} | null;

const TASK_QUEUE_FETCH_TIMEOUT_MS = 18_000;
const TASK_RAIL_RUNNING_POLL_MS = 20_000;
const TASK_RAIL_IDLE_POLL_MS = 180_000;
const TASK_RAIL_IDLE_CACHE_GRACE_MS = 120_000;
const TASK_RAIL_MIN_LOAD_GAP_MS = 15_000;

export function StudioTaskRail({
  module,
  taskScope,
  moduleLabel,
  onContinue,
  onSelectTask,
  className,
}: StudioTaskRailProps) {
  const t = useTranslations("Shared");
  const compactRecentTasksLabel = t("recentTasks").trim().split(/\s+/)[0] || t("recentTasks");
  const resolvedModuleLabel = moduleLabel ?? t("currentModule");
  const moduleState = useTaskQueueStore((state) => state.modules[module]);
  const hydrateModule = useTaskQueueStore((state) => state.hydrateModule);
  const applyServerRows = useTaskQueueStore((state) => state.applyServerRows);
  const setModuleLoadingFailed = useTaskQueueStore((state) => state.setModuleLoadingFailed);
  const setSelectedTask = useTaskQueueStore((state) => state.setSelectedTask);
  const clearSelectedTask = useTaskQueueStore((state) => state.clearSelectedTask);
  const { rows, summary, hasLoaded, loadError, selectedId, lastLoadedAt, refreshVersion } =
    moduleState || getEmptyTaskQueueModuleState();
  const [expanded, setExpanded] = useState(false);
  const [moduleOnly, setModuleOnly] = useState(true);
  const [displayMode, setDisplayMode] = useState<TaskDisplayMode>("flat");
  const [query, setQuery] = useState("");
  const [displayLimit, setDisplayLimit] = useState(TASK_QUEUE_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const loadInFlightRef = useRef(false);
  const snapshotHasFailedRef = useRef(false);
  const lastLoadStartedAtRef = useRef(0);
  const autoSelectSignatureRef = useRef("");
  const runningSelectionRef = useRef<string | null>(null);
  const localSelectionRef = useRef<string | null>(null);
  const initialSelectionSettledRef = useRef(false);
  const handledRefreshVersionRef = useRef(0);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const autoLoadQueuedRef = useRef(false);
  const [autoLoadStarted, setAutoLoadStarted] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledRef = useRef(false);
  const {
    pendingId: applyingId,
    begin: beginSelection,
    cancel: cancelSelection,
  } = useTaskSelectionSession();

  const hasRunningTask = rows.some((item) => taskMatchesScope(item, taskScope) && isTaskRunning(item));
  const queueSnapshotRef = useRef({
    rows,
    hasLoaded,
    expanded,
    moduleOnly,
    query,
    nextCursor,
    lastLoadedAt,
  });
  queueSnapshotRef.current = {
    rows,
    hasLoaded,
    expanded,
    moduleOnly,
    query,
    nextCursor,
    lastLoadedAt,
  };

  const loadQueue = useCallback(async (options?: { append?: boolean; force?: boolean }): Promise<TaskQueueLoadResult> => {
    const snapshot = queueSnapshotRef.current;
    const append = Boolean(options?.append);
    const force = Boolean(options?.force);
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return null;
    if (loadInFlightRef.current) return null;
    if (append && !snapshot.nextCursor) return null;
    const now = Date.now();
    if (!append && !force && snapshot.hasLoaded && now - lastLoadStartedAtRef.current < TASK_RAIL_MIN_LOAD_GAP_MS) return null;
    lastLoadStartedAtRef.current = now;
    loadInFlightRef.current = true;
    if (!snapshot.hasLoaded || append || force) setLoading(true);
    try {
      const isExpanded = snapshot.expanded;
      const isModuleOnly = snapshot.moduleOnly;
      const searchQuery = snapshot.query.trim();
      const params = new URLSearchParams();
      params.set("limit", isExpanded ? String(TASK_QUEUE_PAGE_SIZE) : String(TASK_QUEUE_RECENT_LIMIT));
      if (!isExpanded) params.set("summary", "0");
      if (append && snapshot.nextCursor) params.set("cursor", snapshot.nextCursor);
      if (!isExpanded || isModuleOnly) params.set("module", module);
      if ((!isExpanded || isModuleOnly) && taskScope) params.set("scope", taskScope);
      if (isExpanded && searchQuery) params.set("q", searchQuery);

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), TASK_QUEUE_FETCH_TIMEOUT_MS);
      const res = await fetch(`/api/task-queue?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      }).finally(() => window.clearTimeout(timeout));
      const payload = await res.json().catch(() => ({})) as TaskQueuePayload;
      if (!res.ok) throw new Error("task queue request failed");

      const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
      const currentRows = queueSnapshotRef.current.rows;
      const keepCurrentRowsOnEmpty = !append && !isExpanded && isModuleOnly && !searchQuery && nextRows.length === 0;
      if (!(keepCurrentRowsOnEmpty && currentRows.length > 0)) {
        applyServerRows(module, nextRows, normalizeSummary(payload), {
          append,
          preserveLocal: !append && !isExpanded && isModuleOnly && !searchQuery,
        });
      } else {
        snapshotHasFailedRef.current = false;
        setModuleLoadingFailed(module, false);
      }
      const resolvedNextCursor = typeof payload.nextCursor === "string" && payload.nextCursor ? payload.nextCursor : null;
      queueSnapshotRef.current = { ...queueSnapshotRef.current, nextCursor: resolvedNextCursor };
      setNextCursor(resolvedNextCursor);

      const nextSummary = normalizeSummary(payload);
      if (keepCurrentRowsOnEmpty && currentRows.length > 0) {
        applyServerRows(module, currentRows, nextSummary, {
          append: false,
          preserveLocal: true,
        });
      }
      return { rowCount: nextRows.length, hasMore: Boolean(payload.hasMore) };
    } catch (error) {
      console.warn("[task-rail] queue load failed:", error instanceof Error ? error.message : error);
      const wasFailed = snapshotHasFailedRef.current;
      snapshotHasFailedRef.current = true;
      setModuleLoadingFailed(module, true);
      if (!wasFailed) {
        toast.error(t("networkError"), { description: t("taskListLoadFailed") });
      }
      return null;
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, [applyServerRows, module, setModuleLoadingFailed, t, taskScope]);

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
    setDisplayLimit(TASK_QUEUE_PAGE_SIZE);
    queueSnapshotRef.current = { ...queueSnapshotRef.current, nextCursor: null };
    setNextCursor(null);
  }, [displayMode, expanded, moduleOnly, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQueue({ force: expanded });
    }, query.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [expanded, loadQueue, module, moduleOnly, query]);

  useEffect(() => {
    handledRefreshVersionRef.current = 0;
    localSelectionRef.current = null;
    initialSelectionSettledRef.current = false;
    hydrateModule(module);
  }, [hydrateModule, module]);

  useEffect(() => {
    if (refreshVersion <= handledRefreshVersionRef.current) return;
    handledRefreshVersionRef.current = refreshVersion;
    void loadQueue({ force: true });
  }, [loadQueue, refreshVersion]);

  useEffect(() => {
    const pollMs = hasRunningTask ? TASK_RAIL_RUNNING_POLL_MS : TASK_RAIL_IDLE_POLL_MS;
    const snapshot = queueSnapshotRef.current;
    const cacheIsFreshEnough = Date.now() - snapshot.lastLoadedAt < TASK_RAIL_IDLE_CACHE_GRACE_MS;
    if (!snapshot.hasLoaded || !cacheIsFreshEnough) {
      void loadQueue();
    }
    const timer = window.setInterval(() => {
      void loadQueue();
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [hasRunningTask, loadQueue]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "hidden") return;
      loadQueue();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [loadQueue]);

  const recentRows = useMemo(
    () => rows
      .filter((item) => item.module === module && taskMatchesScope(item, taskScope))
      .slice(0, TASK_QUEUE_RECENT_LIMIT),
    [rows, module, taskScope]
  );

  const visibleRows = expanded
    ? rows
        .filter((item) => !moduleOnly || (item.module === module && taskMatchesScope(item, taskScope)))
        .slice(0, displayLimit)
    : recentRows;
  const totalLoaded = rows.length;
  const totalAvailable = summary.totalTaskNum;
  const canLoadMore = Boolean(nextCursor) || totalLoaded < totalAvailable;
  const loadProgress =
    totalAvailable > 0 ? Math.min(100, Math.round((totalLoaded / totalAvailable) * 100)) : 0;
  const initialLoading = !hasLoaded && rows.length === 0;

  useEffect(() => {
    if (initialSelectionSettledRef.current) return;
    if (selectedId === TASK_QUEUE_CONTINUE_ID) {
      initialSelectionSettledRef.current = true;
      return;
    }
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("apply")) {
      initialSelectionSettledRef.current = true;
      return;
    }
    if (!hasLoaded && rows.length === 0) return;

    initialSelectionSettledRef.current = true;
    if (localSelectionRef.current === selectedId) return;
    autoSelectSignatureRef.current = "";
    runningSelectionRef.current = null;
    clearSelectedTask(module);
    // Mounting a different module must never execute its destructive
    // "continue creating" callback. The page already starts from its own
    // default state; only the explicit Continue card may clear user input.
  }, [clearSelectedTask, hasLoaded, module, rows.length, selectedId]);

  useEffect(() => {
    if (!onSelectTask || selectedId === TASK_QUEUE_CONTINUE_ID) {
      autoSelectSignatureRef.current = "";
      runningSelectionRef.current = null;
      return;
    }
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("apply")) return;
    const selected = rows.find((item) => item.id === selectedId && taskMatchesScope(item, taskScope));
    if (!selected) return;

    const running = isTaskRunning(selected);
    const shouldNotifyCompletion = runningSelectionRef.current === selected.id && !running;
    const signature = getTaskSelectionSignature(selected);
    if (running || !shouldNotifyCompletion) return;
    if (signature === autoSelectSignatureRef.current) return;

    autoSelectSignatureRef.current = signature;
    runningSelectionRef.current = null;

    const session = beginSelection(selected.id, "completion");
    void Promise.resolve(onSelectTask(selected, session))
      .catch((error) => {
        if (!session.isCurrent()) return;
        console.error("Task auto selection failed", error);
        toast.error(error instanceof Error ? error.message : t("taskApplyFailed"));
      })
      .finally(session.finish);
  }, [beginSelection, rows, onSelectTask, selectedId, t, taskScope]);

  const handleSelect = (item: TaskQueueItem) => {
    const previousSelectedId = selectedId;
    localSelectionRef.current = item.id;
    autoSelectSignatureRef.current = getTaskSelectionSignature(item);
    runningSelectionRef.current = isTaskRunning(item) ? item.id : null;
    setSelectedTask(module, item.id);
    if (!onSelectTask) return;

    const session = beginSelection(item.id, "manual");
    void Promise.resolve(onSelectTask(item, session))
      .then((navigated) => {
        if (navigated !== false || !session.isCurrent()) return;
        localSelectionRef.current = previousSelectedId === TASK_QUEUE_CONTINUE_ID ? null : previousSelectedId;
        if (previousSelectedId === TASK_QUEUE_CONTINUE_ID) {
          clearSelectedTask(module);
        } else {
          setSelectedTask(module, previousSelectedId);
        }
      })
      .catch((error) => {
        if (!session.isCurrent()) return;
        console.error("Task selection failed", error);
        toast.error(error instanceof Error ? error.message : t("taskApplyFailedRetry"));
      })
      .finally(session.finish);
  };

  const handleContinue = () => {
    cancelSelection();
    autoSelectSignatureRef.current = "";
    runningSelectionRef.current = null;
    localSelectionRef.current = null;
    clearSelectedTask(module);
    onContinue?.();
  };

  const handleLoadMore = useCallback(async () => {
    if (loading || autoLoadQueuedRef.current) return;
    if (!canLoadMore) return;
    autoLoadQueuedRef.current = true;
    setAutoLoadStarted(true);
    try {
      const result = await loadQueue({ append: true, force: true });
      if (result?.rowCount) {
        setDisplayLimit((limit) => limit + TASK_QUEUE_PAGE_SIZE);
      }
    } finally {
      autoLoadQueuedRef.current = false;
      setAutoLoadStarted(false);
    }
  }, [canLoadMore, loadQueue, loading]);

  useEffect(() => {
    if (!expanded) return;
    const sentinel = loadMoreSentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry?.isIntersecting &&
          canLoadMore &&
          !loading &&
          !autoLoadQueuedRef.current &&
          hasScrolledRef.current
        ) {
          void handleLoadMore();
        }
      },
      { root, rootMargin: "240px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, expanded, handleLoadMore, loading]);

  return (
    <aside
      className={cn(
        "studio-task-rail",
        expanded && "studio-task-rail-expanded",
        initialLoading && "studio-task-rail-loading",
        className
      )}
      aria-label={t("taskList")}
      aria-busy={initialLoading || loading}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div
          className={cn(
            "studio-task-rail-header flex items-center justify-between border-b border-[var(--codex-border)]",
            expanded ? "gap-2 px-3 py-3" : "gap-0.5 px-1 py-2.5"
          )}
        >
          <div className={cn("min-w-0 flex-1", !expanded && "flex justify-center")}>
            <div className={cn("studio-task-rail-title flex items-center font-bold text-codex-ink", expanded ? "gap-1.5 text-sm" : "justify-center text-center text-[11px] leading-4")}>
              {expanded && <History className="studio-task-rail-title-icon h-4 w-4" />}
              <span className="max-w-full truncate whitespace-nowrap">{expanded ? t("allTasks") : compactRecentTasksLabel}</span>
            </div>
            {expanded && (
              <p className="mt-0.5 truncate text-[11px] font-semibold text-codex-faint">
                {moduleOnly ? resolvedModuleLabel : t("allModules")} · {t("taskCountSuffix", { count: summary.totalTaskNum })}
              </p>
            )}
          </div>
          {expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-codex-muted transition hover:bg-[var(--codex-surface-soft)] hover:text-codex-ink"
              aria-label={t("collapseAllTasks")}
              title={t("collapseAllTasks")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {expanded ? (
          <div className="space-y-3 border-b border-[var(--codex-border)] px-3 py-3">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-[var(--codex-border)] bg-white px-2 text-xs text-codex-muted transition focus-within:border-[var(--codex-accent-45)] focus-within:ring-2 focus-within:ring-[var(--codex-accent-18)] dark:border-white/10 dark:bg-white/5 dark:text-codex-faint dark:focus-within:border-[var(--codex-accent-55)] dark:focus-within:ring-[var(--codex-accent-18)]">
              <Search className="h-3.5 w-3.5" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent font-semibold text-codex-ink outline-none placeholder:text-codex-faint dark:text-codex-muted dark:placeholder:text-codex-faint"
                placeholder={t("searchTaskPlaceholder")}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <SegmentButton active={moduleOnly} onClick={() => setModuleOnly(true)}>
                {resolvedModuleLabel}
              </SegmentButton>
              <SegmentButton active={!moduleOnly} onClick={() => setModuleOnly(false)}>
                {t("allModules")}
              </SegmentButton>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SegmentButton active={displayMode === "flat"} onClick={() => setDisplayMode("flat")} icon={<Grid2X2 className="h-3.5 w-3.5" />}>
                {t("flatView")}
              </SegmentButton>
              <SegmentButton active={displayMode === "grouped"} onClick={() => setDisplayMode("grouped")} icon={<Layers3 className="h-3.5 w-3.5" />}>
                {t("groupedView")}
              </SegmentButton>
            </div>
          </div>
        ) : null}

        <div
          ref={scrollContainerRef}
          onScroll={() => {
            hasScrolledRef.current = true;
          }}
          className={cn("min-h-0 flex-1 overflow-y-auto custom-scroll", expanded ? "space-y-2 px-3 py-3" : "space-y-1.5 px-1.5 py-1.5")}
        >
          {initialLoading ? (
            <>
              {!expanded && <ContinueCard selected={selectedId === TASK_QUEUE_CONTINUE_ID} onClick={handleContinue} />}
              <TaskRailSkeleton compact={!expanded} />
            </>
          ) : visibleRows.length ? (
            <>
              {!expanded && <ContinueCard selected={selectedId === TASK_QUEUE_CONTINUE_ID} onClick={handleContinue} />}
              {visibleRows.map((item) => (
                <TaskCard
                  key={item.id}
                  item={item}
                  compact={!expanded}
                  selected={selectedId === item.id}
                  applying={applyingId === item.id}
                  displayMode={displayMode}
                  onClick={() => handleSelect(item)}
                />
              ))}
              {expanded && canLoadMore ? (
                <div
                  ref={loadMoreSentinelRef}
                  className="flex items-center justify-center pt-1"
                  aria-hidden={!autoLoadStarted}
                >
                  {autoLoadStarted ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-codex-faint">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t("loadingMore")}
                    </span>
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-wider text-codex-faint">
                      {t("scrollToLoadMore")}
                    </span>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <>
              {!expanded && <ContinueCard selected={selectedId === TASK_QUEUE_CONTINUE_ID} onClick={handleContinue} />}
              <TaskRailEmpty compact={!expanded} moduleLabel={moduleLabel} failed={loadError} onRetry={() => void loadQueue()} />
            </>
          )}
        </div>

        <div className={cn("border-t border-[var(--codex-border)]", expanded ? "px-3 py-3" : "px-2 py-2")}>
          {expanded ? (
            <div className="space-y-2">
              <Progress
                value={loadProgress}
                className="h-1 bg-[var(--codex-surface-soft)]"
                aria-label={t("loadedProgress", { loaded: totalLoaded, total: totalAvailable })}
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  {canLoadMore ? (
                    <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
                  ) : (
                    <Check className="h-3 w-3 shrink-0 text-emerald-500" aria-hidden="true" />
                  )}
                  <span className="truncate text-[11px] font-black text-codex-muted">
                    {totalAvailable > 0
                      ? t("loadedSummary", { loaded: totalLoaded, total: totalAvailable, percent: loadProgress })
                      : t("loadedCount", { loaded: totalLoaded })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void loadQueue({ force: true })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-codex-muted transition hover:bg-[var(--codex-surface-soft)] hover:text-codex-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  {t("refresh")}
                </button>
              </div>
              {canLoadMore ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleLoadMore()}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-600 transition hover:border-blue-300 hover:bg-blue-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t("loadingDots")}
                    </>
                  ) : (
                    <>
                      {t("loadMore")}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              ) : (
                <div className="flex items-center justify-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50/80 py-2 text-[11px] font-black text-emerald-700">
                  <Check className="h-3 w-3" />
                  {t("allLoaded")}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex h-8 w-full items-center justify-center gap-0.5 whitespace-nowrap rounded-lg px-1 text-[11px] font-black text-codex-ink transition hover:bg-[var(--codex-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {(t("allTasks").trim().split(/\s+/)[0] || t("allTasks"))}
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function ContinueCard({ selected, disabled = false, onClick }: { selected: boolean; disabled?: boolean; onClick: () => void }) {
  const t = useTranslations("Shared");
  const compactLabel = t("continueCreate").trim().split(/\s+/)[0] || t("continueCreate");
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-selected={selected || undefined}
      className={cn(
        "studio-task-card studio-task-card--compact studio-task-card--continue group relative flex aspect-square w-full items-center justify-center px-1 text-center text-[11px] font-medium leading-4 text-codex-muted",
        disabled && "cursor-not-allowed opacity-55",
        selected && "is-selected"
      )}
    >
      <span className="max-w-full truncate whitespace-nowrap">{compactLabel}</span>
      {selected && (
        <span className="studio-task-card-selection-marker" aria-hidden="true">
          <Check className="h-2 w-2" />
        </span>
      )}
    </button>
  );
}

function SegmentButton({
  active,
  disabled = false,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-55",
        active
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-[var(--codex-border)] bg-[var(--codex-surface-soft)] text-codex-muted hover:border-[var(--codex-border-strong)] hover:text-codex-ink"
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
  applying,
  disabled = false,
  displayMode,
  onClick,
}: {
  item: TaskQueueItem;
  compact: boolean;
  selected: boolean;
  applying: boolean;
  disabled?: boolean;
  displayMode: TaskDisplayMode;
  onClick: () => void;
}) {
  const t = useTranslations("Shared");
  const running = isTaskRunning(item);
  const failed = item.statusGroup === "failed";
  const completed = item.statusGroup === "completed";
  const resultThumbnails = safeTaskUrls(item.resultThumbnails);
  const inputThumbnails = safeTaskUrls(item.inputThumbnails);
  const thumbnails = safeTaskUrls(item.thumbnails);
  const cover = running
    ? inputThumbnails[0] || ""
    : resultThumbnails[0] || inputThumbnails[0] || thumbnails[0] || "";
  const progress = clampProgress(item.progress);

  if (compact) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        data-state={applying ? "applying" : failed ? "failed" : running ? "running" : completed ? "completed" : "idle"}
        data-selected={selected || undefined}
        className={cn(
          "studio-task-card studio-task-card--compact group relative flex aspect-square w-full items-center justify-center p-1 text-left",
          applying ? "cursor-wait" : disabled && "cursor-not-allowed opacity-55",
          selected && "is-selected"
        )}
        title={item.title || item.id}
      >
        <TaskThumb url={cover} running={running} failed={failed} applying={applying} compact className="h-full w-full" />
        {selected && (
          <span className="studio-task-card-selection-marker" aria-hidden="true">
            <Check className="h-2 w-2" />
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-state={applying ? "applying" : failed ? "failed" : running ? "running" : completed ? "completed" : "idle"}
      data-selected={selected || undefined}
      className={cn(
        "studio-task-card studio-task-card-expanded group w-full p-2 text-left",
        applying ? "cursor-wait" : disabled && "cursor-not-allowed opacity-55",
        selected && "is-selected"
      )}
    >
      <div className="flex items-start gap-3">
        <TaskThumb url={cover} running={running} failed={failed} applying={applying} className="h-16 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-codex-ink">{item.title}</p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-codex-faint">{item.id}</p>
            </div>
            {applying ? (
              <span className="studio-task-status-pill studio-task-status-pill--applying inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-bold">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("applying")}
              </span>
            ) : (
              <StatusPill item={item} />
            )}
          </div>
          <p className="mt-1 line-clamp-1 text-xs font-semibold text-codex-muted">
            {failed ? item.error || t("taskFailedRetry") : getTaskMeta(item, progress, t)}
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
  applying,
  compact = false,
  className,
}: {
  url: string;
  running: boolean;
  failed: boolean;
  applying: boolean;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("Shared");
  const isVideo = isLikelyVideoUrl(url);
  const displayUrl = isVideo ? url : getImageVariantUrl(url, "thumb");

  return (
    <span className={cn(
      "studio-task-thumb relative block overflow-hidden",
      compact ? "studio-task-thumb--compact" : "studio-task-thumb-frame rounded-lg",
      className
    )}>
      {displayUrl ? (
        isVideo ? (
          <video
            src={displayUrl}
            muted
            playsInline
            preload="metadata"
            className="relative z-[1] h-full w-full object-cover"
          />
        ) : (
          <RawPreviewImage
            src={displayUrl}
            alt=""
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="relative z-[1] h-full w-full object-cover"
          />
        )
      ) : (
        <span className="relative z-[1] flex h-full w-full items-center justify-center text-codex-faint">
          <ImageIcon className="h-4 w-4" />
        </span>
      )}
      {running && (
        <span className="studio-task-running-badge absolute inset-x-1 bottom-1 z-[2] flex items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          <span className="studio-task-running-dot h-1.5 w-1.5 shrink-0 rounded-full" />
          <span className="truncate">{t("generating")}</span>
        </span>
      )}
      {applying && !running && (
        <span className="studio-task-applying-overlay absolute inset-0 z-[2] flex items-center justify-center gap-1 text-[10px] font-semibold backdrop-blur-[1px]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {compact && <span>{t("applying")}</span>}
        </span>
      )}
      {failed && <span className="studio-task-failed-line absolute inset-x-0 bottom-0 z-[2] h-0.5" />}
    </span>
  );
}

function TaskPreviewStrip({ item, displayMode }: { item: TaskQueueItem; displayMode: TaskDisplayMode }) {
  const running = isTaskRunning(item);
  const resultUrls = safeTaskUrls(item.resultThumbnails).slice(0, 4);
  const inputUrls = safeTaskUrls(item.inputThumbnails).slice(0, 2);
  const expectedCount = Math.max(1, Math.min(item.expectedCount || 1, 4));

  if (displayMode === "grouped") {
    const runningSlots: Array<{ url: string; kind: "input" | "result" }> =
      inputUrls.map((url) => ({ url, kind: "input" }));
    while (running && runningSlots.length < Math.max(inputUrls.length, expectedCount)) {
      runningSlots.push({ url: "", kind: "result" as const });
    }
    const slots = [
      ...inputUrls.map((url) => ({ url, kind: "input" as const })),
      ...resultUrls.map((url) => ({ url, kind: "result" as const })),
    ];
    const visibleSlots = running ? runningSlots : slots;
    return (
      <div className="mt-2 flex gap-1 overflow-hidden">
        {visibleSlots.slice(0, 6).map((slot, index) => (
          <span
            key={`${slot.url || slot.kind}-${index}`}
            className={cn(
              "relative h-9 w-9 shrink-0 overflow-hidden rounded-md border",
              slot.kind === "input" ? "border-[var(--codex-border)]" : "border-blue-100"
            )}
          >
            {slot.url ? (
              <TaskStripImage url={slot.url} />
            ) : (
              <span className="studio-task-placeholder-thumb block h-full w-full" />
            )}
          </span>
        ))}
      </div>
    );
  }

  const slots = running
    ? inputUrls.length
      ? inputUrls
      : Array.from({ length: expectedCount }, () => "")
    : resultUrls.length
      ? resultUrls
      : inputUrls;
  return (
    <div className="mt-2 grid grid-cols-4 gap-1">
      {slots.slice(0, 4).map((url, index) => (
        <span key={`${url || "pending"}-${index}`} className="aspect-square w-full overflow-hidden rounded-md border border-[var(--codex-border)] bg-[var(--codex-surface-soft)]">
          {url ? <TaskStripImage url={url} /> : <span className="studio-task-placeholder-thumb block h-full w-full" />}
        </span>
      ))}
    </div>
  );
}

function TaskStripImage({ url }: { url: string }) {
  if (isLikelyVideoUrl(url)) {
    return (
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <RawPreviewImage
      src={getImageVariantUrl(url, "thumb")}
      alt=""
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      className="h-full w-full object-cover"
    />
  );
}

function StatusPill({ item }: { item: TaskQueueItem }) {
  const t = useTranslations("Shared");
  const progress = clampProgress(item.progress);
  const state = item.statusGroup === "failed"
    ? "failed"
    : item.statusGroup === "completed"
      ? "completed"
      : "running";
  return (
    <span className={cn("studio-task-status-pill inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-bold", `studio-task-status-pill--${state}`)}>
      {isTaskRunning(item) && <Loader2 className="h-3 w-3 animate-spin" />}
      {statusText(item, progress, t)}
    </span>
  );
}

function TaskRailSkeleton({ compact }: { compact: boolean }) {
  const items = compact ? 4 : 3;
  return (
    <div className={cn("studio-task-rail-skeleton", compact ? "space-y-2" : "space-y-3")}>
      {Array.from({ length: items }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "studio-task-card-skeleton-frame flex items-center gap-3 overflow-hidden rounded-lg border",
            compact ? "aspect-square p-1" : "h-[88px] p-2"
          )}
        >
          {/* Left thumb (model image area) — same shape as TaskCard */}
          <div
            className={cn(
              "studio-skeleton-shimmer shrink-0 rounded-md",
              compact ? "h-full w-full" : "h-16 w-16"
            )}
          />
          {/* Right text stack */}
          <div className={cn("min-w-0 flex-1 flex-col gap-1.5", compact ? "hidden" : "flex")}>
            <div className={cn("studio-skeleton-shimmer rounded", compact ? "h-2.5 w-3/4" : "h-3 w-2/3")} />
            <div className={cn("studio-skeleton-shimmer rounded", compact ? "h-2 w-1/2" : "h-2.5 w-1/2")} />
            {!compact && (
              <div className="studio-skeleton-shimmer mt-0.5 h-2 w-1/3 rounded" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskRailEmpty({
  compact = false,
  moduleLabel,
  failed = false,
  onRetry,
}: {
  compact?: boolean;
  moduleLabel?: string;
  failed?: boolean;
  onRetry?: () => void;
}) {
  const t = useTranslations("Shared");
  const resolvedModuleLabel = moduleLabel ?? t("currentModule");
  return (
    <div
      className={cn(
        "studio-task-rail-empty flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--codex-accent-20)] bg-white/70 text-center text-xs font-semibold text-codex-faint",
        compact ? "min-h-[80px] px-1 py-2.5" : "min-h-32 px-4 py-5"
      )}
    >
      {failed ? <RefreshCw className="mb-2 h-5 w-5 text-amber-500" /> : <Clock3 className="mb-2 h-5 w-5 text-[var(--codex-accent)]" />}
      <span>{failed ? (compact ? t("retry") : t("taskLoadFailed")) : compact ? t("noTasks") : t("noModuleTasks", { label: resolvedModuleLabel })}</span>
      {!compact && (
        <span className="mt-1 text-[11px] font-medium text-codex-faint">
          {failed ? t("networkRetryHint") : t("appearAfterGenerate")}
        </span>
      )}
      {failed && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "mt-2 inline-flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 font-black text-amber-700 transition hover:bg-amber-100",
            compact ? "h-7 px-2 text-[11px]" : "h-8 px-3 text-xs"
          )}
        >
          {t("refresh")}
        </button>
      ) : null}
    </div>
  );
}

function statusText(item: TaskQueueItem, progress: number, t: (key: string) => string) {
  if (item.statusGroup === "queued") return t("queued");
  if (item.status === "processing_delayed") return t("backgroundProcessing");
  if (item.statusGroup === "running") return progress > 0 ? `${progress}%` : t("generating");
  if (item.statusGroup === "failed") return t("failed");
  return t("completed");
}

function getTaskMeta(item: TaskQueueItem, progress: number, t: (key: string) => string) {
  if (isTaskRunning(item)) {
    const pieces = [item.status === "processing_delayed" ? t("processingDelayed") : item.expectedCount > 4 ? t("multiImageLonger") : t("estimatedMinutes")];
    if (progress > 0) pieces.unshift(`${progress}%`);
    return pieces.join(" · ");
  }
  if (item.resultCount > 0) return `${item.resultCount}/${item.expectedCount} ${t("unitZhang")} · ${item.time || t("completedMeta")}`;
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

function getTaskSelectionSignature(item: TaskQueueItem) {
  return [
    item.id,
    item.status,
    item.statusGroup,
    item.progress,
    item.updatedAt || "",
    item.resultCount,
    item.expectedCount,
    item.error || "",
    safeTaskUrls(item.resultThumbnails).join("|"),
  ].join("::");
}

function safeTaskUrls(value: unknown) {
  return Array.isArray(value) ? value.filter((url): url is string => typeof url === "string" && url.trim().length > 0) : [];
}
