"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { StepKey } from "@/features/all-category-product-image/shared";

/**
 * 页面顶部的 5 步进度条。
 *
 * 显示一组圆圈 + 标签，相邻步骤用细线段连接。
 * activeIndex 之前的步骤画"已完成"（勾 + 深色），当前步骤显示数字 + 高亮，未来步骤半透明。
 */

const STEPS: Array<{ key: StepKey }> = [
  { key: "input" },
  { key: "analyzing" },
  { key: "planning" },
  { key: "generating" },
  { key: "done" },
];

type Props = {
  activeIndex: number;
};

export function StepBar({ activeIndex }: Props) {
  const t = useTranslations("AllCategoryProduct");
  const stepLabels: Record<StepKey, string> = {
    input: t("stepInput"),
    analyzing: t("stepAnalyzing"),
    planning: t("stepPlanning"),
    generating: t("stepGenerating"),
    done: t("stepDone"),
  };
  return (
    <div className="mx-auto flex max-w-[620px] items-center justify-center gap-2">
      {STEPS.map((step, index) => {
        const isActive = index === activeIndex;
        const isDone = index < activeIndex;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                isDone || isActive
                  ? "bg-codex-ink text-white"
                  : "bg-transparent text-codex-muted"
              }`}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span
              className={`hidden text-xs font-semibold sm:inline ${
                isActive || isDone ? "text-codex-ink" : "text-codex-muted"
              }`}
            >
              {stepLabels[step.key]}
            </span>
            {index < STEPS.length - 1 && (
              <span className="h-px w-8 bg-[var(--codex-border-strong)] sm:w-10" />
            )}
          </div>
        );
      })}
    </div>
  );
}