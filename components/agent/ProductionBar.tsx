"use client";

import { Sparkles, Loader2, Zap } from "lucide-react";

type Props = {
  garmentCount: number;
  totalCredits: number;
  isReady: boolean;
  isProducing: boolean;
  onStart: () => void;
};

export function ProductionBar({ garmentCount, totalCredits, isReady, isProducing, onStart }: Props) {
  if (!isReady) return null;

  return (
    <div className="sticky bottom-0 border-t border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-2xl">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          <span className="font-bold text-slate-800">{garmentCount}</span> 款服装 ·
          预估 <span className="font-bold text-amber-600">{totalCredits}</span> 积分
        </div>
        <button
          onClick={onStart}
          disabled={isProducing || garmentCount === 0}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-200 transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isProducing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              生产中...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              开始生产
            </>
          )}
        </button>
      </div>
    </div>
  );
}
