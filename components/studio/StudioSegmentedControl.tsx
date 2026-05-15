import type { ComponentType } from "react";

export type StudioSegmentedControlOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
};

export type StudioSegmentedControlProps<T extends string> = {
  value: T;
  options: readonly StudioSegmentedControlOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  columns?: 2 | 3 | 4;
};

export function StudioSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  columns = 2,
}: StudioSegmentedControlProps<T>) {
  return (
    <div
      className={`studio-segmented-control mac-segmented-control studio-segmented-control-${columns}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = value === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`studio-segmented-option mac-segmented-option ${selected ? "studio-segmented-option-active mac-segmented-option-active" : ""}`}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            <span className="min-w-0">
              <span className="block leading-tight [overflow-wrap:anywhere]">{option.label}</span>
              {option.description && <span className="mt-0.5 block text-[10px] leading-snug opacity-70 [overflow-wrap:anywhere]">{option.description}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
