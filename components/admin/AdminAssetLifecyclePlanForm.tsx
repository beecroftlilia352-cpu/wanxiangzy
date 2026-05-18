"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArchiveRestore, Loader2 } from "lucide-react";
import type { AdminAssetLifecycleAction } from "@/lib/admin/data";

const actions: Array<{ value: AdminAssetLifecycleAction; label: string; hint: string }> = [
  { value: "migrate_to_oss", label: "迁移到 OSS", hint: "复制外部 URL，并为后续回写引用做候选清单。" },
  { value: "review_temp_inputs", label: "复核临时输入图", hint: "确认超过 30 天的输入图是否仍需保留。" },
  { value: "archive_generated_result", label: "归档历史生成图", hint: "为超过 180 天的生成结果创建软归档计划。" },
  { value: "freeze_and_hide", label: "冻结下架素材", hint: "优先处理审核已下架的展示链路。" },
];

type AdminAssetLifecyclePlanFormProps = {
  q: string;
  module: string;
  limit: number;
};

export function AdminAssetLifecyclePlanForm({ q, module, limit }: AdminAssetLifecyclePlanFormProps) {
  const router = useRouter();
  const [action, setAction] = useState<AdminAssetLifecycleAction>("migrate_to_oss");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedAction = actions.find((item) => item.value === action) || actions[0];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/assets/lifecycle/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, filters: { q, module, limit } }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `创建生命周期计划失败 (${res.status})`);
      setMessage(`计划已记录到审计日志，候选 ${payload.plan?.affectedCount || 0} 个。`);
      setReason("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建生命周期计划失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 p-4 lg:grid-cols-[220px_minmax(280px,1fr)_auto]">
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">计划动作</span>
        <select
          value={action}
          onChange={(event) => setAction(event.target.value as AdminAssetLifecycleAction)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 outline-none focus:border-slate-400"
        >
          {actions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <p className="text-xs leading-5 text-slate-500">{selectedAction.hint}</p>
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-black text-slate-500">原因</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold leading-5 outline-none focus:border-slate-400"
          placeholder="例如：统一迁移外部图床，降低失效风险；本次仅创建审计计划，不会直接删除或迁移文件。"
          required
          minLength={6}
          maxLength={240}
        />
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60 lg:w-auto"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />}
          创建计划
        </button>
      </div>
      {message && (
        <p className={`text-sm font-bold lg:col-span-3 ${message.includes("已记录") ? "text-emerald-700" : "text-red-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
