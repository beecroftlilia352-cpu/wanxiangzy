"use client";

import { Check, ChevronRight, ImagePlus, Layers3, Loader2, Plus, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { GenerationCountField } from "@/components/studio/GenerationCountField";
import { getImageVariantUrl } from "@/lib/image-variants";
import type { ProductSetImageType, ProductSetTemplate } from "@/lib/product-set";

const interactiveRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2";

export function ProductModeTabs({ imageType, onChange }: { imageType: ProductSetImageType; onChange: (value: ProductSetImageType) => void }) {
  const t = useTranslations("ProductSet");
  const options: Array<{ value: ProductSetImageType; title: string; desc: string }> = [
    { value: "main", title: t("create.modeTab.mainTitle"), desc: t("create.modeTab.mainDesc") },
    { value: "details", title: t("create.modeTab.detailsTitle"), desc: t("create.modeTab.detailsDesc") },
  ];

  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-1.5 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="grid grid-cols-2 items-stretch gap-1.5" role="tablist" aria-label={t("create.modeTab.ariaLabel")}>
        {options.map((item) => {
          const selected = imageType === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(item.value)}
              className={`flex h-14 items-center gap-2.5 rounded-2xl border px-3 text-left transition-[border-color,background-color,color,box-shadow] ${interactiveRing} ${
                selected
                  ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-slate-950 shadow-[0_10px_26px_rgba(124,58,237,0.12)] dark:border-[rgba(91,140,255,0.45)] dark:bg-[rgba(91,140,255,0.18)] dark:text-stone-100"
                  : "border-transparent bg-white/70 text-slate-600 hover:border-[rgba(91,124,255,0.3)] hover:bg-white hover:text-[var(--codex-accent)] dark:bg-white/5 dark:text-stone-300 dark:hover:border-[rgba(91,140,255,0.45)] dark:hover:bg-white/10"
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                selected
                  ? "border-[rgba(91,124,255,0.22)] bg-white text-[var(--codex-accent)] dark:bg-white/10 dark:text-[#cfd8ff]"
                  : "border-slate-100 bg-white text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-stone-500"
              }`}>
                {item.value === "main" ? <ImagePlus aria-hidden="true" className="h-4 w-4" /> : <Layers3 aria-hidden="true" className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black">{item.title}</span>
                <span className={`mt-0.5 block truncate text-[11px] ${selected ? "text-[var(--codex-accent)] dark:text-[#cfd8ff]" : "text-slate-400 dark:text-stone-500"}`}>{item.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WorkflowStepper({ currentStep }: { currentStep: number }) {
  const t = useTranslations("ProductSet");
  const steps = [
    { value: 1, title: t("create.stepper.step1Title"), desc: t("create.stepper.step1Desc") },
    { value: 2, title: t("create.stepper.step2Title"), desc: t("create.stepper.step2Desc") },
    { value: 3, title: t("create.stepper.step3Title"), desc: t("create.stepper.step3Desc") },
    { value: 4, title: t("create.stepper.step4Title"), desc: t("create.stepper.step4Desc") },
  ];

  return (
    <nav className="rounded-2xl border border-slate-100 bg-white px-3 py-3 shadow-sm dark:border-white/10 dark:bg-white/5" aria-label={t("create.stepper.ariaLabel")}>
      <ol className="grid grid-cols-4 gap-1.5">
        {steps.map((step) => {
          const active = currentStep === step.value;
          const done = currentStep > step.value;
          return (
            <li
              key={step.value}
              aria-current={active ? "step" : undefined}
              className={`min-h-14 rounded-xl px-2 py-2 text-center ${
                active ? "bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : done ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"
              }`}
            >
              <span className={`mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                active ? "bg-[var(--codex-accent)] text-white" : done ? "bg-emerald-500 text-white" : "bg-white text-slate-400"
              }`}>
                {done ? <Check aria-hidden="true" className="h-3 w-3" /> : step.value}
              </span>
              <span className="mt-1 block truncate text-[11px] font-black">{step.title}</span>
              <span className="block truncate text-[10px] font-bold opacity-70">{step.desc}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function CountSelector({ imageType, value, options, onChange, helper }: { imageType: ProductSetImageType; value: number; options: number[]; onChange: (value: number) => void; helper?: string }) {
  const t = useTranslations("ProductSet");
  const unit = imageType === "main" ? t("units.singleImage") : t("units.singleScreen");
  const countLabel = imageType === "main" ? t("analysis.genCount") : t("analysis.detailScreenCount");
  return (
    <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-bold text-slate-700">{countLabel}</span>
        <span className="font-black text-[var(--codex-accent)]">{value > 0 ? `${value} ${unit}` : t("create.count.unselected")}</span>
      </div>
      <GenerationCountField value={value} onChange={onChange} counts={options} unit={unit} ariaLabel={countLabel} />
      {helper ? <p className="mt-2 text-[11px] leading-5 text-slate-400">{helper}</p> : null}
    </div>
  );
}

export function FieldInput({ label, value, maxLength, onChange }: { label: string; value: string; maxLength: number; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black text-slate-500">{label}</span>
      <input name={label} autoComplete="off" value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} className={`h-10 w-full rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs outline-none transition-colors focus-visible:border-[rgba(91,124,255,0.5)] ${interactiveRing}`} />
    </label>
  );
}

export function FieldTextarea({ label, value, maxLength, onChange, placeholder }: { label: string; value: string; maxLength: number; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black text-slate-500">{label}</span>
      <textarea name={label} autoComplete="off" value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`min-h-24 w-full resize-none rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 outline-none transition-colors focus-visible:border-[rgba(91,124,255,0.5)] ${interactiveRing}`} />
    </label>
  );
}

export function TemplateCard({ template, selected, onToggle }: { template: ProductSetTemplate; selected: boolean; onToggle: () => void }) {
  const t = useTranslations("ProductSet");
  const aspectRatioLabel = template.aspectRatio === "auto" ? t("aspectRatio.auto") : template.aspectRatio;
  return (
    <button type="button" aria-pressed={selected} onClick={onToggle} className={`group flex h-full flex-col overflow-hidden rounded-3xl border bg-white text-left shadow-sm transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:shadow-xl ${interactiveRing} ${selected ? "border-[rgba(91,124,255,0.22)] ring-2 ring-[rgba(91,124,255,0.18)]" : "border-slate-100"}`}>
      <div className="relative aspect-[4/3] shrink-0 bg-slate-100">
        <RawPreviewImage src={getImageVariantUrl(template.coverImage, "card")} alt={template.name} className="h-full w-full object-cover" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-slate-600 shadow-sm">{aspectRatioLabel}</span>
        <span className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full shadow-sm ${selected ? "bg-[var(--codex-accent)] text-white" : "bg-white/90 text-slate-400"}`}>
          {selected ? <Check aria-hidden="true" className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
        </span>
        {template.scenario === "womenswear" ? <span className="absolute bottom-3 left-3 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{t("preset.womenswear")}</span> : null}
      </div>
      <div className="flex min-h-[126px] flex-1 flex-col p-3">
        <div className="flex min-h-6 items-start justify-between gap-2">
          <h3 className="min-w-0 line-clamp-1 text-sm font-black text-slate-900 dark:text-stone-100">{template.name}</h3>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{template.imageType === "main" ? t("create.template.main") : t("create.template.details")}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{template.typeDescriptionV2}</p>
        <div className="mt-auto flex items-center gap-2 pt-3 text-[10px] font-bold text-slate-400">
          <Layers3 aria-hidden="true" className="h-3.5 w-3.5" />
          {template.subjectConsistency ? t("create.template.subjectConsistent") : t("create.template.layoutIndependent")}
          <ChevronRight aria-hidden="true" className="ml-auto h-3.5 w-3.5" />
        </div>
      </div>
    </button>
  );
}

export function ToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={active} onClick={onClick} className={`flex h-10 items-center justify-between rounded-xl border px-3 text-xs font-black transition-[border-color,background-color,color] ${interactiveRing} ${active ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "border-slate-100 bg-slate-50 text-slate-500"}`}>
      <span className="min-w-0 truncate pr-2">{label}</span>
      <span aria-hidden="true" className={`h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors ${active ? "bg-[var(--codex-accent)]" : "bg-slate-300"}`}>
        <span className={`block h-3 w-3 rounded-full bg-white transition-transform ${active ? "translate-x-3" : ""}`} />
      </span>
    </button>
  );
}

export function ReferenceUploadButton({ label, hint, url, loading, onClick }: { label: string; hint?: string; url?: string; loading: boolean; onClick: () => void }) {
  const t = useTranslations("ProductSet");
  return (
    <button type="button" onClick={onClick} className={`flex min-h-[60px] w-full items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2 py-2 text-left text-xs font-bold text-slate-600 transition-colors hover:border-[rgba(91,124,255,0.3)] hover:bg-[rgba(91,124,255,0.12)] ${interactiveRing}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg ${url ? "studio-checkerboard" : "bg-white"}`}>
        {url ? <RawPreviewImage src={getImageVariantUrl(url, "thumb")} alt={label} className="h-full w-full object-contain p-0.5" /> : loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-[var(--codex-accent)] motion-reduce:animate-none" /> : <Upload aria-hidden="true" className="h-4 w-4 text-slate-400" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">{url ? t("create.upload.uploadedReplace") : (hint || t("create.upload.dropHint"))}</span>
      </span>
    </button>
  );
}

export function OptionGrid({ title, options, value, onChange }: { title: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-bold text-slate-700">{title}</legend>
      <div className="grid grid-cols-2 items-stretch gap-2 md:grid-cols-4" role="radiogroup">
        {options.map((item) => (
          <button key={item} type="button" role="radio" aria-checked={value === item} onClick={() => onChange(item)} className={`h-10 truncate rounded-xl border px-3 text-xs font-bold transition-[border-color,background-color,color] ${interactiveRing} ${value === item ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "border-slate-200 bg-slate-50 text-slate-500 hover:border-[rgba(91,124,255,0.3)]"}`}>
            {item}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
