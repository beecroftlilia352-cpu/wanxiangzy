"use client";

import { cn } from "@/lib/utils";

type HistoryFilterOption<T extends string> = {
  value: T;
  label: string;
};

type HistoryFilterTabsProps<T extends string> = {
  label: string;
  options: readonly HistoryFilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  tone?: "brand" | "neutral";
  className?: string;
};

export function HistoryFilterTabs<T extends string>({
  label,
  options,
  value,
  onChange,
  tone = "neutral",
  className,
}: HistoryFilterTabsProps<T>) {
  return (
    <section className={cn("min-w-0", className)} aria-label={label}>
      <div className="relative min-w-0">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-white to-transparent sm:hidden dark:from-codex-ink"
        />
        <div
          role="group"
          className="scrollbar-none flex snap-x snap-mandatory items-center gap-1.5 overflow-x-auto overscroll-x-contain py-0.5 pr-7 sm:flex-wrap sm:overflow-visible sm:pr-0"
        >
          <span className="mr-1 flex-none text-[11px] font-bold text-[var(--codex-faint)]">{label}</span>
          {options.map((item) => {
            const active = value === item.value;

            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(item.value)}
                className={cn(
                  "btn-press h-8 flex-none snap-start rounded-full px-3 text-xs font-bold outline-none transition-[color,background-color,border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[var(--codex-accent-48)] focus-visible:ring-offset-2",
                  active
                    ? "border border-[var(--codex-accent-35)] bg-[var(--codex-accent-12)] text-[var(--codex-accent)] shadow-[0_2px_8px_var(--codex-accent-14)] dark:bg-[var(--codex-accent-18)] dark:text-[#aeb8ff]"
                    : "border border-[var(--codex-border)] bg-[var(--codex-surface-soft)] text-[var(--codex-muted)] hover:border-[var(--codex-accent-30)] hover:text-[var(--codex-ink)] dark:hover:text-white"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
