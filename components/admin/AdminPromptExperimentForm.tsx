"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FilePlus2, Loader2 } from "lucide-react";

export function AdminPromptExperimentForm({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const [status, setStatus] = useState("draft");
  const [value, setValue] = useState(defaultValue);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new Error("配置内容必须是合法 JSON");
      }

      const res = await fetch("/api/admin/prompts/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, value: parsed, reason }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `保存失败 (${res.status})`);
      setMessage("Prompt 实验配置版本已创建，审计日志已记录。");
      setStatus("draft");
      setReason("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 p-4 lg:grid-cols-[160px_minmax(360px,1fr)_minmax(260px,0.6fr)_auto]">
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">状态</span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700"
        >
          <option value="draft">draft</option>
          <option value="published">published</option>
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">prompt.experiments JSON</span>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="min-h-56 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-slate-400"
          required
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">原因</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-slate-400"
          placeholder="发布时必填，例如：姿势裂变 prompt V2 灰度 10%"
        />
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60 lg:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
          创建
        </button>
      </div>
      {message && (
        <p className={`text-sm font-bold lg:col-span-4 ${message.includes("已创建") ? "text-emerald-700" : "text-red-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
