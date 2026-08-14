import * as Sentry from "@sentry/nextjs";

// 客户端 Sentry 惰性初始化：模块加载时不依赖环境变量，
// 由 SentryBootstrap 组件挂载后从 /api/monitoring/public-config 读取
// 后台发布的 DSN 再完成 init。
let initialized = false;

export function initClientSentry(dsn?: string) {
  if (initialized) return;
  initialized = true;
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 0.3 : 0,
    replaysSessionSampleRate: 0,
    enabled: process.env.NODE_ENV === "production" && Boolean(dsn),
  });
}
