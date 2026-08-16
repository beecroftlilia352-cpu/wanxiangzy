"use client";

import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";

type Props = {
  email: string;
  onChangeEmail: () => void;
  onGoLogin: () => void;
};

/**
 * "已发送验证邮件 / 等待用户点击链接" 提示视图。
 *
 * 纯展示组件：邮箱用 rich-text 高亮，提供修改邮箱 / 返回登录两个出口。
 */
export function CheckEmailView({ email, onChangeEmail, onGoLogin }: Props) {
  const t = useTranslations("Login");
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--codex-accent-10)]">
        <Mail aria-hidden="true" className="h-10 w-10 text-[var(--codex-accent)]" />
      </div>

      <div className="space-y-2">
        <p className="text-sm leading-6 text-codex-muted">
          {t.rich("emailSentBody", {
            email,
            mail: (chunks) => <span className="font-bold text-codex-ink">{chunks}</span>,
          })}
        </p>
        <p className="text-sm leading-6 text-codex-faint">{t("emailSentHint")}</p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
        <p className="mb-2 text-sm font-black text-amber-800">{t("emailNotReceived")}</p>
        <ul className="space-y-1 text-sm text-amber-700">
          <li>{t("emailTipSpam")}</li>
          <li>{t("emailTipSpelling")}</li>
          <li>{t("emailTipWait")}</li>
        </ul>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onChangeEmail}
          className="h-11 flex-1 rounded-2xl border border-[var(--codex-border)] bg-codex-surface text-sm font-bold text-codex-ink transition-colors hover:bg-[var(--codex-surface-soft)]"
        >
          {t("changeEmail")}
        </button>
        <button
          type="button"
          onClick={onGoLogin}
          className="gradient-brand h-11 flex-1 rounded-2xl text-sm font-black text-white"
        >
          {t("goLogin")}
        </button>
      </div>
    </div>
  );
}