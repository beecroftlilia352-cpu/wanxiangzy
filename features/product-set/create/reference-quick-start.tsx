import type { RefObject } from "react";
import { ChevronRight, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ReferenceUploadButton, ToggleButton } from "@/features/product-set/create/controls";
import {
  CUSTOM_ASPECTS,
  DEFAULT_DRAFT,
  getAspectRatioLabel,
} from "@/features/product-set/create/config";
import type { CustomDraft } from "@/features/product-set/create/types";
import type { ProductSetCopyDensity, ProductSetImageType } from "@/lib/product-set";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2";

type ReferenceIntentOption = {
  labelKey: string;
  role: string;
  description: string;
  scope: string;
};

const REFERENCE_INTENT_OPTIONS: Record<ProductSetImageType, ReferenceIntentOption[]> = {
  main: [
    { labelKey: "create.quickStart.intent.autoDetect", role: "主图参考风格", description: "参考图模式：自动识别参考图的构图、光影、场景和视觉风格，生成适合上架或投放的商品图。", scope: "" },
    { labelKey: "create.quickStart.intent.wearing", role: "模特上身展示", description: "参考模特姿态、镜头距离和上身效果，突出商品穿着表现。", scope: "突出商品上身效果、版型和穿搭氛围。" },
    { labelKey: "create.quickStart.intent.poster", role: "卖点海报", description: "参考海报式构图和视觉层级，生成更适合点击和投放的商品主图。", scope: "突出核心卖点、第一眼吸引力和商品辨识度。" },
    { labelKey: "create.quickStart.intent.scene", role: "场景氛围图", description: "参考场景、光影和情绪氛围，让商品图更有生活感。", scope: "突出使用场景、穿搭情绪和品牌调性。" },
  ],
  details: [
    { labelKey: "create.quickStart.intent.autoSplit", role: "详情页参考风格", description: "参考图模式：自动识别参考图的版式、信息层级和视觉风格，按所选屏数拆成详情页方案。", scope: "" },
    { labelKey: "create.quickStart.intent.hero", role: "详情页首屏海报", description: "参考首屏海报的构图、标题层级和氛围，生成详情页开场屏。", scope: "用于详情页开头，突出风格、商品定位和第一眼吸引力。" },
    { labelKey: "create.quickStart.intent.sellingPoints", role: "核心卖点说明", description: "参考信息展示方式，把商品卖点拆成清晰易懂的详情页模块。", scope: "用于展示核心卖点、功能利益点和购买理由。" },
    { labelKey: "create.quickStart.intent.detailsTexture", role: "细节材质展示", description: "参考局部特写和细节排版，生成面料、工艺或结构说明屏。", scope: "用于展示面料质感、细节工艺、版型或功能结构。" },
  ],
};

type ReferenceQuickStartProps = {
  imageType: ProductSetImageType;
  genCount: number;
  customDraft: CustomDraft;
  isUploadingCustomRef: boolean;
  customRefInputRef: RefObject<HTMLInputElement | null>;
  customModelRefInputRef: RefObject<HTMLInputElement | null>;
  customOtherRefInputRef: RefObject<HTMLInputElement | null>;
  onCustomDraftChange: (updater: (value: CustomDraft) => CustomDraft) => void;
  onUploadCustomReference: (kind: "style" | "model" | "other", file?: File) => void;
  onPickCustomReference?: (kind: "style" | "model" | "other") => void;
  onAddCustomTemplate: () => void;
};

export function ReferenceQuickStart({
  imageType,
  genCount,
  customDraft,
  isUploadingCustomRef,
  customRefInputRef,
  customModelRefInputRef,
  customOtherRefInputRef,
  onCustomDraftChange,
  onUploadCustomReference,
  onPickCustomReference,
  onAddCustomTemplate,
}: ReferenceQuickStartProps) {
  const t = useTranslations("ProductSet");
  const resourceT = useTranslations("ResourceLibrary");
  const unit = imageType === "main" ? t("units.singleImage") : t("units.singleScreen");
  const intentOptions = REFERENCE_INTENT_OPTIONS[imageType];
  const activeIntent = intentOptions.find((option) => option.role === customDraft.moduleRole) || intentOptions[0];
  const referenceCount = customDraft.referenceImageUrls.length
    + customDraft.modelReferenceImageUrls.length
    + customDraft.otherReferenceImageUrls.length;
  const hasReferenceImage = referenceCount > 0;
  const hasCount = genCount > 0;
  const canAddReference = hasReferenceImage && hasCount;

  function chooseIntent(option: ReferenceIntentOption) {
    onCustomDraftChange((current) => ({
      ...current,
      moduleRole: option.role,
      typeDescription: option.description,
      contentScope: option.scope,
      name: current.name && current.name !== DEFAULT_DRAFT.name
        ? current.name
        : imageType === "details" ? t("create.quickStart.defaultNameDetails") : t("create.quickStart.defaultNameMain"),
    }));
  }

  return (
    <div className="space-y-3">
      <input ref={customRefInputRef} aria-hidden="true" tabIndex={-1} type="file" accept="image/*" className="hidden" onChange={(event) => onUploadCustomReference("style", event.target.files?.[0])} />
      <input ref={customModelRefInputRef} aria-hidden="true" tabIndex={-1} type="file" accept="image/*" className="hidden" onChange={(event) => onUploadCustomReference("model", event.target.files?.[0])} />
      <input ref={customOtherRefInputRef} aria-hidden="true" tabIndex={-1} type="file" accept="image/*" className="hidden" onChange={(event) => onUploadCustomReference("other", event.target.files?.[0])} />

      <div className="rounded-2xl bg-white p-2 shadow-sm">
        <ReferenceUploadButton label={t("create.quickStart.mainRef")} hint={t("create.quickStart.styleHint")} url={customDraft.referenceImageUrls[0]} loading={isUploadingCustomRef} onClick={() => customRefInputRef.current?.click()} onLibraryClick={onPickCustomReference ? () => onPickCustomReference("style") : undefined} libraryLabel={resourceT("page.title")} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <ReferenceUploadButton label={t("create.quickStart.modelRef")} hint={t("create.quickStart.optional")} url={customDraft.modelReferenceImageUrls[0]} loading={isUploadingCustomRef} onClick={() => customModelRefInputRef.current?.click()} onLibraryClick={onPickCustomReference ? () => onPickCustomReference("model") : undefined} libraryLabel={resourceT("page.title")} />
        <ReferenceUploadButton label={t("create.quickStart.extraRef", { count: customDraft.otherReferenceImageUrls.length })} hint={t("create.quickStart.optional")} url={customDraft.otherReferenceImageUrls[0]} loading={isUploadingCustomRef} onClick={() => customOtherRefInputRef.current?.click()} onLibraryClick={onPickCustomReference ? () => onPickCustomReference("other") : undefined} libraryLabel={resourceT("page.title")} />
      </div>

      <fieldset className="rounded-2xl bg-white px-3 py-3">
        <legend className="sr-only">{t("create.quickStart.focusLabel")}</legend>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-black text-slate-500">{t("create.quickStart.focusLabel")}</p>
          <span className="rounded-full bg-[rgba(91,124,255,0.1)] px-2 py-0.5 text-[10px] font-black text-[var(--codex-accent)]">{t(activeIntent.labelKey)}</span>
        </div>
        <div role="radiogroup" className="grid grid-cols-2 gap-1.5">
          {intentOptions.map((option) => (
            <button
              key={option.role}
              type="button"
              role="radio"
              aria-checked={activeIntent.role === option.role}
              onClick={() => chooseIntent(option)}
              className={`h-9 touch-manipulation rounded-xl border px-2 text-[11px] font-black transition-[border-color,background-color,color] ${focusRing} ${activeIntent.role === option.role ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "border-slate-100 bg-slate-50 text-slate-500 hover:border-[rgba(91,124,255,0.3)] hover:bg-[rgba(91,124,255,0.12)]"}`}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </fieldset>

      <details className="group rounded-2xl border border-slate-100 bg-white px-3 py-2">
        <summary className={`flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-xs font-black text-slate-600 ${focusRing}`}>
          <span className="inline-flex items-center gap-1.5"><Settings2 aria-hidden="true" className="h-3.5 w-3.5 text-[var(--codex-accent)]" /> {t("create.quickStart.advancedSettings")}</span>
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-3 space-y-3">
          <fieldset>
            <legend className="mb-2 text-[11px] font-black text-slate-500">{t("create.quickStart.aspectRatio")}</legend>
            <div role="radiogroup" className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {CUSTOM_ASPECTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={customDraft.aspectRatio === value}
                  onClick={() => onCustomDraftChange((current) => ({ ...current, aspectRatio: value }))}
                  className={`h-8 touch-manipulation rounded-lg border px-2 text-[11px] transition-colors ${focusRing} ${customDraft.aspectRatio === value ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "border-slate-200 bg-white text-slate-500 hover:border-[rgba(91,124,255,0.3)]"}`}
                >
                  {getAspectRatioLabel(value, t)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 items-stretch gap-2">
            <ToggleButton active={customDraft.subjectConsistency} label={t("create.moduleEdit.subjectConsistency")} onClick={() => onCustomDraftChange((current) => ({ ...current, subjectConsistency: !current.subjectConsistency }))} />
            <ToggleButton active={customDraft.modelConsistency} label={t("create.moduleEdit.modelConsistency")} onClick={() => onCustomDraftChange((current) => ({ ...current, modelConsistency: !current.modelConsistency }))} />
            <ToggleButton active={customDraft.intelligentCopy} label={t("create.moduleEdit.intelligentCopy")} onClick={() => onCustomDraftChange((current) => ({ ...current, intelligentCopy: !current.intelligentCopy }))} />
            <label>
              <span className="sr-only">{t("create.moduleEdit.copyDensity")}</span>
              <select
                name="reference-copy-density"
                autoComplete="off"
                value={customDraft.copyDensity}
                onChange={(event) => onCustomDraftChange((current) => ({ ...current, copyDensity: event.target.value as ProductSetCopyDensity }))}
                className={`h-10 w-full rounded-xl border border-slate-100 bg-slate-50 px-2 text-xs font-bold text-slate-600 ${focusRing}`}
              >
                <option value="none">{t("create.moduleEdit.copyDensityNone")}</option>
                <option value="light">{t("create.moduleEdit.copyDensityLight")}</option>
                <option value="standard">{t("create.moduleEdit.copyDensityStandard")}</option>
                <option value="rich">{t("create.moduleEdit.copyDensityRich")}</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="sr-only">{t("create.quickStart.specialRequirement")}</span>
            <textarea
              name="reference-extra-description"
              autoComplete="off"
              value={customDraft.extraDescription}
              maxLength={600}
              onChange={(event) => onCustomDraftChange((current) => ({ ...current, extraDescription: event.target.value }))}
              className={`min-h-16 w-full resize-none rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 transition-colors focus-visible:border-[rgba(91,124,255,0.5)] ${focusRing}`}
              placeholder={t("create.quickStart.extraPlaceholder")}
            />
          </label>
        </div>
      </details>

      <button
        type="button"
        onClick={onAddCustomTemplate}
        disabled={!canAddReference}
        className={`h-11 w-full touch-manipulation rounded-xl text-xs font-black transition-colors ${focusRing} ${canAddReference ? "bg-slate-950 text-white hover:bg-slate-800" : "cursor-not-allowed bg-slate-200 text-slate-400"}`}
      >
        {!hasReferenceImage ? t("create.quickStart.uploadRefFirst") : !hasCount ? t("create.quickStart.selectCountFirst", { unit: imageType === "main" ? t("create.quickStart.countUnitMain") : t("create.quickStart.countUnitDetails") }) : t("create.quickStart.addRefAndGenerate", { count: genCount, unit })}
      </button>
    </div>
  );
}
