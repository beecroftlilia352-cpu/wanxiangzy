"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, PlusCircle } from "lucide-react";
import type { AdminSupportTicketCategory, AdminSupportTicketPriority } from "@/lib/admin/data";

const categories: Array<{ value: AdminSupportTicketCategory; label: string }> = [
  { value: "generation_failure", label: "生成失败" },
  { value: "credit_issue", label: "积分问题" },
  { value: "content_moderation", label: "内容审核" },
  { value: "billing", label: "账单" },
  { value: "account", label: "账号" },
  { value: "technical", label: "技术问题" },
  { value: "other", label: "其他" },
];

const priorities: Array<{ value: AdminSupportTicketPriority; label: string }> = [
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
  { value: "low", label: "低" },
];

export function AdminSupportTicketForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<AdminSupportTicketCategory>("generation_failure");
  const [priority, setPriority] = useState<AdminSupportTicketPriority>("medium");
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [generationId, setGenerationId] = useState("");
  const [tags, setTags] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, category, priority, userEmail, userId, generationId, tags }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `创建工单失败 (${res.status})`);
      setMessage(`工单已创建：${payload.ticket?.ticket_no || payload.ticket?.id || ""}`);
      setTitle("");
      setDescription("");
      setUserEmail("");
      setUserId("");
      setGenerationId("");
      setTags("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建工单失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 p-4 xl:grid-cols-[minmax(260px,1fr)_160px_130px_minmax(220px,0.8fr)_minmax(220px,0.8fr)]">
      <label className="space-y-1.5 xl:col-span-2">
        <span className="text-xs font-black text-slate-500">标题</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          placeholder="例如：姿势裂变结果重复，用户要求补偿"
          required
          minLength={4}
          maxLength={120}
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">分类</span>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as AdminSupportTicketCategory)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700"
        >
          {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">优先级</span>
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value as AdminSupportTicketPriority)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700"
        >
          {priorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">用户邮箱</span>
        <input
          value={userEmail}
          onChange={(event) => setUserEmail(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          placeholder="user@example.com"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">用户 ID</span>
        <input
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs font-semibold outline-none focus:border-slate-400"
          placeholder="UUID"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">Generation ID</span>
        <input
          value={generationId}
          onChange={(event) => setGenerationId(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs font-semibold outline-none focus:border-slate-400"
          placeholder="UUID"
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">标签</span>
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          placeholder="pose, refund"
        />
      </label>
      <label className="space-y-1.5 xl:col-span-4">
        <span className="text-xs font-black text-slate-500">问题描述</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold leading-5 outline-none focus:border-slate-400"
          placeholder="记录用户诉求、关联证据、已尝试动作和下一步建议。"
          required
          minLength={8}
          maxLength={2000}
        />
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60 xl:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
          创建工单
        </button>
      </div>
      {message && (
        <p className={`text-sm font-bold xl:col-span-5 ${message.includes("已创建") ? "text-emerald-700" : "text-red-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
