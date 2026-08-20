"use client";

import { StudioHomeHeroLoadingBackdrop } from "@/components/studio/StudioHomeHeroLoadingBackdrop";

export function TaskSwitchLoading({ label }: { label: string }) {
  return (
    <>
      <StudioHomeHeroLoadingBackdrop />
      <span className="studio-task-switch-loading relative z-10 text-sm font-medium text-white">
        {label}
      </span>
    </>
  );
}
