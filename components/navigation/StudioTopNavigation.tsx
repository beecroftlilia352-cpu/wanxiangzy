"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type AppModuleKey,
  VISIBLE_TOP_MODULES,
  getFeatureItemsForModule,
} from "@/lib/navigation";
import { StudioTabBadge } from "@/components/studio/StudioTabBadge";

const POINTER_OPEN_DELAY_MS = 130;
const POINTER_CLOSE_DELAY_MS = 110;
const EXIT_DURATION_MS = 150;
const SCROLL_GUARD_MS = 260;

export function StudioTopNavigation({ activeModule }: { activeModule: string }) {
  const t = useTranslations("Header");
  const tAny = useTranslations();
  const pathname = usePathname();
  const [renderedModule, setRenderedModule] = useState<AppModuleKey | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollAtRef = useRef(0);

  const activePopoverModule = useMemo(
    () => VISIBLE_TOP_MODULES.find((item) => item.key === renderedModule) ?? null,
    [renderedModule],
  );
  const popoverFeatures = useMemo(
    () => (renderedModule ? getFeatureItemsForModule(renderedModule) : []),
    [renderedModule],
  );
  const activeFeatureKey = useMemo(
    () => [...popoverFeatures]
      .sort((a, b) => b.href.length - a.href.length)
      .find((feature) => pathname === feature.href || pathname.startsWith(`${feature.href}/`))
      ?.key,
    [pathname, popoverFeatures],
  );

  function clearTimer(ref: typeof openTimerRef) {
    if (ref.current) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  }

  function reveal(module: AppModuleKey) {
    clearTimer(closeTimerRef);
    clearTimer(exitTimerRef);
    setRenderedModule(module);
    requestAnimationFrame(() => setIsOpen(true));
  }

  function requestPointerOpen(module: AppModuleKey) {
    clearTimer(openTimerRef);
    clearTimer(closeTimerRef);
    if (performance.now() - lastScrollAtRef.current < SCROLL_GUARD_MS) return;

    openTimerRef.current = setTimeout(() => {
      if (performance.now() - lastScrollAtRef.current >= SCROLL_GUARD_MS) reveal(module);
    }, POINTER_OPEN_DELAY_MS);
  }

  function requestClose(delay = POINTER_CLOSE_DELAY_MS) {
    clearTimer(openTimerRef);
    clearTimer(closeTimerRef);
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      clearTimer(exitTimerRef);
      exitTimerRef.current = setTimeout(() => setRenderedModule(null), EXIT_DURATION_MS);
    }, delay);
  }

  useEffect(() => {
    const guardAgainstScrollHover = () => {
      lastScrollAtRef.current = performance.now();
      clearTimer(openTimerRef);
      if (renderedModule) requestClose(0);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && renderedModule) {
        requestClose(0);
        navRef.current?.querySelector<HTMLElement>("[data-studio-module-active='true']")?.focus();
      }
    };

    window.addEventListener("wheel", guardAgainstScrollHover, { passive: true, capture: true });
    window.addEventListener("scroll", guardAgainstScrollHover, { passive: true, capture: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("wheel", guardAgainstScrollHover, true);
      window.removeEventListener("scroll", guardAgainstScrollHover, true);
      window.removeEventListener("keydown", onKeyDown);
      clearTimer(openTimerRef);
      clearTimer(closeTimerRef);
      clearTimer(exitTimerRef);
    };
    // Functions only operate on refs and state setters; renderedModule is needed
    // so a newly opened panel is dismissed as soon as scrolling begins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderedModule]);

  return (
    <nav
      ref={navRef}
      className="studio-top-navigation hidden items-center xl:flex"
      aria-label={t("mainNavAria")}
      onPointerEnter={() => clearTimer(closeTimerRef)}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse" || event.pointerType === "pen") requestClose();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) requestClose(60);
      }}
    >
      <div className="studio-top-navigation-track">
        {VISIBLE_TOP_MODULES.map((item, index) => {
          const showDivider = index > 0 && item.key === "works";
          const active = activeModule === item.key;
          const Icon = item.icon;

          return (
            <div key={item.key} className="studio-top-navigation-slot">
              {showDivider ? <span aria-hidden="true" className="studio-top-navigation-divider" /> : null}
              <Link
                href={item.href}
                className="studio-top-navigation-trigger"
                data-active={active ? "true" : "false"}
                data-studio-module-active={active ? "true" : undefined}
                aria-current={active ? "page" : undefined}
                aria-expanded={renderedModule === item.key && isOpen}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse" || event.pointerType === "pen") requestPointerOpen(item.key);
                }}
                onFocus={() => reveal(item.key)}
                onClick={() => requestClose(0)}
              >
                <Icon aria-hidden="true" />
                <span className="relative inline-flex">
                  {item.labelKey ? tAny(item.labelKey) : item.label}
                  {item.badge ? <StudioTabBadge decorative={false}>{item.badge}</StudioTabBadge> : null}
                </span>
              </Link>
            </div>
          );
        })}
      </div>

      {renderedModule && activePopoverModule ? (
        <div
          className="studio-top-navigation-popover"
          data-open={isOpen ? "true" : "false"}
          data-compact={popoverFeatures.length <= 3 ? "true" : "false"}
          aria-hidden={!isOpen}
          onPointerEnter={() => clearTimer(closeTimerRef)}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse" || event.pointerType === "pen") requestClose();
          }}
        >
          <div className="studio-top-navigation-popover-heading">
            <span>{activePopoverModule.labelKey ? tAny(activePopoverModule.labelKey) : activePopoverModule.label}</span>
            <ChevronRight aria-hidden="true" />
          </div>
          <div className="studio-top-navigation-feature-grid" data-compact={popoverFeatures.length <= 3 ? "true" : "false"}>
            {popoverFeatures.map((feature, index) => {
              const FeatureIcon = feature.icon;
              const featureActive = activeModule === feature.module && activeFeatureKey === feature.key;

              return (
                <Link
                  key={feature.key}
                  href={feature.href}
                  className="studio-top-navigation-feature"
                  data-active={featureActive ? "true" : "false"}
                  style={{ "--studio-popover-item-index": index } as CSSProperties}
                  onClick={() => requestClose(0)}
                  tabIndex={isOpen ? 0 : -1}
                >
                  <span className="studio-top-navigation-feature-icon">
                    <FeatureIcon aria-hidden="true" />
                  </span>
                  <span className="studio-top-navigation-feature-copy">
                    <span className="studio-top-navigation-feature-title">
                      {feature.labelKey ? tAny(feature.labelKey) : feature.label}
                      {feature.badge ? <StudioTabBadge variant="inline">{feature.badge}</StudioTabBadge> : null}
                    </span>
                    <span className="studio-top-navigation-feature-description">
                      {feature.labelKey ? tAny(feature.labelKey.replace(/\.label$/, ".description")) : feature.description}
                    </span>
                  </span>
                  {featureActive ? <Check className="studio-top-navigation-feature-check" aria-hidden="true" /> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
