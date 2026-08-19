"use client";

import { useTranslations } from "next-intl";
import { Eye, EyeOff, Gift, KeyRound, Lock, Mail } from "lucide-react";
import { AuthErrorBanner } from "@/features/login/AuthErrorBanner";

type Props = {
  email: string;
  password: string;
  inviteCode: string;
  showPassword: boolean;
  loading: boolean;
  error: string | null;
  showInviteBanner: boolean;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onChangeInviteCode: (value: string) => void;
  onToggleShowPassword: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onGoLogin: () => void;
};

/**
 * 注册表单视图。受控组件，所有状态由父级持有。
 *
 * 当 inviteCode 非空时显示 "invite banner"，提示用户这是受邀注册。
 * 邀请码输入框自动转大写，便于 OCR 识别后粘贴。
 */
export function SignUpFormView({
  email,
  password,
  inviteCode,
  showPassword,
  loading,
  error,
  showInviteBanner,
  onChangeEmail,
  onChangePassword,
  onChangeInviteCode,
  onToggleShowPassword,
  onSubmit,
  onGoLogin,
}: Props) {
  const t = useTranslations("Login");
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {showInviteBanner && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-[var(--codex-accent-28)] bg-[var(--codex-accent-08)] px-4 py-3 text-sm leading-5 text-codex-ink dark:text-codex-muted">
          <Gift aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--codex-accent)]" />
          <span>{t("inviteBanner")}</span>
        </div>
      )}
      <div>
        <label htmlFor="signup-email" className="mb-1.5 block text-sm font-bold text-codex-ink dark:text-codex-muted">
          {t("email")}
        </label>
        <div className="relative">
          <Mail aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-codex-faint rtl:left-auto rtl:right-3" />
          <input
            id="signup-email"
            autoFocus
            name="email"
            type="email"
            value={email}
            onChange={(e) => onChangeEmail(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            className="w-full rounded-2xl border border-[var(--codex-border)] bg-codex-surface px-4 py-3 pl-10 text-sm rtl:pl-4 rtl:pr-10 text-codex-ink outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-codex-faint focus-visible:border-[var(--codex-accent-48)] focus-visible:ring-4 focus-visible:ring-[var(--codex-accent-14)]"
            placeholder={t("emailPlaceholder")}
          />
        </div>
      </div>

      <div>
        <label htmlFor="signup-invite" className="mb-1.5 block text-sm font-bold text-codex-ink dark:text-codex-muted">
          {t("inviteCode")}
        </label>
        <div className="relative">
          <KeyRound aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-codex-faint rtl:left-auto rtl:right-3" />
          <input
            id="signup-invite"
            name="inviteCode"
            value={inviteCode}
            onChange={(e) => onChangeInviteCode(e.target.value.toUpperCase())}
            required
            autoComplete="one-time-code"
            className="w-full rounded-2xl border border-[var(--codex-border)] bg-codex-surface px-4 py-3 pl-10 font-mono text-sm font-black uppercase tracking-[0.08em] text-codex-ink outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-codex-faint rtl:pl-4 rtl:pr-10 rtl:tracking-normal focus-visible:border-[var(--codex-accent-48)] focus-visible:ring-4 focus-visible:ring-[var(--codex-accent-14)]"
            placeholder={t("inviteCodePlaceholder")}
          />
        </div>
      </div>

      <div>
        <label htmlFor="signup-password" className="mb-1.5 block text-sm font-bold text-codex-ink dark:text-codex-muted">
          {t("password")}
        </label>
        <div className="relative">
          <Lock aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-codex-faint rtl:left-auto rtl:right-3" />
          <input
            id="signup-password"
            name="newPassword"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => onChangePassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full rounded-2xl border border-[var(--codex-border)] bg-codex-surface px-4 py-3 pl-10 pr-10 text-sm text-codex-ink outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-codex-faint focus-visible:border-[var(--codex-accent-48)] focus-visible:ring-4 focus-visible:ring-[var(--codex-accent-14)]"
            placeholder={t("passwordPlaceholder")}
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
        <p className="mt-1 text-xs text-codex-faint">{t("passwordHint")}</p>
      </div>

      <AuthErrorBanner message={error} />

      <button
        type="submit"
        disabled={loading}
        className="gradient-brand flex h-12 w-full items-center justify-center rounded-2xl text-sm font-black text-white shadow-xl shadow-slate-300/40 transition-opacity hover:opacity-95 disabled:opacity-50"
      >
        {loading ? t("creating") : t("createAccount")}
      </button>

      <p className="text-center text-sm text-codex-muted">
        {t("haveAccount")}
        <button
          type="button"
          onClick={onGoLogin}
          className="ml-1 font-bold text-[var(--codex-accent)] hover:underline"
        >
          {t("goLogin")}
        </button>
      </p>
    </form>
  );
}
