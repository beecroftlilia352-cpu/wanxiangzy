"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Coins, RefreshCw, X } from "lucide-react";

type CreditLog = {
  id: string;
  amount: number;
  balance: number;
  reason: string | null;
  generation_id: string | null;
  created_at: string;
};

type CreditLogModalProps = {
  open: boolean;
  onClose: () => void;
  onCreditsRefresh?: () => void;
};

export function CreditLogModal({ open, onClose, onCreditsRefresh }: CreditLogModalProps) {
  const [logs, setLogs] = useState<CreditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestBalance = useMemo(() => logs[0]?.balance ?? null, [logs]);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/credits/logs", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "积分记录加载失败");
      }
      setLogs(Array.isArray(payload.logs) ? payload.logs : []);
      onCreditsRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "积分记录加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadLogs();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[990] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-2xl shadow-slate-950/15">
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Coins className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900">积分流水</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              扣费、失败退款和余额变化都会在这里记录。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭积分流水"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="mb-3 flex items-center justify-between rounded-2xl border border-amber-100 bg-amber-50/70 px-3 py-2">
            <div>
              <p className="text-[11px] font-medium text-amber-700">当前可见余额</p>
              <p className="text-lg font-black text-amber-700">{latestBalance ?? "-"}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadLogs()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold text-amber-700 transition-colors hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>

          {error && (
            <div className="mb-3 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {loading && logs.length === 0 ? (
              <CreditLogSkeleton />
            ) : logs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
                <p className="text-sm font-bold text-slate-700">暂无积分记录</p>
                <p className="mt-1 text-xs text-slate-400">生成或退款后会自动出现在这里。</p>
              </div>
            ) : (
              logs.map((log) => <CreditLogRow key={log.id} log={log} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreditLogRow({ log }: { log: CreditLog }) {
  const isPositive = log.amount > 0;
  const amountText = `${isPositive ? "+" : ""}${log.amount}`;
  const timeText = formatDateTime(log.created_at);
  const generationText = log.generation_id ? `任务 ${log.generation_id.slice(0, 8)}` : null;

  return (
    <div className="flex gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm shadow-slate-200/40">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          isPositive ? "bg-emerald-50 text-emerald-600" : "bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]"
        }`}
      >
        {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">{log.reason || "积分变动"}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {timeText}{generationText ? ` · ${generationText}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-sm font-black ${isPositive ? "text-emerald-600" : "text-[var(--codex-accent)]"}`}>
              {amountText}
            </p>
            <p className="text-[11px] text-slate-400">余额 {log.balance}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreditLogSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2.5">
          <div className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-slate-100" />
            <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
