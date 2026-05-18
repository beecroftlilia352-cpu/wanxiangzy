"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, CircleDollarSign, Loader2, RotateCcw, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { TaskStatusGroup } from "@/lib/task-queue";

type AdminTaskAction = "retry" | "mark_failed_refund" | "mark_failed_no_refund" | "cancel_refund";

type AdminTaskActionsProps = {
  id: string;
  sourceType: "generation" | "workflow";
  statusGroup: TaskStatusGroup;
  isStale?: boolean;
  compact?: boolean;
};

const actionConfig: Record<AdminTaskAction, { label: string; icon: ReactNode; defaultReason: string; tone: "default" | "danger" }> = {
  retry: {
    label: "重新入队",
    icon: <RotateCcw className="h-3.5 w-3.5" />,
    defaultReason: "管理员重新入队卡住任务",
    tone: "default",
  },
  mark_failed_refund: {
    label: "失败退款",
    icon: <CircleDollarSign className="h-3.5 w-3.5" />,
    defaultReason: "管理员处理卡住任务并退还积分",
    tone: "danger",
  },
  cancel_refund: {
    label: "取消退款",
    icon: <Ban className="h-3.5 w-3.5" />,
    defaultReason: "管理员取消卡住任务并退还未结算积分",
    tone: "danger",
  },
  mark_failed_no_refund: {
    label: "失败不退",
    icon: <XCircle className="h-3.5 w-3.5" />,
    defaultReason: "管理员标记失败但不退还积分",
    tone: "danger",
  },
};

export function AdminTaskActions({ id, sourceType, statusGroup, isStale = false, compact = false }: AdminTaskActionsProps) {
  const router = useRouter();
  const [activeAction, setActiveAction] = useState<AdminTaskAction | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const finished = statusGroup === "completed" || statusGroup === "failed";
  const availableActions: AdminTaskAction[] = finished
    ? []
    : isStale
      ? ["retry", "mark_failed_refund", "cancel_refund", "mark_failed_no_refund"]
      : ["retry", "mark_failed_refund", "cancel_refund"];

  async function submitAction(action: AdminTaskAction) {
    setLoading(true);
    setMessage("");
    const config = actionConfig[action];
    try {
      const res = await fetch(`/api/admin/generations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          sourceType,
          reason: reason.trim() || config.defaultReason,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `操作失败 (${res.status})`);
      setMessage(`${config.label}已提交`);
      setActiveAction(null);
      setReason("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setLoading(false);
    }
  }

  if (!availableActions.length) {
    return <span className="text-xs font-semibold text-slate-400">已结束</span>;
  }

  return (
    <div className={compact ? "min-w-[220px] space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap gap-1.5">
        {availableActions.map((action) => {
          const config = actionConfig[action];
          return (
            <button
              key={action}
              type="button"
              onClick={() => {
                setActiveAction(action);
                setReason(config.defaultReason);
                setMessage("");
              }}
              disabled={loading}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs font-black transition disabled:opacity-60 ${
                config.tone === "danger"
                  ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {config.icon}
              {config.label}
            </button>
          );
        })}
      </div>

      {activeAction && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-16 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold leading-5 outline-none focus:border-slate-400"
            maxLength={240}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void submitAction(activeAction)}
              disabled={loading || reason.trim().length < 4}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-black text-white disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : actionConfig[activeAction].icon}
              确认
            </button>
            <button
              type="button"
              onClick={() => setActiveAction(null)}
              disabled={loading}
              className="h-8 rounded-lg px-2 text-xs font-black text-slate-500 hover:bg-white"
            >
              取消
            </button>
          </div>
        </div>
      )}
      {message && <p className={`text-xs font-bold ${message.includes("已") ? "text-emerald-700" : "text-red-700"}`}>{message}</p>}
    </div>
  );
}
