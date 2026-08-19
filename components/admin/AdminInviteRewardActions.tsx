"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function AdminInviteRewardActions({ id }: { id: string }) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/invite-rewards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reason: "管理员撤销" }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `撤销失败 (${res.status})`);
      router.refresh();
      toast.success("邀请奖励已撤销");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "撤销邀请奖励失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <button
      type="button"
      disabled={loading}
      onClick={() => confirm({
        title: "撤销邀请奖励",
        content: "撤销后邀请人与被邀请人已发放的灵点将被回收，余额不会扣为负。",
        okText: "确认撤销",
        onOk: submit,
      })}
      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs font-black text-[var(--admin-fg)] hover:bg-[var(--admin-surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      撤销
    </button>
    {confirmDialog}
    </>
  );
}
