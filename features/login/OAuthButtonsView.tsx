"use client";

import { useTranslations } from "next-intl";

type Props = {
  loading: boolean;
  /** 当前正在执行的 provider，null 表示空闲 */
  activeProvider: "google" | "wechat" | null;
  onGoogle: () => void;
  onWeChat: () => void;
};

/**
 * 第三方登录按钮组：Google（active）+ WeChat（即将上线）。
 *
 * 设计：分隔线 + 两个等宽按钮，垂直排列；移动端不会溢出。
 * - Google 走 Supabase OAuth（需要在 Supabase 控制台启用 + 配置 redirect URL）
 * - WeChat 占位 disabled，附带"即将上线"角标，避免用户误以为能用
 */
export function OAuthButtonsView({ loading, activeProvider, onGoogle, onWeChat }: Props) {
  const t = useTranslations("Login");
  const googleLoading = activeProvider === "google";
  const wechatLoading = activeProvider === "wechat";
  const disabled = loading && !googleLoading && !wechatLoading;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--codex-border)]/70" />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-codex-faint">
          {t("oauthDivider")}
        </span>
        <span className="h-px flex-1 bg-[var(--codex-border)]/70" />
      </div>

      <button
        type="button"
        onClick={onGoogle}
        disabled={disabled || googleLoading}
        className="group flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-[var(--codex-border)] bg-codex-surface px-4 text-sm font-black text-codex-ink shadow-sm transition-all hover:bg-[var(--codex-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--codex-accent-18)]"
        aria-label={t("oauthGoogle")}
      >
        <GoogleMark aria-hidden="true" />
        <span>{googleLoading ? t("oauthGoogleLoading") : t("oauthGoogle")}</span>
      </button>

      <button
        type="button"
        onClick={onWeChat}
        disabled
        title={t("oauthWechatComingSoon")}
        className="relative flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-[var(--codex-border)] bg-codex-surface px-4 text-sm font-black text-codex-faint shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-70"
        aria-label={`${t("oauthWechat")}（${t("oauthWechatComingSoon")}）`}
      >
        <WeChatMark aria-hidden="true" />
        <span>{t("oauthWechat")}</span>
        <span className="absolute right-3 inline-flex h-5 items-center rounded-full bg-[var(--codex-surface-soft)] px-2 text-[10px] font-bold tracking-wide text-codex-faint">
          {t("oauthWechatComingSoon")}
        </span>
      </button>
    </div>
  );
}

/** 简洁版 Google G 标志：避免外链 logo 资源 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.07 5.07 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.44.35-2.1V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.83z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.65l3.15-3.15C17.45 2.16 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

/** 简洁版微信图标 */
function WeChatMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#1AAD19"
        d="M8.69 4C4.99 4 2 6.4 2 9.4c0 1.74 1 3.27 2.55 4.27-.09.34-.32 1.04-.37 1.18-.06.18 0 .4.18.45.13.04.27 0 .39-.07.13-.08 1.07-.74 1.5-1.04.74.2 1.54.31 2.36.32a6 6 0 0 1-.18-1.45c0-2.99 3.04-5.42 6.78-5.42.16 0 .32 0 .48.02C14.83 5.46 12.05 4 8.69 4zM6.5 7.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm4.5 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"
      />
      <path
        fill="#1AAD19"
        d="M22 14.85c0-2.6-2.6-4.7-5.7-4.7-3.2 0-5.7 2.1-5.7 4.7s2.5 4.7 5.7 4.7c.7 0 1.4-.1 2-.3l1.3.9c.1.05.2.07.3.04.13-.04.18-.2.13-.34l-.3-1.07c1.5-.85 2.27-2.18 2.27-3.93zm-7.7-1.7a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7zm4 0a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7z"
      />
    </svg>
  );
}