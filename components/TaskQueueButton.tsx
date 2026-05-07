"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, Loader2, RefreshCw, XCircle } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

type QueueItem = {
  id: string;
  title: string;
  status: string;
  statusGroup: "running" | "finished";
  time: string;
  createdAt: string;
  error?: string;
  progress?: number;
  thumbnails: string[];
};

type QueuePayload = {
  rows?: QueueItem[];
  runningCount?: number;
  finishedCount?: number;
};

export function TaskQueueButton() {
  const [rows, setRows] = useState<QueueItem[]>([]);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"running" | "finished">("running");
  const [loading, setLoading] = useState(false);
  const [optimisticRunning, setOptimisticRunning] = useState(false);
  const [optimisticStartedAt, setOptimisticStartedAt] = useState(0);

  const running = rows.filter((row) => row.statusGroup === "running");
  const finished = rows.filter((row) => row.statusGroup === "finished");
  const activeRows = activeTab === "running" ? running : finished;
  const groupedRows = groupQueueRows(activeRows.slice(0, 12));
  const isRunning = running.length > 0 || optimisticRunning;
  const totalCount = running.length || finished.length;

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/task-queue", { cache: "no-store" });
      const payload = await res.json().catch(() => ({})) as QueuePayload;
      if (!res.ok) return;
      const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
      setRows(nextRows);
      if (nextRows.some((row) => row.statusGroup === "running")) {
        setOptimisticRunning(false);
      } else if (optimisticRunning && Date.now() - optimisticStartedAt > 6000) {
        setOptimisticRunning(false);
      }
    } finally {
      setLoading(false);
    }
  }, [optimisticRunning, optimisticStartedAt]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    const hasRunning = rows.some((row) => row.statusGroup === "running") || optimisticRunning;
    const timer = window.setInterval(loadQueue, hasRunning || open ? 3000 : 8000);
    return () => window.clearInterval(timer);
  }, [loadQueue, open, rows, optimisticRunning]);

  useEffect(() => {
    const refresh = () => {
      setOptimisticStartedAt(Date.now());
      setOptimisticRunning(true);
      setActiveTab("running");
      window.setTimeout(loadQueue, 300);
      window.setTimeout(loadQueue, 1500);
    };
    window.addEventListener("wanxiang:task-queue-refresh", refresh);
    window.addEventListener("focus", loadQueue);
    document.addEventListener("visibilitychange", loadQueue);
    return () => {
      window.removeEventListener("wanxiang:task-queue-refresh", refresh);
      window.removeEventListener("focus", loadQueue);
      document.removeEventListener("visibilitychange", loadQueue);
    };
  }, [loadQueue]);

  useEffect(() => {
    if (running.length > 0 || optimisticRunning) setActiveTab("running");
  }, [running.length, optimisticRunning]);

  const buttonLabel = useMemo(() => (
    isRunning ? `Task ${Math.max(running.length, 1)}` : `Task ${totalCount || 0}`
  ), [isRunning, running.length, totalCount]);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
        >
          {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {buttonLabel}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="z-[90] w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_24px_90px_rgba(15,23,42,0.18)]"
        >
          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("finished")}
              className={`h-8 rounded-lg text-xs font-bold transition ${activeTab === "finished" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
            >
              Finished({finished.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("running")}
              className={`h-8 rounded-lg text-xs font-bold transition ${activeTab === "running" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
            >
              Running({running.length})
            </button>
          </div>

          <div className="mt-3 max-h-[360px] space-y-1 overflow-y-auto">
            {loading && !rows.length ? (
              <div className="flex h-28 items-center justify-center text-xs font-semibold text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载任务中...
              </div>
            ) : activeRows.length ? (
              groupedRows.map((group) => (
                <div key={group.label}>
                  <div className="px-2 pb-1 pt-2 text-[11px] font-bold text-slate-400">{group.label}</div>
                  <div className="space-y-1">
                    {group.rows.map((item) => (
                      <DropdownMenu.Item key={item.id} asChild>
                        <Link
                          href="/history"
                          className="flex items-center gap-3 rounded-xl px-2 py-2 outline-none transition hover:bg-slate-50"
                        >
                          <StatusDot item={item} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
                            <p className="mt-0.5 text-xs text-slate-400">{item.error || getQueueMeta(item)}</p>
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
                {activeTab === "running" && optimisticRunning ? (
                  <>
                    <Loader2 className="mb-2 h-5 w-5 animate-spin text-violet-500" />
                    正在同步新任务...
                  </>
                ) : (
                  <>
                    <Clock3 className="mb-2 h-5 w-5" />
                    暂无{activeTab === "running" ? "进行中" : "已完成"}任务
                  </>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={loadQueue}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              刷新
            </button>
            <DropdownMenu.Item asChild>
              <Link href="/history" className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white outline-none">
                查看全部
              </Link>
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ThumbnailStack({ urls }: { urls: string[] }) {
  const safeUrls = urls.filter((url) => typeof url === "string" && url.trim().length > 0).slice(0, 2);
  if (!safeUrls.length) {
    return (
      <span className="flex h-10 w-8 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-[10px] font-black text-slate-300">
        AI
      </span>
    );
  }
  return (
    <span className="flex -space-x-2">
      {safeUrls.map((url, index) => (
        <img
          key={`${url}-${index}`}
          src={url}
          alt=""
          className="h-10 w-8 rounded-lg border border-white bg-slate-100 object-cover shadow-sm"
        />
      ))}
    </span>
  );
}

function StatusDot({ item }: { item: QueueItem }) {
  if (item.statusGroup === "running") {
    const progress = clampProgress(item.progress);
    return (
      <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-violet-50 text-violet-600">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {progress > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-[9px] font-black leading-3 text-violet-600 shadow-sm">
            {progress}
          </span>
        )}
      </span>
    );
  }
  if (item.status === "failed") {
    return <XCircle className="h-5 w-5 text-red-400" />;
  }
  return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
}

function getQueueMeta(item: QueueItem) {
  if (item.statusGroup === "running") {
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

function groupQueueRows(items: QueueItem[]) {
  const groups: { label: string; rows: QueueItem[] }[] = [];
  for (const item of items) {
    const label = getQueueDateLabel(item.createdAt);
    const group = groups.find((entry) => entry.label === label);
    if (group) group.rows.push(item);
    else groups.push({ label, rows: [item] });
  }
  return groups;
}

function getQueueDateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Earlier";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((today - target) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
