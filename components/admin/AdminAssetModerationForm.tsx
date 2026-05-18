"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

export function AdminAssetModerationForm({
  sourceId,
  sourceType,
}: {
  sourceId: string;
  sourceType: string;
}) {
  const router = useRouter();
  const [action, setAction] = useState("hide");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/assets/${sourceId}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType, action, reason }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `审核失败 (${res.status})`);
      setReason("");
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "审核失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex min-w-[280px] items-center gap-1.5">
      <select
        value={action}
        onChange={(event) => setAction(event.target.value)}
        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700"
        aria-label="审核动作"
      >
        <option value="hide">下架</option>
        <option value="pass">通过</option>
        <option value="escalate">复核</option>
      </select>
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-slate-400"
        placeholder="原因"
        required
        minLength={4}
      />
      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-950 px-2 text-xs font-black text-white disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        记录
      </button>
    </form>
  );
}
