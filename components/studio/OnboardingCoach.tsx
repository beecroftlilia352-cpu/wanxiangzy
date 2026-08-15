"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Camera, CheckCircle2, ImagePlus, X } from "lucide-react";
import { useTranslations } from "next-intl";

const STORAGE_KEY = "pxd-onboarding-done";

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

/**
 * 新用户引导浮层：注册后首次进入创作页显示三步上手流程。
 * localStorage 记录完成状态，点「开始创作」或关闭后不再出现。
 */
export function OnboardingCoach({ show }: { show: boolean }) {
  const t = useTranslations("Shared");
  const [step, setStep] = useState(0);

  function dismiss() {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, "1");
    }
    // 通过自定义事件通知宿主关闭
    window.dispatchEvent(new CustomEvent("pxd:onboarding-dismiss"));
  }

  useEffect(() => {
    if (!show) return;
    setStep(0);
  }, [show]);

  if (!show) return null;
  const current = STEPS[step];
  const stepTitles = [t("onboardingUpload"), t("onboardingReference"), t("onboardingGenerate")];
  const stepDescs = [t("onboardingUploadDesc"), t("onboardingReferenceDesc"), t("onboardingGenerateDesc")];

  return (
    <div className="fixed inset-0 z-[260] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label={t("onboardingAria")}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/60 bg-white/95 p-6 shadow-[0_32px_90px_rgba(15,23,42,0.3)] dark:border-white/10 dark:bg-stone-900/95">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--codex-accent)]">{t("quickStart")}</p>
            <h2 className="mt-1.5 text-xl font-black text-[var(--codex-ink)]">{t("onboardingTitle")}</h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("closeGuide")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--codex-faint)] transition hover:bg-slate-100 hover:text-[var(--codex-ink)] dark:hover:bg-stone-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 步骤进度 */}
        <div className="mt-4 flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={`h-1 flex-1 rounded-full transition-colors duration-150 ${index <= step ? "bg-[var(--codex-accent)]" : "bg-slate-200 dark:bg-stone-700"}`}
            />
          ))}
        </div>

        {/* 步骤卡 */}
        <div className="mt-5 flex gap-4 rounded-2xl border border-[var(--codex-border)] bg-[var(--codex-surface-soft)] p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(91,124,255,0.12)] text-[var(--codex-accent)]">
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
                type="button"
                onClick={() => setStep((value) => value + 1)}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--codex-accent)] px-5 text-sm font-black text-white shadow-[0_8px_20px_rgba(91,124,255,0.3)] transition hover:opacity-90"
              >
                {t("nextStep")}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={dismiss}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--codex-accent)] px-5 text-sm font-black text-white shadow-[0_8px_20px_rgba(91,124,255,0.3)] transition hover:opacity-90"
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
