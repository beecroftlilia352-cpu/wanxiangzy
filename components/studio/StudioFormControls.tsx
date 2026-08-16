import { useEffect, useMemo } from "react";
import type { ChangeEvent, ComponentType, ReactNode } from "react";
import { useVisibleImageModels } from "@/lib/use-visible-image-models";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { useTranslations } from "next-intl";
import {
  StudioOptionGrid as StudioChoiceGroupOptionGrid,
  StudioChoiceGroup,
  type StudioChoiceOption,
  type StudioChoiceGroupProps,
} from "@/components/studio/StudioChoiceGroup";

// Re-export the unified choice group under its legacy name so existing
// imports (`StudioOptionGrid` from `@/components/studio/StudioFormControls`)
// keep working without touching every call site. New code should import
// `StudioChoiceGroup` directly.
export const StudioOptionGrid = StudioChoiceGroupOptionGrid;
export { StudioChoiceGroup };
export type { StudioChoiceOption, StudioChoiceGroupProps };

export type StudioModelOption<T extends string = string> = {
  value: T;
  label: string;
  labelKey?: string;
  desc: string;
  descKey?: string;
  icon?: string;
  badge?: string;
  badgeKey?: string;
  disabled?: boolean;
};

export function StudioModelSelector<T extends string>({
  models,
  value,
  onChange,
  getMeta,
  columns = 2,
  ariaLabel = "Generation model",
}: {
  models: readonly StudioModelOption<T>[];
  value: T;
  onChange: (value: T) => void;
  getMeta?: (model: StudioModelOption<T>) => ReactNode;
  columns?: 1 | 2;
  ariaLabel?: string;
}) {
  const t = useTranslations();
  const { visibleModels, isReady } = useVisibleImageModels();
  const visibleOptions = useMemo(() => {
    if (!isReady || !visibleModels) return models;
    return models.filter((model) => visibleModels.has(model.value));
  }, [isReady, models, visibleModels]);

  useEffect(() => {
    if (!isReady || visibleOptions.length === 0) return;
    if (!visibleOptions.some((model) => model.value === value)) {
      onChange(visibleOptions[0].value);
    }
  }, [isReady, onChange, value, visibleOptions]);

  return (
    <div className={cn("studio-model-selector", columns === 1 && "studio-model-selector-1")} role="radiogroup" aria-label={ariaLabel}>
      {visibleOptions.map((model) => {
        const selected = value === model.value;
        return (
          <button
            key={model.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={model.disabled}
            onClick={() => onChange(model.value)}
            className={cn("studio-model-option", selected && "studio-model-option-selected")}
          >
            <span className="studio-model-option-icon">
              {model.icon ? <RawPreviewImage src={model.icon} alt="" /> : <ImageIcon className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="studio-model-option-title">
                <span className="leading-tight [overflow-wrap:anywhere]">{model.labelKey ? t(model.labelKey) : model.label}</span>
                {model.badge && <span className="studio-model-option-badge">{model.badgeKey ? t(model.badgeKey) : model.badge}</span>}
              </span>
              <span className="studio-model-option-desc">{getMeta?.(model) ?? (model.descKey ? t(model.descKey) : model.desc)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function StudioToggleRow({
  title,
  description,
  checked,
  onChange,
  meta,
  disabled,
  ariaLabel,
}: {
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  meta?: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-xl bg-[var(--codex-surface-soft)]/90 p-4 text-left transition",
        "hover:bg-[var(--codex-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2",
        disabled && "cursor-not-allowed opacity-60 hover:bg-[var(--codex-surface-soft)]/90"
      )}
    >
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-black text-codex-ink">{title}</span>
          {meta && <span className="rounded-full bg-codex-surface px-2 py-0.5 text-[10px] font-black text-codex-faint shadow-sm">{meta}</span>}
        </span>
        {description && <span className="mt-1 block text-[11px] font-semibold leading-5 text-codex-faint">{description}</span>}
      </span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-[var(--codex-accent)]" : "bg-[var(--codex-border)]"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-codex-surface shadow-sm transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  );
}

export function StudioHiddenFileInput({
  inputRef,
  multiple,
  accept = "image/*",
  onFiles,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  multiple?: boolean;
  accept?: string;
  onFiles: (files: File[]) => void | Promise<void>;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple={multiple}
      className="hidden"
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const input = event.currentTarget;
        void Promise.resolve(onFiles(Array.from(input.files || []))).finally(() => {
          input.value = "";
        });
      }}
    />
  );
}

export type StudioPresetImage = {
  id: string;
  src: string;
  label?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
};
