export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    // Edge runtime 目前仅上报错误，不启用 tracing
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({ enabled: false });
  }
}
