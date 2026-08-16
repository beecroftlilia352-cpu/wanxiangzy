"use client";

import { useTranslations } from "next-intl";
import type { TryOnAgeGroup, TryOnGarmentAudience } from "@/lib/tryon-prompt";
import { AGE_GROUP_OPTIONS, GARMENT_AUDIENCE_OPTIONS } from "@/lib/tryon-studio-options";

type Props = {
  garmentAudience: TryOnGarmentAudience;
  ageGroup: TryOnAgeGroup;
  onChangeAudience: (value: TryOnGarmentAudience) => void;
  onChangeAge: (value: TryOnAgeGroup) => void;
};

/**
 * 服装人群 / 年龄段选择面板。
 *
 * 受控组件：纯展示 + 选择事件回传，状态由调用方（CreatePage）持有。
 * 提取原因是 page-client.tsx 中 audience + age 两个按钮组紧挨在一起、
 * 共享同一份样式表，单独成为一个组件后样式集中维护、复用更容易。
 */
export function AudienceAgePanel({ garmentAudience, ageGroup, onChangeAudience, onChangeAge }: Props) {
  const t = useTranslations("Create");

  return (
    <section className="rounded-2xl border border-violet-100 bg-white/78 p-3 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="studio-control-title">{t("audience.title")}</h3>
            <span className="rounded-full bg-[var(--codex-surface-soft)] px-1.5 py-0.5 text-[11px] font-medium text-codex-faint dark:bg-white/10 dark:text-codex-faint">{t("common.optional")}</span>
          </div>
          <p className="mt-1 truncate text-[12px] text-codex-faint">
            {t("audience.description")}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--codex-accent-10)] px-2 py-0.5 text-[11px] font-medium text-[var(--codex-accent)] dark:bg-[rgba(167,139,250,0.18)] dark:text-purple-300">
          {t("audience.badge")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {GARMENT_AUDIENCE_OPTIONS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onChangeAudience(value)}
            aria-pressed={garmentAudience === value}
            className={`rounded-lg border px-2 py-1.5 text-[12px] font-medium leading-none transition-[color,background-color,border-color,box-shadow] ${
              garmentAudience === value
                ? "border-violet-400 bg-[var(--codex-accent-10)] text-violet-700 shadow-sm dark:border-[rgba(167,139,250,0.6)] dark:bg-[rgba(167,139,250,0.18)] dark:text-purple-200"
                : "border-[var(--codex-border)] bg-white text-codex-muted hover:border-[var(--codex-accent-30)] hover:text-[var(--codex-accent)] dark:border-white/10 dark:bg-[#26262a] dark:text-codex-muted dark:hover:border-[rgba(167,139,250,0.45)] dark:hover:text-purple-300"
            }`}
          >
            {t(`audience.garment.${value}`)}
          </button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {AGE_GROUP_OPTIONS.map((value) => {
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChangeAge(value)}
              aria-pressed={ageGroup === value}
              className={`rounded-lg border px-1.5 py-1.5 text-[12px] font-medium leading-none transition-[color,background-color,border-color,box-shadow] ${
                ageGroup === value
                  ? "border-violet-400 bg-[var(--codex-accent-10)] text-violet-700 shadow-sm dark:border-[rgba(167,139,250,0.6)] dark:bg-[rgba(167,139,250,0.18)] dark:text-purple-200"
                  : "border-[var(--codex-border)] bg-white text-codex-muted hover:border-[var(--codex-accent-30)] hover:text-[var(--codex-accent)] dark:border-white/10 dark:bg-[#26262a] dark:text-codex-muted dark:hover:border-[rgba(167,139,250,0.45)] dark:hover:text-purple-300"
              }`}
            >
              {t(`audience.age.${value}`)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
