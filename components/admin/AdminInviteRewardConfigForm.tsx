"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { AdminStatusBadge } from "@/components/admin/AdminPrimitives";

type InviteRewardConfigPayload = {
  config: { inviterCredits?: number; inviteeCredits?: number } | null;
  publishedAt: string | null;
  effective: { inviterCredits: number; inviteeCredits: number };
  defaults: { inviterCredits: number; inviteeCredits: number };
};

/**
 * 邀请奖励配置：邀请人与被邀请人的灵点额度统一在后台管理，
 * 发布后服务端运行时读取（5 分钟缓存内生效），无需环境变量。
 */
export function AdminInviteRewardConfigForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inviterCredits, setInviterCredits] = useState("");
  const [inviteeCredits, setInviteeCredits] = useState("");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [effective, setEffective] = useState<{ inviterCredits: number; inviteeCredits: number } | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/invite-rewards", { cache: "no-store" });
      const payload = (await res.json().catch(() => ({}))) as Partial<InviteRewardConfigPayload>;
      const base = payload.config ?? payload.effective ?? payload.defaults;
      if (base) {
        setInviterCredits(String(base.inviterCredits ?? ""));
        setInviteeCredits(String(base.inviteeCredits ?? ""));
      }
      setPublishedAt(payload.publishedAt || null);
      setEffective(payload.effective || null);
    } catch {
      // 首次未配置属正常
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/invite-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviterCredits: Number(inviterCredits), inviteeCredits: Number(inviteeCredits), reason }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "保存失败");
      toast.success("已发布：新额度最多 5 分钟内生效");
      setReason("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 py-2 text-xs text-[var(--admin-muted)]">
        <span>
          {publishedAt
            ? `上次发布 ${new Date(publishedAt).toLocaleString("zh-CN")} · 当前生效：邀请人 ${effective?.inviterCredits ?? "-"} 灵点 / 被邀人 ${effective?.inviteeCredits ?? "-"} 灵点`
            : `尚未发布配置 · 当前使用默认值：邀请人 ${effective?.inviterCredits ?? "-"} 灵点 / 被邀人 ${effective?.inviteeCredits ?? "-"} 灵点`}
        </span>
        <AdminStatusBadge status={publishedAt ? "published" : "draft"} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-black text-[var(--admin-muted)]">邀请人奖励（灵点/人）</span>
          <input
            type="number"
            min={0}
            max={10000}
            step={1}
            value={inviterCredits}
            onChange={(event) => setInviterCredits(event.target.value)}
            placeholder="100"
            className="h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 font-mono text-xs text-[var(--admin-fg)] outline-none focus:border-[var(--admin-accent)]"
          />
          <span className="text-[11px] text-[var(--admin-faint)]">好友注册成功，邀请人自动到账。0 表示不发放。</span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-black text-[var(--admin-muted)]">被邀人奖励（灵点/人）</span>
          <input
            type="number"
            min={0}
            max={10000}
            step={1}
            value={inviteeCredits}
            onChange={(event) => setInviteeCredits(event.target.value)}
            placeholder="50"
            className="h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 font-mono text-xs text-[var(--admin-fg)] outline-none focus:border-[var(--admin-accent)]"
          />
          <span className="text-[11px] text-[var(--admin-faint)]">好友使用邀请码注册，本人自动到账。0 表示不发放。</span>
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">变更原因（写入审计日志）</span>
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="例如：邀请裂变活动调高奖励"
          className="h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs text-[var(--admin-fg)] outline-none focus:border-[var(--admin-accent)]"
        />
      </label>

      <button
        type="submit"
        disabled={saving || loading}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--admin-fg)] px-4 text-sm font-black text-white disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        保存并发布
      </button>
    </form>
  );
}
