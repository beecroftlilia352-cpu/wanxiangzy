"use client";

import { PackageCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { getProgressMessage } from "@/features/all-category-product-image/shared";

type Props = {
  title: string;
  progress: number;
};

/**
 * 单张生成中卡片的占位：图标 + 标题 + 进度文案 + 百分比。
 *
 * 复用 progressMessage 文案；progress=0 时退化为 "waitingRender"。
 */
export function GenerationSkeleton({ title, progress }: Props) {
  const t = useTranslations("AllCategoryProduct");
  return (
    <div className="flex aspect-[3/4] flex-col items-center justify-center rounded-lg border border-[var(--codex-border)] bg-[var(--codex-surface-soft)] text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white dark:bg-white/10 text-codex-muted shadow-sm">
        <PackageCheck aria-hidden="true" className="h-6 w-6" />
      </div>
      <p className="mt-4 text-sm font-black text-codex-ink">{title}</p>
      <p className="mt-1 px-4 text-xs text-codex-muted">
        {getProgressMessage(t, "generating", progress)}
      </p>
      <p className="mt-1 text-[11px] font-semibold text-codex-faint">
        {progress ? `${progress}%` : t("waitingRender")}
      </p>
    </div>
  );
}