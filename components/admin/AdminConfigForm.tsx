"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilePlus2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const defaultJson = `{
  "enabled": true,
  "notes": "draft config"
}`;

export function AdminConfigForm({
  defaultConfigKey = "",
  defaultStatus = "draft",
  defaultValue = defaultJson,
}: {
  defaultConfigKey?: string;
  defaultStatus?: "draft" | "published";
  defaultValue?: string;
}) {
  const router = useRouter();
  const [configKey, setConfigKey] = useState(defaultConfigKey);
  const [status, setStatus] = useState<string>(defaultStatus);
  const [value, setValue] = useState(defaultValue);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new Error("配置内容必须是合法 JSON");
      }
      const res = await fetch("/api/admin/settings/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configKey, status, value: parsed }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `保存失败 (${res.status})`);
      setMessage("配置版本已创建，审计日志已记录。");
      setConfigKey(defaultConfigKey);
      setStatus(defaultStatus);
      setValue(defaultValue);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 p-4 lg:grid-cols-[minmax(240px,0.8fr)_160px_minmax(360px,1.4fr)_auto]">
      <FormField label="配置键" labelClassName="text-xs font-black text-[var(--admin-muted)]" className="space-y-1.5">
        <Input
          value={configKey}
          onChange={(event) => setConfigKey(event.target.value)}
          className="h-10 border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold focus-visible:border-[var(--admin-border-strong)] focus-visible:ring-0"
          placeholder="model.routing"
          required
        />
      </FormField>
      <FormField label="状态" labelClassName="text-xs font-black text-[var(--admin-muted)]" className="space-y-1.5">
        <NativeSelect
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-sm font-bold text-[var(--admin-fg)] focus-visible:border-[var(--admin-border-strong)] focus-visible:ring-0"
        >
          <option value="draft">draft</option>
          <option value="published">published</option>
        </NativeSelect>
      </FormField>
      <FormField label="JSON 内容" labelClassName="text-xs font-black text-[var(--admin-muted)]" className="space-y-1.5">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="min-h-28 border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 font-mono text-xs leading-5 focus-visible:border-[var(--admin-border-strong)] focus-visible:ring-0"
          required
        />
      </FormField>
      <div className="flex items-end">
        <Button type="submit" disabled={loading} className="h-10 w-full bg-[var(--admin-fg)] px-4 text-sm font-black text-white disabled:opacity-60 lg:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
          创建
        </Button>
      </div>
      {message && (
        <p className={`lg:col-span-4 text-sm font-bold ${message.includes("已创建") ? "text-[var(--admin-success)]" : "text-[var(--admin-danger)]"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
