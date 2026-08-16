"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, CheckCircle2, ImagePlus, X } from "lucide-react";
import { useTranslations } from "next-intl";

const STORAGE_KEY = "pxd-onboarding-done";
const AUTO_ADVANCE_MS = 8000;

const STEPS = [
  {
    icon: Camera,
    title: "上传素材",
    desc: "上传服装平铺图或模特图，系统自动识别版型、颜色与结构。",
  },
  {
    icon: ImagePlus,
    title: "选择参考",
    desc: "从场景库挑选拍摄参考，或上传你喜欢的参考图。",
  },
  {
    icon: CheckCircle2,
    title: "生成成片",
    desc: "点击底部「生成」按钮，灵点扣费后几秒到几分钟出片。",
  },
];

export type OnboardingCoachProps = {
  show: boolean;
  /** When true, the panel auto-advances to the next step after
   *  `AUTO_ADVANCE_MS` of inactivity (no hover, no focus, no click).
   *  Defaults to false — opt-in so the existing host sites don't change
   *  behavior. The create page sets this to true. */
  autoAdvance?: boolean;
};

/**
 * 新用户引导浮层：注册后首次进入创作页显示三步上手流程。
 * localStorage 记录完成状态，点「开始创作」或关闭后不再出现。
 *
 * Enhancement round:
 *   - Keyboard: ArrowLeft / ArrowRight move between steps; Esc dismisses;
 *     Enter on Next/Finish triggers the primary action.
 *   - Optional auto-advance (8s) that pauses on hover/focus/click.
 *   - Step navigation by clicking the progress bar (jump to step).
 *   - Auto-focus the primary action on mount so keyboard users land on the
 *     right control.
 */
export function OnboardingCoach({ show, autoAdvance = false }: OnboardingCoachProps) {
  const t = useTranslations("Shared");
  const [step, setStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  const dismiss = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, "1");
    }
    // 通过自定义事件通知宿主关闭
    window.dispatchEvent(new CustomEvent("pxd:onboarding-dismiss"));
  }, []);

  const advance = useCallback(() => {
    setStep((value) => Math.min(value + 1, STEPS.length - 1));
  }, []);

  useEffect(() => {
    if (!show) return;
    setStep(0);
  }, [show]);

  // Auto-focus primary action when shown so keyboard users land on it.
  useEffect(() => {
    if (!show) return;
    const id = window.setTimeout(() => primaryRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [show]);

  // Keyboard handlers at the dialog level so users don't have to focus
  // a specific element.
  useEffect(() => {
    if (!show) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setStep((value) => Math.min(value + 1, STEPS.length - 1));
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setStep((value) => Math.max(value - 1, 0));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, dismiss]);

  // Auto-advance on a long idle. Paused while user hovers/focuses/clicks
  // inside the dialog so we never move while they're reading.
  useEffect(() => {
    if (!show || !autoAdvance || isPaused) return;
    if (step >= STEPS.length - 1) return; // don't move past the last step
    const timer = window.setTimeout(() => advance(), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [show, autoAdvance, isPaused, step, advance]);

  if (!show) return null;
  const current = STEPS[step];
  const stepTitles = [t("onboardingUpload"), t("onboardingReference"), t("onboardingGenerate")];
  const stepDescs = [t("onboardingUploadDesc"), t("onboardingReferenceDesc"), t("onboardingGenerateDesc")];

  return (
    <div
      className="fixed inset-0 z-[260] flex items-end justify-center bg-codex-ink/45 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t("onboardingAria")}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        // Resume when focus leaves the dialog entirely.
        if (!dialogRef.current?.contains(event.relatedTarget as Node | null)) {
          setIsPaused(false);
        }
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-white/60 bg-white/95 p-6 shadow-[0_32px_90px_rgba(15,23,42,0.3)] dark:border-white/10 dark:bg-[var(--codex-surface)]/95 motion-reduce:transition-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--codex-accent)]">{t("quickStart")}</p>
            <h2 className="mt-1.5 text-xl font-black text-[var(--codex-ink)]">{t("onboardingTitle")}</h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("closeGuide")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--codex-faint)] transition hover:bg-[var(--codex-surface-soft)] hover:text-[var(--codex-ink)] dark:hover:bg-[var(--codex-surface-strong)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 步骤进度 — clickable so users can jump directly to any step */}
        <div className="mt-4 flex gap-1.5" role="tablist" aria-label={t("onboardingAria")}>
          {STEPS.map((stepDef, index) => {
            const reached = index <= step;
            return (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={index === step}
                aria-label={stepTitles[index]}
                onClick={() => setStep(index)}
                className={`h-1 flex-1 rounded-full transition-colors duration-150 ${reached ? "bg-[var(--codex-accent)]" : "bg-[var(--codex-border)] dark:bg-[var(--codex-surface-strong)]"}`}
              />
            );
          })}
        </div>

        {/* 步骤卡 */}
        <div className="mt-5 flex gap-4 rounded-2xl border border-[var(--codex-border)] bg-[var(--codex-surface-soft)] p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--codex-accent-12)] text-[var(--codex-accent)]">
            <current.icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-[var(--codex-ink)]">{t("stepCount", { step: step + 1, title: stepTitles[step] })}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--codex-muted)]">{stepDescs[step]}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-[var(--codex-faint)]">{step + 1} / {STEPS.length}</span>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((value) => value - 1)}
                className="inline-flex h-10 items-center rounded-full border border-[var(--codex-border)] bg-[var(--codex-surface)] px-4 text-sm font-bold text-[var(--codex-muted)] transition hover:text-[var(--codex-ink)]"
              >
                {t("prevStep")}
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                ref={primaryRef}
                type="button"
                onClick={() => setStep((value) => value + 1)}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--codex-accent)] px-5 text-sm font-black text-white shadow-[0_8px_20px_var(--codex-accent-30)] transition hover:opacity-90"
              >
                {t("nextStep")}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                ref={primaryRef}
                type="button"
                onClick={dismiss}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--codex-accent)] px-5 text-sm font-black text-white shadow-[0_8px_20px_var(--codex-accent-30)] transition hover:opacity-90"
              >
                {t("startCreating")}
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 是否已看过引导 */
export function hasSeenOnboarding() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === "1";
}
