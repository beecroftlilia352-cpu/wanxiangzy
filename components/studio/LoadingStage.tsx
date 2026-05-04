"use client";

import { Sparkles } from "lucide-react";

type LoadingStageProps = {
  genCount: number;
  progress: number;
  moduleName?: string;
};

function getProgressLabel(progress: number): string {
  if (progress < 15) return "准备中...";
  if (progress < 50) return "AI 绘制中...";
  if (progress < 90) return "即将完成...";
  return "处理中...";
}

export function LoadingStage({ genCount, progress, moduleName = "图像生成" }: LoadingStageProps) {
  const safeCount = Math.max(1, Math.min(genCount, 4));
  const displayProgress = Math.round(Math.max(0, Math.min(progress, 100)));
  const gridClass = safeCount > 1 ? "grid-cols-2 max-w-[430px]" : "grid-cols-1 max-w-[320px]";

  return (
    <div className="studio-loading-stage min-h-[260px] sm:min-h-[360px] lg:h-full p-5 sm:p-8 flex items-center justify-center">
      <div className="w-full">
        <div className={`mx-auto grid ${gridClass} gap-3 sm:gap-4`}>
          {Array.from({ length: safeCount }).map((_, i) => (
            <div
              key={i}
              className="gen-card relative overflow-hidden rounded-3xl border border-white/70 bg-gradient-to-br from-slate-100 via-violet-50 to-pink-50 shadow-[0_24px_70px_rgba(88,28,135,0.12)] backdrop-blur-xl"
              style={{ aspectRatio: "3/4" }}
            >
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/45 to-transparent"
                style={{ animation: "gen-shimmer 2s ease-in-out infinite", backgroundSize: "200% 100%" }}
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(168,85,247,0.16),transparent_34%),radial-gradient(circle_at_72%_78%,rgba(236,72,153,0.13),transparent_36%)]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div className="relative flex h-12 w-12 items-center justify-center">
                  <div className="gen-ring absolute inset-0 rounded-full bg-violet-300/40" />
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white/85 shadow-lg backdrop-blur-sm">
                    <Sparkles className="gen-icon h-6 w-6 text-violet-500" />
                  </div>
                </div>
                <span className="bg-gradient-to-r from-violet-600 to-pink-600 bg-clip-text text-xl font-black tabular-nums text-transparent">
                  {displayProgress}%
                </span>
                <p className="text-xs font-medium text-slate-500">
                  {getProgressLabel(displayProgress)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className={`mx-auto mt-3 flex items-center gap-2 px-1 ${safeCount > 1 ? "max-w-[430px]" : "max-w-[320px]"}`}>
          <span className="shrink-0 text-[11px] font-semibold text-violet-500">{moduleName}</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-700"
              style={{ width: `${Math.max(displayProgress, 5)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
