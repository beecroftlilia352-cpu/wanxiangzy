"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Loader2, Plus } from "lucide-react";

type GeneratedCode = {
  id: string;
  code: string;
};

export function AdminInviteCodeForm() {
  const router = useRouter();
  const [count, setCount] = useState(1);
  const [maxUses, setMaxUses] = useState(1);
  const [prefix, setPrefix] = useState("VW");
  const [campaign, setCampaign] = useState("");
  const [note, setNote] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [generatedCodes, setGeneratedCodes] = useState<GeneratedCode[]>([]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          maxUses,
          prefix,
          campaign,
          note,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `生成失败 (${res.status})`);
      setGeneratedCodes(Array.isArray(payload.codes) ? payload.codes : []);
      setMessage("邀请码已生成，使用记录会在用户注册后写入。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function copyCodes() {
    const text = generatedCodes.map((item) => item.code).join("\n");
    if (!text) return;
    await navigator.clipboard?.writeText(text);
    setMessage("已复制本次生成的邀请码。");
  }

  return (
    <form onSubmit={submit} className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
      <label className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">生成数量</span>
        <input
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
          className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">单码次数</span>
        <input
          type="number"
          min={1}
          max={1000}
          value={maxUses}
          onChange={(event) => setMaxUses(Number(event.target.value))}
          className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">前缀</span>
        <input
          value={prefix}
          onChange={(event) => setPrefix(event.target.value)}
          maxLength={12}
          className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 font-mono text-sm font-black uppercase outline-none focus:border-[var(--admin-border-strong)]"
          placeholder="VW"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">备注</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={200}
          className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
          placeholder="渠道、批次或发放对象"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">批次/渠道</span>
        <input
          value={campaign}
          onChange={(event) => setCampaign(event.target.value)}
          maxLength={80}
          className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
          placeholder="小红书内测、代理商 A"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">生效时间</span>
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
          className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">过期时间</span>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
          className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
        />
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--admin-fg)] px-4 text-sm font-black text-white disabled:opacity-60 xl:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          生成
        </button>
      </div>
      {generatedCodes.length > 0 && (
        <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] p-3 md:col-span-2 xl:col-span-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-[var(--admin-faint)]">本次生成</p>
            <button type="button" onClick={copyCodes} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs font-black text-[var(--admin-fg)] hover:bg-[var(--admin-surface-soft)]">
              <Copy className="h-3.5 w-3.5" />
              复制
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {generatedCodes.map((item) => (
              <code key={item.id || item.code} className="rounded-md bg-[var(--admin-surface)] px-2 py-1 font-mono text-sm font-black text-[var(--admin-fg)] ring-1 ring-slate-200">
                {item.code}
              </code>
            ))}
          </div>
        </div>
      )}
      {message && (
        <p className={`text-sm font-bold md:col-span-2 xl:col-span-4 ${message.includes("失败") || message.includes("无效") || message.includes("必须") ? "text-[var(--admin-danger)]" : "text-[var(--admin-success)]"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
