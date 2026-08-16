"use client";

import type { ReactNode } from "react";

type Props = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
};

/**
 * ResultGrid 卡片悬浮时露出的圆形按钮：zoom / download / regenerate。
 *
 * 圆形白色背景 + 阴影，hover 时变柔和色。a11y 用 title + aria-label 双标注。
 */
export function IconButton({ label, icon, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-white/10 text-codex-ink shadow-lg hover:bg-[var(--codex-surface-soft)]"
    >
      {icon}
    </button>
  );
}