"use client";

import { Sparkles, Layers3, ChevronRight } from "lucide-react";
import type { RecommendedPlan } from "@/lib/agent/types";

const ICON_MAP: Record<string, string> = {
  Shirt: "👕",
  Heart: "📱",
  Box: "📦",
  Layers3: "🎯",
  Images: "🖼️",
  PersonStanding: "🧍",
  UserRound: "👤",
};

type Props = {
  plans: RecommendedPlan[];
  onSelect: (plan: RecommendedPlan) => void;
  garmentCount: number;
};

export function RecommendationCards({ plans, onSelect, garmentCount }: Props) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-bold text-slate-800">AI 推荐方案</h3>
      </div>

      <div className="space-y-2">
        {plans.map((plan) => (
          <button
            key={plan.id}
            onClick={() => onSelect(plan)}
            className={`group w-full rounded-xl border p-3 text-left transition-all ${
              plan.isRecommended
                ? "border-violet-200 bg-violet-50/50 shadow-[0_8px_24px_rgba(124,58,237,0.1)] hover:shadow-[0_12px_32px_rgba(124,58,237,0.15)]"
                : "border-slate-200/80 bg-white hover:border-violet-200 hover:shadow-md"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2.5">
                <span className="text-lg">{ICON_MAP[plan.icon] || "✨"}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{plan.title}</span>
                    {plan.isRecommended && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-600">
                        AI 推荐
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{plan.description}</p>
                  {plan.aiReason && (
                    <p className="mt-1 text-xs text-violet-500/80">💡 {plan.aiReason}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs font-bold text-amber-600">
                  {plan.creditsPerItem * garmentCount} 积分
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-400" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
