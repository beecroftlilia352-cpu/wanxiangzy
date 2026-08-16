"use client";

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, RotateCcw, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ClientPortal } from "@/components/ClientPortal";
import type {
  ImageTranslationLanguageConfig,
  ImageTranslationLanguageCode,
} from "@/lib/image-translation";
import { flattenImageTranslationLanguages } from "@/lib/image-translation";
import { cn } from "@/lib/utils";

const DRAWER_EXIT_MS = 180;
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type DrawerBounds = Pick<CSSProperties, "inset" | "top" | "right" | "bottom" | "left">;

export type LanguagePickerModalProps = {
  open: boolean;
  onClose: () => void;
  config: ImageTranslationLanguageConfig;
  selected: string[];
  onChange: (next: string[]) => void;
  title?: string;
  description?: string;
  triggerRef?: RefObject<HTMLElement | null>;
  /** Desktop drawer starts at the right edge of this element. */
  anchorSelector?: string;
  /** 最大可选语种数 */
  maxCount?: number;
};

export function LanguagePickerModal({
  open,
  onClose,
  config,
  selected,
  onChange,
  title,
  description,
  triggerRef,
  anchorSelector = ".studio-parameters",
  maxCount,
}: LanguagePickerModalProps) {
  const t = useTranslations("Shared");
  const resolvedTitle = title ?? t("allLanguages");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const [bounds, setBounds] = useState<DrawerBounds>({ inset: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const requestClose = useCallback(() => onCloseRef.current(), []);

  const allLanguages = useMemo(() => flattenImageTranslationLanguages(config), [config]);
  const languagesByCode = useMemo(
    () => new Map(allLanguages.map((language) => [language.code, language])),
    [allLanguages]
  );
  const selectedLanguages = useMemo(
    () => selected
      .map((code) => languagesByCode.get(code))
      .filter((language): language is ImageTranslationLanguageCode => Boolean(language)),
    [languagesByCode, selected]
  );

  const updateBounds = useCallback(() => {
    if (window.innerWidth < 1024) {
      setBounds({ inset: 0 });
      return;
    }

    const anchor = document.querySelector<HTMLElement>(anchorSelector);
    const workbench = anchor?.closest<HTMLElement>(".studio-workbench");
    if (!anchor || !workbench) {
      setBounds({ inset: 0 });
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const workbenchRect = workbench.getBoundingClientRect();
    setBounds({
      inset: "auto",
      top: Math.max(0, workbenchRect.top),
      right: Math.max(0, window.innerWidth - workbenchRect.right),
      bottom: Math.max(0, window.innerHeight - workbenchRect.bottom),
      left: Math.max(0, anchorRect.right),
    });
  }, [anchorSelector]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }

    setEntered(false);
    const timeout = window.setTimeout(() => setMounted(false), DRAWER_EXIT_MS);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return;

    returnFocusRef.current = triggerRef?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setQuery("");
    updateBounds();
    const anchor = document.querySelector<HTMLElement>(anchorSelector);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateBounds);
    if (anchor) resizeObserver?.observe(anchor);
    window.addEventListener("resize", updateBounds);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      setEntered(true);
    });
    const focusTimeout = window.setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 100);

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    };
    document.addEventListener("keydown", handleEscape);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(focusTimeout);
      window.removeEventListener("resize", updateBounds);
      resizeObserver?.disconnect();
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, [anchorSelector, mounted, open, requestClose, triggerRef, updateBounds]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRegions = useMemo(() => {
    if (!normalizedQuery) return config;
    return config
      .map((region) => ({
        ...region,
        children: region.children
          .map((group) =>
            group.filter(
              (entry) =>
                entry.label.toLowerCase().includes(normalizedQuery) ||
                (entry.enLabel && entry.enLabel.toLowerCase().includes(normalizedQuery))
            )
          )
          .filter((group) => group.length > 0),
      }))
      .filter((region) => region.children.length > 0);
  }, [config, normalizedQuery]);

  const max = maxCount ?? 0;
  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter((item) => item !== code));
      return;
    }
    if (max > 0 && selected.length >= max) return;
    onChange([...selected, code]);
  };

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!mounted) return null;

  return (
    <ClientPortal>
      <div
        className="studio-language-drawer-layer"
        data-state={entered && open ? "open" : "closed"}
        style={bounds}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={resolvedTitle}
          className="studio-language-drawer-panel"
          onKeyDown={trapFocus}
        >
          <header className="studio-language-drawer-header">
            <div className="min-w-0">
              <h2>{resolvedTitle}</h2>
              {description ? <p className="sr-only">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label={t("close")}
              className="studio-language-drawer-close"
            >
              <X aria-hidden="true" />
            </button>
          </header>

          <div className="studio-language-drawer-tools">
            <label className="studio-language-drawer-search">
              <Search aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchTargetLanguage")}
                aria-label={t("searchTargetLanguage")}
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label={t("clearInput")}>
                  <X aria-hidden="true" />
                </button>
              ) : null}
            </label>

            {selected.length ? <div className="studio-language-drawer-selection" aria-live="polite">
              <span className="studio-language-drawer-selection-label">
                {max > 0
                  ? t("selectedCountMax", { count: selected.length, max })
                  : t("selectedCount", { count: selected.length })}
              </span>
              <div className="studio-language-drawer-selected-list">
                {selectedLanguages.map((language) => (
                  <button
                    key={language.code}
                    type="button"
                    onClick={() => toggle(language.code)}
                    className="studio-language-drawer-selected-chip"
                    aria-label={`${t("clear")} ${language.label}`}
                  >
                    <span>{language.label}</span>
                    <span>{language.enLabel}</span>
                    <X aria-hidden="true" />
                  </button>
                ))}
              </div>
              <button type="button" className="studio-language-drawer-reset" onClick={() => onChange([])}>
                <RotateCcw aria-hidden="true" />
                {t("clear")}
              </button>
            </div> : null}
          </div>

          <div className="studio-language-drawer-content" style={{ scrollbarGutter: "stable" }}>
            {filteredRegions.map((region) => {
              const isCollapsed = collapsed[region.label] === true && !normalizedQuery;
              return (
                <section key={region.label} className="studio-language-region">
                  <button
                    type="button"
                    onClick={() => setCollapsed((previous) => ({ ...previous, [region.label]: !previous[region.label] }))}
                    className="studio-language-region-heading"
                    aria-expanded={!isCollapsed}
                  >
                    <span>{region.label}</span>
                    <ChevronDown className={cn(isCollapsed && "-rotate-90")} aria-hidden="true" />
                  </button>
                  {!isCollapsed ? (
                    <div className="studio-language-region-groups">
                      {region.children.map((group, groupIndex) => {
                        const languages = group
                          .map((entry) => languagesByCode.get((entry.enLabel && entry.enLabel.trim()) || entry.label.trim()))
                          .filter((language): language is ImageTranslationLanguageCode => Boolean(language));
                        if (!languages.length) return null;
                        return (
                          <div
                            key={`${region.label}-${groupIndex}-${languages[0]?.code || groupIndex}`}
                            className="studio-language-drawer-grid"
                          >
                            {languages.map((language) => {
                              const checked = selected.includes(language.code);
                              const disabled = max > 0 && !checked && selected.length >= max;
                              return (
                                <LanguageChip
                                  key={language.code}
                                  lang={language}
                                  checked={checked}
                                  disabled={disabled}
                                  onToggle={() => toggle(language.code)}
                                />
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}

            {filteredRegions.length === 0 ? (
              <p className="studio-language-drawer-empty">{t("noLanguageMatch")}</p>
            ) : null}
          </div>

          <footer className="studio-language-drawer-footer">
            <p>{t("languageFooter", { max: max || "20" })}</p>
            <button type="button" onClick={requestClose}>{t("doneSelecting")}</button>
          </footer>
        </div>
      </div>
    </ClientPortal>
  );
}

function LanguageChip({
  lang,
  checked,
  disabled,
  onToggle,
}: {
  lang: ImageTranslationLanguageCode;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={checked}
      className={cn("studio-language-card", checked && "is-selected", disabled && "is-disabled")}
    >
      <span>{lang.label}</span>
      <span title={lang.enLabel}>{lang.enLabel}</span>
      {checked ? (
        <span className="studio-language-card-check">
          <Check aria-hidden="true" />
        </span>
      ) : null}
    </button>
  );
}
