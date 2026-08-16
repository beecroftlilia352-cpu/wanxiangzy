"use client";

import type { ComponentType, ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * 分辨率档位（1K/2K/4K）的视觉选择器。
 *
 * 设计语言沿用 AspectRatioSelector：紫色 marker 标题 + 卡片化分段控件，
 * 2K 默认显示「推荐」角标，4K 默认显示企业版角标；业务方仍可通过 props 覆盖。
 */
export type ResolutionOption<T extends string = string> = {
  value: T;
  /** Raw label text. Use `labelKey` for i18n. */
  label?: string;
  /** next-intl key path; takes precedence over `label` when provided. */
  labelKey?: string;
  /**
   * Optional supporting text. For 1K / 2K / 4K, the visible descriptor is
   * normalized to the localized 标清 / 高清 / 超清 label and this value stays
   * available in the accessible name (for example, to preserve credit cost).
   */
  description?: string;
  descriptionKey?: string;
  disabled?: boolean;
};

export type ResolutionSelectorProps<T extends string = string> = {
  options: readonly ResolutionOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Title rendered above the row with the purple marker accent. */
  title?: ReactNode;
  /** Accessible label for the radio group; falls back to the title text. */
  ariaLabel?: string;
  /**
   * Per-value badge override. 2K defaults to `recommended` and 4K to `enterprise`.
   */
  badges?: Partial<Record<T, "recommended" | "member" | "enterprise">>;
  /** Optional icon rendered before the title text (e.g. lucide Monitor). */
  icon?: ComponentType<{ className?: string }>;
  className?: string;
};

function resolveBadgeLabel(
  t: ReturnType<typeof useTranslations>,
  locale: string,
  tier: "recommended" | "member" | "enterprise" | undefined
): string | null {
  if (!tier) return null;
  if (!locale.toLowerCase().startsWith("zh")) {
    if (tier === "recommended") return "REC";
    if (tier === "member") return "VIP";
    return "PRO";
  }
  if (tier === "recommended") return t("Shared.modelBadge.recommended");
  if (tier === "member") return t("Shared.tierBadge.member");
  return t("Shared.tierBadge.enterprise");
}

function resolveClarityLabel(
  t: ReturnType<typeof useTranslations>,
  value: string,
): string | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === "1K") return t("Shared.resolutionStandard");
  if (normalized === "2K") return t("Shared.resolutionHD");
  if (normalized === "4K") return t("Shared.resolutionUltra");
  return null;
}

function isImageClarityTier(value: string): boolean {
  return ["1K", "2K", "4K"].includes(value.trim().toUpperCase());
}

export function ResolutionSelector<T extends string = string>({
  options,
  value,
  onChange,
  title,
  ariaLabel,
  badges,
  icon: Icon,
  className,
}: ResolutionSelectorProps<T>) {
  const t = useTranslations();
  const locale = useLocale();
  const isChineseLocale = locale.toLowerCase().startsWith("zh");
  const usesImageClarityTiers = options.some((option) => isImageClarityTier(String(option.value)));
  const resolvedTitle = usesImageClarityTiers ? t("Shared.resolutionClarity") : title;
  const fallbackAria = typeof title === "string" ? title : undefined;
  // Guard against empty / missing i18n keys — an empty aria-label removes the
  // radiogroup's accessible name, which breaks screen reader navigation.
  const resolvedAriaLabel =
    ariaLabel && ariaLabel !== ""
      ? ariaLabel
      : fallbackAria && fallbackAria !== ""
        ? fallbackAria
        : undefined;

  return (
    <section className={cn("studio-resolution-selector", className)}>
      {resolvedTitle != null && resolvedTitle !== "" && (
        <h3 className="studio-resolution-selector-title">
          <span aria-hidden="true" className="studio-resolution-selector-title-mark" />
          {Icon ? <Icon className="h-4 w-4 text-[var(--codex-accent)]" /> : null}
          <span className="studio-resolution-selector-title-text">{resolvedTitle}</span>
        </h3>
      )}
      <div
        className="studio-resolution-selector-row"
        role="radiogroup"
        aria-label={resolvedAriaLabel}
      >
        {options.map((option) => {
          const selected = value === option.value;
          const labelText = option.labelKey
            ? t(option.labelKey)
            : option.label ?? String(option.value);
          const descriptionText = option.descriptionKey
            ? t(option.descriptionKey)
            : option.description;
          const clarityText = resolveClarityLabel(t, String(option.value));
          const normalizedValue = String(option.value).trim().toUpperCase();
          const defaultBadgeTier = normalizedValue === "2K"
            ? "recommended"
            : normalizedValue === "4K"
              ? "enterprise"
              : undefined;
          const badgeTier = badges?.[option.value] ?? defaultBadgeTier;
          const badgeText = resolveBadgeLabel(t, locale, badgeTier);
          const accessibilityLabel = [labelText, clarityText, descriptionText]
            .filter((part) => part && part.trim() !== "")
            .join(" · ");
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={accessibilityLabel || undefined}
              disabled={option.disabled}
              onClick={() => onChange(option.value as T)}
              title={typeof labelText === "string" ? labelText : undefined}
              data-tier={badgeTier ?? undefined}
              className={cn(
                "studio-resolution-selector-card",
                selected && "studio-resolution-selector-card-selected"
              )}
            >
              {badgeText ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "studio-resolution-selector-badge",
                    badgeTier === "enterprise"
                      ? "studio-resolution-selector-badge-enterprise"
                      : badgeTier === "recommended"
                        ? "studio-resolution-selector-badge-recommended"
                        : "studio-resolution-selector-badge-member"
                  )}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true" className="studio-resolution-selector-badge-spark">
                    <path
                      d="M6 1 L7.2 4.6 L11 6 L7.2 7.4 L6 11 L4.8 7.4 L1 6 L4.8 4.6 Z"
                      fill="currentColor"
                    />
                  </svg>
                  {badgeText}
                </span>
              ) : null}
              <span className="studio-resolution-selector-label">
                <span>{labelText}</span>
                {clarityText ? (
                  <span className="studio-resolution-selector-clarity">
                    {isChineseLocale ? null : "\u00a0"}
                    {clarityText}
                  </span>
                ) : null}
              </span>
              {!clarityText && descriptionText ? (
                <span className="studio-resolution-selector-description">{descriptionText}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
