import type { RefObject } from "react";
import { ChevronRight, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ReferenceQuickStart } from "@/features/product-set/create/reference-quick-start";
import type { CustomDraft } from "@/features/product-set/create/types";
import type { ProductSetCustomTemplate, ProductSetImageType } from "@/lib/product-set";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2";

type CustomTemplateSourcePanelProps = {
  imageType: ProductSetImageType;
  genCount: number;
  customDraft: CustomDraft;
  activeCustomTemplates: ProductSetCustomTemplate[];
  isUploadingCustomRef: boolean;
  customRefInputRef: RefObject<HTMLInputElement | null>;
  customModelRefInputRef: RefObject<HTMLInputElement | null>;
  customOtherRefInputRef: RefObject<HTMLInputElement | null>;
  onCustomDraftChange: (updater: (value: CustomDraft) => CustomDraft) => void;
  onUploadCustomReference: (kind: "style" | "model" | "other", file?: File) => void;
  onPickCustomReference?: (kind: "style" | "model" | "other") => void;
  onAddCustomTemplate: () => void;
  onRemoveCustomTemplate: (id: string) => void;
  onOpenLibrary: () => void;
};

export function CustomTemplateSourcePanel({
  imageType,
  genCount,
  customDraft,
  activeCustomTemplates,
  isUploadingCustomRef,
  customRefInputRef,
  customModelRefInputRef,
  customOtherRefInputRef,
  onCustomDraftChange,
  onUploadCustomReference,
  onPickCustomReference,
  onAddCustomTemplate,
  onRemoveCustomTemplate,
  onOpenLibrary,
}: CustomTemplateSourcePanelProps) {
  const t = useTranslations("ProductSet");
  const countLabel = genCount > 0
    ? `${genCount} ${imageType === "main" ? t("units.mainImage") : t("units.detailPage")}`
    : imageType === "main" ? t("create.customSource.selectedCountMain") : t("create.customSource.selectedCountDetails");

  return (
    <section aria-label={t("create.customSource.ariaLabel")} className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="inline-flex items-center gap-1.5 text-xs font-black text-slate-800">
            <Upload aria-hidden="true" className="h-3.5 w-3.5 text-[var(--codex-accent)]" /> {t("create.customSource.ariaLabel")}
          </h3>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">
            {t("create.customSource.description", { count: countLabel })}
          </p>
        </div>
        <button type="button" onClick={onOpenLibrary} className={`inline-flex h-8 shrink-0 touch-manipulation items-center gap-1 rounded-full bg-white px-2.5 text-[11px] font-black text-[var(--codex-accent)] transition-colors hover:bg-[rgba(91,124,255,0.12)] ${focusRing}`}>
          {t("create.customSource.library")}
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>

      <ReferenceQuickStart
        imageType={imageType}
        genCount={genCount}
        customDraft={customDraft}
        isUploadingCustomRef={isUploadingCustomRef}
        customRefInputRef={customRefInputRef}
        customModelRefInputRef={customModelRefInputRef}
        customOtherRefInputRef={customOtherRefInputRef}
        onCustomDraftChange={onCustomDraftChange}
        onUploadCustomReference={onUploadCustomReference}
        onPickCustomReference={onPickCustomReference}
        onAddCustomTemplate={onAddCustomTemplate}
      />

      <div>
        <h4 className="text-xs font-black text-slate-700">{t("create.customSource.added")}</h4>
        {activeCustomTemplates.length ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {activeCustomTemplates.map((template) => (
              <div key={template.id} className="flex min-h-12 items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-black text-slate-700">{template.name}</p>
                  <p className="mt-0.5 truncate text-[10px] font-bold text-slate-400">{template.moduleRole || template.typeDescription}</p>
                </div>
                <button
                  type="button"
                  aria-label={t("create.customSource.removeAria", { name: template.name })}
                  onClick={() => onRemoveCustomTemplate(template.id)}
                  className={`flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 ${focusRing}`}
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-2xl bg-white px-3 py-4 text-xs leading-5 text-slate-400">
            {t("create.customSource.empty")}
          </p>
        )}
      </div>
    </section>
  );
}
