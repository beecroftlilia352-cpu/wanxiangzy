"use client";

import { useTranslations } from "next-intl";
import { ArrowLeft, Mail } from "lucide-react";
import { AuthErrorBanner } from "@/features/login/AuthErrorBanner";

type Props = {
  email: string;
  loading: boolean;
  error: string | null;
  onChangeEmail: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onBackToLogin: () => void;
};

/**
 * "忘记密码" 表单视图。受控组件。
 *
 * 提交调用 Supabase resetPasswordForEmail，成功后跳转 reset-sent 视图。
 */
export function ForgotPasswordView({
  email,
  loading,
  error,
  onChangeEmail,
  onSubmit,
  onBackToLogin,
}: Props) {
  const t = useTranslations("Login");
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-bold text-codex-ink dark:text-codex-muted">
          {t("registeredEmail")}
        </label>
        <div className="relative">
          <Mail aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-codex-faint rtl:left-auto rtl:right-3" />
          <input
            id="forgot-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => onChangeEmail(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            className="w-full rounded-2xl border border-[var(--codex-border)] bg-codex-surface px-4 py-3 pl-10 text-sm rtl:pl-4 rtl:pr-10 text-codex-ink outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-codex-faint focus-visible:border-[var(--codex-accent-48)] focus-visible:ring-4 focus-visible:ring-[var(--codex-accent-14)]"
            placeholder="you@example.com…"
          />
        </div>
      </div>

      <AuthErrorBanner message={error} />

      <button
        type="submit"
        disabled={loading}
        className="gradient-brand flex h-12 w-full items-center justify-center rounded-2xl text-sm font-black text-white shadow-xl shadow-slate-300/40 transition-opacity hover:opacity-95 disabled:opacity-50"
      >
        {loading ? t("sending") : t("sendResetLink")}
      </button>

      <button
        type="button"
        onClick={onBackToLogin}
        className="flex w-full items-center justify-center gap-1 text-sm font-bold text-codex-muted transition-colors hover:text-codex-ink"
      >
        <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
        {t("backToLogin")}
      </button>
    </form>
  );
}
