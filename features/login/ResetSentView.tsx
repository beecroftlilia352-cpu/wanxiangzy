"use client";

import { useTranslations } from "next-intl";
import { CheckCircle } from "lucide-react";

type Props = {
  email: string;
  onBackToLogin: () => void;
};

/**
 * "重置链接已发送" 提示视图。纯展示组件。
 */
export function ResetSentView({ email, onBackToLogin }: Props) {
  const t = useTranslations("Login");
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
        <CheckCircle aria-hidden="true" className="h-10 w-10 text-emerald-500" />
      </div>

      <div className="space-y-2">
        <p className="text-sm leading-6 text-codex-muted">
          {t.rich("resetSentBody", {
            email,
            mail: (chunks) => <span className="font-bold text-codex-ink">{chunks}</span>,
          })}
        </p>
        <p className="text-sm leading-6 text-codex-faint">{t("resetSentHint")}</p>
      </div>

      <button
        type="button"
        onClick={onBackToLogin}
        className="gradient-brand h-12 w-full rounded-2xl text-sm font-black text-white transition-opacity hover:opacity-95"
      >
        {t("backToLogin")}
      </button>
    </div>
  );
}