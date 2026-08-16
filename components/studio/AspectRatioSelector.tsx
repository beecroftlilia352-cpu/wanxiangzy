"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Aspect-ratio value used by the visual rectangle preview.
 * `auto` is rendered with a dedicated "smart-fit" icon.
 */
export type AspectRatioShape = string;

export type AspectRatioOption<T extends string = string> = {
  value: T;
  /** Raw label text. Use `labelKey` for i18n. */
  label?: string;
  /** next-intl key path; takes precedence over `label` when provided. */
  labelKey?: string;
  /**
   * Optional CSS `aspect-ratio` override. Defaults to the ratio derived from
   * `value` (e.g. "3:4" -> "3/4"). Pass a custom value only when the ratio
   * string cannot be parsed automatically.
   */
  shape?: AspectRatioShape;
  disabled?: boolean;
};

export type AspectRatioSelectorProps<T extends string = string> = {
  options: readonly AspectRatioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Title rendered above the grid with the purple marker accent. */
  title?: ReactNode;
  /** next-intl key for the title; takes precedence over `title`. */
  titleKey?: string;
  /** Accessible label for the radio group; falls back to the title text. */
  ariaLabel?: string;
  className?: string;
};

function ratioToShape(value: string): AspectRatioShape | null {
  // Auto / smart-fit options are handled by a dedicated icon.
  if (!value || value === "auto" || value === "smart" || value === "智能") {
    return null;
  }
  const match = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return null;
  return `${match[1]} / ${match[2]}`;
}

function AutoShapeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 26 22"
      width="26"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4.5" y="5" width="17" height="12" rx="1.6" />
      <circle cx="4.5" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="21.5" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="17" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="21.5" cy="17" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function RatioShape({ shape }: { shape: AspectRatioShape }) {
  return (
    <span
      aria-hidden="true"
      className="studio-aspect-ratio-selector-shape"
      style={{ aspectRatio: shape.replace(/\s/g, "") }}
    />
  );
}

export function AspectRatioSelector<T extends string = string>({
  options,
  value,
  onChange,
  title,
  titleKey,
  ariaLabel,
  className,
}: AspectRatioSelectorProps<T>) {
  const t = useTranslations();
  const resolvedTitle = titleKey ? t(titleKey) : title;
  const fallbackAria = titleKey ? t(titleKey) : typeof title === "string" ? title : undefined;
  const resolvedAriaLabel = ariaLabel ?? fallbackAria;

  return (
    <section className={cn("studio-aspect-ratio-selector", className)}>
      {resolvedTitle != null && resolvedTitle !== "" && (
        <h3 className="studio-aspect-ratio-selector-title">
          <span aria-hidden="true" className="studio-aspect-ratio-selector-title-mark" />
          <span className="studio-aspect-ratio-selector-title-text">{resolvedTitle}</span>
        </h3>
      )}
      <div
        className="studio-aspect-ratio-selector-grid"
        role="radiogroup"
        aria-label={resolvedAriaLabel}
      >
        {options.map((option) => {
          const selected = value === option.value;
          const labelText = option.labelKey ? t(option.labelKey) : option.label ?? option.value;
          const shape = option.shape ?? ratioToShape(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={option.disabled}
              onClick={() => onChange(option.value as T)}
              title={typeof labelText === "string" ? labelText : undefined}
              className={cn(
                "studio-aspect-ratio-selector-card",
                selected && "studio-aspect-ratio-selector-card-selected"
              )}
            >
              <span className="studio-aspect-ratio-selector-icon" aria-hidden="true">
                {shape ? <RatioShape shape={shape} /> : <AutoShapeIcon />}
              </span>
              <span className="studio-aspect-ratio-selector-label">{labelText}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Standard 8-card layout shown in the design:
 *   自动比例 . 4:3 . 3:4 . 9:16
 *   16:9    . 1:1 . 3:2 . 2:3
 *
 * Pages that previously used ad-hoc `ASPECTS` arrays can opt into this preset
 * via `STANDARD_ASPECT_RATIO_OPTIONS` and override the auto label per-locale.
 */
export const STANDARD_ASPECT_RATIO_VALUES = [
  "auto",
  "4:3",
  "3:4",
  "9:16",
  "16:9",
  "1:1",
  "3:2",
  "2:3",
] as const;

export type StandardAspectRatioKey = (typeof STANDARD_ASPECT_RATIO_VALUES)[number];

export function buildStandardAspectRatioOptions(
  overrides: Partial<Record<StandardAspectRatioKey, AspectRatioOption>> = {}
): AspectRatioOption[] {
  return STANDARD_ASPECT_RATIO_VALUES.map((value) => overrides[value] ?? { value });
}
