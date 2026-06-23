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
      onClick={submit}
      disabled={loading}
      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs font-black text-[var(--admin-fg)] hover:bg-[var(--admin-surface-soft)] disabled:opacity-60"
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {status === "active" ? "停用" : "启用"}
    </button>
  );
}
