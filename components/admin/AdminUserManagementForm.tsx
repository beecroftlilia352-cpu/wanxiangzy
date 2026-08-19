"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, Coins, Loader2, Save, ShieldCheck } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { App, Typography } from "@/components/ui/shadcn-compat";
import type { AdminUserListItem } from "@/lib/admin/data";

type AdminUserManagementFormProps = {
  profile: AdminUserListItem;
  canManageUser?: boolean;
  canAdjustCredits?: boolean;
};

type ControlPayload = {
  action: "update_control";
  status: string;
  generateEnabled: boolean;
  supportLevel: string;
  reason: string;
  note: string;
  expiresAt: string;
};

type CreditPayload = {
  action: "credit_adjust";
  userId: string;
  amount: number;
  reason: string;
};

export function AdminUserManagementForm({ profile, canManageUser = false, canAdjustCredits = false }: AdminUserManagementFormProps) {
  const router = useRouter();
  const { modal } = App.useApp();
  const [profileMessage, setProfileMessage] = useState("");
  const [controlMessage, setControlMessage] = useState("");
  const [creditMessage, setCreditMessage] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [controlLoading, setControlLoading] = useState(false);
  const [creditLoading, setCreditLoading] = useState(false);

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageUser) return;
    setProfileLoading(true);
    setProfileMessage("");
    const form = new FormData(event.currentTarget);

    try {
      const res = await fetch(`/api/admin/users/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_profile",
          displayName: String(form.get("displayName") || ""),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `保存失败 (${res.status})`);
      setProfileMessage("资料已更新");
      router.refresh();
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setProfileLoading(false);
    }
  }

  async function runControl(payload: ControlPayload) {
    if (!canManageUser) return;
    const res = await fetch(`/api/admin/users/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `保存失败 (${res.status})`);
  }

  function handleControlSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageUser) return;
    const form = new FormData(event.currentTarget);
    const payload: ControlPayload = {
      action: "update_control",
      status: String(form.get("status") || "active"),
      generateEnabled: form.get("generateEnabled") === "on",
      supportLevel: String(form.get("supportLevel") || "standard"),
      reason: String(form.get("reason") || ""),
      note: String(form.get("note") || ""),
      expiresAt: String(form.get("expiresAt") || ""),
    };
    const statusLabel = payload.status === "suspended" ? "暂停" : payload.status === "restricted" ? "观察" : "正常";
    const summary = `${statusLabel} · ${payload.supportLevel} · 允许生成 ${payload.generateEnabled ? "是" : "否"}`;
    const isDestructive = payload.status === "suspended";
    modal.confirm({
      title: "确认更新运营控制",
      content: (
        <Typography.Paragraph className="!mb-0">
          用户 {profile.email || profile.id} 将被设置为：{summary}。{isDestructive ? "暂停后用户无法继续生成，已产生任务会保留。" : ""}
        </Typography.Paragraph>
      ),
      okText: "确认更新",
      okButtonProps: { danger: isDestructive },
      async onOk() {
        setControlLoading(true);
        setControlMessage("");
        try {
          await runControl(payload);
          setControlMessage("运营控制已更新");
          router.refresh();
        } catch (error) {
          setControlMessage(error instanceof Error ? error.message : "保存失败");
        } finally {
          setControlLoading(false);
        }
      },
    });
  }

  async function runCredit(payload: CreditPayload) {
    if (!canAdjustCredits) return;
    const res = await fetch("/api/admin/credits/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `调整失败 (${res.status})`);
  }

  function handleCreditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAdjustCredits) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amount = Number(form.get("amount") || 0);
    const reason = String(form.get("reason") || "");
    const payload: CreditPayload = {
      action: "credit_adjust",
      userId: profile.id,
      amount,
      reason,
    };
    if (reason.trim().length < 4) {
      setCreditMessage("请填写至少 4 个字的原因");
      return;
    }
    const direction = amount > 0 ? "增加" : amount < 0 ? "扣减" : "调整";
    modal.confirm({
      title: `确认${direction}灵点`,
      content: (
        <Typography.Paragraph className="!mb-0">
          将对用户 {profile.email || profile.id} {direction} <Typography.Text strong className="tabular-nums">{amount > 0 ? "+" : ""}{amount}</Typography.Text> 灵点。
          此操作立即生效并写入审计日志。
        </Typography.Paragraph>
      ),
      okText: "确认调整",
      okButtonProps: { danger: amount < 0 },
      async onOk() {
        setCreditLoading(true);
        setCreditMessage("");
        try {
          await runCredit(payload);
          setCreditMessage("灵点已调整");
          formElement.reset();
          router.refresh();
        } catch (error) {
          setCreditMessage(error instanceof Error ? error.message : "调整失败");
        } finally {
          setCreditLoading(false);
        }
      },
    });
  }

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-3">
      {canManageUser ? <form onSubmit={submitProfile} className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-black text-[var(--admin-fg)]">
          <Save aria-hidden="true" className="h-4 w-4 text-[var(--admin-muted)]" />
          基础资料
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-black text-[var(--admin-muted)]">显示名</span>
          <input
            name="displayName"
            defaultValue={profile.displayName || ""}
            maxLength={80}
            className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
            placeholder="用户昵称"
          />
        </label>
        <SubmitButton loading={profileLoading} icon={<Save aria-hidden="true" className="h-4 w-4" />} label="保存资料" />
        <FormMessage message={profileMessage} />
      </form> : <ReadOnlyPanel title="基础资料" description="当前角色仅可查看用户资料，不能修改显示名。" icon={<Save aria-hidden="true" className="h-4 w-4 text-[var(--admin-muted)]" />} />}

      {canManageUser ? <form onSubmit={handleControlSubmit} className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-black text-[var(--admin-fg)]">
          <Ban aria-hidden="true" className="h-4 w-4 text-[var(--admin-muted)]" />
          运营控制
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-[var(--admin-muted)]">账号状态</span>
            <select
              name="status"
              defaultValue={profile.accountStatus}
              className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-sm font-bold text-[var(--admin-fg)]"
            >
              <option value="active">正常</option>
              <option value="restricted">观察</option>
              <option value="suspended">暂停</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-[var(--admin-muted)]">服务等级</span>
            <select
              name="supportLevel"
              defaultValue={profile.supportLevel}
              className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-sm font-bold text-[var(--admin-fg)]"
            >
              <option value="standard">标准</option>
              <option value="priority">优先</option>
              <option value="watch">重点观察</option>
            </select>
          </label>
        </div>
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 text-sm font-bold text-[var(--admin-fg)]">
          <input name="generateEnabled" type="checkbox" defaultChecked={profile.generateEnabled} className="h-4 w-4 rounded border-[var(--codex-border-strong)]" />
          允许继续生成
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-black text-[var(--admin-muted)]">限制到期</span>
          <input
            name="expiresAt"
            type="datetime-local"
            defaultValue={toDateTimeLocal(profile.controlExpiresAt)}
            className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-black text-[var(--admin-muted)]">原因</span>
          <input
            name="reason"
            defaultValue={profile.controlReason || ""}
            maxLength={240}
            className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
            placeholder="如：连续失败任务异常、人工风控观察"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-black text-[var(--admin-muted)]">内部备注</span>
          <textarea
            name="note"
            defaultValue={profile.controlNote || ""}
            maxLength={1000}
            className="min-h-20 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
          />
        </label>
        <SubmitButton loading={controlLoading} icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />} label="保存控制" />
        <FormMessage message={controlMessage} />
      </form> : <ReadOnlyPanel title="运营控制" description="当前角色无用户控制权限，状态和生成开关保持只读。" icon={<Ban aria-hidden="true" className="h-4 w-4 text-[var(--admin-muted)]" />} />}

      {canAdjustCredits ? <form onSubmit={handleCreditSubmit} className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-black text-[var(--admin-fg)]">
          <Coins aria-hidden="true" className="h-4 w-4 text-[var(--admin-muted)]" />
          灵点调整
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-black text-[var(--admin-muted)]">变动数量</span>
          <input
            name="amount"
            type="number"
            min={-10000}
            max={10000}
            required
            className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 font-mono text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)] tabular-nums"
            placeholder="+20 / -5"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-black text-[var(--admin-muted)]">调整原因</span>
          <textarea
            name="reason"
            minLength={4}
            maxLength={240}
            required
            className="min-h-28 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
            placeholder="如：卡住任务补偿、人工核对后扣回"
          />
        </label>
        <SubmitButton loading={creditLoading} icon={<Coins aria-hidden="true" className="h-4 w-4" />} label="提交调整" />
        <FormMessage message={creditMessage} />
      </form> : <ReadOnlyPanel title="灵点调整" description="灵点变动需要 credits:write 权限，并会进入审计日志。" icon={<Coins aria-hidden="true" className="h-4 w-4 text-[var(--admin-muted)]" />} />}
    </div>
  );
}

function ReadOnlyPanel({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] p-3">
      <div className="flex items-center gap-2 text-sm font-black text-[var(--admin-fg)]">
        {icon}
        {title}
      </div>
      <p className="text-sm font-semibold leading-6 text-[var(--admin-muted)]">{description}</p>
      <span className="inline-flex h-8 items-center rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs font-black text-[var(--admin-muted)]">只读</span>
    </div>
  );
}

function SubmitButton({ loading, icon, label }: { loading: boolean; icon: ReactNode; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--admin-fg)] px-4 text-sm font-black text-white transition-colors hover:bg-codex-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-fg)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function FormMessage({ message }: { message: string }) {
  if (!message) return null;
  const ok = message.includes("已");
  return (
    <p role="status" aria-live="polite" className={`text-sm font-bold ${ok ? "text-[var(--admin-success)]" : "text-[var(--admin-danger)]"}`}>
      {message}
    </p>
  );
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}
