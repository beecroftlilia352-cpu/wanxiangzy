"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export function AdminInviteRewardActions({ id }: { id: string }) {
  const router = useRouter();
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
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => {
        const confirmed = window.confirm(
          "确定撤销该邀请奖励吗？撤销后邀请人与被邀请人已发放的灵点将被回收（余额不会扣为负）。",
        );
        if (confirmed) void submit();
      }}
      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs font-black text-[var(--admin-fg)] hover:bg-[var(--admin-surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      撤销
    </button>
  );
}
