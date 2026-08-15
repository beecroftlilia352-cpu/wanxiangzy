"use client";

import { useState, type ReactNode } from "react";
import { Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldInput, FieldTextarea, OptionGrid, ToggleButton } from "@/features/product-set/create/controls";
import { CUSTOM_ASPECTS, DEFAULT_REFERENCE_STYLE_BRIEF } from "@/features/product-set/create/config";
import {
  getProductSetModuleReason,
  PRODUCT_SET_COUNTRIES,
  PRODUCT_SET_FONT_STYLE_LABELS,
  PRODUCT_SET_LANGUAGES,
  PRODUCT_SET_PLATFORMS,
  shouldUseModelForTemplate,
  type ProductSetApparelType,
  type ProductSetCopyDensity,
  type ProductSetModuleOverride,
  type ProductSetModelStrategy,
  type ProductSetProductKind,
  type ProductSetProductProfile,
  type ProductSetResolvedTemplate,
  type ProductSetFontStyle,
  type ProductSetSettings,
  type ProductSetThemeMode,
} from "@/lib/product-set";

const controlRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2";

type DialogFrameProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  maxWidth?: string;
};

function DialogFrame({ title, description, children, footer, onClose, maxWidth = "sm:max-w-3xl" }: DialogFrameProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent overlayClassName="z-[134] bg-slate-950/35 backdrop-blur-xl" className={`${maxWidth} z-[135] flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-[28px] bg-white p-0 shadow-[0_30px_120px_rgba(15,23,42,0.28)]`}>
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 pr-16 text-left">
          <DialogTitle className="text-lg font-black leading-6 text-slate-950 dark:text-stone-100">{title}</DialogTitle>
          <DialogDescription className="text-xs leading-5 text-slate-400">{description}</DialogDescription>
        </DialogHeader>
        {children}
        <div className="shrink-0">{footer}</div>
      </DialogContent>
    </Dialog>
  );
}

export function ReferenceStyleModal({ value, onChange, onClose, onSave }: { value: string; onChange: (value: string) => void; onClose: () => void; onSave: () => void }) {
  const t = useTranslations("ProductSet");
  return (
    <DialogFrame
      title={t("create.referenceStyle.title")}
      description={t("create.referenceStyle.description")}
      onClose={onClose}
      footer={(
        <DialogFooter className="mx-0 mb-0 flex-col items-stretch gap-3 rounded-none border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => onChange(DEFAULT_REFERENCE_STYLE_BRIEF)} className={`h-10 w-full rounded-full border border-slate-200 px-4 text-xs font-black text-slate-500 transition-colors hover:bg-slate-50 sm:w-auto ${controlRing}`}>{t("create.referenceStyle.restoreExample")}</button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" onClick={onClose} className={`h-10 w-full rounded-full border border-slate-200 px-5 text-xs font-black text-slate-500 transition-colors hover:bg-slate-50 sm:w-auto ${controlRing}`}>{t("common.cancel")}</button>
            <button type="button" onClick={onSave} className={`h-10 w-full rounded-full bg-slate-950 px-6 text-xs font-black text-white transition-colors hover:bg-slate-800 sm:w-auto ${controlRing}`}>{t("create.referenceStyle.save")}</button>
          </div>
        </DialogFooter>
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <textarea name="reference-style" autoComplete="off" value={value} maxLength={2000} onChange={(event) => onChange(event.target.value)} className={`min-h-[40vh] w-full resize-none rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-800 outline-none transition-colors focus-visible:border-[rgba(91,124,255,0.5)] focus-visible:bg-white sm:min-h-[520px] ${controlRing}`} placeholder={t("create.referenceStyle.placeholder")} />
        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-400"><span>{t("create.referenceStyle.hint")}</span><span className="shrink-0">{value.length} / 2000</span></div>
      </div>
    </DialogFrame>
  );
}

export function ProductProfileEditorModal({ profile, onSave, onClose }: { profile: ProductSetProductProfile; onSave: (profile: ProductSetProductProfile) => void; onClose: () => void }) {
  const t = useTranslations("ProductSet");
  const [draft, setDraft] = useState<ProductSetProductProfile>(profile);
  const kindOptions: Array<{ value: ProductSetProductKind; labelKey: string }> = [
    { value: "apparel", labelKey: "create.profileEditor.kind.apparel" }, { value: "footwear", labelKey: "create.profileEditor.kind.footwear" }, { value: "bag", labelKey: "create.profileEditor.kind.bag" }, { value: "accessory", labelKey: "create.profileEditor.kind.accessory" }, { value: "beauty", labelKey: "create.profileEditor.kind.beauty" }, { value: "electronics", labelKey: "create.profileEditor.kind.electronics" }, { value: "home", labelKey: "create.profileEditor.kind.home" }, { value: "toy", labelKey: "create.profileEditor.kind.toy" }, { value: "food", labelKey: "create.profileEditor.kind.food" }, { value: "general", labelKey: "create.profileEditor.kind.general" },
  ];
  const apparelOptions: Array<{ value: ProductSetApparelType; labelKey: string }> = [
    { value: "womenswear", labelKey: "create.profileEditor.apparel.womenswear" }, { value: "menswear", labelKey: "create.profileEditor.apparel.menswear" }, { value: "kidswear", labelKey: "create.profileEditor.apparel.kidswear" }, { value: "outerwear", labelKey: "create.profileEditor.apparel.outerwear" }, { value: "sportswear", labelKey: "create.profileEditor.apparel.sportswear" }, { value: "intimate", labelKey: "create.profileEditor.apparel.intimate" }, { value: "swimwear", labelKey: "create.profileEditor.apparel.swimwear" }, { value: "general", labelKey: "create.profileEditor.apparel.general" },
  ];
  const modelOptions: Array<{ value: ProductSetModelStrategy; labelKey: string }> = [
    { value: "none", labelKey: "create.profileEditor.model.none" }, { value: "optional", labelKey: "create.profileEditor.model.optional" }, { value: "recommended", labelKey: "create.profileEditor.model.recommended" }, { value: "required", labelKey: "create.profileEditor.model.required" },
  ];

  function setKind(kind: ProductSetProductKind) {
    const isApparel = kind === "apparel" || kind === "footwear";
    setDraft((current) => ({ ...current, kind, isApparel, needsModel: isApparel ? current.needsModel || current.modelStrategy !== "none" : false, modelStrategy: isApparel ? (current.modelStrategy === "none" ? "recommended" : current.modelStrategy) : "none" }));
  }

  const optionClass = (selected: boolean) => `h-10 truncate rounded-xl border px-2 text-xs font-black transition-[border-color,background-color,color] ${controlRing} ${selected ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "border-slate-200 bg-slate-50 text-slate-500"}`;
  return (
    <DialogFrame
      title={t("create.profileEditor.title")}
      description={t("create.profileEditor.description")}
      onClose={onClose}
      footer={<DialogFooter className="mx-0 mb-0 flex-row justify-end rounded-none border-slate-100 bg-white px-5 py-4"><button type="button" onClick={onClose} className={`h-11 rounded-full bg-slate-100 px-8 text-sm font-black text-slate-600 ${controlRing}`}>{t("common.cancel")}</button><button type="button" onClick={() => onSave(draft)} className={`h-11 rounded-full bg-slate-950 px-8 text-sm font-black text-white ${controlRing}`}>{t("common.confirm")}</button></DialogFooter>}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <fieldset><legend className="mb-2 text-xs font-black text-slate-700">{t("create.profileEditor.productType")}</legend><div role="radiogroup" className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-5">{kindOptions.map((item) => <button key={item.value} type="button" role="radio" aria-checked={draft.kind === item.value} onClick={() => setKind(item.value)} className={optionClass(draft.kind === item.value)}>{t(item.labelKey)}</button>)}</div></fieldset>
        {(draft.kind === "apparel" || draft.kind === "footwear" || draft.isApparel) ? <fieldset><legend className="mb-2 text-xs font-black text-slate-700">{t("create.profileEditor.apparelSubtype")}</legend><div role="radiogroup" className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-4">{apparelOptions.map((item) => <button key={item.value} type="button" role="radio" aria-checked={draft.apparelType === item.value} onClick={() => setDraft((current) => ({ ...current, apparelType: item.value, isApparel: true }))} className={optionClass(draft.apparelType === item.value)}>{t(item.labelKey)}</button>)}</div></fieldset> : null}
        <fieldset><legend className="mb-2 text-xs font-black text-slate-700">{t("create.profileEditor.modelStrategy")}</legend><div role="radiogroup" className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-4">{modelOptions.map((item) => <button key={item.value} type="button" role="radio" aria-checked={draft.modelStrategy === item.value} onClick={() => setDraft((current) => ({ ...current, modelStrategy: item.value, needsModel: item.value === "recommended" || item.value === "required" }))} className={optionClass(draft.modelStrategy === item.value)}>{t(item.labelKey)}</button>)}</div></fieldset>
        <label className="block"><span className="sr-only">{t("create.profileEditor.modelRequirement")}</span><textarea name="model-brief" autoComplete="off" value={draft.modelBrief} maxLength={220} onChange={(event) => setDraft((current) => ({ ...current, modelBrief: event.target.value }))} className={`min-h-28 w-full resize-none rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm leading-6 outline-none transition-colors focus-visible:border-[rgba(91,124,255,0.5)] ${controlRing}`} placeholder={t("create.profileEditor.modelBriefPlaceholder")} /></label>
      </div>
    </DialogFrame>
  );
}

export function ModuleEditModal({ template, index, override, productProfile, onSave, onRemove, onClose }: { template: ProductSetResolvedTemplate; index: number; override?: ProductSetModuleOverride; productProfile: ProductSetProductProfile; onSave: (patch: Partial<ProductSetModuleOverride>) => void; onRemove: () => void; onClose: () => void }) {
  const t = useTranslations("ProductSet");
  const [draft, setDraft] = useState({
    name: override?.name || template.name, moduleRole: override?.moduleRole || template.moduleRole, contentScope: override?.contentScope || template.contentScope, layoutRules: override?.layoutRules || template.layoutRules, textRules: override?.textRules || template.textRules, avoidRules: override?.avoidRules || template.avoidRules, typeDescription: override?.typeDescription || template.typeDescriptionV2 || template.typeDescription, extraDescription: override?.extraDescription || "", aspectRatio: override?.aspectRatio || template.aspectRatio, subjectConsistency: override?.subjectConsistency ?? template.subjectConsistency, modelConsistency: override?.modelConsistency ?? Boolean(template.modelConsistency), intelligentCopy: override?.intelligentCopy ?? template.intelligentCopy, copyDensity: (override?.copyDensity || template.copyDensity || "standard") as ProductSetCopyDensity,
  });
  const usesModel = shouldUseModelForTemplate({ ...template, ...draft }, productProfile);

  return (
    <DialogFrame
      title={t("create.moduleEdit.title")}
      description={t("create.moduleEdit.description", { index: index + 1, type: template.imageType === "details" ? t("create.moduleEdit.modelTypeDetails") : t("create.moduleEdit.modelTypeMain") })}
      onClose={onClose}
      footer={<DialogFooter className="mx-0 mb-0 flex-col gap-3 rounded-none border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={onRemove} className={`h-11 shrink-0 rounded-full border border-red-100 bg-red-50 px-5 text-sm font-black text-red-500 ${controlRing}`}>{t("create.moduleEdit.remove")}</button><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={`h-11 rounded-full bg-slate-100 px-8 text-sm font-black text-slate-600 ${controlRing}`}>{t("common.cancel")}</button><button type="button" onClick={() => onSave(draft)} className={`h-11 rounded-full bg-slate-950 px-8 text-sm font-black text-white ${controlRing}`}>{t("create.moduleEdit.save")}</button></div></DialogFooter>}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="rounded-2xl border border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] px-3 py-3 text-xs leading-5 text-[var(--codex-accent)]">{getProductSetModuleReason(template, productProfile)}</div>
        <div className="grid gap-3 sm:grid-cols-2"><FieldInput label={t("create.moduleEdit.fieldName")} value={draft.name} maxLength={40} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} /><FieldInput label={t("create.moduleEdit.fieldRole")} value={draft.moduleRole} maxLength={160} onChange={(value) => setDraft((current) => ({ ...current, moduleRole: value }))} /></div>
        <FieldTextarea label={t("create.moduleEdit.fieldContentScope")} value={draft.contentScope} maxLength={320} onChange={(value) => setDraft((current) => ({ ...current, contentScope: value }))} placeholder={t("create.moduleEdit.contentScopePlaceholder")} />
        <div className="grid gap-3 sm:grid-cols-3"><FieldTextarea label={t("create.moduleEdit.fieldLayoutRules")} value={draft.layoutRules} maxLength={320} onChange={(value) => setDraft((current) => ({ ...current, layoutRules: value }))} /><FieldTextarea label={t("create.moduleEdit.fieldTextRules")} value={draft.textRules} maxLength={260} onChange={(value) => setDraft((current) => ({ ...current, textRules: value }))} /><FieldTextarea label={t("create.moduleEdit.fieldAvoidRules")} value={draft.avoidRules} maxLength={320} onChange={(value) => setDraft((current) => ({ ...current, avoidRules: value }))} /></div>
        <FieldTextarea label={t("create.moduleEdit.fieldTypeDescription")} value={draft.typeDescription} maxLength={700} onChange={(value) => setDraft((current) => ({ ...current, typeDescription: value }))} />
        <fieldset><legend className="mb-2 text-xs font-black text-slate-700">{t("create.moduleEdit.aspectRatio")}</legend><div role="radiogroup" className="grid grid-cols-4 items-stretch gap-2">{CUSTOM_ASPECTS.map((value) => <button key={value} type="button" role="radio" aria-checked={draft.aspectRatio === value} onClick={() => setDraft((current) => ({ ...current, aspectRatio: value }))} className={`h-10 rounded-xl border text-xs font-black transition-[border-color,background-color,color] ${controlRing} ${draft.aspectRatio === value ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "border-slate-200 bg-slate-50 text-slate-500"}`}>{value === "auto" ? t("aspectRatio.auto") : value}</button>)}</div></fieldset>
        <div className="grid gap-2 sm:grid-cols-4"><ToggleButton active={draft.subjectConsistency} label={t("create.moduleEdit.subjectConsistency")} onClick={() => setDraft((current) => ({ ...current, subjectConsistency: !current.subjectConsistency }))} /><ToggleButton active={draft.modelConsistency} label={t("create.moduleEdit.modelConsistency")} onClick={() => setDraft((current) => ({ ...current, modelConsistency: !current.modelConsistency }))} /><ToggleButton active={draft.intelligentCopy} label={t("create.moduleEdit.intelligentCopy")} onClick={() => setDraft((current) => ({ ...current, intelligentCopy: !current.intelligentCopy }))} /><label><span className="sr-only">{t("create.moduleEdit.copyDensity")}</span><select name="module-copy-density" autoComplete="off" value={draft.copyDensity} onChange={(event) => setDraft((current) => ({ ...current, copyDensity: event.target.value as ProductSetCopyDensity }))} className={`h-10 w-full rounded-xl border border-slate-100 bg-slate-50 px-2 text-xs font-bold text-slate-600 outline-none ${controlRing}`}><option value="none">{t("create.moduleEdit.copyDensityNone")}</option><option value="light">{t("create.moduleEdit.copyDensityLight")}</option><option value="standard">{t("create.moduleEdit.copyDensityStandard")}</option><option value="rich">{t("create.moduleEdit.copyDensityRich")}</option></select></label></div>
        <div className={`rounded-2xl px-3 py-3 text-xs leading-5 ${usesModel ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-500"}`}>{usesModel ? t("create.moduleEdit.modelAdviceOn") : t("create.moduleEdit.modelAdviceOff")}</div>
        <FieldTextarea label={t("create.moduleEdit.fieldExtraDescription")} value={draft.extraDescription} maxLength={700} onChange={(value) => setDraft((current) => ({ ...current, extraDescription: value }))} placeholder={t("create.moduleEdit.extraDescriptionPlaceholder")} />
      </div>
    </DialogFrame>
  );
}

export function SettingsModal({ settings, onSettingChange, onClose }: { settings: ProductSetSettings; onSettingChange: <Key extends keyof ProductSetSettings>(key: Key, value: ProductSetSettings[Key]) => void; onClose: () => void }) {
  const t = useTranslations("ProductSet");
  const choiceClass = (selected: boolean) => `rounded-xl border px-3 text-xs font-bold transition-[border-color,background-color,color] ${controlRing} ${selected ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "border-slate-200 bg-slate-50 text-slate-500"}`;
  return (
    <DialogFrame
      title={t("create.settings.title")}
      description={t("create.settings.description")}
      onClose={onClose}
      maxWidth="sm:max-w-5xl"
      footer={<DialogFooter className="mx-0 mb-0 flex-row justify-end rounded-none border-slate-100 bg-white px-5 py-4"><button type="button" onClick={onClose} className={`h-11 rounded-full bg-slate-950 px-8 text-sm font-black text-white ${controlRing}`}>{t("common.confirm")}</button></DialogFooter>}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="space-y-6">
          <OptionGrid title={t("create.settings.country")} options={PRODUCT_SET_COUNTRIES} value={settings.country} onChange={(value) => onSettingChange("country", value)} />
          <OptionGrid title={t("create.settings.language")} options={PRODUCT_SET_LANGUAGES} value={settings.language} onChange={(value) => onSettingChange("language", value)} />
          <OptionGrid title={t("create.settings.platform")} options={PRODUCT_SET_PLATFORMS} value={settings.platform} onChange={(value) => onSettingChange("platform", value)} />
          <fieldset>
            <legend className="mb-2 text-xs font-bold text-slate-700">{t("create.settings.theme")}</legend>
            <div role="radiogroup" className="grid grid-cols-2 items-stretch gap-2">
              {([ ["auto", t("create.settings.themeAuto")], ["custom", t("create.settings.themeCustom")] ] as Array<[ProductSetThemeMode, string]>).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={settings.themeMode === value} onClick={() => onSettingChange("themeMode", value)} className={`flex h-11 items-center justify-center gap-2 ${choiceClass(settings.themeMode === value)}`}><Palette aria-hidden="true" className="h-4 w-4" /> {label}</button>
              ))}
            </div>
            {settings.themeMode === "custom" ? <label className="mt-2 block"><span className="sr-only">{t("create.settings.themeCustomLabel")}</span><input name="custom-theme-color" autoComplete="off" value={settings.themeColor} maxLength={80} onChange={(event) => onSettingChange("themeColor", event.target.value)} placeholder={t("create.settings.themeColorPlaceholder")} className={`h-10 w-full rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs outline-none transition-colors focus-visible:border-[rgba(91,124,255,0.5)] ${controlRing}`} /></label> : null}
          </fieldset>
          <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">{t("create.settings.fontStyle")}</legend><div role="radiogroup" className="grid grid-cols-2 items-stretch gap-2 md:grid-cols-3">{(Object.keys(PRODUCT_SET_FONT_STYLE_LABELS) as ProductSetFontStyle[]).map((value) => <button key={value} type="button" role="radio" aria-checked={settings.fontStyle === value} onClick={() => onSettingChange("fontStyle", value)} className={`h-10 ${choiceClass(settings.fontStyle === value)}`}>{PRODUCT_SET_FONT_STYLE_LABELS[value]}</button>)}</div></fieldset>
          <label className="block"><span className="sr-only">{t("create.settings.extraDescription")}</span><textarea name="settings-extra-description" autoComplete="off" value={settings.extraDescription || ""} maxLength={600} onChange={(event) => onSettingChange("extraDescription", event.target.value)} placeholder={t("create.settings.extraDescriptionPlaceholder")} className={`min-h-28 w-full resize-none rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm leading-6 outline-none transition-colors focus-visible:border-[rgba(91,124,255,0.5)] ${controlRing}`} /></label>
        </div>
      </div>
    </DialogFrame>
  );
}
