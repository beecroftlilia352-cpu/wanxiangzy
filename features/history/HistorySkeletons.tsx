"use client";

/**
 * 历史页骨架屏组件。
 *
 * History 页加载时显示的占位结构：页面标题栏 / 筛选 tab / 卡片网格 / 详情面板。
 * 这些组件是纯展示组件，无 props / 无状态，可在任何加载容器里直接使用。
 */

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`history-skeleton ${className}`} />;
}

function HistorySkeletonStyles() {
  return (
    <style>{`
      .history-skeleton {
        position: relative;
        overflow: hidden;
        background: linear-gradient(110deg, #eef1f5 8%, #f8fafc 18%, #e7ebf1 33%);
        background-size: 220% 100%;
        animation: history-skeleton-sweep 1.35s ease-in-out infinite;
      }

      .history-skeleton::after {
        content: "";
        position: absolute;
        inset: 0;
        transform: translateX(-120%);
        background: linear-gradient(90deg, transparent, var(--codex-surface-72), transparent);
        animation: history-skeleton-glow 1.6s ease-in-out infinite;
      }

      .history-skeleton-card {
        animation: history-skeleton-float 2.8s ease-in-out infinite;
      }

      .history-skeleton-card:nth-child(2n) {
        animation-delay: 0.16s;
      }

      .history-skeleton-card:nth-child(3n) {
        animation-delay: 0.28s;
      }

      @keyframes history-skeleton-sweep {
        0% { background-position: 120% 0; }
        100% { background-position: -120% 0; }
      }

      @keyframes history-skeleton-glow {
        0% { transform: translateX(-120%); }
        55%, 100% { transform: translateX(120%); }
      }

      @keyframes history-skeleton-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }

      @media (prefers-reduced-motion: reduce) {
        .history-skeleton,
        .history-skeleton::after,
        .history-skeleton-card {
          animation: none;
        }
      }
    `}</style>
  );
}

function HistoryCardSkeleton() {
  return (
    <article className="history-skeleton-card overflow-hidden rounded-2xl border border-[var(--codex-border)] bg-[var(--codex-surface-strong)] shadow-sm">
      <SkeletonBlock className="aspect-[3/4] rounded-none" />
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-3.5 w-24 rounded-full" />
          <SkeletonBlock className="h-2.5 w-32 rounded-full" />
        </div>
        <SkeletonBlock className="h-5 w-12 rounded-full" />
      </div>
    </article>
  );
}

function HistoryLoadingSkeleton() {
  return (
    <div className="studio-workbench history-workbench min-h-[calc(100dvh-64px)] px-4 py-6 sm:py-8">
      <HistorySkeletonStyles />
      <div className="mx-auto mb-5 max-w-7xl rounded-2xl border border-[var(--codex-border)] bg-[var(--codex-surface-strong)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-28 rounded-full" />
            <SkeletonBlock className="h-3 w-40 rounded-full" />
          </div>
          <SkeletonBlock className="h-9 w-24 rounded-full" />
        </div>
        <div className="mt-3 flex gap-2 border-t border-[var(--codex-border)] pt-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-8 w-16 rounded-full" />
          ))}
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <HistoryCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

function DetailLoadingSkeleton({ open }: { open: boolean }) {
  const t = useTranslations("History");
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[119] bg-codex-ink/25 backdrop-blur-xl"
        className="z-[120] grid max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-5xl gap-0 overflow-y-auto rounded-3xl border border-white/75 bg-white/85 p-0 shadow-[0_28px_90px_rgba(15,23,42,0.28)] backdrop-blur-2xl [overscroll-behavior:contain] sm:max-w-5xl lg:grid-cols-[minmax(0,1.2fr)_340px] lg:overflow-hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        aria-busy="true"
      >
        <DialogTitle className="sr-only">{t("detailLoadingTitle")}</DialogTitle>
        <DialogDescription className="sr-only">{t("detailLoadingDesc")}</DialogDescription>
        <div className="bg-[#eef0f3] p-5">
          <div className="mb-4 flex items-center justify-between">
            <SkeletonBlock className="h-4 w-20 rounded-full" />
            <SkeletonBlock className="h-8 w-24 rounded-full" />
          </div>
          <SkeletonBlock className="h-[52vh] min-h-72 rounded-3xl" />
          <div className="mt-4 flex items-center gap-3">
            <SkeletonBlock className="h-2 flex-1 rounded-full" />
            <SkeletonBlock className="h-8 w-16 rounded-full" />
          </div>
        </div>
        <div className="space-y-5 bg-white/75 p-5">
          <div className="space-y-3">
            <SkeletonBlock className="h-4 w-20 rounded-full" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="space-y-2 border-b border-[var(--codex-border)] pb-2">
                  <SkeletonBlock className="h-3 w-12 rounded-full" />
                  <SkeletonBlock className="h-4 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <SkeletonBlock className="h-4 w-20 rounded-full" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-24 rounded-xl" />
              ))}
            </div>
          </div>
          <SkeletonBlock className="h-32 rounded-xl" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export {
  HistoryLoadingSkeleton,
  HistoryCardSkeleton,
  DetailLoadingSkeleton,
  SkeletonBlock,
  HistorySkeletonStyles,
};