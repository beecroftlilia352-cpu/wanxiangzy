"use client";

import { Brush, Check, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RefObject } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  plans: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onConfirm: () => void;
  onRefresh: () => void;
  onClose: () => void;
};

/**
 * AI 改写弹窗：
 * - 顶部：tab 形式的方案选择（可横向滚动）
 * - 中间：当前方案的 markdown 内容
 * - 底部：左下"重写"按钮 + 右下"确认选择"按钮
 *
 * 受控组件：所有状态由父级持有（plans / selectedIndex），关闭时通过 onClose 通知。
 */
export function AiWritingModal({
  open,
  returnFocusRef,
  plans,
  selectedIndex,
  onSelect,
  onConfirm,
  onRefresh,
  onClose,
}: Props) {
  const t = useTranslations("AllCategoryProduct");
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        returnFocusRef={returnFocusRef}
        overlayClassName="z-[149] bg-codex-ink/45"
        className="z-[150] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-lg bg-white p-0 shadow-2xl sm:max-w-3xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--codex-border)] px-5 py-4 pr-14">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--codex-surface-soft)]">
              <Brush aria-hidden="true" className="h-5 w-5 text-codex-ink" />
            </span>
            <div>
              <DialogTitle className="text-base font-black leading-6 text-codex-ink">
                {t("aiWritingPlanTitle")}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-codex-muted">
                {t("aiWritingPlanDesc")}
              </DialogDescription>
            </div>
          </div>
        </div>
        <div
          className="border-b border-[var(--codex-border)] px-5 py-3"
          role="group"
          aria-label={t("aiWritingPlanGroup")}
        >
          <div className="flex gap-2 overflow-x-auto pb-1">
            {plans.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-pressed={selectedIndex === index}
                onClick={() => onSelect(index)}
                className={`h-9 shrink-0 rounded-full border px-4 text-sm font-black outline-none transition-[color,background-color,border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-[var(--codex-border-strong)] focus-visible:ring-offset-2 ${
                  selectedIndex === index
                    ? "border-codex-ink bg-codex-ink text-white"
                    : "border-[var(--codex-border)] bg-white text-codex-muted hover:border-[var(--codex-border-strong)]"
                }`}
              >
                {t("planN", { index: index + 1 })}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--codex-surface-soft)] p-5 [overscroll-behavior:contain]">
          <pre className="min-h-64 whitespace-pre-wrap rounded-lg bg-white p-4 text-sm leading-7 text-codex-ink shadow-sm sm:min-h-[360px]">
            {plans[selectedIndex] || t("noPlan")}
          </pre>
        </div>
        <div className="flex flex-col gap-2 border-t border-[var(--codex-border)] px-5 py-4 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-11 touch-manipulation items-center justify-center gap-2 rounded-lg border border-[var(--codex-border)] px-4 text-sm font-black text-codex-muted outline-none transition-[color,background-color,border-color,box-shadow] hover:bg-[var(--codex-surface-soft)] focus-visible:ring-2 focus-visible:ring-[var(--codex-border-strong)] focus-visible:ring-offset-2"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {t("rewrite")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-11 touch-manipulation items-center justify-center gap-2 rounded-lg bg-codex-ink px-6 text-sm font-black text-white outline-none transition-[background-color,box-shadow] hover:bg-codex-muted focus-visible:ring-2 focus-visible:ring-[var(--codex-border-strong)] focus-visible:ring-offset-2"
          >
            <Check aria-hidden="true" className="h-4 w-4" />
            {t("confirmSelect")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}