"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Studio module loading skeleton — mirrors the real studio-workbench layout:
 *   FeatureTabs (40px) | Parameters panel (472px) | Canvas | TaskRail (288px)
 *
 * The skeleton maps 1:1 to the CSS grid used by .studio-workbench so there's
 * zero layout shift when the real content hydrates.
 */
export type StudioModuleSkeletonVariant = "default" | "model" | "pose" | "tryon";

type StudioModuleSkeletonProps = {
  variant?: StudioModuleSkeletonVariant;
  className?: string;
};

function Block({ className, rounded = "rounded-md" }: { className?: string; rounded?: string }) {
  return <div className={cn("studio-skeleton-shimmer", rounded, className)} aria-hidden="true" />;
}

function SkeletonPanelSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
      {title ? <Block className="mb-3 h-3 w-24" /> : null}
      {children}
    </div>
  );
}

export function StudioModuleSkeleton({
  variant = "default",
  className,
}: StudioModuleSkeletonProps) {
  const t = useTranslations("Shared");
  return (
    <div
      className={cn(
        "studio-workbench flex min-h-[calc(100dvh-64px)] w-full flex-col lg:flex-row lg:h-[calc(100vh-64px)]",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
      aria-label={t("loadingModule")}
    >
      {/* Feature tabs sidebar — 40px slim rail */}
      <div className="hidden w-10 shrink-0 flex-col items-center gap-4 border-r border-slate-200 bg-slate-50/70 py-3 lg:flex dark:border-white/5 dark:bg-[#161618]">
        {Array.from({ length: 6 }).map((_, i) => (
          <Block key={i} className="h-8 w-8" rounded="rounded-lg" />
        ))}
      </div>

      {/* Parameters panel — mirrors .studio-parameters (472px) */}
      <div className="studio-parameters flex w-full shrink-0 flex-col border-b lg:w-[472px] lg:border-b-0 lg:border-r">
        <div className="flex-1 space-y-4 overflow-hidden p-3 sm:p-5">
          {/* Module header */}
          <div className="flex items-center gap-2">
            <Block className="h-6 w-6" rounded="rounded-lg" />
            <Block className="h-6 w-28" />
            <Block className="ml-auto h-5 w-14" rounded="rounded-full" />
          </div>

          {/* Upload section — mimics StudioMultiImageUpload */}
          <SkeletonPanelSection>
            <Block className="mb-2 h-3 w-16" />
            <Block className="h-28 w-full" rounded="rounded-xl" />
            <div className="mt-3 flex gap-2">
              <Block className="h-9 flex-1" rounded="rounded-lg" />
              <Block className="h-9 w-24" rounded="rounded-lg" />
            </div>
          </SkeletonPanelSection>

          {/* Model / option section */}
          <SkeletonPanelSection>
            <Block className="mb-3 h-3 w-16" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <Block className="aspect-square w-full" rounded="rounded-xl" />
                  <Block className="h-2.5 w-12" />
                  <Block className="h-2 w-16" />
                </div>
              ))}
            </div>
          </SkeletonPanelSection>

          {/* Aspect ratio chips */}
          <SkeletonPanelSection>
            <Block className="mb-3 h-3 w-20" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Block key={i} className="h-8 w-full" rounded="rounded-md" />
              ))}
            </div>
          </SkeletonPanelSection>

          {/* Resolution / gen count */}
          <SkeletonPanelSection>
            <Block className="mb-3 h-3 w-16" />
            <div className="grid grid-cols-3 gap-2">
              <Block className="h-8 w-full" rounded="rounded-md" />
              <Block className="h-8 w-full" rounded="rounded-md" />
              <Block className="h-8 w-full" rounded="rounded-md" />
            </div>
          </SkeletonPanelSection>

          {/* Prompt textarea */}
          <SkeletonPanelSection>
            <Block className="mb-2 h-3 w-20" />
            <Block className="h-24 w-full" rounded="rounded-lg" />
          </SkeletonPanelSection>
        </div>

        {/* Runbar — mirrors StudioRunBar */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#1c1c1e]">
          <div className="flex flex-col gap-1">
            <Block className="h-3 w-32" />
            <Block className="h-2.5 w-20" />
          </div>
          <Block className="h-10 w-28" rounded="rounded-full" />
        </div>
      </div>

      {/* Canvas — mirrors .studio-canvas */}
      <div className="studio-canvas relative flex min-h-[360px] flex-1 items-center justify-center overflow-hidden p-4 sm:p-6 lg:min-h-0">
        <div className="grid w-full max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: variant === "default" ? 4 : 6 }).map((_, i) => (
            <Block key={i} className="aspect-square w-full" rounded="rounded-xl" />
          ))}
        </div>
      </div>

      {/* Task rail — mirrors ModuleTaskRail (288px) */}
      <div className="hidden w-[288px] shrink-0 flex-col border-l border-slate-200 bg-slate-50/70 p-3 lg:flex dark:border-white/5 dark:bg-[#161618]">
        <div className="mb-3 flex items-center justify-between">
          <Block className="h-4 w-20" />
          <Block className="h-7 w-7" rounded="rounded-lg" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-white p-2 shadow-sm dark:bg-[#1c1c1e]">
              <Block className="h-10 w-10 shrink-0" rounded="rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Block className="h-2.5 w-3/4" />
                <Block className="h-2 w-1/2" />
              </div>
              <Block className="h-4 w-4 shrink-0" rounded="rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
