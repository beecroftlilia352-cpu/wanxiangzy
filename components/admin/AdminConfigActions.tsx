"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, Loader2, Rocket } from "lucide-react";

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
  const canPublish = status !== "published";
  const canArchive = status !== "archived";

  async function run(action: "publish" | "archive") {
    const reason = window.prompt(action === "publish" ? "请输入发布原因" : "请输入归档原因");
    if (!reason || reason.trim().length < 6) return;

    setLoadingAction(action);
    try {
      const res = await fetch(`${endpointBase}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `操作失败 (${res.status})`);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "操作失败");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {canPublish && (
        <button
          type="button"
          onClick={() => run("publish")}
          disabled={Boolean(loadingAction)}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {loadingAction === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
          发布
        </button>
      )}
      {canArchive && (
        <button
          type="button"
          onClick={() => run("archive")}
          disabled={Boolean(loadingAction)}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {loadingAction === "archive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
          归档
        </button>
      )}
    </div>
  );
}
