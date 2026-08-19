"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const REFRESH_INTERVAL_MS = 15_000;

/** Keep the operational panel current without polling hidden browser tabs. */
export function AdminWorkerAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <span
      title="Worker 面板每 15 秒自动刷新"
      aria-label="Worker 面板每 15 秒自动刷新"
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-muted)]"
    >
      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}
