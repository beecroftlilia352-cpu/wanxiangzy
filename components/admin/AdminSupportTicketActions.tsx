"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import type { AdminSupportTicketStatus } from "@/lib/admin/data";

type AdminSupportTicketActionsProps = {
  id: string;
  status: AdminSupportTicketStatus;
};

export function AdminSupportTicketActions({ id, status }: AdminSupportTicketActionsProps) {
  const router = useRouter();
  const [loadingStatus, setLoadingStatus] = useState<AdminSupportTicketStatus | null>(null);
  const done = status === "resolved" || status === "closed";

  async function update(nextStatus: AdminSupportTicketStatus) {
    const reason = window.prompt(nextStatus === "resolved" ? "请输入解决说明" : "请输入状态变更原因");
    if (!reason || reason.trim().length < 4) return;
    const resolution = nextStatus === "resolved" || nextStatus === "closed" ? reason : "";
    setLoadingStatus(nextStatus);
    try {
      const res = await fetch(`/api/admin/support-tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, reason, resolution }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `更新工单失败 (${res.status})`);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "更新工单失败");
    } finally {
      setLoadingStatus(null);
    }
  }

  if (done) return <span className="text-xs font-semibold text-slate-400">已完结</span>;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ActionButton
        label="处理中"
        status="pending"
        tone="amber"
        loadingStatus={loadingStatus}
        onClick={() => update("pending")}
        icon={<Clock3 className="h-3.5 w-3.5" />}
      />
      <ActionButton
        label="解决"
        status="resolved"
        tone="emerald"
        loadingStatus={loadingStatus}
        onClick={() => update("resolved")}
        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
      />
      <ActionButton
        label="关闭"
        status="closed"
        tone="red"
        loadingStatus={loadingStatus}
        onClick={() => update("closed")}
        icon={<XCircle className="h-3.5 w-3.5" />}
      />
    </div>
  );
}

function ActionButton({
  label,
  status,
  tone,
  loadingStatus,
  onClick,
  icon,
}: {
  label: string;
  status: AdminSupportTicketStatus;
  tone: "amber" | "emerald" | "red";
  loadingStatus: AdminSupportTicketStatus | null;
  onClick: () => void;
  icon: ReactNode;
}) {
  const toneClass = {
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(loadingStatus)}
      className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-black disabled:opacity-60 ${toneClass}`}
    >
      {loadingStatus === status ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
