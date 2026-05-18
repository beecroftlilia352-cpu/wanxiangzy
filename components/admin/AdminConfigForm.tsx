"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilePlus2, Loader2 } from "lucide-react";

const defaultJson = `{
  "enabled": true,
  "notes": "draft config"
}`;

export function AdminConfigForm() {
  const router = useRouter();
  const [configKey, setConfigKey] = useState("");
  const [status, setStatus] = useState("draft");
  const [value, setValue] = useState(defaultJson);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
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
      const res = await fetch("/api/admin/settings/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configKey, status, value: parsed }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `保存失败 (${res.status})`);
      setMessage("配置版本已创建，审计日志已记录。");
      setConfigKey("");
      setStatus("draft");
      setValue(defaultJson);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 p-4 lg:grid-cols-[minmax(240px,0.8fr)_160px_minmax(360px,1.4fr)_auto]">
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">配置键</span>
        <input
          value={configKey}
          onChange={(event) => setConfigKey(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          placeholder="model.routing"
          required
        />
      </label>
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
        <span className="text-xs font-black text-slate-500">JSON 内容</span>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-slate-400"
          required
        />
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60 lg:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
          创建
        </button>
      </div>
      {message && (
        <p className={`lg:col-span-4 text-sm font-bold ${message.includes("已创建") ? "text-emerald-700" : "text-red-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
