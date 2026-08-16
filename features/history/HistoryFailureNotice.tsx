"use client";

import { useTranslations } from "next-intl";
import type { HistoryFailureRecoveryCopy } from "@/lib/history-page-state";

/**
 * 历史记录失败原因 / 恢复提示卡片。
 *
 * 受控组件：copy 是由父级 useHistoryFailureCopy 派生出的国际化文案。
 * 仅负责排版 / 颜色，文案与触发逻辑都来自 lib/history-failure-copy。
 */
export function HistoryFailureNotice({ copy }: { copy: HistoryFailureRecoveryCopy }) {
  const tAny = useTranslations();
  return (
    <div className="mt-3 rounded-xl border border-red-100 bg-red-50/80 px-3 py-2 text-xs leading-5 text-red-700">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">{copy.titleKey ? tAny(copy.titleKey) : copy.title}</p>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-bold text-red-500">
          {copy.applyLabelKey ? tAny(copy.applyLabelKey) : copy.applyLabel}
        </span>
      </div>
      <dl className="mt-2 space-y-1.5">
        <div>
          <dt className="text-[11px] font-black uppercase text-red-400">
            {copy.reasonLabelKey ? tAny(copy.reasonLabelKey) : copy.reasonLabel}
          </dt>
          <dd className="mt-0.5 font-medium text-red-700">
            {copy.reasonKey ? tAny(copy.reasonKey) : copy.reason}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-black uppercase text-red-400">
            {copy.recoveryLabelKey ? tAny(copy.recoveryLabelKey) : copy.recoveryLabel}
          </dt>
          <dd className="mt-0.5 text-red-600">
            {copy.recoveryHintKey
              ? tAny(copy.recoveryHintKey, copy.recoveryHintParams)
              : copy.recoveryHint}
          </dd>
        </div>
      </dl>
    </div>
  );
}