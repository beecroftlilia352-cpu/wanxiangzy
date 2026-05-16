import Image from "next/image";
import type { ReactNode } from "react";

type PreviewGuideStep = {
  title: string;
  desc: string;
};

type PreviewGuideProps = {
  title: string;
  subtitle: string;
  steps: PreviewGuideStep[];
  imageSrc?: string;
  imageAlt?: string;
  icon?: ReactNode;
};

export function PreviewGuide({
  title,
  subtitle,
  steps,
  imageSrc,
  imageAlt = "",
  icon,
}: PreviewGuideProps) {
  return (
    <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/80 bg-white/76 p-4 shadow-[0_24px_76px_rgba(15,23,42,0.12)] backdrop-blur-2xl sm:p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(168,85,247,0.13),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.9),rgba(255,255,255,0.58))]" />
      <div className="relative flex gap-4 sm:grid sm:grid-cols-[168px_minmax(0,1fr)] sm:gap-5 sm:items-center">
        <div className="relative flex-shrink-0 flex h-28 w-20 items-end justify-center overflow-hidden rounded-[18px] border border-white/80 bg-slate-100 shadow-sm sm:mx-0 sm:h-48 sm:w-36 sm:rounded-[22px]">
          {imageSrc ? (
            <Image
              src={imageSrc}
              alt={imageAlt}
              fill
              sizes="(max-width: 639px) 80px, 168px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white/70 text-[var(--codex-accent)]">
              {icon}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-normal text-[var(--codex-accent)] sm:text-[11px]">Preview Guide</p>
          <h3 className="mt-1 text-base font-black text-slate-950 sm:text-lg">{title}</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500 sm:mt-1 sm:text-xs sm:leading-5">{subtitle}</p>

          <div className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-3">
            {steps.map((step, index) => (
              <div key={step.title} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 sm:grid-cols-[24px_minmax(0,1fr)] sm:gap-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-950 text-[10px] font-black text-white shadow-sm sm:h-6 sm:w-6 sm:text-xs">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-950 sm:text-sm">{step.title}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500 sm:mt-1 sm:text-xs sm:leading-5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
