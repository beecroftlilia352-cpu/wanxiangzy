"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RefreshCw, Repeat2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AdminBillingAction = "refund" | "cancel-subscription" | "sync" | "replay-event";

const actionConfig: Record<
  AdminBillingAction,
  {
    label: string;
    endpoint: (targetId?: string) => string;
    idKey?: string;
    icon: typeof RotateCcw;
    confirm?: (targetId?: string) => string;
    body?: (targetId?: string) => Record<string, unknown>;
  }
> = {
  refund: {
    label: "退款",
    endpoint: (targetId) => `/api/admin/billing/orders/${encodeURIComponent(targetId || "")}/refund`,
    icon: RotateCcw,
    confirm: (targetId) => `确认发起退款？\n\n订单：${targetId || "-"}`,
    body: () => ({ reason: "管理员后台发起退款" }),
  },
  "cancel-subscription": {
    label: "取消订阅",
    endpoint: (targetId) => `/api/admin/billing/subscriptions/${encodeURIComponent(targetId || "")}/cancel`,
    icon: XCircle,
    confirm: (targetId) => `确认取消订阅？\n\n订阅：${targetId || "-"}`,
    body: () => ({ reason: "管理员后台取消订阅", cancelAtPeriodEnd: true }),
  },
  sync: {
    label: "同步",
    endpoint: () => "/api/admin/billing/sync",
    icon: RefreshCw,
  },
  "replay-event": {
    label: "重放事件",
    endpoint: () => "/api/admin/billing/webhook-events/replay",
    icon: Repeat2,
    confirm: (targetId) => `确认重放 Webhook 事件？\n\n事件：${targetId || "-"}`,
    body: (targetId) => ({ eventId: targetId }),
  },
};

export function AdminBillingActionButton({
  action,
  targetId,
  disabled,
}: {
  action: AdminBillingAction;
  targetId?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const config = actionConfig[action];
  const Icon = config.icon;

  function handleClick() {
    if (config.confirm) {
      setConfirmOpen(true);
      return;
    }
    void runAction();
  }

  async function runAction() {
    setConfirmOpen(false);
    setLoading(true);
    try {
      const endpoint = config.endpoint(targetId);
      const body = config.body ? config.body(targetId) : config.idKey ? { [config.idKey]: targetId } : {};
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fallback = res.status === 404 ? `接口未就绪：${endpoint}` : `操作失败 (${res.status})`;
        throw new Error(typeof payload.error === "string" ? payload.error : fallback);
      }
      toast.success(`${config.label}操作已提交`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || disabled}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2.5 text-xs font-black text-[var(--admin-fg)] hover:bg-[var(--admin-surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        {config.label}
      </button>

      {config.confirm ? (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认{config.label}</AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-line">
                {config.confirm(targetId)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>取消</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={loading}
                onClick={(event) => {
                  event.preventDefault();
                  void runAction();
                }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                确认
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
