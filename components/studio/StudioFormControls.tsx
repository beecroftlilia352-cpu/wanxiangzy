import type { ChangeEvent, ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  StudioOptionGrid as StudioChoiceGroupOptionGrid,
  StudioChoiceGroup,
  type StudioChoiceOption,
  type StudioChoiceGroupProps,
} from "@/components/studio/StudioChoiceGroup";
export {
  StudioModelSelector,
  type StudioModelOption,
  type StudioModelSelectorProps,
} from "@/components/studio/StudioModelSelector";

// Re-export the unified choice group under its legacy name so existing
// imports (`StudioOptionGrid` from `@/components/studio/StudioFormControls`)
// keep working without touching every call site. New code should import
// `StudioChoiceGroup` directly.
export const StudioOptionGrid = StudioChoiceGroupOptionGrid;
export { StudioChoiceGroup };
export type { StudioChoiceOption, StudioChoiceGroupProps };

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
