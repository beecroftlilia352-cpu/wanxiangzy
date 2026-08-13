"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { AdminStatusBadge } from "@/components/admin/AdminPrimitives";

type VideoProviderName = "minimax" | "seedance";

type SnapshotEntry = {
  key: "video";
  enabled: boolean;
  provider: VideoProviderName;
  baseUrl: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
  source: "admin" | "env";
};

type Snapshot = {
  configKey: string;
  versionId?: string;
  publishedAt?: string | null;
  models: SnapshotEntry[];
};

const PROVIDER_OPTIONS = [
  { value: "minimax", label: "MiniMax H3（768p / 2K）" },
  { value: "seedance", label: "豆包 Seedance 2.0（mini / fast / 标准）" },
] as const;

const PROVIDER_BASE_URLS: Record<VideoProviderName, string> = {
  minimax: "https://api.new.bi",
  seedance: "https://api.new.bi",
};

export function AdminVideoProviderConfigForm() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [apiKey, setApiKey] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/video-providers", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `加载失败 (${res.status})`);
      setSnapshot(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const entry = useMemo(() => snapshot?.models?.[0] ?? null, [snapshot]);

  function update(patch: Partial<SnapshotEntry>) {
    setSnapshot((current) => current ? {
      ...current,
      models: current.models.map((item) => item.key === "video" ? { ...item, ...patch } : item),
    } : current);
  }

  function updateProvider(provider: VideoProviderName) {
    update({ provider, baseUrl: PROVIDER_BASE_URLS[provider] });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot || !entry) return;
    setSaving(true);
    setMessage("");

    const payload = {
      video: {
        enabled: entry.enabled,
        provider: entry.provider,
        baseUrl: entry.baseUrl,
        apiKey: apiKey.trim() || "",
      },
    };

    try {
      const res = await fetch("/api/admin/video-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ models: payload }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || `保存失败 (${res.status})`);
      setMessage("已发布 video.providers，视频生成会立即使用新的供应商配置。");
      setApiKey("");
      await load();
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-4 text-sm font-bold text-[var(--admin-muted)]">正在加载视频供应商配置…</p>;
  if (error || !snapshot || !entry) return <p className="p-4 text-sm font-bold text-[var(--admin-danger)]">{error || "暂无配置"}</p>;

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 py-2 text-xs text-[var(--admin-muted)]">
        <span>配置键 <code className="font-black text-[var(--admin-fg)]">{snapshot.configKey}</code>；API Key 使用 AES-256-GCM 加密后落库，页面只显示脱敏值。</span>
        <AdminStatusBadge status={snapshot.versionId ? "published" : "draft"} />
      </div>

      <section className="space-y-3 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black text-[var(--admin-fg)]">视频生成模型</p>
            <p className="font-mono text-[11px] font-bold text-[var(--admin-muted)]">video</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-[var(--admin-fg)]">
            <input
              type="checkbox"
              checked={entry.enabled}
              onChange={(event) => update({ enabled: event.target.checked })}
              className="h-4 w-4"
            />
            启用
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] font-black text-[var(--admin-muted)]">供应商</span>
          <select
            value={entry.provider}
            onChange={(event) => updateProvider(event.target.value as VideoProviderName)}
            className="h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-xs font-bold text-[var(--admin-fg)]"
          >
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-black text-[var(--admin-muted)]">Base URL</span>
          <input
            value={entry.baseUrl}
            onChange={(event) => update({ baseUrl: event.target.value })}
            placeholder="https://api.new.bi"
            className="h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 font-mono text-xs font-semibold text-[var(--admin-fg)]"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-black text-[var(--admin-muted)]">API Key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={entry.apiKeyConfigured ? `${entry.apiKeyMasked}（留空则不修改）` : "输入新 Key"}
            className="h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 font-mono text-xs font-semibold text-[var(--admin-fg)]"
          />
          <span className="text-[11px] text-[var(--admin-muted)]">
            来源：{entry.source}；{entry.apiKeyConfigured ? `已配置 ${entry.apiKeyMasked}` : "未配置"}
          </span>
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--admin-fg)] px-4 text-sm font-black text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存并发布
        </button>
        {message && (
          <p className={`text-sm font-bold ${message.includes("已发布") ? "text-[var(--admin-success)]" : "text-[var(--admin-danger)]"}`}>
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
