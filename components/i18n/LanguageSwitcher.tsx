"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/lib/i18n/navigation";
import { Check, ChevronDown, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** 原生语言名展示（注意：对母语用户展示本族文字，不做翻译） */
const LOCALE_OPTIONS = [
  { value: "zh", label: "简体中文" },
  { value: "en", label: "English" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
  { value: "ru", label: "Русский" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "bg", label: "Български" },
  { value: "it", label: "Italiano" },
  { value: "ar", label: "العربية" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "hi", label: "हिन्दी" },
  { value: "th", label: "ไทย" },
  { value: "tr", label: "Türkçe" },
] as const;

/**
 * 语言切换器：
 * - 写入 NEXT_LOCALE cookie 后 router.refresh()，服务端与客户端一致
 * - 12 语言原生名展示，当前语言高亮 + 勾选
 */
export function LanguageSwitcher({ variant = "header" }: { variant?: "header" | "menu" }) {
  const locale = useLocale();
  const t = useTranslations("Header");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const current = LOCALE_OPTIONS.find((option) => option.value === locale) ?? LOCALE_OPTIONS[1];

  function switchLocale(nextLocale: string) {
    if (nextLocale === locale || isPending) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/locale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: nextLocale }),
        });
        if (!res.ok) throw new Error(`locale switch failed (${res.status})`);
        router.refresh();
        setOpen(false);
      } catch {
        toast.error(t("languageSwitchFailed"));
      }
    });
  }

  if (variant === "menu") {
    // 移动端菜单：紧凑网格，全部语言平铺可见
    return (
      <div className="grid grid-cols-2 gap-1 px-1 py-1.5">
        {LOCALE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => switchLocale(option.value)}
            className={cn(
              "flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] transition",
              option.value === locale
                ? "bg-[rgba(91,124,255,0.1)] font-bold text-[var(--codex-accent)]"
                : "font-medium text-codex-muted hover:bg-[var(--codex-surface-soft)] hover:text-codex-ink",
            )}
            aria-current={option.value === locale ? "true" : undefined}
          >
            <span className="truncate">{option.label}</span>
            {option.value === locale ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--codex-border)] bg-[var(--codex-surface)] px-3 text-xs font-bold text-[var(--codex-muted)] transition hover:text-[var(--codex-ink)]"
        aria-label={t("language")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Languages className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden max-w-[88px] truncate sm:inline">{current.label}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close language menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-11 z-50 max-h-[70vh] w-48 overflow-y-auto rounded-xl border border-[var(--codex-border)] bg-[var(--codex-surface-strong)] p-1.5 shadow-xl rtl:right-auto rtl:left-0"
          >
            {LOCALE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={option.value === locale}
                onClick={() => switchLocale(option.value)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
                  option.value === locale
                    ? "bg-[rgba(91,124,255,0.1)] font-black text-[var(--codex-accent)]"
                    : "font-semibold text-[var(--codex-muted)] hover:bg-[var(--codex-surface-soft)] hover:text-[var(--codex-ink)]",
                )}
              >
                <span className="truncate">{option.label}</span>
                {option.value === locale ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
