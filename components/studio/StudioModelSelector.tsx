"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Check, ChevronRight, CircleHelp, ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { useVisibleImageModels } from "@/lib/use-visible-image-models";
import { cn } from "@/lib/utils";

export type StudioModelOption<T extends string = string> = {
  value: T;
  label: string;
  labelKey?: string;
  desc: string;
  descKey?: string;
  icon?: string;
  badge?: string;
  badgeKey?: string;
  disabled?: boolean;
};

export type StudioModelSelectorProps<T extends string> = {
  models: readonly StudioModelOption<T>[];
  value: T;
  onChange: (value: T) => void;
  getMeta?: (model: StudioModelOption<T>) => ReactNode;
  title?: ReactNode;
  ariaLabel?: string;
  className?: string;
  /** Retained for source compatibility; the screenshot layout is responsive. */
  columns?: 1 | 2;
};

const CLOSE_DELAY_MS = 120;
const HOVER_OPEN_DELAY_MS = 120;
const SCROLL_HOVER_COOLDOWN_MS = 320;

export function StudioModelSelector<T extends string>({
  models,
  value,
  onChange,
  getMeta,
  title,
  ariaLabel,
  className,
}: StudioModelSelectorProps<T>) {
  const t = useTranslations();
  const { visibleModels, isReady } = useVisibleImageModels();
  const visibleOptions = useMemo(() => {
    if (!isReady || !visibleModels) return models;
    return models.filter((model) => visibleModels.has(model.value));
  }, [isReady, models, visibleModels]);

  useEffect(() => {
    if (!isReady || visibleOptions.length === 0) return;
    if (!visibleOptions.some((model) => model.value === value)) {
      onChange(visibleOptions[0].value);
    }
  }, [isReady, onChange, value, visibleOptions]);

  const [open, setOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerOpenBlockedUntilRef = useRef(0);
  const keyboardOpenRef = useRef(false);
  const suppressTriggerFocusRef = useRef(false);

  const selectedIndex = Math.max(0, visibleOptions.findIndex((model) => model.value === value));
  const selectedModel = visibleOptions[selectedIndex];
  const resolvedTitle = title ?? t("Shared.modelPickerTitle");
  const resolvedAriaLabel = ariaLabel ?? (typeof resolvedTitle === "string" ? resolvedTitle : t("Shared.modelPickerTitle"));
  const selectedLabel = selectedModel?.labelKey
    ? t(selectedModel.labelKey)
    : selectedModel?.label;
  const selectedDescription = selectedModel?.descKey
    ? t(selectedModel.descKey)
    : selectedModel?.desc;
  const selectedBadge = selectedModel?.badgeKey
    ? t(selectedModel.badgeKey)
    : selectedModel?.badge;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const closeNow = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    keyboardOpenRef.current = false;
    setOpen(false);
  }, [clearCloseTimer, clearOpenTimer]);

  const closeWhenFocusLeaves = (event: FocusEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (
      nextTarget instanceof Node
      && (triggerRef.current?.contains(nextTarget) || popoverRef.current?.contains(nextTarget))
    ) {
      clearCloseTimer();
      return;
    }
    closeNow();
  };

  useEffect(() => () => {
    clearOpenTimer();
    clearCloseTimer();
  }, [clearCloseTimer, clearOpenTimer]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsCompact(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const suspendPointerOpen = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && popoverRef.current?.contains(target)) return;
      pointerOpenBlockedUntilRef.current = Date.now() + SCROLL_HOVER_COOLDOWN_MS;
      clearOpenTimer();
      clearCloseTimer();
      keyboardOpenRef.current = false;
      setOpen(false);
    };

    document.addEventListener("scroll", suspendPointerOpen, true);
    document.addEventListener("wheel", suspendPointerOpen, { capture: true, passive: true });
    document.addEventListener("touchmove", suspendPointerOpen, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", suspendPointerOpen, true);
      document.removeEventListener("wheel", suspendPointerOpen, true);
      document.removeEventListener("touchmove", suspendPointerOpen, true);
    };
  }, [clearCloseTimer, clearOpenTimer]);

  const openFromPointer = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") return;
    clearCloseTimer();
    clearOpenTimer();
    if (Date.now() < pointerOpenBlockedUntilRef.current) return;
    openTimerRef.current = setTimeout(() => {
      keyboardOpenRef.current = false;
      setOpen(true);
    }, HOVER_OPEN_DELAY_MS);
  };

  const openFromKeyboard = () => {
    if (suppressTriggerFocusRef.current) return;
    clearOpenTimer();
    clearCloseTimer();
    keyboardOpenRef.current = true;
    setOpen(true);
  };

  const closeAndRestoreFocus = () => {
    suppressTriggerFocusRef.current = true;
    keyboardOpenRef.current = false;
    setOpen(false);
    triggerRef.current?.focus();
    queueMicrotask(() => {
      suppressTriggerFocusRef.current = false;
    });
  };

  const focusOption = (index: number) => {
    const nextIndex = (index + visibleOptions.length) % visibleOptions.length;
    optionRefs.current[nextIndex]?.focus();
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        focusOption(index + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        focusOption(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusOption(0);
        break;
      case "End":
        event.preventDefault();
        focusOption(visibleOptions.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        closeAndRestoreFocus();
        break;
    }
  };

  if (!selectedModel) return null;

  return (
    <section
      className={cn("studio-model-selector", className)}
      onPointerLeave={() => {
        clearOpenTimer();
        scheduleClose();
      }}
      onFocus={clearCloseTimer}
      onBlur={closeWhenFocusLeaves}
    >
      <div className="studio-model-selector-heading">
        <h3 className="studio-model-selector-title">
          <span aria-hidden="true" className="studio-model-selector-title-mark" />
          <span className="studio-model-selector-title-text">{resolvedTitle}</span>
        </h3>
        <span className="studio-model-selector-help" title={resolvedAriaLabel} aria-hidden="true">
          <CircleHelp />
        </span>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className="studio-model-selector-trigger"
            aria-label={resolvedAriaLabel}
            onPointerEnter={openFromPointer}
            onFocus={openFromKeyboard}
            onClick={(event) => {
              event.preventDefault();
              openFromKeyboard();
            }}
            onKeyDown={(event) => {
              if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
                event.preventDefault();
                openFromKeyboard();
              }
            }}
          >
            <span className="studio-model-selector-trigger-visual" aria-hidden="true">
              {selectedModel.icon ? (
                <RawPreviewImage src={selectedModel.icon} alt="" eager disableFade draggable={false} />
              ) : (
                <ImageIcon />
              )}
            </span>
            <span className="studio-model-selector-trigger-copy">
              <span className="studio-model-selector-trigger-heading">
                <span className="studio-model-selector-trigger-label">{selectedLabel}</span>
                {selectedBadge ? (
                  <span className="studio-model-selector-badge studio-model-selector-trigger-badge">
                    {selectedBadge}
                  </span>
                ) : null}
              </span>
              <span className="studio-model-selector-trigger-description">{selectedDescription}</span>
            </span>
            <ChevronRight className="studio-model-selector-trigger-chevron" aria-hidden="true" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          ref={popoverRef}
          side={isCompact ? "bottom" : "right"}
          align="center"
          sideOffset={10}
          collisionPadding={12}
          className="studio-model-selector-popover"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (!keyboardOpenRef.current) return;
            keyboardOpenRef.current = false;
            queueMicrotask(() => optionRefs.current[selectedIndex]?.focus());
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerEnter={(event) => {
            if (event.pointerType !== "mouse") return;
            clearOpenTimer();
            clearCloseTimer();
          }}
          onPointerLeave={closeNow}
          onFocusCapture={clearCloseTimer}
          onBlurCapture={closeWhenFocusLeaves}
        >
          <h4 className="studio-model-selector-popover-title">{t("Shared.modelPickerRecommended")}</h4>
          <div className="studio-model-selector-popover-divider" />
          <div className="studio-model-selector-options" role="radiogroup" aria-label={resolvedAriaLabel}>
            {visibleOptions.map((model, index) => {
              const selected = model.value === value;
              const modelLabel = model.labelKey ? t(model.labelKey) : model.label;
              const modelDescription = model.descKey ? t(model.descKey) : model.desc;
              const modelBadge = model.badgeKey ? t(model.badgeKey) : model.badge;
              const meta = getMeta?.(model);

              return (
                <button
                  key={model.value}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={model.disabled}
                  className={cn("studio-model-selector-option", selected && "studio-model-selector-option-selected")}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  onClick={() => {
                    if (model.disabled) return;
                    onChange(model.value);
                    closeAndRestoreFocus();
                  }}
                >
                  <span className="studio-model-selector-option-visual" aria-hidden="true">
                    {model.icon ? (
                      <RawPreviewImage src={model.icon} alt="" eager disableFade draggable={false} />
                    ) : (
                      <ImageIcon />
                    )}
                  </span>
                  <span className="studio-model-selector-option-copy">
                    <span className="studio-model-selector-option-heading">
                      <span className="studio-model-selector-option-name">{modelLabel}</span>
                      {modelBadge ? (
                        <span className="studio-model-selector-badge studio-model-selector-option-badge">
                          {modelBadge}
                        </span>
                      ) : null}
                    </span>
                    <span className="studio-model-selector-option-description">{modelDescription}</span>
                    {meta ? <span className="studio-model-selector-option-meta">{meta}</span> : null}
                  </span>
                  {selected ? (
                    <span className="studio-model-selector-option-check" aria-hidden="true">
                      <Check />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </section>
  );
}
