"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export function AdminInviteCodeActions({ id, status }: { id: string; status: "active" | "disabled" }) {
  const router = useRouter();
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
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => {
        const actionLabel = status === "active" ? "停用" : "启用";
        const confirmed = window.confirm(
          status === "active"
            ? `确定停用该邀请码吗？停用后此码无法再用于注册，已有用户不受影响。`
            : `确定启用该邀请码吗？启用后新用户可凭此码完成注册。`,
        );
        if (confirmed) void submit();
      }}
      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs font-black text-[var(--admin-fg)] hover:bg-[var(--admin-surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {status === "active" ? "停用" : "启用"}
    </button>
  );
}
