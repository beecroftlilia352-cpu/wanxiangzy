"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilePlus2, Loader2, PlusCircle } from "lucide-react";

export function AdminCreditAdjustForm({
  mode = "adjust",
}: {
  mode?: "adjust" | "request";
}) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [generationId, setGenerationId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const isRequest = mode === "request";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(isRequest ? "/api/admin/operation-requests" : "/api/admin/credits/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: isRequest ? "credits.adjust" : undefined,
          userId,
          amount: Number(amount),
          reason,
          generationId: generationId || undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || `调整失败 (${res.status})`);
      }
      setMessage(isRequest ? "补偿审批单已创建，等待 Finance/Owner 审批。" : "积分已调整，审计日志已记录。");
      setUserId("");
      setAmount("");
      setReason("");
      setGenerationId("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "调整失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 p-4 lg:grid-cols-[minmax(240px,1fr)_120px_minmax(220px,1fr)_minmax(240px,1fr)_auto]">
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">用户 UUID</span>
        <input
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          placeholder="auth.users / profiles id"
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          required
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">调整数量</span>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="+10 / -5"
          type="number"
          min={-10000}
          max={10000}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          required
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">关联 generation</span>
        <input
          value={generationId}
          onChange={(event) => setGenerationId(event.target.value)}
          placeholder="可选"
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">原因</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="例如：客服补偿、异常扣费修正"
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          required
        />
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60 lg:w-auto"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isRequest ? <FilePlus2 className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
          {isRequest ? "创建申请" : "直接调整"}
        </button>
      </div>
      {message && (
        <p className={`lg:col-span-5 text-sm font-bold ${message.includes("已") ? "text-emerald-700" : "text-red-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
