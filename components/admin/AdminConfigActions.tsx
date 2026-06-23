"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function AdminConfigActions({
  id,
  status,
  endpointBase = "/api/admin/settings/configs",
}: {
  id: string;
  status: string;
  endpointBase?: string;
}) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"publish" | "archive" | null>(null);
  const [reason, setReason] = useState("");
  const canPublish = status !== "published";
  const canArchive = status !== "archived";

  function openAction(action: "publish" | "archive") {
    setReason("");
    setPendingAction(action);
  }

  async function run() {
    const action = pendingAction;
    const normalizedReason = reason.trim();
    if (!action) return;
    if (normalizedReason.length < 6) {
      toast.error("请输入至少 6 个字的操作原因");
      return;
    }

    setLoadingAction(action);
    try {
      const res = await fetch(`${endpointBase}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: normalizedReason }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `操作失败 (${res.status})`);
      toast.success(action === "publish" ? "配置已发布" : "配置已归档");
      setPendingAction(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        {canPublish && (
          <button
            type="button"
            onClick={() => openAction("publish")}
            disabled={Boolean(loadingAction)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-xs font-black text-[var(--admin-fg)] hover:bg-[var(--admin-surface-soft)] disabled:opacity-60"
          >
            {loadingAction === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
            发布
          </button>
        )}
        {canArchive && (
          <button
            type="button"
            onClick={() => openAction("archive")}
            disabled={Boolean(loadingAction)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-xs font-black text-[var(--admin-fg)] hover:bg-[var(--admin-surface-soft)] disabled:opacity-60"
          >
            {loadingAction === "archive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
            归档
          </button>
        )}
      </div>

      <Dialog open={Boolean(pendingAction)} onOpenChange={(open) => !open && setPendingAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction === "publish" ? "发布配置" : "归档配置"}</DialogTitle>
            <DialogDescription>
              请输入本次操作原因，方便后续审计和回滚追踪。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={pendingAction === "publish" ? "例如：完成模型路由校验，发布到生产配置" : "例如：旧配置已被新版本替代"}
            rows={4}
            maxLength={240}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingAction(null)} disabled={Boolean(loadingAction)}>
              取消
            </Button>
            <Button type="button" onClick={() => void run()} disabled={Boolean(loadingAction)}>
              {loadingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
