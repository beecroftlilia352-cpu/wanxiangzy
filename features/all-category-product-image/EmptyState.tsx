"use client";

import { PackageCheck } from "lucide-react";

type Props = {
  title: string;
  description: string;
};

/**
 * ResultGrid / canvas 的占位空态：图标圆 + 标题 + 描述，居中布局。
 */
export function EmptyState({ title, description }: Props) {
  return (
    <div className="flex min-h-[680px] items-center justify-center px-6 text-center">
      <div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--codex-surface-soft)] text-codex-muted">
          <PackageCheck aria-hidden="true" className="h-8 w-8" />
        </div>
        <h3 className="mt-5 text-sm font-semibold leading-6 text-codex-muted">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-codex-muted">{description}</p>
      </div>
    </div>
  );
}