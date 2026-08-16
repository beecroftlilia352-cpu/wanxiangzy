"use client";

import type { ComponentType, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * 分辨率档位（1K/2K/4K）的视觉选择器。
 *
 * 设计语言沿用 AspectRatioSelector：紫色 marker 标题 + 卡片化分段控件，
 * 可选档位角标（Member / Enterprise）通过 props 控制是否渲染，
 * 业务方按用户等级决定要不要挂会员/企业版锁。
 */
export type ResolutionOption<T extends string = string> = {
  value: T;
  /** Raw label text. Use `labelKey` for i18n. */
  label?: string;
  /** next-intl key path; takes precedence over `label` when provided. */
  labelKey?: string;
  /**
   * Optional second line shown under the main label, e.g. "标清 / 高清 / 超清".
   * Use `descriptionKey` for i18n.
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
  /** next-intl key for the title; takes precedence over `title`. */
  titleKey?: string;
  /** Accessible label for the radio group; falls back to the title text. */
  ariaLabel?: string;
  /**
   * Per-value tier badge — render the Member / Enterprise corner tag.
   * 默认全部关闭；业务模块按用户等级或产品策略开启。
   */
  badges?: Partial<Record<T, "member" | "enterprise">>;
  /** Optional icon rendered before the title text (e.g. lucide Monitor). */
  icon?: ComponentType<{ className?: string }>;
  className?: string;
};

function resolveBadgeLabel(
  t: ReturnType<typeof useTranslations>,
  tier: "member" | "enterprise" | undefined
): string | null {
  if (!tier) return null;
  if (tier === "member") return t("Shared.tierBadge.member");
  return t("Shared.tierBadge.enterprise");
}

export function ResolutionSelector<T extends string = string>({
  options,
  value,
  onChange,
  title,
  titleKey,
  ariaLabel,
  badges,
  icon: Icon,
  className,
}: ResolutionSelectorProps<T>) {
  const t = useTranslations();
  const resolvedTitle = titleKey ? t(titleKey) : title;
  const fallbackAria = titleKey
    ? t(titleKey)
    : typeof title === "string"
      ? title
      : undefined;
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
          const badgeTier = badges?.[option.value];
          const badgeText = resolveBadgeLabel(t, badgeTier);
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={
                descriptionText
                  ? `${labelText} · ${descriptionText}`
                  : typeof labelText === "string"
                    ? labelText
                    : undefined
              }
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
              <span className="studio-resolution-selector-label">{labelText}</span>
              {descriptionText ? (
                <span className="studio-resolution-selector-description">{descriptionText}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}