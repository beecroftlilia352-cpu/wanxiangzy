import type { ComponentType, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Check, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SurfaceVariant = "surface" | "elevated" | "floating" | "toolbar";
type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
type Density = "compact" | "comfortable";

const surfaceClasses: Record<SurfaceVariant, string> = {
  surface: "mac-surface",
  elevated: "mac-surface mac-surface-elevated",
  floating: "mac-surface mac-surface-floating",
  toolbar: "mac-surface mac-toolbar-surface",
};

const toneClasses: Record<Tone, string> = {
  neutral: "mac-tone-neutral",
  accent: "mac-tone-accent",
  success: "mac-tone-success",
  warning: "mac-tone-warning",
  danger: "mac-tone-danger",
};

export function GlassSurface({
  variant = "surface",
  density = "comfortable",
  className,
  children,
}: {
  variant?: SurfaceVariant;
  density?: Density;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(surfaceClasses[variant], density === "compact" ? "mac-density-compact" : "mac-density-comfortable", className)}>
      {children}
    </div>
  );
}

export function MacButton({
  tone = "neutral",
  density = "comfortable",
  loading,
  selected,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  density?: Density;
  loading?: boolean;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "mac-button",
        toneClasses[tone],
        density === "compact" && "mac-button-compact",
        selected && "mac-button-selected",
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export type MacSegmentedOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
};

export function MacSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  density = "comfortable",
  className,
}: {
  value: T;
  options: readonly MacSegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  density?: Density;
  className?: string;
}) {
  return (
    <div className={cn("mac-segmented-control", density === "compact" && "mac-segmented-compact", className)} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const Icon = option.icon;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn("mac-segmented-option", selected && "mac-segmented-option-active")}
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            <span className="min-w-0">
              <span className="block truncate">{option.label}</span>
              {option.description && <span className="block truncate text-[10px] opacity-70">{option.description}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function MacToolbar({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mac-toolbar", className)}>{children}</div>;
}

export function MacPanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mac-panel", className)}>
      {(title || description || actions) && (
        <div className="mac-panel-header">
          <div className="min-w-0">
            {title && <h3 className="mac-panel-title">{title}</h3>}
            {description && <p className="mac-panel-description">{description}</p>}
          </div>
          {actions && <div className="mac-panel-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

type MacFieldProps =
  | ({ as?: "input" } & InputHTMLAttributes<HTMLInputElement>)
  | ({ as: "textarea" } & TextareaHTMLAttributes<HTMLTextAreaElement>)
  | ({ as: "select" } & SelectHTMLAttributes<HTMLSelectElement>);

export function MacField({
  label,
  hint,
  error,
  className,
  as,
  ...props
}: MacFieldProps & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
}) {
  const fieldClassName = cn("mac-field-control", className);
  return (
    <label className="mac-field">
      {label && <span className="mac-field-label">{label}</span>}
      {as === "textarea" ? (
        <textarea {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)} className={fieldClassName} />
      ) : as === "select" ? (
        <select {...(props as SelectHTMLAttributes<HTMLSelectElement>)} className={fieldClassName} />
      ) : (
        <input {...(props as InputHTMLAttributes<HTMLInputElement>)} className={fieldClassName} />
      )}
      {(hint || error) && <span className={cn("mac-field-hint", error && "mac-field-error")}>{error || hint}</span>}
    </label>
  );
}

export function MacStatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("mac-status-badge", toneClasses[tone], className)}>{children}</span>;
}

export function MacAssetCard({
  imageUrl,
  title,
  meta,
  status,
  selected,
  onClick,
  actions,
}: {
  imageUrl?: string | null;
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  actions?: ReactNode;
}) {
  return (
    <article className={cn("mac-asset-card", selected && "mac-asset-card-selected")}>
      <button type="button" onClick={onClick} className="mac-asset-card-preview" disabled={!onClick}>
        {imageUrl ? <img src={imageUrl} alt="" /> : <ImageIcon className="h-6 w-6 text-slate-400" />}
        {selected && (
          <span className="mac-asset-selected-mark">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
      <div className="mac-asset-card-body">
        <div className="min-w-0">
          <h3>{title}</h3>
          {meta && <p>{meta}</p>}
        </div>
        {status}
      </div>
      {actions && <div className="mac-asset-card-actions">{actions}</div>}
    </article>
  );
}
