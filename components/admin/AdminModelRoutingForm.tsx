"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { AdminProviderCatalog } from "@/lib/admin/data";

type Routing = AdminProviderCatalog["routing"];

const GPT_PROVIDER_OPTIONS = [
  { value: "catrouter", label: "CatRouter", description: "默认 GPT-Image-2 通道，OpenAI images/edits 格式。" },
  { value: "plato", label: "Plato / Yunwu OpenAI", description: "原 GPT-Image-2 备用通道。" },
] as const;

const BANANA_PROVIDER_OPTIONS = [
  { value: "yunwu", label: "Yunwu", description: "当前 Banana 默认通道，Gemini native generateContent。" },
  { value: "catrouter", label: "CatRouter", description: "CatRouter Gemini native generateContent 备用通道。" },
  { value: "laozhang", label: "LaoZhang", description: "老张 Gemini native generateContent 备用通道。" },
] as const;

export function AdminModelRoutingForm({ routing }: { routing: Routing }) {
  const router = useRouter();
  const [gptImageProvider, setGptImageProvider] = useState(routing.gptImageProvider);
  const [nanoBananaProvider, setNanoBananaProvider] = useState(routing.nanoBananaProvider);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const payloadPreview = useMemo(() => ({
    gptImageProvider,
    nanoBananaProvider,
    models: {
      "gpt-image-2": { enabled: true, provider: gptImageProvider },
      "nano-banana-2": { enabled: true, provider: nanoBananaProvider },
      "nano-banana-pro": { enabled: true, provider: nanoBananaProvider },
    },
    degrade: {
      disable4k: false,
      fallbackModel: "nano-banana-2",
    },
  }), [gptImageProvider, nanoBananaProvider]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/settings/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configKey: "model.routing",
          status: "published",
          value: {
            ...payloadPreview,
            updatedFrom: "admin.providers.quick-switch",
            updatedAt: new Date().toISOString(),
          },
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `保存失败 (${res.status})`);
      setMessage("已发布 model.routing，新任务会使用新的模型通道。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 p-4 xl:grid-cols-[minmax(220px,0.7fr)_minmax(260px,0.8fr)_minmax(320px,1fr)_auto]">
      <label className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">GPT-Image-2 通道</span>
        <select
          value={gptImageProvider}
          onChange={(event) => setGptImageProvider(event.target.value as Routing["gptImageProvider"])}
          className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-sm font-bold text-[var(--admin-fg)]"
        >
          {GPT_PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <p className="text-xs leading-5 text-[var(--admin-muted)]">
          {GPT_PROVIDER_OPTIONS.find((option) => option.value === gptImageProvider)?.description}
        </p>
      </label>

      <label className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">Banana 通道</span>
        <select
          value={nanoBananaProvider}
          onChange={(event) => setNanoBananaProvider(event.target.value as Routing["nanoBananaProvider"])}
          className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-sm font-bold text-[var(--admin-fg)]"
        >
          {BANANA_PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <p className="text-xs leading-5 text-[var(--admin-muted)]">
          {BANANA_PROVIDER_OPTIONS.find((option) => option.value === nanoBananaProvider)?.description}
        </p>
      </label>

      <div className="space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">当前来源</span>
        <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 py-2 text-xs leading-5 text-[var(--admin-fg)]">
          <p><span className="font-black text-[var(--admin-fg)]">source:</span> {routing.source}</p>
          <p><span className="font-black text-[var(--admin-fg)]">key:</span> {routing.configKey}</p>
          {routing.versionId && <p className="truncate"><span className="font-black text-[var(--admin-fg)]">version:</span> {routing.versionId}</p>}
          {routing.publishedAt && <p><span className="font-black text-[var(--admin-fg)]">published:</span> {routing.publishedAt}</p>}
        </div>
      </div>

      <div className="flex items-start xl:items-end">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--admin-fg)] px-4 text-sm font-black text-white disabled:opacity-60 xl:w-auto"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存并发布
        </button>
      </div>

      <details className="xl:col-span-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2">
        <summary className="cursor-pointer text-xs font-black text-[var(--admin-muted)]">查看即将发布的 JSON</summary>
        <pre className="mt-2 overflow-auto rounded-md bg-[var(--admin-fg)] p-3 text-xs leading-5 text-slate-100">
          {JSON.stringify(payloadPreview, null, 2)}
        </pre>
      </details>

      {message && (
        <p className={`xl:col-span-4 text-sm font-bold ${message.includes("已发布") ? "text-[var(--admin-success)]" : "text-[var(--admin-danger)]"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
