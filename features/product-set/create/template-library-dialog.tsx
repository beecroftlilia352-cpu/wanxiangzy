import type { RefObject } from "react";
import { Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TemplateCard } from "@/features/product-set/create/controls";
import { ReferenceQuickStart } from "@/features/product-set/create/reference-quick-start";
import type { CustomDraft, TemplateFilter } from "@/features/product-set/create/types";
import type {
  ProductSetCustomTemplate,
  ProductSetImageType,
  ProductSetTemplate,
} from "@/lib/product-set";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2";

type TemplateLibraryDialogProps = {
  imageType: ProductSetImageType;
  genCount: number;
  templates: ProductSetTemplate[];
  selectedTemplateIds: number[];
  activeCustomTemplates: ProductSetCustomTemplate[];
  filter: TemplateFilter;
  query: string;
  customDraft: CustomDraft;
  showCustomBuilder: boolean;
  isUploadingCustomRef: boolean;
  customRefInputRef: RefObject<HTMLInputElement | null>;
  customModelRefInputRef: RefObject<HTMLInputElement | null>;
  customOtherRefInputRef: RefObject<HTMLInputElement | null>;
  onFilterChange: (value: TemplateFilter) => void;
  onQueryChange: (value: string) => void;
  onToggleTemplate: (id: number) => void;
  onClose: () => void;
  onShowCustomBuilder: (value: boolean) => void;
  onCustomDraftChange: (updater: (value: CustomDraft) => CustomDraft) => void;
  onUploadCustomReference: (kind: "style" | "model" | "other", file?: File) => void;
  onPickCustomReference?: (kind: "style" | "model" | "other") => void;
  onAddCustomTemplate: () => void;
  onRemoveCustomTemplate: (id: string) => void;
};

export function TemplateLibraryDialog({
  imageType,
  genCount,
  templates,
  selectedTemplateIds,
  activeCustomTemplates,
  filter,
  query,
  customDraft,
  showCustomBuilder,
  isUploadingCustomRef,
  customRefInputRef,
  customModelRefInputRef,
  customOtherRefInputRef,
  onFilterChange,
  onQueryChange,
  onToggleTemplate,
  onClose,
  onShowCustomBuilder,
  onCustomDraftChange,
  onUploadCustomReference,
  onPickCustomReference,
  onAddCustomTemplate,
  onRemoveCustomTemplate,
}: TemplateLibraryDialogProps) {
  const t = useTranslations("ProductSet");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTemplates = templates.filter((template) => {
    if (filter === "selected" && !selectedTemplateIds.includes(template.id)) return false;
    if (filter === "womenswear" && template.scenario !== "womenswear") return false;
    return !normalizedQuery || `${template.name} ${template.typeDescriptionV2}`.toLowerCase().includes(normalizedQuery);
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        overlayClassName="z-[129] bg-slate-950/35 backdrop-blur-xl"
        className="z-[130] flex w-[calc(100%-2rem)] max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-[32px] bg-white p-0 shadow-[0_30px_120px_rgba(15,23,42,0.28)] sm:max-w-[calc(100vw-1.5rem)] xl:max-w-7xl"
      >
        <DialogHeader className="shrink-0 flex-col gap-3 border-b border-slate-100 px-5 py-4 pr-16 text-left lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-black leading-6 text-slate-950 text-pretty dark:text-stone-100">{t("create.library.title")}</DialogTitle>
            <DialogDescription className="mt-1 text-xs text-slate-400">{t("create.library.description")}</DialogDescription>
          </div>
          <label className="relative min-w-0 shrink-0">
            <span className="sr-only">{t("create.library.searchLabel")}</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <input
              name="template-search"
              autoComplete="off"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t("create.library.searchPlaceholder")}
              className={`h-10 w-40 rounded-full border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs transition-colors focus-visible:border-[rgba(91,124,255,0.5)] sm:w-52 ${focusRing}`}
            />
          </label>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
            <div className="mb-4 flex flex-wrap gap-2" aria-label={t("create.library.filterAria")}>
              {([
                ["all", imageType === "details" ? t("create.library.allDetails") : t("create.library.allMain")],
                ["womenswear", t("create.library.womenswearScene")],
                ["selected", t("create.library.selectedCount", { count: selectedTemplateIds.length })],
              ] as [TemplateFilter, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => onFilterChange(value)}
                  className={`h-9 touch-manipulation rounded-full px-3 text-xs font-black transition-colors ${focusRing} ${filter === value ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div aria-live="polite">
              {visibleTemplates.length ? (
                <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      selected={selectedTemplateIds.includes(template.id)}
                      onToggle={() => onToggleTemplate(template.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">
                  {t("create.library.empty")}
                </div>
              )}
            </div>
          </div>
          <aside className="max-h-[42dvh] min-h-0 shrink-0 overflow-y-auto overscroll-contain border-t border-slate-100 bg-slate-50 p-5 lg:max-h-none lg:border-l lg:border-t-0">
            <button
              type="button"
              aria-expanded={showCustomBuilder}
              onClick={() => onShowCustomBuilder(!showCustomBuilder)}
              className={`inline-flex w-full touch-manipulation items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgba(91,124,255,0.22)] bg-white px-3 py-3 text-xs font-black text-[var(--codex-accent)] transition-colors hover:bg-[rgba(91,124,255,0.12)] ${focusRing}`}
            >
              <Plus aria-hidden="true" className="h-4 w-4" /> {t("create.library.uploadReference")}
            </button>

            {showCustomBuilder ? (
              <div className="mt-3 space-y-3 rounded-2xl border border-slate-100 bg-white p-3">
                <div>
                  <p className="text-xs font-black text-slate-800">{t("create.library.customTitle")}</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{t("create.library.customDesc")}</p>
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
              </div>
            ) : null}

            <div className="mt-5">
              <h3 className="text-xs font-black text-slate-700">{t("create.library.customStyles")}</h3>
              {activeCustomTemplates.length ? (
                <div className="mt-2 space-y-2">
                  {activeCustomTemplates.map((template) => (
                    <div key={template.id} className="flex min-h-10 items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-xs">
                      <span className="min-w-0 truncate font-bold text-slate-700">{template.name}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveCustomTemplate(template.id)}
                        className={`flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 ${focusRing}`}
                        aria-label={t("create.library.removeAria", { name: template.name })}
                      >
                        <X aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-2xl bg-white px-3 py-4 text-xs leading-5 text-slate-400">{t("create.library.customEmpty")}</p>
              )}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
