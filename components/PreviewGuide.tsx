import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PreviewGuideStep = {
  title: string;
  desc: string;
  imageSrc?: string;
  imageAlt?: string;
  imageFit?: "cover" | "contain";
  badge?: string;
};

type PreviewGuideProps = {
  title: string;
  subtitle: string;
  steps: PreviewGuideStep[];
  imageSrc?: string;
  imageAlt?: string;
  icon?: ReactNode;
  actions?: ReactNode;
};

export function PreviewGuide({
  title,
  subtitle,
  steps,
  imageSrc,
  imageAlt = "",
  icon,
  actions,
}: PreviewGuideProps) {
  const stepGridClass = steps.length >= 4
    ? "sm:grid-cols-2 lg:grid-cols-4"
    : steps.length === 2
      ? "sm:grid-cols-2"
    : "sm:grid-cols-3";
  const visualGridWidthClass = steps.length >= 4
    ? ""
    : steps.length === 2
      ? "mx-auto max-w-[720px]"
      : "mx-auto max-w-[900px]";
  const connectorVisibilityClass = steps.length >= 4 ? "lg:flex" : "sm:flex";

  return (
    <div className="relative mx-auto w-full max-w-[1080px] px-1 py-3 text-center sm:px-3 sm:py-6">
      <div className="pointer-events-none absolute inset-x-10 top-16 h-40 rounded-full bg-[radial-gradient(circle,rgba(91,124,255,0.16),transparent_68%)] blur-3xl" />
      <div className="relative">
        <h3 className="bg-[linear-gradient(135deg,#3f5dff_0%,#6d8dff_45%,#aeb8ff_100%)] bg-clip-text text-[24px] font-black tracking-[-0.02em] text-transparent dark:bg-[linear-gradient(135deg,#8fa8ff_0%,#b8c6ff_55%,#dbe4ff_100%)] sm:text-[34px] lg:text-[38px]" style={{ textWrap: "balance" }}>{title}</h3>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-500 dark:text-stone-400 sm:text-[15px]">{subtitle}</p>

        <div className="mt-8 overflow-hidden rounded-[32px] border border-white/80 dark:border-white/10 bg-white/95 dark:bg-white/5 px-4 py-7 text-left shadow-[0_28px_90px_rgba(91,124,255,0.12),0_8px_26px_rgba(15,23,42,0.06)] ring-1 ring-slate-950/[0.03] dark:ring-white/5 backdrop-blur sm:px-7 sm:py-8">
          <div className={`grid grid-cols-1 gap-5 sm:gap-8 ${stepGridClass} ${visualGridWidthClass}`}>
            {steps.map((step, index) => {
              const hasImage = Boolean(step.imageSrc || imageSrc);
              const isContain = step.imageFit === "contain";

              return (
                <div key={step.title} className="group relative min-w-0">
                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-slate-100 to-slate-200 p-px shadow-[0_18px_42px_rgba(15,23,42,0.08)] transition-[transform,box-shadow] duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_24px_54px_rgba(91,124,255,0.14)] dark:from-stone-800 dark:via-stone-900 dark:to-black">
                    <div
                      className={cn(
                        "relative aspect-[4/5] overflow-hidden rounded-[21px]",
                        isContain
                          ? "bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_55%,#eef4ff_100%)] dark:bg-[linear-gradient(135deg,#1c1c1e_0%,#26262a_55%,#1c1c1e_100%)]"
                          : "bg-slate-100 dark:bg-stone-800"
                      )}
                    >
                      {hasImage ? (
                        <Image
                          src={step.imageSrc || imageSrc || ""}
                          alt={step.imageAlt || imageAlt || step.title}
                          fill
                          sizes="(max-width: 640px) 86vw, (max-width: 1024px) 42vw, 250px"
                          className={cn(
                            "transition duration-300 group-hover:scale-[1.025]",
                            isContain ? "object-contain p-5 sm:p-6" : "object-cover object-top"
                          )}
                        />
                      ) : (
                        <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#f8fbff,#eef3ff)] dark:bg-[linear-gradient(135deg,#1c1c1e,#26262a)]">
                          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_18%,rgba(91,124,255,0.16),transparent_52%),radial-gradient(circle_at_76%_72%,rgba(174,184,255,0.16),transparent_48%)]" />
                          <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white/72 text-3xl font-black text-[var(--codex-accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_12px_28px_rgba(91,124,255,0.16)] backdrop-blur-sm dark:bg-white/8 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(0,0,0,0.35)]">
                            {icon || index + 1}
                          </span>
                        </div>
                      )}
                      <span className="absolute left-3 top-3 inline-flex h-7 items-center gap-1 rounded-lg border border-[rgba(91,124,255,0.28)] bg-[rgba(91,124,255,0.1)] px-2.5 text-[11px] font-black leading-none text-[var(--codex-accent)] backdrop-blur-sm">
                        {step.badge || `步骤 ${index + 1}`}
                      </span>
                    </div>
                  </div>
                  {index < steps.length - 1 ? (
                    <div className={cn(
                      "pointer-events-none absolute right-[-27px] top-[38%] z-10 hidden h-9 w-9 items-center justify-center rounded-full border-[3px] border-white dark:border-stone-900 bg-[var(--codex-accent)] text-white shadow-[0_16px_34px_rgba(91,124,255,0.28)]",
                      connectorVisibilityClass
                    )}>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-center justify-center gap-2 text-center">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 px-2 text-[11px] font-black text-slate-500 dark:text-stone-400">
                      {index + 1}
                    </span>
                    <p className="min-w-0 truncate text-[14px] font-black text-slate-950 dark:text-stone-100 sm:text-[15px]">{step.title}</p>
                  </div>
                  {step.desc ? (
                    <p className="mx-auto mt-1.5 max-w-[220px] text-center text-[12px] font-semibold leading-5 text-slate-500 dark:text-stone-400">
                      {step.desc}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {actions && <div className="mt-7 flex flex-wrap justify-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
