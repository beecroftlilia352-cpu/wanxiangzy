"use client";

import { useEffect } from "react";

/**
 * 客户端 Sentry 惰性引导：从后台发布的配置读取 DSN 后初始化。
 * 无 DSN 时保持静默，不影响任何功能。
 */
export function SentryBootstrap() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/monitoring/public-config", { cache: "no-store" });
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;
        const dsn = typeof payload.sentryDsn === "string" ? payload.sentryDsn : "";
        if (!dsn) return;
        const { initClientSentry } = await import("@/sentry.client.config");
        initClientSentry(dsn);
      } catch {
        // 配置获取失败静默
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
