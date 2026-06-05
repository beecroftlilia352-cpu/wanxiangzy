"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2, Play } from "lucide-react";

type WorkerTarget = "generations" | "agent-workflows" | "agent-evals";

type AdminWorkerRunFormProps = {
  defaultTarget?: WorkerTarget;
  defaultLimit?: number;
  defaultReason?: string;
  lockTarget?: boolean;
};

const WORKER_OPTIONS: Array<{ value: WorkerTarget; label: string }> = [
  { value: "generations", label: "生成任务" },
  { value: "agent-workflows", label: "工作流助手" },
  { value: "agent-evals", label: "回归评测" },
];

export function AdminWorkerRunForm({
  defaultTarget = "generations",
  defaultLimit,
  defaultReason = "",
  lockTarget = false,
}: AdminWorkerRunFormProps) {
  const router = useRouter();
  const [target, setTarget] = useState<WorkerTarget>(defaultTarget);
  const [limit, setLimit] = useState(defaultLimit || (defaultTarget === "agent-evals" ? 20 : 2));
  const [reason, setReason] = useState(defaultReason);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const maxLimit = target === "agent-evals" ? 100 : 10;

  async function submit(event: FormEvent<HTMLFormElement>) {
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
      setMessage(`已触发${targetLabel(target)}，处理结果已记录。`);
      if (!defaultReason) setReason("");
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
        <span className="text-xs font-black text-slate-500">处理类型</span>
        {lockTarget ? (
          <div className="flex h-10 w-full items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700">
            {WORKER_OPTIONS.find((option) => option.value === target)?.label || target}
          </div>
        ) : (
          <select
            value={target}
            onChange={(event) => {
              const nextTarget = event.target.value as WorkerTarget;
              setTarget(nextTarget);
              setLimit(nextTarget === "agent-evals" ? 20 : 2);
            }}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700"
          >
            {WORKER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">批量</span>
        <input
          type="number"
          min={1}
          max={maxLimit}
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
          placeholder="例如：处理积压队列 / 验证修复后的处理服务"
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
        <p className={`text-sm font-bold lg:col-span-4 ${message.startsWith("已触发") ? "text-emerald-700" : "text-red-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}

function targetLabel(target: WorkerTarget) {
  return WORKER_OPTIONS.find((option) => option.value === target)?.label || "处理任务";
}
