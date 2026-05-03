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
      <div className="relative grid gap-5 sm:grid-cols-[168px_minmax(0,1fr)] sm:items-center">
        <div className="relative mx-auto flex h-48 w-36 items-end justify-center overflow-hidden rounded-[22px] border border-white/80 bg-slate-100 shadow-sm sm:mx-0">
          {imageSrc ? (
            <Image
              src={imageSrc}
              alt={imageAlt}
              fill
              sizes="160px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white/70 text-purple-400">
              {icon}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-normal text-purple-500">Preview Guide</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>

          <div className="mt-4 space-y-3">
            {steps.map((step, index) => (
              <div key={step.title} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white shadow-sm">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-950">{step.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
