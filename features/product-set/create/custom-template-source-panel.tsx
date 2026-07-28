import type { RefObject } from "react";
import { ChevronRight, Upload, X } from "lucide-react";
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
  onAddCustomTemplate,
  onRemoveCustomTemplate,
  onOpenLibrary,
}: CustomTemplateSourcePanelProps) {
  const countLabel = genCount > 0
    ? `${genCount} ${imageType === "main" ? "张主图" : "屏详情页"}`
    : imageType === "main" ? "所选张数" : "所选屏数";

  return (
    <section aria-label="上传参考图" className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="inline-flex items-center gap-1.5 text-xs font-black text-slate-800">
            <Upload aria-hidden="true" className="h-3.5 w-3.5 text-[var(--codex-accent)]" /> 上传参考图
          </h3>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">
            上传 1 张主参考图即可，系统会自动理解版式和风格，再按{countLabel}拆成方案。
          </p>
        </div>
        <button type="button" onClick={onOpenLibrary} className={`inline-flex h-8 shrink-0 touch-manipulation items-center gap-1 rounded-full bg-white px-2.5 text-[11px] font-black text-[var(--codex-accent)] transition-colors hover:bg-[rgba(91,124,255,0.12)] ${focusRing}`}>
          模板库
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
        onAddCustomTemplate={onAddCustomTemplate}
      />

      <div>
        <h4 className="text-xs font-black text-slate-700">已添加参考</h4>
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
                  aria-label={`移除${template.name}`}
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
            还没有添加参考。上传主参考图后点添加，参考图会随商品图一起发送，只影响风格、版式、模特或氛围。
          </p>
        )}
      </div>
    </section>
  );
}
