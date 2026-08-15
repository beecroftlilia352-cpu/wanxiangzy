"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CircleHelp } from "lucide-react";
import { ClientPortal } from "@/components/ClientPortal";

type ModuleHeaderProps = {
  title: string;
  tooltip: string;
  actions?: ReactNode;
};

export function ModuleHeader({ title, tooltip, actions }: ModuleHeaderProps) {
  const t = useTranslations("Shared");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipStyle, setTooltipStyle] = useState<{ top: number; left: number } | null>(null);

  const showTooltip = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 288;
    const left = Math.max(12, Math.min(rect.left - 24, window.innerWidth - width - 12));
    const top = Math.min(rect.bottom + 8, window.innerHeight - 96);
    setTooltipStyle({ top, left });
  };

  return (
    <div className="studio-module-heading">
      <div className="studio-module-heading-main">
        <h1 className="studio-module-heading-title">{title}</h1>
        <button
          ref={buttonRef}
          type="button"
          aria-label={t("moduleHeaderAria", { title })}
          onMouseEnter={showTooltip}
          onMouseLeave={() => setTooltipStyle(null)}
          onFocus={showTooltip}
          onBlur={() => setTooltipStyle(null)}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-400 shadow-sm transition-colors hover:border-emerald-200 hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
        {tooltipStyle && (
          <ClientPortal>
            <div
              className="mac-surface pointer-events-none fixed z-[320] w-72 rounded-xl px-3 py-2.5 text-left text-xs font-medium leading-relaxed text-slate-700 shadow-[0_18px_42px_rgba(15,23,42,0.26)] animate-fade-in"
              style={{ top: tooltipStyle.top, left: tooltipStyle.left }}
            >
            {tooltip}
            </div>
          </ClientPortal>
        )}
      </div>
      {actions ? <div className="studio-module-heading-actions">{actions}</div> : null}
    </div>
  );
}
