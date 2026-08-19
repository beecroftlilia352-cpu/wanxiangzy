import * as Sentry from "@sentry/nextjs";

let initialized = false;
let publicConfigPromise: Promise<boolean> | null = null;

export function initClientSentry(dsn?: string): boolean {
  if (initialized) return true;
  if (!dsn || process.env.NODE_ENV !== "production") return false;

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 0.3,
    replaysSessionSampleRate: 0,
    enabled: true,
  });
  initialized = true;
  return true;
}

export function initializeClientSentryFromPublicConfig(): Promise<boolean> {
  if (initialized) return Promise.resolve(true);
  if (process.env.NODE_ENV !== "production") return Promise.resolve(false);
  if (publicConfigPromise) return publicConfigPromise;

  publicConfigPromise = (async () => {
    try {
      const response = await fetch("/api/monitoring/public-config", { cache: "no-store" });
      if (!response.ok) return false;
      const payload: unknown = await response.json().catch(() => null);
      const dsn =
        payload &&
        typeof payload === "object" &&
        "sentryDsn" in payload &&
        typeof payload.sentryDsn === "string"
          ? payload.sentryDsn
          : undefined;
      return initClientSentry(dsn);
    } catch {
      return false;
    }
  })().finally(() => {
    if (!initialized) publicConfigPromise = null;
  });

  return publicConfigPromise;
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
