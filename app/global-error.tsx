"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { initializeClientSentryFromPublicConfig } from "@/instrumentation-client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    let cancelled = false;
    void initializeClientSentryFromPublicConfig().then((enabled) => {
      if (!cancelled && enabled) Sentry.captureException(error);
    });
    return () => {
      cancelled = true;
    };
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "grid",
          placeItems: "center",
          background: "#0c0a09",
          color: "#fafaf9",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: 480, padding: 32, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 28 }}>页面暂时无法显示</h1>
          <p style={{ margin: "0 0 24px", color: "#a8a29e", lineHeight: 1.6 }}>
            系统已记录本次异常。请重试；如果问题持续存在，请稍后再访问。
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: 0,
              borderRadius: 10,
              padding: "10px 18px",
              background: "#fafaf9",
              color: "#1c1917",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            重新加载
          </button>
        </main>
      </body>
    </html>
  );
}
