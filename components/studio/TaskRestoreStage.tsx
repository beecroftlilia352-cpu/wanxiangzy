"use client";

import { Images, Layers3 } from "lucide-react";
import { cn } from "@/lib/utils";

type TaskRestoreStageProps = {
  title: string;
  description: string;
  statusLabel: string;
  className?: string;
};

export function TaskRestoreStage({
  title,
  description,
  statusLabel,
  className,
}: TaskRestoreStageProps) {
  return (
    <div
      className={cn(
        "studio-task-restore-stage flex min-h-[260px] items-center justify-center px-5 py-8 sm:min-h-[360px] sm:px-8 lg:h-full",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="studio-task-restore-content w-full max-w-[680px]">
        <div className="studio-task-restore-heading flex items-center gap-3">
          <span className="studio-task-restore-icon flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden="true">
            <Layers3 className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-codex-ink">{title}</p>
            <p className="mt-0.5 text-xs leading-5 text-codex-muted">{description}</p>
          </div>
          <span className="studio-task-restore-status hidden shrink-0 items-center gap-2 text-xs font-medium text-codex-muted sm:inline-flex">
            <span className="studio-task-restore-status-dot" aria-hidden="true" />
            {statusLabel}
          </span>
        </div>

        <div className="studio-task-restore-canvas mt-5" aria-hidden="true">
          <div className="studio-task-restore-source">
            <span className="studio-task-restore-source-icon flex h-9 w-9 items-center justify-center">
              <Images className="h-4 w-4" />
            </span>
            <span className="studio-task-restore-line studio-task-restore-line--short" />
            <span className="studio-task-restore-line" />
          </div>
          <div className="studio-task-restore-preview">
            <span className="studio-task-restore-preview-main" />
            <span className="studio-task-restore-preview-side" />
            <span className="studio-task-restore-preview-side" />
          </div>
          <span className="studio-task-restore-progress">
            <span className="studio-task-restore-progress-bar" />
          </span>
        </div>
      </div>
    </div>
  );
}
