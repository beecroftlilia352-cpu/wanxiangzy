"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, ArrowLeft, CheckCircle, Eye, EyeOff, Gift, KeyRound, Lock, Mail } from "lucide-react";
import { useTranslations } from "next-intl";

type AuthView = "login" | "signup" | "check-email" | "forgot-password" | "reset-sent";

const viewCopy: Record<AuthView, { titleKey: string; descKey: string }> = {
  login: {
    titleKey: "loginTitle",
    descKey: "loginDesc",
  },
  signup: {
    titleKey: "signupTitle",
    descKey: "signupDesc",
  },
  "check-email": {
    titleKey: "checkEmailTitle",
    descKey: "checkEmailDesc",
  },
  "forgot-password": {
    titleKey: "forgotPasswordTitle",
    descKey: "forgotPasswordDesc",
  },
  "reset-sent": {
    titleKey: "resetSentTitle",
    descKey: "resetSentDesc",
  },
};

const showcaseImages = [
  "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/references/reference-striped-top-white-skirt.png",
  "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/references/reference-grey-tank-denim-culottes.jpg",
  "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/models/model-natural-smile.jpg",
  "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/references/reference-soft-blue-cardigan.jpg",
];

function getSafeAuthRedirectTarget() {
  if (typeof window === "undefined") return "/create";
  const next = new URLSearchParams(window.location.search).get("next") || "";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/api/")) return "/create";
  return next;
}

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations("Login");

  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 邀请链接落地：/login?invite=CODE 预填邀请码并直接进入注册
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("invite") || "";
    const code = raw.trim().toUpperCase().replace(/[\s-]+/g, "").slice(0, 64);
    if (!code) return;
    setInviteCode(code);
    setView("signup");
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (mounted && data.user) window.location.replace(getSafeAuthRedirectTarget());
      })
      .catch(() => undefined);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session && window.location.pathname === "/login") {
        window.location.replace(getSafeAuthRedirectTarget());
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email, password }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = typeof payload.error === "string" ? payload.error : t("errors.default");
        if (message.includes("Invalid login credentials")) {
          setError(t("errors.invalidCredentials"));
        } else if (message.includes("Email not confirmed")) {
          setError(t("errors.emailNotConfirmed"));
          setView("check-email");
        } else {
          setError(message);
        }
        return;
      }

      window.location.href = getSafeAuthRedirectTarget();
    } catch {
      setError(t("errors.network"));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password.length < 6) {
      setError(t("errors.passwordMin"));
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          email,
          password,
          inviteCode,
          next: getSafeAuthRedirectTarget(),
        }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = typeof payload.error === "string" ? payload.error : t("errors.default");
        if (message.includes("已注册")) {
          setError(t("errors.emailExists"));
          setView("login");
        } else {
          setError(message);
        }
        return;
      }

      if (payload.session) {
        window.location.href = getSafeAuthRedirectTarget();
        return;
      }

      setView("check-email");
    } catch {
      setError(t("errors.network"));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) {
      setError(error.message);
    } else {
      setView("reset-sent");
    }
    setLoading(false);
  };

  const copy = viewCopy[view];

  return (
    <div className="min-h-[calc(100dvh-64px)] bg-[var(--codex-gradient-page)] px-4 py-8 text-codex-ink transition-colors sm:px-6 lg:px-8 dark:bg-stone-950 dark:text-stone-100">
      <div className="mx-auto grid min-h-[calc(100dvh-128px)] max-w-6xl items-start gap-8 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:pt-0">
        <section className="hidden lg:block" aria-hidden="true">
          <div className="studio-surface studio-surface-elevated relative overflow-hidden rounded-[34px] p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(91,124,255,0.18),transparent_34%),radial-gradient(circle_at_86%_8%,rgba(174,184,255,0.28),transparent_38%)]" />
            <div className="relative z-10">
              <Link href="/" className="studio-button studio-button-compact">
                <CheckCircle aria-hidden="true" className="h-4 w-4 text-[var(--codex-accent)]" />
                Pixel Diffusion
              </Link>
              <h1 className="mt-10 max-w-xl text-5xl font-black leading-[0.95] tracking-[-0.04em] text-codex-ink">
                {t("heroTitle")}
              </h1>
              <p className="mt-5 max-w-lg text-base leading-8 text-codex-muted">
                {t("heroDesc")}
              </p>

              <div className="mt-10 grid grid-cols-4 gap-3" aria-hidden="true">
                {showcaseImages.map((src, index) => (
                  <div
                    key={src}
                    className={`relative aspect-[3/4] overflow-hidden rounded-[24px] bg-[var(--codex-ice)] shadow-[0_18px_48px_rgba(14,18,38,0.14)] ${index % 2 === 1 ? "translate-y-8" : ""}`}
                  >
                    <Image src={src} alt="" fill sizes="180px" className="object-cover" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="studio-surface studio-surface-elevated mx-0 w-full max-w-[350px] rounded-[28px] p-6 sm:mx-auto sm:max-w-[440px] sm:p-8">
          <div className="mb-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-codex-dark shadow-lg shadow-slate-300/70">
              <CheckCircle aria-hidden="true" className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-2xl font-black tracking-[-0.02em] text-codex-ink">{t(copy.titleKey)}</h2>
            <p className="mt-2 text-sm leading-6 text-codex-muted">
              {view === "check-email" && email ? t("checkEmailSent") + " " + email : t(copy.descKey)}
            </p>
          </div>

          {view === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">{t("email")}</label>
                <div className="relative">
                  <Mail aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 rtl:left-auto rtl:right-3 dark:text-slate-500" />
                  <input
                    id="login-email"
                    autoFocus
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    inputMode="email"
                    spellCheck={false}
                    aria-invalid={error ? "true" : undefined}
                    aria-describedby={error ? "login-error" : undefined}
                    className="w-full rounded-2xl border border-[var(--codex-border)] bg-white px-4 py-3 pl-10 text-sm rtl:pl-4 rtl:pr-10 text-slate-900 outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-slate-400 focus-visible:border-[rgba(91,124,255,0.5)] focus-visible:ring-4 focus-visible:ring-[rgba(91,124,255,0.14)] dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus-visible:border-[rgba(91,124,255,0.6)] dark:focus-visible:ring-[rgba(91,124,255,0.18)]"
                    placeholder={t("emailPlaceholder")}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">{t("password")}</label>
                <div className="relative">
                  <Lock aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 rtl:left-auto rtl:right-3 dark:text-slate-500" />
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    aria-invalid={error ? "true" : undefined}
                    aria-describedby={error ? "login-error" : undefined}
                    className="w-full rounded-2xl border border-[var(--codex-border)] bg-white px-4 py-3 pl-10 pr-10 text-sm text-slate-900 outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-slate-400 focus-visible:border-[rgba(91,124,255,0.5)] focus-visible:ring-4 focus-visible:ring-[rgba(91,124,255,0.14)] dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus-visible:border-[rgba(91,124,255,0.6)] dark:focus-visible:ring-[rgba(91,124,255,0.18)]"
                    placeholder={t("passwordPlaceholderLogin")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 rtl:right-auto rtl:left-3 dark:text-slate-500 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.5)] focus-visible:rounded"
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  >
                    {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div id="login-error" role="alert" aria-live="polite" className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                  <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

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
                  onClick={() => {
                    setView("forgot-password");
                    setError("");
                  }}
                  className="font-bold text-[var(--codex-accent)] hover:underline"
                >
                  {t("forgotPassword")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setView("signup");
                    setError("");
                  }}
                  className="font-bold text-[var(--codex-accent)] hover:underline"
                >
                  {t("createAccount")}
                </button>
              </div>
            </form>
          )}

          {view === "signup" && (
            <form onSubmit={handleSignUp} className="space-y-4">
              {inviteCode ? (
                <div className="flex items-start gap-2.5 rounded-2xl border border-[rgba(91,124,255,0.28)] bg-[rgba(91,124,255,0.08)] px-4 py-3 text-sm leading-5 text-slate-700 dark:text-slate-200">
                  <Gift aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--codex-accent)]" />
                  <span>{t("inviteBanner")}</span>
                </div>
              ) : null}
              <div>
                <label htmlFor="signup-email" className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">{t("email")}</label>
                <div className="relative">
                  <Mail aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 rtl:left-auto rtl:right-3 dark:text-slate-500" />
                  <input
                    id="signup-email"
                    autoFocus
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    inputMode="email"
                    spellCheck={false}
                    className="w-full rounded-2xl border border-[var(--codex-border)] bg-white px-4 py-3 pl-10 text-sm rtl:pl-4 rtl:pr-10 text-slate-900 outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-slate-400 focus-visible:border-[rgba(91,124,255,0.5)] focus-visible:ring-4 focus-visible:ring-[rgba(91,124,255,0.14)] dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
                    placeholder={t("emailPlaceholder")}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="signup-invite" className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">{t("inviteCode")}</label>
                <div className="relative">
                  <KeyRound aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 rtl:left-auto rtl:right-3 dark:text-slate-500" />
                  <input
                    id="signup-invite"
                    name="inviteCode"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    required
                    autoComplete="one-time-code"
                    className="w-full rounded-2xl border border-[var(--codex-border)] bg-white px-4 py-3 pl-10 font-mono text-sm font-black uppercase tracking-[0.08em] text-slate-900 outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-slate-400 rtl:pl-4 rtl:pr-10 rtl:tracking-normal focus-visible:border-[rgba(91,124,255,0.5)] focus-visible:ring-4 focus-visible:ring-[rgba(91,124,255,0.14)] dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
                    placeholder={t("inviteCodePlaceholder")}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="signup-password" className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">{t("password")}</label>
                <div className="relative">
                  <Lock aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 rtl:left-auto rtl:right-3 dark:text-slate-500" />
                  <input
                    id="signup-password"
                    name="newPassword"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-[var(--codex-border)] bg-white px-4 py-3 pl-10 pr-10 text-sm text-slate-900 outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-slate-400 focus-visible:border-[rgba(91,124,255,0.5)] focus-visible:ring-4 focus-visible:ring-[rgba(91,124,255,0.14)] dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
                    placeholder={t("passwordPlaceholder")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 rtl:right-auto rtl:left-3 dark:text-slate-500 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.5)] focus-visible:rounded"
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  >
                    {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{t("passwordHint")}</p>
              </div>

              {error && (
                <div role="alert" aria-live="polite" className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                  <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="gradient-brand flex h-12 w-full items-center justify-center rounded-2xl text-sm font-black text-white shadow-xl shadow-slate-300/40 transition-opacity hover:opacity-95 disabled:opacity-50"
              >
                {loading ? t("creating") : t("createAccount")}
              </button>

              <p className="text-center text-sm text-slate-500">
                {t("haveAccount")}
                <button
                  type="button"
                  onClick={() => {
                    setView("login");
                    setError("");
                  }}
                  className="ml-1 font-bold text-[var(--codex-accent)] hover:underline"
                >
                  {t("goLogin")}
                </button>
              </p>
            </form>
          )}

          {view === "check-email" && (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[rgba(91,124,255,0.1)]">
                <Mail aria-hidden="true" className="h-10 w-10 text-[var(--codex-accent)]" />
              </div>

              <div className="space-y-2">
                <p className="text-sm leading-6 text-slate-600">
                  {t.rich("emailSentBody", {
                    email,
                    mail: (chunks) => <span className="font-bold text-slate-900">{chunks}</span>,
                  })}
                </p>
                <p className="text-sm leading-6 text-slate-500">
                  {t("emailSentHint")}
                </p>
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
                  onClick={() => setView("signup")}
                  className="h-11 flex-1 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  {t("changeEmail")}
                </button>
                <button
                  type="button"
                  onClick={() => setView("login")}
                  className="gradient-brand h-11 flex-1 rounded-2xl text-sm font-black text-white"
                >
                  {t("goLogin")}
                </button>
              </div>
            </div>
          )}

          {view === "forgot-password" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">{t("registeredEmail")}</label>
                <div className="relative">
                  <Mail aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 rtl:left-auto rtl:right-3 dark:text-slate-500" />
                  <input
                    id="forgot-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    inputMode="email"
                    spellCheck={false}
                    className="w-full rounded-2xl border border-[var(--codex-border)] bg-white px-4 py-3 pl-10 text-sm rtl:pl-4 rtl:pr-10 text-slate-900 outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-slate-400 focus-visible:border-[rgba(91,124,255,0.5)] focus-visible:ring-4 focus-visible:ring-[rgba(91,124,255,0.14)] dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
                    placeholder="you@example.com…"
                  />
                </div>
              </div>

              {error && (
                <div role="alert" aria-live="polite" className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                  <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="gradient-brand flex h-12 w-full items-center justify-center rounded-2xl text-sm font-black text-white shadow-xl shadow-slate-300/40 transition-opacity hover:opacity-95 disabled:opacity-50"
              >
                {loading ? t("sending") : t("sendResetLink")}
              </button>

              <button
                type="button"
                onClick={() => {
                  setView("login");
                  setError("");
                }}
                className="flex w-full items-center justify-center gap-1 text-sm font-bold text-slate-500 transition-colors hover:text-slate-800"
              >
                <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
                {t("backToLogin")}
              </button>
            </form>
          )}

          {view === "reset-sent" && (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle aria-hidden="true" className="h-10 w-10 text-emerald-500" />
              </div>

              <div className="space-y-2">
                <p className="text-sm leading-6 text-slate-600">
                  {t.rich("resetSentBody", {
                    email,
                    mail: (chunks) => <span className="font-bold text-slate-900">{chunks}</span>,
                  })}
                </p>
                <p className="text-sm leading-6 text-slate-500">
                  {t("resetSentHint")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setView("login")}
                className="gradient-brand h-12 w-full rounded-2xl text-sm font-black text-white transition-opacity hover:opacity-95"
              >
                {t("backToLogin")}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
