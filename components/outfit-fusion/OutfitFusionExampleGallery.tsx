"use client";

import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  getOutfitFusionAssetLabel,
  OUTFIT_FUSION_TEMPLATES,
  type OutfitFusionAssetRole,
  type OutfitFusionTemplate,
} from "@/lib/outfit-fusion";

export type OutfitFusionExampleGalleryProps = {
  templates?: OutfitFusionTemplate[];
  activeTemplateId?: string | null;
  onUseTemplate: (template: OutfitFusionTemplate) => void;
  className?: string;
};

function getOutfitFusionRoleLabelKey(role: OutfitFusionAssetRole) {
  if (role === "reference") return "roles.reference";
  if (role === "model") return "roles.model";
  return "roles.outfit";
}

export function OutfitFusionExampleGallery({
  templates = OUTFIT_FUSION_TEMPLATES,
  activeTemplateId,
  onUseTemplate,
  className,
}: OutfitFusionExampleGalleryProps) {
  const t = useTranslations("OutfitFusion");
  return (
    <section className={cn("mx-auto w-full max-w-[1680px]", className)} aria-label={t("galleryAriaLabel")}>
      <div className="grid overflow-hidden rounded-[8px] bg-white dark:bg-white/5 grid-cols-1 gap-[3px] sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {templates.map((template, index) => (
          <article
            key={template.id}
            aria-label={template.title}
            className={cn(
              "group relative aspect-[3/4] min-h-[320px] animate-slide-up overflow-hidden bg-slate-100 shadow-sm transition-[transform,box-shadow,filter] duration-[300ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(15,23,42,0.14)] motion-reduce:animate-none sm:min-h-[360px] dark:bg-white/5",
              activeTemplateId === template.id && "z-[1] ring-2 ring-[var(--codex-accent)] ring-inset"
            )}
            style={{ animationDelay: `${Math.min(index * 28, 180)}ms` }}
          >
            <RawPreviewImage
              src={template.coverUrl}
              alt={template.title}
              loading={index < 6 ? "eager" : "lazy"}
              className="h-full w-full object-cover transition-transform duration-[300ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform group-hover:scale-[1.018] group-focus-within:scale-[1.018]"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-1.5 items-end gap-2 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-2 opacity-0 transition-[transform,opacity] duration-[300ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
              <div className="flex min-w-0 gap-1">
                {template.assets.slice(0, 3).map((asset, assetIndex) => {
                  const label = getOutfitFusionAssetLabel(asset, assetIndex);
                  const roleLabel = t(getOutfitFusionRoleLabelKey(asset.role));
                  return (
                    <div key={asset.id} className="w-12 overflow-hidden rounded-[4px] border border-white/70 bg-white shadow-sm transition duration-200 group-hover:shadow-md" title={`${label} · ${roleLabel}`}>
                      <div className="truncate bg-black/55 px-1 py-0.5 text-[10px] leading-none text-white">
                        {label}
                      </div>
                      <RawPreviewImage src={asset.url} alt={`${label}${roleLabel}`} className="aspect-square w-full object-cover" />
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                className="pointer-events-auto mb-0.5 ml-auto inline-flex h-8 shrink-0 items-center justify-center rounded-[4px] border border-white/70 bg-[rgba(0,0,0,0.58)] px-3 text-xs font-semibold leading-4 text-white shadow-[0_6px_14px_rgba(0,0,0,0.18)] transition duration-200 hover:border-white/90 hover:bg-[rgba(0,0,0,0.70)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                onClick={() => onUseTemplate(template)}
              >
                {t("makeSame")}
              </button>
            </div>
            <div className="absolute left-2 top-2 rounded-[5px] bg-black/55 px-2 py-1 text-xs font-medium leading-4 text-white opacity-0 transition duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
              {template.title}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
