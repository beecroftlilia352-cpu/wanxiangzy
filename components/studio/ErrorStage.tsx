"use client";

import { Info, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";

type ErrorStageProps = {
  error: string;
  onRetry: () => void;
  isGenerating: boolean;
  retryDisabled?: boolean;
  retryLabel?: string;
  notice?: string;
};

export function ErrorStage({
  error,
  onRetry,
  retryDisabled = false,
  retryLabel,
  notice,
}: ErrorStageProps) {
  const t = useTranslations("Shared");
  return (
    <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center animate-fade-in px-4">
      <div className="mx-auto w-full max-w-md text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 shadow-[0_14px_34px_rgba(239,68,68,0.16)]">
          <X className="h-8 w-8 text-red-500" />
        </div>
        <p className="mb-1 font-semibold text-red-600">{t("generationFailed")}</p>
        <p className="mx-auto mb-3 max-w-sm text-sm leading-6 text-codex-muted">{error}</p>
        {notice && (
          <p className="mx-auto mb-4 flex max-w-sm items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold leading-5 text-amber-700">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{notice}</span>
          </p>
        )}
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          className="mac-button inline-flex items-center justify-center gap-2 px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-55"
        >
          <RotateCcw className="h-4 w-4" />
          {retryLabel ?? t("retry")}
        </button>
      </div>
    </div>
  );
}
