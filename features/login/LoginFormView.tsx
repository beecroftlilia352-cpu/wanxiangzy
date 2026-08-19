"use client";

import { useTranslations } from "next-intl";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { AuthErrorBanner } from "@/features/login/AuthErrorBanner";

type Props = {
  email: string;
  password: string;
  showPassword: boolean;
  loading: boolean;
  error: string | null;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onToggleShowPassword: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onForgotPassword: () => void;
  onCreateAccount: () => void;
};

/**
 * 登录表单视图。受控组件，所有状态由父级持有。
 *
 * 国际化使用 next-intl Login 命名空间。
 */
export function LoginFormView({
  email,
  password,
  showPassword,
  loading,
  error,
  onChangeEmail,
  onChangePassword,
  onToggleShowPassword,
  onSubmit,
  onForgotPassword,
  onCreateAccount,
}: Props) {
  const t = useTranslations("Login");
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="login-email" className="mb-1.5 block text-sm font-bold text-codex-ink dark:text-codex-muted">
          {t("email")}
        </label>
        <div className="relative">
          <Mail aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-codex-faint rtl:left-auto rtl:right-3" />
          <input
            id="login-email"
            autoFocus
            name="email"
            type="email"
            value={email}
            onChange={(e) => onChangeEmail(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className="w-full rounded-2xl border border-[var(--codex-border)] bg-codex-surface px-4 py-3 pl-10 text-sm rtl:pl-4 rtl:pr-10 text-codex-ink outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-codex-faint focus-visible:border-[var(--codex-accent-48)] focus-visible:ring-4 focus-visible:ring-[var(--codex-accent-14)] dark:focus-visible:border-[var(--codex-accent-55)] dark:focus-visible:ring-[var(--codex-accent-18)]"
            placeholder={t("emailPlaceholder")}
          />
        </div>
      </div>

      <div>
        <label htmlFor="login-password" className="mb-1.5 block text-sm font-bold text-codex-ink dark:text-codex-muted">
          {t("password")}
        </label>
        <div className="relative">
          <Lock aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-codex-faint rtl:left-auto rtl:right-3" />
          <input
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => onChangePassword(e.target.value)}
            required
            autoComplete="current-password"
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className="w-full rounded-2xl border border-[var(--codex-border)] bg-codex-surface px-4 py-3 pl-10 pr-10 text-sm text-codex-ink outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-codex-faint focus-visible:border-[var(--codex-accent-48)] focus-visible:ring-4 focus-visible:ring-[var(--codex-accent-14)] dark:focus-visible:border-[var(--codex-accent-55)] dark:focus-visible:ring-[var(--codex-accent-18)]"
            placeholder={t("passwordPlaceholderLogin")}
          />
          <button
            type="button"
            onClick={onToggleShowPassword}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2.5 text-codex-faint transition-colors hover:text-codex-ink rtl:right-auto rtl:left-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent-48)]"
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
          >
            {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <AuthErrorBanner message={error} id="login-error" />

      <button
        type="submit"
        disabled={loading}
        className="gradient-brand flex h-12 w-full items-center justify-center rounded-2xl text-sm font-black text-white shadow-xl shadow-slate-300/40 transition-opacity hover:opacity-95 disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            {t("loggingIn")}
          </span>
        ) : (
          t("loginButton")
        )}
      </button>

      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onForgotPassword}
          className="font-bold text-[var(--codex-accent)] hover:underline"
        >
          {t("forgotPassword")}
        </button>
        <button
          type="button"
          onClick={onCreateAccount}
          className="font-bold text-[var(--codex-accent)] hover:underline"
        >
          {t("createAccount")}
        </button>
      </div>
    </form>
  );
}
