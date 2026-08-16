"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { FolderOpen, History, Info } from "lucide-react";
import { getFeatureItem, getFeatureItemsForModule, type FeatureKey, type FeatureNavItem } from "@/lib/navigation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StudioTabBadge } from "@/components/studio/StudioTabBadge";

/** 数据键全路径（Header.features.*），用全局 t 解析（对齐 HeaderClient 的 tAny 用法） */
function featureLabel(t: (key: string) => string, item: FeatureNavItem): string {
  return item.labelKey ? t(item.labelKey) : item.label;
}

function featureTitle(t: (key: string) => string, item: FeatureNavItem): string {
  if (item.disabled) {
    return item.disabledReason || t(`Header.features.${item.key}.description`);
  }
  return t(`Header.features.${item.key}.description`);
}

export function FeatureTabs({ active }: { active: FeatureKey }) {
  const t = useTranslations();
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeItem = getFeatureItem(active);
  const visibleItems = useMemo(() => {
    const moduleKey = activeItem?.module || "aiShoots";
    return getFeatureItemsForModule(moduleKey);
  }, [activeItem?.module]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const activeNode = activeRef.current;
    if (!scroller || !activeNode) return;

    if (window.matchMedia("(min-width: 1024px)").matches) {
      const targetTop = activeNode.offsetTop - (scroller.clientHeight - activeNode.clientHeight) / 2;
      scroller.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" });
      return;
    }

    const targetLeft = activeNode.offsetLeft - (scroller.clientWidth - activeNode.clientWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, targetLeft), behavior: "auto" });
  }, [active, visibleItems.length]);

  return (
    <aside className="studio-nav-rail w-full max-w-[100vw] shrink-0 overflow-hidden border-b px-2 py-2 lg:flex lg:h-full lg:w-[112px] lg:max-w-none lg:flex-col lg:border-b-0 lg:border-r lg:px-2 lg:py-3">
      <div ref={scrollerRef} className="studio-nav-scroller flex w-full items-center gap-1 overflow-x-auto overscroll-x-contain pb-1 lg:min-h-0 lg:flex-1 lg:flex-col lg:items-stretch lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-y-contain lg:pb-2">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          const title = featureTitle(t, item);

          if (item.disabled) {
            return (
              <span
                key={item.key}
                aria-disabled="true"
                title={title}
                className="studio-nav-item group flex h-14 min-w-[92px] cursor-not-allowed flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[12px] font-black opacity-45 lg:h-[72px] lg:min-w-0"
              >
                <span className="studio-nav-icon-frame text-codex-faint">
                  <Icon aria-hidden="true" />
                </span>
                <span className="max-w-full text-center leading-tight [overflow-wrap:anywhere]">{featureLabel(t, item)}</span>
                <span className="text-[11px] font-bold text-codex-faint">{item.disabledReason}</span>
              </span>
            );
          }

          return (
            <Link
              key={item.key}
              ref={isActive ? activeRef : undefined}
              href={item.href}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              className={`studio-nav-item group flex h-14 min-w-[92px] flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[12px] font-black transition-[background-color,color,box-shadow,border-color] duration-150 lg:h-[72px] lg:min-w-0 ${
                isActive
                  ? "studio-nav-item-active bg-white/80 text-[var(--codex-accent)] shadow-sm ring-1 ring-[var(--codex-accent-22)] dark:bg-white/10 dark:text-[#cfd8ff] dark:ring-[var(--codex-accent-40)]"
                  : "text-codex-muted hover:bg-white/70 hover:text-codex-ink dark:hover:bg-white/5 dark:hover:text-codex-muted"
              }`}
              title={featureTitle(t, item)}
            >
              <span className={`studio-nav-icon-frame ${isActive ? "text-[var(--codex-accent)]" : "text-codex-faint group-hover:text-codex-ink"}`}>
                <Icon aria-hidden="true" />
                {item.badge && (
                  <StudioTabBadge variant="inline" className="studio-nav-item-badge">
                    {item.badge}
                  </StudioTabBadge>
                )}
              </span>
              <span className="max-w-full text-center leading-tight [overflow-wrap:anywhere]">{featureLabel(t, item)}</span>
            </Link>
          );
        })}
      </div>
      <StudioNavFooter />
    </aside>
  );
}

function StudioNavFooter() {
  const t = useTranslations("Header");

  return (
    <TooltipProvider delayDuration={320} skipDelayDuration={80}>
      <div className="studio-nav-footer hidden shrink-0 flex-col lg:flex">
        <div className="studio-nav-footer-divider" aria-hidden="true" />
        <Link href="/history" prefetch={false} className="studio-nav-footer-item">
          <History aria-hidden="true" />
          <span>{t("generationHistory")}</span>
        </Link>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="studio-nav-footer-item" aria-label={t("resourceLibraryComingSoon")}>
              <FolderOpen aria-hidden="true" />
              <span>{t("resourceLibrary")}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10} className="studio-nav-footer-tooltip">
            {t("resourceLibraryComingSoon")}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="studio-nav-disclaimer-trigger" aria-label={t("apiDisclaimer")}>
              <Info aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12} className="studio-nav-disclaimer-tooltip">
            {t("apiDisclaimer")}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
