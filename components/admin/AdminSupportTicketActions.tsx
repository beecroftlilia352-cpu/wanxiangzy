"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { AdminSupportTicketStatus } from "@/lib/admin/data";

type AdminSupportTicketActionsProps = {
  id: string;
  status: AdminSupportTicketStatus;
};

export function AdminSupportTicketActions({ id, status }: AdminSupportTicketActionsProps) {
  const router = useRouter();
  const [loadingStatus, setLoadingStatus] = useState<AdminSupportTicketStatus | null>(null);
  const [pendingStatus, setPendingStatus] = useState<AdminSupportTicketStatus | null>(null);
  const [reason, setReason] = useState("");
  const done = status === "resolved" || status === "closed";

  function openStatus(nextStatus: AdminSupportTicketStatus) {
    setReason("");
    setPendingStatus(nextStatus);
  }

  async function update() {
    const nextStatus = pendingStatus;
    const normalizedReason = reason.trim();
    if (!nextStatus) return;
    if (normalizedReason.length < 4) {
      toast.error("请输入至少 4 个字的处理说明");
      return;
    }
    const resolution = nextStatus === "resolved" || nextStatus === "closed" ? normalizedReason : "";
    setLoadingStatus(nextStatus);
    try {
      const res = await fetch(`/api/admin/support-tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, reason: normalizedReason, resolution }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `更新工单失败 (${res.status})`);
      toast.success("工单状态已更新");
      setPendingStatus(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新工单失败");
    } finally {
      setLoadingStatus(null);
    }
  }

  if (done) return <span className="text-xs font-semibold text-slate-400">已完结</span>;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <ActionButton
          label="处理中"
          status="pending"
          tone="amber"
          loadingStatus={loadingStatus}
          onClick={() => openStatus("pending")}
          icon={<Clock3 className="h-3.5 w-3.5" />}
        />
        <ActionButton
          label="解决"
          status="resolved"
          tone="emerald"
          loadingStatus={loadingStatus}
          onClick={() => openStatus("resolved")}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
        />
        <ActionButton
          label="关闭"
          status="closed"
          tone="red"
          loadingStatus={loadingStatus}
          onClick={() => openStatus("closed")}
          icon={<XCircle className="h-3.5 w-3.5" />}
        />
      </div>

      <Dialog open={Boolean(pendingStatus)} onOpenChange={(open) => !open && setPendingStatus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingStatus === "resolved" ? "解决工单" : pendingStatus === "closed" ? "关闭工单" : "更新工单状态"}</DialogTitle>
            <DialogDescription>
              请输入处理说明，说明会写入后台审计记录并用于客服交接。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={pendingStatus === "resolved" ? "例如：已补偿用户灵点并验证任务结果" : "例如：已联系用户，等待补充材料"}
            rows={4}
            maxLength={300}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingStatus(null)} disabled={Boolean(loadingStatus)}>
              取消
            </Button>
            <Button type="button" onClick={() => void update()} disabled={Boolean(loadingStatus)}>
              {loadingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
