"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { getFeatureItem, getFeatureItemsForModule, type FeatureKey } from "@/lib/navigation";

export function FeatureTabs({ active }: { active: FeatureKey }) {
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
    <aside className="studio-nav-rail w-full max-w-[100vw] shrink-0 overflow-hidden border-b px-2 py-2 lg:h-full lg:w-[112px] lg:max-w-none lg:border-b-0 lg:border-r lg:px-2 lg:py-4">
      <div ref={scrollerRef} className="flex w-full items-center gap-1 overflow-x-auto overscroll-x-contain pb-1 lg:h-full lg:flex-col lg:items-stretch lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          const title = item.disabled ? item.disabledReason || item.description : item.description;

          if (item.disabled) {
            return (
              <span
                key={item.key}
                aria-disabled="true"
                title={title}
                className="studio-nav-item group flex h-14 min-w-[92px] cursor-not-allowed flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[10px] font-black opacity-45 lg:h-[72px] lg:min-w-0"
              >
                <span className="relative flex h-6 w-6 items-center justify-center text-codex-faint">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="max-w-full text-center leading-tight [overflow-wrap:anywhere]">{item.label}</span>
                <span className="text-[8px] font-bold text-codex-faint">{item.disabledReason}</span>
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
              className={`studio-nav-item group flex h-14 min-w-[92px] flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[10px] font-black transition-[background-color,color,box-shadow,border-color] duration-150 lg:h-[72px] lg:min-w-0 ${
                isActive
                  ? "studio-nav-item-active bg-white/80 text-[var(--codex-accent)] shadow-sm ring-1 ring-[rgba(91,124,255,0.22)] dark:bg-white/10 dark:text-[#cfd8ff] dark:ring-[rgba(91,140,255,0.40)]"
                  : "text-codex-muted hover:bg-white/70 hover:text-codex-ink dark:text-stone-400 dark:hover:bg-white/5 dark:hover:text-stone-200"
              }`}
              title={item.description}
            >
              <span className={`relative flex h-6 w-6 items-center justify-center ${isActive ? "text-[var(--codex-accent)]" : "text-codex-faint group-hover:text-codex-ink"}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="max-w-full text-center leading-tight [overflow-wrap:anywhere]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
