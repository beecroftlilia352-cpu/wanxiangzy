"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function AdminInviteCodeActions({ id, status }: { id: string; status: "active" | "disabled" }) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [loading, setLoading] = useState(false);
  const nextStatus = status === "active" ? "disabled" : "active";

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/invite-codes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `更新失败 (${res.status})`);
      router.refresh();
      toast.success(status === "active" ? "邀请码已停用" : "邀请码已启用");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新邀请码失败");
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
        title: status === "active" ? "停用邀请码" : "启用邀请码",
        content: status === "active"
          ? "停用后此码无法再用于注册，已有用户不受影响。"
          : "启用后新用户可凭此码完成注册。",
        okText: status === "active" ? "确认停用" : "确认启用",
        onOk: submit,
      })}
      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs font-black text-[var(--admin-fg)] hover:bg-[var(--admin-surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {status === "active" ? "停用" : "启用"}
    </button>
    {confirmDialog}
    </>
  );
}
