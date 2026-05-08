import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export type StudioRunBarProps = {
  summary: ReactNode;
  costLabel?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  primaryLabel: string;
  isLoading?: boolean;
  onPrimaryAction: () => void;
  secondaryActions?: ReactNode;
};

export function StudioRunBar({
  summary,
  costLabel,
  disabled,
  disabledReason,
  primaryLabel,
  isLoading,
  onPrimaryAction,
  secondaryActions,
}: StudioRunBarProps) {
  return (
    <div className="studio-runbar studio-runbar-v2">
      <div className="flex min-w-0 items-start justify-between gap-3 text-xs">
        <div className="min-w-0 text-slate-500">{summary}</div>
        {costLabel && <div className="shrink-0 text-right font-black text-amber-600">{costLabel}</div>}
      </div>
      {disabled && disabledReason && (
        <p className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-700">
          {disabledReason}
        </p>
      )}
      <button
        type="button"
        onClick={onPrimaryAction}
        disabled={disabled || isLoading}
        className="studio-primary-action"
      >
        <Sparkles className="h-4 w-4" />
        {primaryLabel}
      </button>
      {secondaryActions && <div className="studio-runbar-actions">{secondaryActions}</div>}
    </div>
  );
}
