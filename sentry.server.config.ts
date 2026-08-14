import * as Sentry from "@sentry/nextjs";

// 服务端 Sentry：DSN 优先从后台发布的 site.monitoring 配置读取，
// 环境变量作为兜底；两者都空则保持禁用。
async function resolveDsn(): Promise<string | undefined> {
  const envDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (envDsn) return envDsn;
  try {
    const { getSiteMonitoringConfig } = await import("@/lib/site-config");
    const config = await getSiteMonitoringConfig();
    return config?.sentryDsn || undefined;
  } catch {
    return undefined;
  }
}

void (async () => {
  const dsn = await resolveDsn();
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    enabled: process.env.NODE_ENV === "production" && Boolean(dsn),
  });
})();
