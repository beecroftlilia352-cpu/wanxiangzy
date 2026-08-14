"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type WorkerTarget = "generations";

type AdminWorkerRunFormProps = {
  defaultTarget?: WorkerTarget;
  defaultLimit?: number;
  defaultReason?: string;
  lockTarget?: boolean;
};

const WORKER_OPTIONS: Array<{ value: WorkerTarget; label: string }> = [
  { value: "generations", label: "生成任务" },
];

export function AdminWorkerRunForm({
  defaultTarget = "generations",
  defaultLimit,
  defaultReason = "",
  lockTarget = false,
}: AdminWorkerRunFormProps) {
  const router = useRouter();
  const [target, setTarget] = useState<WorkerTarget>(defaultTarget);
  const [limit, setLimit] = useState(defaultLimit || 2);
  const [reason, setReason] = useState(defaultReason);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const maxLimit = 10;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/workers/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, limit, reason }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `触发失败 (${res.status})`);
      setMessage(`已触发${targetLabel(target)}，处理结果已记录。`);
      if (!defaultReason) setReason("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "触发失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 p-4 lg:grid-cols-[220px_120px_minmax(320px,1fr)_auto]">
      <FormField label="处理类型" labelClassName="text-xs font-black text-[var(--admin-muted)]" className="space-y-1.5">
        {lockTarget ? (
          <div className="flex h-10 w-full items-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 text-sm font-bold text-[var(--admin-fg)]">
            {WORKER_OPTIONS.find((option) => option.value === target)?.label || target}
          </div>
        ) : (
          <NativeSelect
            value={target}
            onChange={(event) => {
              const nextTarget = event.target.value as WorkerTarget;
              setTarget(nextTarget);
              setLimit(2);
            }}
            className="h-10 border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-sm font-bold text-[var(--admin-fg)] focus-visible:border-[var(--admin-border-strong)] focus-visible:ring-0"
          >
            {WORKER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField label="批量" labelClassName="text-xs font-black text-[var(--admin-muted)]" className="space-y-1.5">
        <Input
          type="number"
          min={1}
          max={maxLimit}
          value={limit}
          onChange={(event) => setLimit(Number(event.target.value))}
          className="h-10 border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold focus-visible:border-[var(--admin-border-strong)] focus-visible:ring-0"
        />
      </FormField>
      <FormField label="触发原因" labelClassName="text-xs font-black text-[var(--admin-muted)]" className="space-y-1.5">
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="h-10 border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold focus-visible:border-[var(--admin-border-strong)] focus-visible:ring-0"
          placeholder="例如：处理积压队列 / 验证修复后的处理服务"
          required
          minLength={6}
        />
      </FormField>
      <div className="flex items-end">
        <Button type="submit" disabled={loading} className="h-10 w-full bg-[var(--admin-fg)] px-4 text-sm font-black text-white disabled:opacity-60 lg:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          触发
        </Button>
      </div>
      {message && (
        <p className={`text-sm font-bold lg:col-span-4 ${message.startsWith("已触发") ? "text-[var(--admin-success)]" : "text-[var(--admin-danger)]"}`}>
          {message}
        </p>
      )}
    </form>
  );
}

function targetLabel(target: WorkerTarget) {
  return WORKER_OPTIONS.find((option) => option.value === target)?.label || "处理任务";
}
