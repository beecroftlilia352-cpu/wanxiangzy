"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

const exportTypes = [
  { value: "users", label: "用户" },
  { value: "credits", label: "积分流水" },
  { value: "generations", label: "生成任务" },
  { value: "assets", label: "资产" },
  { value: "audit", label: "审计日志" },
  { value: "diagnostics", label: "异常诊断" },
  { value: "reports", label: "成本报表" },
  { value: "requests", label: "审批单" },
  { value: "moderation", label: "审核案件" },
];

export function AdminExportForm() {
  const router = useRouter();
  const [exportType, setExportType] = useState("users");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [module, setModule] = useState("");
  const [limit, setLimit] = useState(100);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exportType,
          reason,
          filters: { q, status, module, limit },
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `创建导出失败 (${res.status})`);
      setMessage("导出任务已创建，下载链接 1 小时内有效。");
      setReason("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建导出失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 p-4 xl:grid-cols-[180px_minmax(180px,1fr)_150px_150px_120px_minmax(220px,1fr)_auto]">
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">数据集</span>
        <select
          value={exportType}
          onChange={(event) => setExportType(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700"
        >
          {exportTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">搜索</span>
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          placeholder="用户 / 任务 / 原因"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">状态</span>
        <input
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          placeholder="pending / failed"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">模块</span>
        <input
          value={module}
          onChange={(event) => setModule(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          placeholder="pose / tryon"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">上限</span>
        <input
          type="number"
          min={1}
          max={500}
          value={limit}
          onChange={(event) => setLimit(Number(event.target.value))}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">导出原因</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          placeholder="例如：财务核对 / 审计抽查"
          required
          minLength={4}
        />
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60 xl:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          创建
        </button>
      </div>
      {message && (
        <p className={`xl:col-span-7 text-sm font-bold ${message.includes("已创建") ? "text-emerald-700" : "text-red-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
