import { cn } from "@/lib/utils";

/**
 * P5.45 unified module loading skeleton.
 *
 * Mirrors the typical "模特图 / 姿势 / 服装上身" module layout:
 *   - top bar placeholder (model prompt + runbar)
 *   - left control panel placeholder (sections, chips, toggles)
 *   - center canvas placeholder (image preview slot)
 *   - right task rail placeholder (queue cards)
 *
 * Used while the actual studio shell is hydrating or fetching the first
 * run state so the user never sees "naked" empty containers or skeleton
 * blocks that don't match the real UI structure.
 */
export type StudioModuleSkeletonVariant = "default" | "model" | "pose" | "tryon";

type StudioModuleSkeletonProps = {
  variant?: StudioModuleSkeletonVariant;
  className?: string;
  showRightRail?: boolean;
  showRunbar?: boolean;
};

function Block({
  className,
  rounded = "rounded-md",
}: {
  className?: string;
  rounded?: string;
}) {
  return (
    <div
      className={cn(
        "studio-skeleton-shimmer",
        rounded,
        className,
      )}
      aria-hidden="true"
    />
  );
}

export function StudioModuleSkeleton({
  variant = "default",
  className,
  showRightRail = true,
  showRunbar = true,
}: StudioModuleSkeletonProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[480px] w-full flex-col gap-3 p-3 sm:p-4",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
      aria-label="模块加载中"
    >
      {/* Top bar — matches StudioHeader */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
        <div className="flex items-center gap-3">
          <Block className="h-7 w-7" rounded="rounded-lg" />
          <Block className="h-4 w-28" />
          <div className="ml-2 hidden gap-2 sm:flex">
            <Block className="h-7 w-16" rounded="rounded-full" />
            <Block className="h-7 w-16" rounded="rounded-full" />
            <Block className="h-7 w-16" rounded="rounded-full" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Block className="h-7 w-20" rounded="rounded-full" />
          <Block className="h-7 w-20" rounded="rounded-full" />
          <Block className="h-7 w-24" rounded="rounded-full" />
        </div>
      </div>

      {/* Body — left panel + canvas + optional right rail */}
      <div className="grid h-full min-h-0 flex-1 grid-cols-12 gap-3">
        {/* Left control panel */}
        <div className="col-span-12 space-y-3 lg:col-span-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
            <Block className="h-3 w-20" />
            <Block className="mt-2 h-7 w-full" rounded="rounded-lg" />
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <Block className="h-7 w-full" rounded="rounded-md" />
              <Block className="h-7 w-full" rounded="rounded-md" />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
            <Block className="h-3 w-24" />
            <div className="mt-3 grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Block
                  key={i}
                  className="aspect-[3/4] w-full"
                  rounded="rounded-lg"
                />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
            <Block className="h-3 w-16" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Block className="h-7 w-14" rounded="rounded-md" />
              <Block className="h-7 w-16" rounded="rounded-md" />
              <Block className="h-7 w-12" rounded="rounded-md" />
              <Block className="h-7 w-14" rounded="rounded-md" />
            </div>
          </div>
        </div>

        {/* Center canvas — image preview slot */}
        <div
          className={cn(
            "col-span-12 flex flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]",
            showRightRail ? "lg:col-span-6" : "lg:col-span-9",
          )}
        >
          <div className="flex items-center justify-between">
            <Block className="h-3 w-20" />
            <Block className="h-7 w-24" rounded="rounded-full" />
          </div>
          <div className="mt-3 flex flex-1 items-center justify-center">
            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: variant === "default" ? 4 : 6 }).map(
                (_, i) => (
                  <Block
                    key={i}
                    className="aspect-[3/4] w-full"
                    rounded="rounded-xl"
                  />
                ),
              )}
            </div>
          </div>
        </div>

        {/* Right task rail */}
        {showRightRail && (
          <div className="col-span-12 space-y-3 lg:col-span-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
              <Block className="h-3 w-16" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Block className="h-12 w-12" rounded="rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Block className="h-3 w-3/4" />
                      <Block className="h-2.5 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
              <Block className="h-3 w-20" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Block key={i} className="h-14 w-full" rounded="rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Runbar */}
      {showRunbar && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
          <Block className="h-3 w-1/2" />
          <div className="flex items-center gap-2">
            <Block className="h-9 w-24" rounded="rounded-full" />
            <Block className="h-9 w-28" rounded="rounded-full" />
          </div>
        </div>
      )}
    </div>
  );
}
