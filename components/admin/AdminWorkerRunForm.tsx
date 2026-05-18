"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Play } from "lucide-react";

export function AdminWorkerRunForm() {
  const router = useRouter();
  const [target, setTarget] = useState("generations");
  const [limit, setLimit] = useState(2);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/workers/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, limit, reason }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `触发失败 (${res.status})`);
      setMessage(`已触发 ${target}，结果已写入审计。`);
      setReason("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "触发失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 p-4 lg:grid-cols-[220px_120px_minmax(320px,1fr)_auto]">
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">Worker</span>
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700"
        >
          <option value="generations">生成任务</option>
          <option value="agent-workflows">Agent workflow</option>
          <option value="agent-evals">Agent eval</option>
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">批量</span>
        <input
          type="number"
          min={1}
          max={target === "agent-evals" ? 100 : 10}
          value={limit}
          onChange={(event) => setLimit(Number(event.target.value))}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">触发原因</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          placeholder="例如：处理积压队列 / 验证修复后的 worker"
          required
          minLength={6}
        />
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60 lg:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          触发
        </button>
      </div>
      {message && (
        <p className={`lg:col-span-4 text-sm font-bold ${message.startsWith("已触发") ? "text-emerald-700" : "text-red-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
