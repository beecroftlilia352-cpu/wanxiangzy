"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, Coins, Loader2, Save, ShieldCheck } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { App, Typography } from "@/components/ui/shadcn-compat";
import type { AdminUserListItem } from "@/lib/admin/data";

type AdminUserManagementFormProps = {
  profile: AdminUserListItem;
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

export function AdminUserManagementForm({ profile }: AdminUserManagementFormProps) {
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
      <form onSubmit={submitProfile} className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-black text-slate-950">
          <Save aria-hidden="true" className="h-4 w-4 text-slate-500" />
          基础资料
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-black text-slate-500">显示名</span>
          <input
            name="displayName"
            defaultValue={profile.displayName || ""}
            maxLength={80}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
            placeholder="用户昵称"
          />
        </label>
        <SubmitButton loading={profileLoading} icon={<Save aria-hidden="true" className="h-4 w-4" />} label="保存资料" />
        <FormMessage message={profileMessage} />
      </form>

      <form onSubmit={handleControlSubmit} className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-black text-slate-950">
          <Ban aria-hidden="true" className="h-4 w-4 text-slate-500" />
          运营控制
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-slate-500">账号状态</span>
            <select
              name="status"
              defaultValue={profile.accountStatus}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700"
            >
              <option value="active">正常</option>
              <option value="restricted">观察</option>
              <option value="suspended">暂停</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-slate-500">服务等级</span>
            <select
              name="supportLevel"
              defaultValue={profile.supportLevel}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700"
            >
              <option value="standard">标准</option>
              <option value="priority">优先</option>
              <option value="watch">重点观察</option>
            </select>
          </label>
        </div>
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700">
          <input name="generateEnabled" type="checkbox" defaultChecked={profile.generateEnabled} className="h-4 w-4 rounded border-slate-300" />
          允许继续生成
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-black text-slate-500">限制到期</span>
          <input
            name="expiresAt"
            type="datetime-local"
            defaultValue={toDateTimeLocal(profile.controlExpiresAt)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-black text-slate-500">原因</span>
          <input
            name="reason"
            defaultValue={profile.controlReason || ""}
            maxLength={240}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-400"
            placeholder="如：连续失败任务异常、人工风控观察"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-black text-slate-500">内部备注</span>
          <textarea
            name="note"
            defaultValue={profile.controlNote || ""}
            maxLength={1000}
            className="min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-slate-400"
          />
        </label>
        <SubmitButton loading={controlLoading} icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />} label="保存控制" />
        <FormMessage message={controlMessage} />
      </form>

      <form onSubmit={handleCreditSubmit} className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-black text-slate-950">
          <Coins aria-hidden="true" className="h-4 w-4 text-slate-500" />
          灵点调整
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-black text-slate-500">变动数量</span>
          <input
            name="amount"
            type="number"
            min={-10000}
            max={10000}
            required
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm font-semibold outline-none focus:border-slate-400 tabular-nums"
            placeholder="+20 / -5"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-black text-slate-500">调整原因</span>
          <textarea
            name="reason"
            minLength={4}
            maxLength={240}
            required
            className="min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-slate-400"
            placeholder="如：卡住任务补偿、人工核对后扣回"
          />
        </label>
        <SubmitButton loading={creditLoading} icon={<Coins aria-hidden="true" className="h-4 w-4" />} label="提交调整" />
        <FormMessage message={creditMessage} />
      </form>
    </div>
  );
}

function SubmitButton({ loading, icon, label }: { loading: boolean; icon: ReactNode; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
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
    <p role="status" aria-live="polite" className={`text-sm font-bold ${ok ? "text-emerald-700" : "text-red-700"}`}>
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
