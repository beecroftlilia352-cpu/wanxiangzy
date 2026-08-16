import { Loader2, Play } from "lucide-react";
import { useId, type ReactNode } from "react";

export type StudioRunBarProps = {
  summary: ReactNode;
  /** 耗时预估提示（如 "预计 1-2 分钟"），显示在 summary 右侧 */
  estimateLabel?: ReactNode;
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
  estimateLabel,
  costLabel,
  disabled,
  disabledReason,
  primaryLabel,
  isLoading,
  onPrimaryAction,
  secondaryActions,
}: StudioRunBarProps) {
  const disabledReasonId = useId();
  const showDisabledReason = Boolean(disabled && disabledReason);

  return (
    <div className="studio-runbar studio-runbar-v2" aria-busy={isLoading || undefined}>
      <div className="flex min-w-0 items-start justify-between gap-3 text-xs">
        <div className="min-w-0 space-y-0.5">
          <div className="text-codex-muted">{summary}</div>
          {estimateLabel && <div className="text-codex-faint">{estimateLabel}</div>}
        </div>
        {costLabel && <div className="shrink-0 text-right font-black text-amber-600">{costLabel}</div>}
      </div>
      {showDisabledReason && (
        <p id={disabledReasonId} className="studio-runbar-status" aria-live="polite">
          {disabledReason}
        </p>
      )}
      <button
        type="button"
        onClick={onPrimaryAction}
        disabled={disabled || isLoading}
        aria-describedby={showDisabledReason ? disabledReasonId : undefined}
        className="studio-primary-action"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        <span className="truncate">{primaryLabel}</span>
      </button>
      {secondaryActions && <div className="studio-runbar-actions">{secondaryActions}</div>}
    </div>
  );
}
