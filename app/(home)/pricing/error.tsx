"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

export default function PricingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Pricing");
  return (
    <div className="min-h-[calc(100dvh-64px)] bg-[var(--codex-gradient-page)] px-4 py-6 text-codex-ink sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[52vh] max-w-xl flex-col items-center justify-center rounded-lg border border-red-100 bg-white/86 p-6 text-center shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-50 text-red-600">
          <AlertCircle className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-normal text-codex-ink">{t("error.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-codex-muted">
          {error.message || t("error.fallback")}
        </p>
        <button
          type="button"
          onClick={reset}
          className="studio-button studio-tone-primary mt-5 h-10 rounded-lg px-4"
        >
          <RefreshCw className="h-4 w-4" />
          {t("error.retry")}
        </button>
      </div>
    </div>
  );
}
