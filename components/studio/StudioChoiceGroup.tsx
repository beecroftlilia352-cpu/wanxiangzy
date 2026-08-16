import type { ComponentType, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Unified single/multi-select button grid used by every studio module.
 *
 * Replaces three near-identical components that grew up independently:
 *   - `StudioOptionGrid`     — large "tile" treatment with icon + ratio + badge
 *   - `StudioSegmentedControl` — compact pill-row for short labels
 *   - legacy model tiles    — superseded by the dedicated hover-card
 *                              `StudioModelSelector`
 *
 * The `variant` prop switches visual treatment while sharing the same
 * markup, props, ARIA contract (`role="radiogroup"`, `role="radio"`,
 * `aria-checked`). Existing `studio-option-grid*` and
 * `studio-segmented-control*` CSS classes are kept verbatim so the
 * migration is a one-line import swap.
 *
 * Migration map (old → new):
 *   <StudioOptionGrid      variant="tile" />
 *   <StudioSegmentedControl variant="segmented" />
 *   legacy model tiles     → use the dedicated `StudioModelSelector`
 */
export type StudioChoiceOption<T extends string = string> = {
  value: T;
  label: ReactNode;
  labelKey?: string;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
  /** Visual-only: render a small rectangle in the chosen aspect ratio + the ratio label. */
  ratio?: string;
  /** Small badge anchored to the top-right corner (e.g. "推荐"). */
  badge?: string;
};

export type StudioChoiceGroupVariant = "tile" | "segmented";

export type StudioChoiceGroupProps<T extends string> = {
  options: readonly StudioChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  variant?: StudioChoiceGroupVariant;
  columns?: number | "auto";
  className?: string;
  textAlign?: "center" | "start";
  descriptionMode?: "truncate" | "wrap";
};

export function StudioChoiceGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  variant = "tile",
  columns = "auto",
  className,
  textAlign = "center",
  descriptionMode = "truncate",
}: StudioChoiceGroupProps<T>) {
  const t = useTranslations();
  const containerClass = cn(
    variant === "segmented"
      ? cn("studio-segmented-control", columns !== "auto" && `studio-segmented-control-${columns}`)
      : cn("studio-option-grid", columns !== "auto" && `studio-option-grid-${columns}`),
    className
  );

  return (
    <div className={containerClass} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <ChoiceOptionButton
          key={option.value}
          option={option}
          selected={value === option.value}
          onSelect={() => onChange(option.value)}
          variant={variant}
          textAlign={textAlign}
          descriptionMode={descriptionMode}
          translateLabel={(key) => t(key)}
        />
      ))}
    </div>
  );
}

type ChoiceOptionButtonProps<T extends string> = {
  option: StudioChoiceOption<T>;
  selected: boolean;
  onSelect: () => void;
  variant: StudioChoiceGroupVariant;
  textAlign: "center" | "start";
  descriptionMode: "truncate" | "wrap";
  translateLabel: (key: string) => string;
};

function ChoiceOptionButton<T extends string>({
  option,
  selected,
  onSelect,
  variant,
  textAlign,
  descriptionMode,
  translateLabel,
}: ChoiceOptionButtonProps<T>) {
  const Icon = option.icon;
  const labelText = option.labelKey ? translateLabel(option.labelKey) : option.label;
  const buttonClass = cn(
    variant === "segmented"
      ? cn("studio-segmented-option", selected && "studio-segmented-option-active")
      : cn(
          "studio-option-control",
          textAlign === "start" && "studio-option-control-start",
          selected && "studio-option-control-selected"
        )
  );

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={option.disabled}
      onClick={onSelect}
      title={typeof labelText === "string" ? labelText : undefined}
      className={buttonClass}
    >
      {variant === "tile" && option.badge ? (
        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-[var(--codex-accent-12)] px-1.5 py-0.5 text-[9px] font-black leading-none text-[var(--codex-accent)]">
          {option.badge}
        </span>
      ) : null}
      {variant === "tile" && option.ratio ? (
        <span className="flex flex-col items-center gap-1.5">
          <span
            aria-hidden="true"
            className="block w-7 rounded-[3px] border-[1.6px] border-current"
            style={{ aspectRatio: option.ratio, maxHeight: "26px" }}
          />
          <span className="truncate text-[11px] font-bold leading-none">{option.ratio}</span>
          <span className="sr-only">{labelText}</span>
        </span>
      ) : (
        <span className={cn("min-w-0", Icon && variant === "tile" && "flex items-start gap-2.5")}>
          {Icon && variant === "tile" ? (
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--codex-accent-10)] text-[var(--codex-accent)]"
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
          ) : null}
          {Icon && variant === "segmented" ? <Icon className="h-4 w-4 shrink-0" /> : null}
          <span className="min-w-0">
            <span
              className={cn(
                variant === "segmented"
                  ? "block leading-tight [overflow-wrap:anywhere]"
                  : descriptionMode === "wrap"
                    ? "block whitespace-normal break-words"
                    : "block truncate"
              )}
            >
              {labelText}
            </span>
            {option.description ? (
              <span
                className={cn(
                  "mt-0.5 block text-[11px] font-semibold opacity-65",
                  variant === "segmented"
                    ? "leading-snug [overflow-wrap:anywhere]"
                    : descriptionMode === "wrap"
                      ? "whitespace-normal break-words leading-4"
                      : "truncate"
                )}
              >
                {option.description}
              </span>
            ) : null}
          </span>
        </span>
      )}
    </button>
  );
}

/**
 * Backwards-compatible re-export so existing imports keep working. New code
 * should import from `@/components/studio/StudioChoiceGroup` directly.
 *
 * @deprecated Use `StudioChoiceGroup` with `variant="tile"` instead.
 */
export function StudioOptionGrid<T extends string>(props: Omit<StudioChoiceGroupProps<T>, "variant">) {
  return <StudioChoiceGroup {...props} variant="tile" />;
}

/**
 * Backwards-compatible re-export of the segmented variant.
 *
 * @deprecated Use `StudioChoiceGroup` with `variant="segmented"` instead.
 */
export function StudioSegmentedControl<T extends string>(
  props: Omit<StudioChoiceGroupProps<T>, "variant"> & { columns?: 2 | 3 | 4 }
) {
  return <StudioChoiceGroup {...props} variant="segmented" />;
}
