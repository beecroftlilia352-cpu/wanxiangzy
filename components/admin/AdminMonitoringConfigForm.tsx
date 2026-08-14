"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { AdminStatusBadge } from "@/components/admin/AdminPrimitives";

type MonitoringConfig = {
  sentryDsn?: string;
  seoTitle?: string;
  seoDescription?: string;
  updatedAt?: string;
};

/**
 * 监控与 SEO 配置：Sentry DSN 与站点 SEO 文案统一在后台管理，
 * 发布后服务端运行时读取，无需改环境变量或代码。
 */
export function AdminMonitoringConfigForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sentryDsn, setSentryDsn] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/monitoring-config", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.config) {
        setSentryDsn(payload.config.sentryDsn || "");
        setSeoTitle(payload.config.seoTitle || "");
        setSeoDescription(payload.config.seoDescription || "");
        setPublishedAt(payload.publishedAt || null);
      }
    } catch {
      // 首次未配置属正常
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/monitoring-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentryDsn, seoTitle, seoDescription, reason }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "保存失败");
      toast.success("已发布：新配置将随下次部署或缓存刷新生效");
      setReason("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 py-2 text-xs text-[var(--admin-muted)]">
        <span>
          发布后写入配置版本表并记录审计日志{publishedAt ? ` · 上次发布 ${new Date(publishedAt).toLocaleString("zh-CN")}` : " · 尚未配置（Sentry 未启用）"}
        </span>
        <AdminStatusBadge status={publishedAt ? "published" : "draft"} />
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">Sentry DSN（错误监控）</span>
        <input
          type="text"
          value={sentryDsn}
          onChange={(event) => setSentryDsn(event.target.value)}
          placeholder="https://xxx@o12345.ingest.sentry.io/6789012（留空则不启用）"
          className="h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 font-mono text-xs text-[var(--admin-fg)] outline-none focus:border-[var(--admin-accent)]"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">SEO 标题（分享卡片标题）</span>
        <input
          type="text"
          value={seoTitle}
          onChange={(event) => setSeoTitle(event.target.value)}
          placeholder="Pixel Diffusion - AI 服装视觉生产工作台"
          className="h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs text-[var(--admin-fg)] outline-none focus:border-[var(--admin-accent)]"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">SEO 描述（分享卡片摘要）</span>
        <textarea
          value={seoDescription}
          onChange={(event) => setSeoDescription(event.target.value)}
          placeholder="面向服装品牌、电商团队和内容创作者的 AI 服装视觉生产工作台…"
          rows={3}
          className="w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-xs text-[var(--admin-fg)] outline-none focus:border-[var(--admin-accent)]"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-black text-[var(--admin-muted)]">变更原因（写入审计日志）</span>
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="例如：接入 Sentry 生产监控"
          className="h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs text-[var(--admin-fg)] outline-none focus:border-[var(--admin-accent)]"
        />
      </label>

      <button
        type="submit"
        disabled={saving || loading}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--admin-fg)] px-4 text-sm font-black text-white disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        保存并发布
      </button>
    </form>
  );
}
