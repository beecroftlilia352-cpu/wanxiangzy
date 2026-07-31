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
      <p className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <div className="relative min-w-0">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white/95 to-transparent sm:hidden"
        />
        <div
          role="group"
          className="scrollbar-none flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-0.5 py-1 pr-8 sm:flex-wrap sm:overflow-visible sm:pr-0"
        >
          {options.map((item) => {
            const active = value === item.value;

            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(item.value)}
                className={cn(
                  "btn-press h-9 flex-none snap-start rounded-full border px-3.5 text-xs font-bold outline-none transition-[color,background-color,border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2",
                  active && tone === "brand"
                    ? "border-transparent bg-slate-950 text-white shadow-[0_6px_16px_rgba(15,23,42,0.18)]"
                    : active
                      ? "border-slate-300 bg-slate-100 text-slate-800 shadow-sm"
                      : "border-slate-200/90 bg-white/80 text-slate-500 shadow-sm hover:border-slate-300 hover:bg-white hover:text-slate-800"
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
