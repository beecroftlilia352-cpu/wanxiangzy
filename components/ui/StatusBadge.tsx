import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tone tokens — single source of truth for status pill colors.
 *
 * Three parallel class-prefix systems still exist (studio / mac / admin),
 * each backed by its own CSS rule. Until P5 deletes the parallel systems,
 * `toneClass` looks up the same mapping the per-system primitives used to
 * carry inline, so each variant produces identical visuals.
 */
export type StatusTone = "neutral" | "accent" | "primary" | "success" | "warning" | "danger";

const toneClasses: Record<StatusTone, string> = {
  neutral: "studio-tone-neutral",
  accent: "studio-tone-accent",
  primary: "studio-tone-primary",
  success: "studio-tone-success",
  warning: "studio-tone-warning",
  danger: "studio-tone-danger",
};

export type StatusBadgeVariant = "studio" | "mac" | "admin";

const variantClasses: Record<StatusBadgeVariant, string> = {
  studio: "studio-status-badge",
  mac: "mac-status-badge",
  admin: "admin-status-badge",
};

export type StatusBadgeProps = {
  tone?: StatusTone;
  variant?: StatusBadgeVariant;
  children: ReactNode;
  className?: string;
};

/**
 * Single source of truth for the studio/mac/admin status pill.
 *
 * Replaces three near-identical components that lived in different files:
 *   - `StudioStatusBadge` (`@/components/studio/StudioPrimitives`)
 *   - `MacStatusBadge`    (`@/components/studio/MacControls`)
 *   - `AdminStatusBadge`  (`@/components/admin/AdminPrimitives`)
 *
 * `AdminStatusBadge` is the odd one out — it accepts a `status: string`
 * and auto-derives tone/group from the value. That variant is preserved
 * separately (see `AdminStatusBadge` re-export) because the auto-derivation
 * logic is admin-specific (e.g. "pending", "draft", "published" → tone).
 */
export function StatusBadge({
  tone = "neutral",
  variant = "studio",
  children,
  className,
}: StatusBadgeProps) {
  return <span className={cn(variantClasses[variant], toneClasses[tone], className)}>{children}</span>;
}