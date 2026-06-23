"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";

const resources = [
  "users",
  "credits",
  "generations",
  "assets",
  "asset_lifecycle",
  "audit",
  "agent_evals",
  "prompt_experiments",
  "diagnostics",
  "reports",
  "risk_scores",
  "requests",
  "support_tickets",
  "moderation",
  "workers",
];

const defaultFilters = `{
  "q": "",
  "status": "",
  "module": ""
}`;

export function AdminSavedViewForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [resource, setResource] = useState("generations");
  const [visibility, setVisibility] = useState("private");
  const [filters, setFilters] = useState(defaultFilters);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      let parsedFilters: unknown;
      try {
        parsedFilters = JSON.parse(filters);
      } catch {
        throw new Error("筛选条件必须是合法 JSON");
      }
      const res = await fetch("/api/admin/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, resource, visibility, filters: parsedFilters }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `保存视图失败 (${res.status})`);
      setMessage("视图已保存，可在列表中复用筛选条件。");
      setName("");
      setFilters(defaultFilters);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存视图失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 p-4 lg:grid-cols-[minmax(180px,0.8fr)_160px_140px_minmax(320px,1.4fr)_auto]">
      <label className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">视图名称</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
          placeholder="失败任务 · 姿势裂变"
          required
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">资源</span>
        <select
          value={resource}
          onChange={(event) => setResource(event.target.value)}
          className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-sm font-bold text-[var(--admin-fg)]"
        >
          {resources.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">可见性</span>
        <select
          value={visibility}
          onChange={(event) => setVisibility(event.target.value)}
          className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-sm font-bold text-[var(--admin-fg)]"
        >
          <option value="private">private</option>
          <option value="team">team</option>
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">筛选 JSON</span>
        <textarea
          value={filters}
          onChange={(event) => setFilters(event.target.value)}
          className="min-h-28 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-[var(--admin-border-strong)]"
          required
        />
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--admin-fg)] px-4 text-sm font-black text-white disabled:opacity-60 lg:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存
        </button>
      </div>
      {message && (
        <p className={`lg:col-span-5 text-sm font-bold ${message.includes("已保存") ? "text-[var(--admin-success)]" : "text-[var(--admin-danger)]"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
