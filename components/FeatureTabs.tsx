"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FolderOpen, History, Info } from "lucide-react";
import { getFeatureItem, getFeatureItemsForModule, type AppModuleKey, type FeatureKey, type FeatureNavItem } from "@/lib/navigation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StudioTabBadge } from "@/components/studio/StudioTabBadge";
import { requestStudioNavigation } from "@/lib/studio-navigation";

/** 数据键全路径（Header.features.*），用全局 t 解析（对齐 HeaderClient 的 tAny 用法） */
function featureLabel(t: (key: string) => string, item: FeatureNavItem): string {
  return item.labelKey ? t(item.labelKey) : item.label;
}

function featureTitle(t: (key: string) => string, item: FeatureNavItem): string {
  const description = item.labelKey
    ? t(`Header.features.${item.key}.description`)
    : item.description;
  if (item.disabled) {
    return item.disabledReason || description;
  }
  return description;
}

function compactRailLabel(label: string, locale: string): string {
  if (/^(zh|ja|ko)(-|$)/i.test(locale)) return label;
  const [firstWord = label] = label.trim().split(/\s+/);
  return firstWord.length <= 10 ? firstWord : "";
}

export function FeatureTabs({ active, module }: { active: FeatureKey | null; module?: AppModuleKey }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeItem = active ? getFeatureItem(active) : undefined;
  const visibleItems = useMemo(() => {
    const moduleKey = module || activeItem?.module || "aiShoots";
    return getFeatureItemsForModule(moduleKey);
  }, [activeItem?.module, module]);

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

  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void requestStudioNavigation(href, () => router.push(href));
  };

  return (
    <aside className="studio-nav-rail w-full max-w-[100vw] shrink-0 overflow-hidden border-b px-2 py-2 lg:flex lg:h-full lg:w-[var(--studio-nav-rail-width)] lg:max-w-none lg:flex-col lg:border-b-0 lg:border-r lg:px-1 lg:py-1">
      <div ref={scrollerRef} className="studio-nav-scroller flex w-full items-center gap-1 overflow-x-auto overscroll-x-contain pb-1 lg:min-h-0 lg:flex-1 lg:flex-col lg:items-stretch lg:gap-0.5 lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-y-contain lg:pb-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          const title = featureTitle(t, item);
          const label = featureLabel(t, item);
          const railLabel = compactRailLabel(label, locale);

          if (item.disabled) {
            return (
              <span
                key={item.key}
                aria-disabled="true"
                aria-label={label}
                title={title}
                className="studio-nav-item group flex h-14 min-w-[84px] cursor-not-allowed flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-bold opacity-45 lg:h-[52px] lg:min-w-0 lg:px-0 lg:text-[10.5px]"
              >
                <span className="studio-nav-icon-frame text-codex-faint">
                  <Icon aria-hidden="true" />
                </span>
                {railLabel && <span aria-hidden="true" className="studio-nav-item-label max-w-full truncate whitespace-nowrap text-center leading-tight">{railLabel}</span>}
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
              aria-label={label}
              className={`studio-nav-item group flex h-14 min-w-[84px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-bold transition-[background-color,color,box-shadow,border-color] duration-150 lg:h-[52px] lg:min-w-0 lg:px-0 lg:text-[10.5px] ${
                isActive
                  ? "studio-nav-item-active bg-white/80 text-[var(--codex-accent)] shadow-sm ring-1 ring-[var(--codex-accent-22)] dark:bg-white/10 dark:text-[#cfd8ff] dark:ring-[var(--codex-accent-40)]"
                  : "text-codex-muted hover:bg-white/70 hover:text-codex-ink dark:hover:bg-white/5 dark:hover:text-codex-muted"
              }`}
              title={featureTitle(t, item)}
              onClick={(event) => navigate(event, item.href)}
            >
              <span className={`studio-nav-icon-frame ${isActive ? "text-[var(--codex-accent)]" : "text-codex-faint group-hover:text-codex-ink"}`}>
                <Icon aria-hidden="true" />
                {item.badge && (
                  <StudioTabBadge variant="inline" className="studio-nav-item-badge">
                    {item.badge}
                  </StudioTabBadge>
                )}
              </span>
              {railLabel && <span aria-hidden="true" className="studio-nav-item-label max-w-full truncate whitespace-nowrap text-center leading-tight">{railLabel}</span>}
            </Link>
          );
        })}
      </div>
      <StudioNavFooter locale={locale} onNavigate={navigate} />
    </aside>
  );
}

function StudioNavFooter({
  locale,
  onNavigate,
}: {
  locale: string;
  onNavigate: (event: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const t = useTranslations("Header");
  const pathname = usePathname();
  const historyLabel = t("generationHistory");
  const resourceLabel = t("resourceLibrary");
  const isHistoryActive = pathname === "/history" || pathname.startsWith("/history/");
  const isResourceLibraryActive = pathname === "/resource-library" || pathname.startsWith("/resource-library/");

  return (
    <TooltipProvider delayDuration={320} skipDelayDuration={80}>
      <div className="studio-nav-footer hidden shrink-0 flex-col lg:flex">
        <div className="studio-nav-footer-divider" aria-hidden="true" />
        <Link href="/history" prefetch={false} className="studio-nav-footer-item" data-active={isHistoryActive || undefined} aria-current={isHistoryActive ? "page" : undefined} aria-label={historyLabel} title={historyLabel} onClick={(event) => onNavigate(event, "/history")}>
          <History aria-hidden="true" />
          <span aria-hidden="true" className="max-w-full truncate whitespace-nowrap">{compactRailLabel(historyLabel, locale)}</span>
        </Link>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href="/resource-library" prefetch={false} className="studio-nav-footer-item" data-active={isResourceLibraryActive || undefined} aria-current={isResourceLibraryActive ? "page" : undefined} aria-label={resourceLabel} title={resourceLabel} onClick={(event) => onNavigate(event, "/resource-library")}>
              <FolderOpen aria-hidden="true" />
              <span aria-hidden="true" className="max-w-full truncate whitespace-nowrap">{compactRailLabel(resourceLabel, locale)}</span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10} className="studio-nav-footer-tooltip">
            {resourceLabel}
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
