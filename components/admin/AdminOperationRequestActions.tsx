"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export function AdminOperationRequestActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  if (status !== "pending") return <span className="text-xs font-semibold text-slate-400">已处理</span>;

  async function run(action: "approve" | "reject") {
    const reason = window.prompt(action === "approve" ? "请输入审批通过原因" : "请输入驳回原因");
    if (!reason || reason.trim().length < 4) return;
    setLoadingAction(action);
    try {
      const res = await fetch(`/api/admin/operation-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `审批失败 (${res.status})`);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "审批失败");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => run("approve")}
        disabled={Boolean(loadingAction)}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-xs font-black text-emerald-700 disabled:opacity-60"
      >
        {loadingAction === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        通过
      </button>
      <button
        type="button"
        onClick={() => run("reject")}
        disabled={Boolean(loadingAction)}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 text-xs font-black text-red-700 disabled:opacity-60"
      >
        {loadingAction === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
        驳回
      </button>
    </div>
  );
}
