import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  // 生产环境 10% 采样（避免高流量成本），开发环境关闭
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 0.3 : 0,
  replaysSessionSampleRate: 0,
  enabled: process.env.NODE_ENV === "production",
});
