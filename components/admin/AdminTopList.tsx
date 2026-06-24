"use client";

import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

/* ----------------------------------------------------------------------------
 * AdminTopList — Vercel/H-care-style Top-N list with:
 *   - circular icon tile (left)
 *   - label + secondary meta (middle, truncate)
 *   - right-aligned value with tone-aware bar fill
 *   - click-to-navigate via optional href
 *
 * Replaces the old module-bar + model-bar charts on the dashboard. Renders
 * a clean ranked list that scans faster than horizontal bars and supports
 * per-item navigation.
 * -------------------------------------------------------------------------- */

export type AdminTopListItem = {
  key: string;
  label: string;
  value: number;
  icon?: LucideIcon | null;
  secondary?: string;
  tone?: "success" | "warning" | "danger" | "neutral" | "accent";
  href?: string;
};

type AdminTopListProps = {
  items: AdminTopListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  /** Used to color the bar fill behind each value. Defaults to "accent". */
  tone?: AdminTopListItem["tone"];
  valueFormatter?: (value: number) => string;
  /** Max items to render. Defaults to 8. */
  max?: number;
};

const toneClassMap: Record<NonNullable<AdminTopListItem["tone"]>, string> = {
  success: "bg-[hsl(var(--codex-success))]",
  warning: "bg-[hsl(var(--codex-warning))]",
  danger: "bg-[hsl(var(--codex-danger))]",
  neutral: "bg-[hsl(var(--codex-faint))]",
  accent: "bg-[hsl(var(--codex-accent))]",
};

const toneBadgeClassMap: Record<NonNullable<AdminTopListItem["tone"]>, string> = {
  success: "border-[var(--admin-success-border)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]",
  warning: "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
  danger: "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
  neutral: "border-[var(--admin-border)] bg-[var(--admin-surface-soft)] text-[var(--admin-muted)]",
  accent: "border-[var(--admin-info-border)] bg-[var(--admin-info-soft)] text-[var(--admin-info)]",
};

const defaultValueFormatter = (value: number) => String(Math.round(value * 10) / 10);

export function AdminTopList({
  items,
  emptyTitle = "暂无数据",
  emptyDescription = "等待新数据写入后会显示在这里。",
  tone = "accent",
  valueFormatter = defaultValueFormatter,
  max = 8,
}: AdminTopListProps) {
  const visible = items.slice(0, max);
  const maxValue = visible.reduce((m, it) => (it.value > m ? it.value : m), 0);

  if (visible.length === 0) {
    return (
      <div className="p-4">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <ol className="flex flex-col divide-y divide-[var(--admin-border)]" aria-label="Top 列表">
      {visible.map((item, index) => {
        const Icon = item.icon ?? null;
        const ratio = maxValue > 0 ? Math.max(0, Math.min(1, item.value / maxValue)) : 0;
        const widthPct = Math.max(6, ratio * 100); // minimum 6% so a zero-value row is still scannable
        const effectiveTone: NonNullable<AdminTopListItem["tone"]> = item.tone ?? tone;
        const content = (
          <div className="relative flex min-w-0 items-center gap-3 px-3 py-2.5">
            {/* Bar fill — sits behind the content; only takes the value column */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-1 right-1 rounded-md opacity-[0.12] ${toneClassMap[effectiveTone]}`}
              style={{ width: `${widthPct}%` }}
            />
            <span
              aria-hidden="true"
              className={`relative z-10 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${toneBadgeClassMap[effectiveTone]}`}
            >
              {Icon ? <Icon className="h-4 w-4" /> : <span className="text-[11px] font-black tabular-nums">{index + 1}</span>}
            </span>
            <div className="relative z-10 min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold text-[var(--admin-fg)]">{item.label}</span>
                {item.href ? (
                  <ArrowUpRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-[var(--admin-faint)] motion-safe:transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--admin-fg)]"
                  />
                ) : null}
              </div>
              {item.secondary ? (
                <span className="mt-0.5 block truncate text-[11px] font-semibold text-[var(--admin-muted)]">
                  {item.secondary}
                </span>
              ) : null}
            </div>
            <span
              className={`relative z-10 ml-auto shrink-0 text-sm font-black tabular-nums ${
                effectiveTone === "danger" ? "text-[var(--admin-danger)]" : "text-[var(--admin-fg)]"
              }`}
            >
              {valueFormatter(item.value)}
            </span>
          </div>
        );

        return (
          <li key={item.key}>
            {item.href ? (
              <Link
                href={item.href}
                className="group block motion-safe:transition-colors hover:bg-[var(--admin-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-surface)]"
                aria-label={`查看 ${item.label}（${valueFormatter(item.value)}）`}
              >
                {content}
              </Link>
            ) : (
              <div className="group">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Skeleton for AdminTopList — 6 rows matching the realistic visual rhythm.
 * Place this in `loading.tsx` so the layout doesn't reflow on hydration.
 */
export function AdminTopListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ol className="flex flex-col divide-y divide-[var(--admin-border)]" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
          <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-4 w-12 shrink-0" />
        </li>
      ))}
    </ol>
  );
}
