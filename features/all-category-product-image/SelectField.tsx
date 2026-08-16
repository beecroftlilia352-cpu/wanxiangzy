"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { getAspectRatioLabel } from "@/features/all-category-product-image/shared";

type Props = {
  icon?: ReactNode;
  label: string;
  value: string;
  options: readonly string[];
  labels?: Record<string, string>;
  disabled?: boolean;
  onChange: (value: string) => void;
};

/**
 * 通用 select 表单字段：图标 + 标签 + native <select>。
 *
 * 选项文本默认走 `getAspectRatioLabel` 处理（auto → "智能"，其他原值）；
 * 若传 `labels` 则按 key 取 label（覆盖默认行为）。
 */
export function SelectField({ icon, label, value, options, labels, disabled, onChange }: Props) {
  const t = useTranslations("AllCategoryProduct");
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-codex-muted">
        {icon}
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-[var(--codex-border)] bg-[var(--codex-surface-soft)] px-3 text-sm font-semibold text-codex-ink outline-none transition focus:border-[var(--codex-border-strong)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] || getAspectRatioLabel(option, t)}
          </option>
        ))}
      </select>
    </label>
  );
}