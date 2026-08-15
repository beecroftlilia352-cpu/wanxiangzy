"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type GenerationCountOption = {
  value: number;
  /** Raw label override, e.g. "1 张". Falls back to `${value} ${unit}`. */
  label?: string;
  labelKey?: string;
  disabled?: boolean;
};

export type GenerationCountFieldProps = {
  value: number;
  onChange: (value: number) => void;
  /** Available count options. Defaults to [1, 2, 3, 4]. */
  options?: readonly GenerationCountOption[];
  /** Shorthand for `options` when only the numeric range matters. */
  counts?: readonly number[];
  /** Title rendered above the row with the purple marker accent. */
  title?: ReactNode;
  titleKey?: string;
  /** Label inside the row, e.g. "生成张数". Pass `null` to hide the label cell. */
  label?: ReactNode;
  labelKey?: string;
  /**
   * Override the summary on the right; defaults to `共 N 张`.
   * Pass an empty string to suppress the summary cell entirely.
   */
  summary?: ReactNode;
  summaryKey?: string;
  /** Unit word appended after each count (default: "张"). */
  unit?: string;
  unitKey?: string;
  /** Optional icon to render before the label. */
  icon?: ComponentType<{ className?: string }>;
  ariaLabel?: string;
  className?: string;
};

function resolveOptions(
  options: readonly GenerationCountOption[] | undefined,
  counts: readonly number[] | undefined
): GenerationCountOption[] {
  if (options && options.length > 0) return [...options];
  if (counts && counts.length > 0) return counts.map((value) => ({ value }));
  return [1, 2, 3, 4].map((value) => ({ value }));
}

export function GenerationCountField({
  value,
  onChange,
  options,
  counts,
  title,
  titleKey,
  label,
  labelKey,
  summary,
  summaryKey,
  unit,
  unitKey,
  icon: Icon = Layers,
  ariaLabel,
  className,
}: GenerationCountFieldProps) {
  const t = useTranslations();
  const resolvedOptions = useMemo(
    () => resolveOptions(options, counts),
    [options, counts]
  );

  const resolvedTitle = titleKey ? t(titleKey) : title;
  const resolvedLabel = labelKey ? t(labelKey) : label;
  const resolvedUnit = unitKey ? t(unitKey) : unit ?? t("Shared.unitZhang");
  // Skip empty unit fragments so locales with `unitZhang=""` (e.g. ar/it) don't
  // leave a trailing space in the auto-summary.
  const fallbackSummary =
    [t("Shared.totalLabel"), String(value), resolvedUnit]
      .filter((part) => part && part.trim() !== "")
      .join(" ");
  const resolvedSummary =
    summaryKey !== undefined
      ? t(summaryKey)
      : summary !== undefined
        ? summary
        : fallbackSummary;
  const resolvedAriaLabel =
    ariaLabel ?? (typeof resolvedLabel === "string" ? resolvedLabel : undefined);

  // Controlled popover so we can close it on selection.
  const [open, setOpen] = useState(false);

  // Roving tabindex for the listbox (WAI-ARIA Listbox pattern).
  const listboxId = useId();
  const listboxRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const initialIndex = useMemo(() => {
    const idx = resolvedOptions.findIndex((opt) => opt.value === value);
    return idx >= 0 ? idx : 0;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [focusedIdx, setFocusedIdx] = useState(initialIndex);

  useEffect(() => {
    optionRefs.current[focusedIdx]?.focus();
  }, [focusedIdx]);

  const handleListboxKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setFocusedIdx((idx) => Math.min(resolvedOptions.length - 1, idx + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setFocusedIdx((idx) => Math.max(0, idx - 1));
        break;
      case "Home":
        event.preventDefault();
        setFocusedIdx(0);
        break;
      case "End":
        event.preventDefault();
        setFocusedIdx(resolvedOptions.length - 1);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const opt = resolvedOptions[focusedIdx];
        if (opt && !opt.disabled) {
          onChange(opt.value);
          setOpen(false);
        }
        break;
      }
      case "Escape":
        setOpen(false);
        break;
    }
  };

  const hasLabel = resolvedLabel != null && resolvedLabel !== "";
  const hasSummary =
    resolvedSummary != null && String(resolvedSummary).trim() !== "";

  return (
    <section className={cn("studio-generation-count-field", className)}>
      {resolvedTitle != null && resolvedTitle !== "" && (
        <h3 className="studio-aspect-ratio-selector-title">
          <span aria-hidden="true" className="studio-aspect-ratio-selector-title-mark" />
          <span className="studio-aspect-ratio-selector-title-text">{resolvedTitle}</span>
        </h3>
      )}
      <div className="studio-generation-count-row">
        {hasLabel && (
          <span className="studio-generation-count-label">
            <span className="studio-generation-count-label-icon" aria-hidden="true">
              <Icon className="h-4 w-4" />
            </span>
            <span>{resolvedLabel}</span>
          </span>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="studio-generation-count-trigger"
              aria-label={resolvedAriaLabel}
              aria-haspopup="listbox"
            >
              <span>{value}</span>
              <span className="studio-generation-count-trigger-chevron" aria-hidden="true">
                <ChevronDown className="h-4 w-4" />
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="center"
            sideOffset={6}
            collisionPadding={8}
            className="studio-generation-count-popover w-auto p-0"
          >
            <div
              ref={listboxRef}
              className="studio-generation-count-options"
              role="listbox"
              tabIndex={0}
              aria-label={resolvedAriaLabel}
              aria-activedescendant={
                listboxId ? `${listboxId}-opt-${focusedIdx}` : undefined
              }
              onKeyDown={handleListboxKeyDown}
            >
              {resolvedOptions.map((option, index) => {
                const selected = option.value === value;
                const optionLabel =
                  option.labelKey
                    ? t(option.labelKey)
                    : option.label ?? `${option.value} ${resolvedUnit}`.trim();
                return (
                  <button
                    key={option.value}
                    ref={(el) => {
                      optionRefs.current[index] = el;
                    }}
                    id={listboxId ? `${listboxId}-opt-${index}` : undefined}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-disabled={option.disabled || undefined}
                    tabIndex={-1}
                    onClick={() => {
                      if (!option.disabled) {
                        onChange(option.value);
                        setOpen(false);
                      }
                    }}
                    className={cn(
                      "studio-generation-count-option",
                      selected && "studio-generation-count-option-active"
                    )}
                  >
                    {optionLabel}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        {hasSummary && (
          <span className="studio-generation-count-summary">{resolvedSummary}</span>
        )}
      </div>
    </section>
  );
}