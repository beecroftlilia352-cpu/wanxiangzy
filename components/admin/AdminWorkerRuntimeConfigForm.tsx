"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { WorkerRuntimeConfig } from "@/lib/queue/worker-runtime-config";

export function AdminWorkerRuntimeConfigForm({ initialConfig }: { initialConfig: WorkerRuntimeConfig }) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function update(field: keyof WorkerRuntimeConfig, value: string) {
    setConfig((current) => ({ ...current, [field]: Number(value) }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/workers/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, reason }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `保存失败 (${response.status})`);
      setConfig(payload.config || config);
      setReason("");
      setMessage("已发布期望配置；下次部署时由发布控制器应用。 ");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <NumberField label="Worker 实例" value={config.desiredInstances} min={1} max={32} onChange={(value) => update("desiredInstances", value)} hint="PM2 进程数" />
        <NumberField label="单进程并发" value={config.workerConcurrency} min={1} max={512} onChange={(value) => update("workerConcurrency", value)} hint="远端 API I/O 上限" />
        <NumberField label="Outbox 并发" value={config.relayConcurrency} min={1} max={128} onChange={(value) => update("relayConcurrency", value)} hint="发布事务消息" />
        <NumberField label="积压告警" value={config.alertWaiting} min={1} max={1_000_000} onChange={(value) => update("alertWaiting", value)} hint="waiting 数量" />
        <NumberField label="最老任务告警" value={config.alertOldestPendingSeconds} min={30} max={86_400} onChange={(value) => update("alertOldestPendingSeconds", value)} hint="秒" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <FormField label="变更原因" labelClassName="text-xs font-black text-[var(--admin-muted)]" className="min-w-0 flex-1 space-y-1.5">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} minLength={6} required placeholder="例如：扩容到 1000 用户基线" className="h-10 border-[var(--admin-border)] bg-[var(--admin-surface)] text-sm" />
        </FormField>
        <Button type="submit" disabled={saving} className="h-10 bg-[var(--admin-fg)] px-4 text-sm font-black text-white">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存期望配置
        </Button>
      </div>
      {message && <p className={`flex items-center gap-1.5 text-sm font-bold ${message.startsWith("已发布") ? "text-[var(--admin-success)]" : "text-[var(--admin-danger)]"}`}>{message.startsWith("已发布") && <Check className="h-4 w-4" />}{message}</p>}
    </form>
  );
}

function NumberField({ label, value, min, max, hint, onChange }: { label: string; value: number; min: number; max: number; hint: string; onChange: (value: string) => void }) {
  return (
    <FormField label={label} labelClassName="text-xs font-black text-[var(--admin-muted)]" className="space-y-1.5">
      <Input type="number" value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)} className="h-10 border-[var(--admin-border)] bg-[var(--admin-surface)] text-sm font-black" />
      <p className="text-[11px] text-[var(--admin-faint)]">{hint} · {min}-{max}</p>
    </FormField>
  );
}
