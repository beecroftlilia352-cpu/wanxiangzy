import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudioDensity, StudioSurfaceVariant, StudioTone } from "@/lib/design/codex-theme";

const surfaceVariantClasses: Record<StudioSurfaceVariant, string> = {
  surface: "studio-surface",
  elevated: "studio-surface studio-surface-elevated",
  floating: "studio-surface studio-surface-floating",
  canvas: "studio-surface studio-surface-canvas",
  toolbar: "studio-surface studio-surface-toolbar",
};

const toneClasses: Record<StudioTone, string> = {
  neutral: "studio-tone-neutral",
  accent: "studio-tone-accent",
  primary: "studio-tone-primary",
  success: "studio-tone-success",
  warning: "studio-tone-warning",
  danger: "studio-tone-danger",
};

export type StudioSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  variant?: StudioSurfaceVariant;
  density?: StudioDensity;
};

export function StudioSurface({
  variant = "surface",
  density = "comfortable",
  className,
  children,
  ...props
}: StudioSurfaceProps) {
  return (
    <div
      className={cn(
        surfaceVariantClasses[variant],
        density === "compact" ? "studio-density-compact" : "studio-density-comfortable",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type StudioButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: StudioTone;
  density?: StudioDensity;
  selected?: boolean;
  loading?: boolean;
  icon?: ReactNode;
};

export function StudioButton({
  tone = "neutral",
  density = "comfortable",
  selected,
  loading,
  icon,
  disabled,
  className,
  children,
  ...props
}: StudioButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "studio-button",
        toneClasses[tone],
        density === "compact" && "studio-button-compact",
        selected && "studio-button-selected",
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function StudioStatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StudioTone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("studio-status-badge", toneClasses[tone], className)}>{children}</span>;
}
