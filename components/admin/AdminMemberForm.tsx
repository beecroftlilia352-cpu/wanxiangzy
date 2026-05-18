"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";

const roles = ["owner", "ops", "support", "finance", "reviewer", "engineer", "viewer"];

export function AdminMemberForm() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [status, setStatus] = useState("active");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email, role, status }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `保存失败 (${res.status})`);
      setMessage("后台成员已保存，审计日志已记录。");
      setUserId("");
      setEmail("");
      setRole("viewer");
      setStatus("active");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 p-4 lg:grid-cols-[minmax(260px,1fr)_minmax(220px,0.8fr)_140px_130px_auto]">
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">用户 UUID</span>
        <input
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          placeholder="auth.users id"
          required
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">邮箱</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          placeholder="admin@example.com"
          type="email"
          required
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">角色</span>
        <select
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700"
        >
          {roles.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">状态</span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700"
        >
          <option value="active">active</option>
          <option value="disabled">disabled</option>
        </select>
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60 lg:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          保存
        </button>
      </div>
      {message && (
        <p className={`lg:col-span-5 text-sm font-bold ${message.includes("已保存") ? "text-emerald-700" : "text-red-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
