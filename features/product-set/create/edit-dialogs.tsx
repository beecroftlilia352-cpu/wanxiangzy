"use client";

import { useState, type ReactNode } from "react";
import { Palette } from "lucide-react";
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
  return (
    <DialogFrame
      title="参考风格说明"
      description="这里只保存风格方向，不会开始分析模板；点击“帮我写商品信息”时会一起传入智能分析。"
      onClose={onClose}
      footer={(
        <DialogFooter className="mx-0 mb-0 flex-col items-stretch gap-3 rounded-none border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => onChange(DEFAULT_REFERENCE_STYLE_BRIEF)} className={`h-10 w-full rounded-full border border-slate-200 px-4 text-xs font-black text-slate-500 transition-colors hover:bg-slate-50 sm:w-auto ${controlRing}`}>恢复示例</button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" onClick={onClose} className={`h-10 w-full rounded-full border border-slate-200 px-5 text-xs font-black text-slate-500 transition-colors hover:bg-slate-50 sm:w-auto ${controlRing}`}>取消</button>
            <button type="button" onClick={onSave} className={`h-10 w-full rounded-full bg-slate-950 px-6 text-xs font-black text-white transition-colors hover:bg-slate-800 sm:w-auto ${controlRing}`}>保存参考风格</button>
          </div>
        </DialogFooter>
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <textarea name="reference-style" autoComplete="off" value={value} maxLength={2000} onChange={(event) => onChange(event.target.value)} className={`min-h-[40vh] w-full resize-none rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-800 outline-none transition-colors focus-visible:border-[rgba(91,124,255,0.5)] focus-visible:bg-white sm:min-h-[520px] ${controlRing}`} placeholder="写入参考风格、目标平台、视觉风格、统一场景、配色和用户要求…" />
        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-400"><span>这段内容会作为风格参考传入分析，不会直接当作模板生成。</span><span className="shrink-0">{value.length} / 2000</span></div>
      </div>
    </DialogFrame>
  );
}

export function ProductProfileEditorModal({ profile, onSave, onClose }: { profile: ProductSetProductProfile; onSave: (profile: ProductSetProductProfile) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<ProductSetProductProfile>(profile);
  const kindOptions: Array<{ value: ProductSetProductKind; label: string }> = [
    { value: "apparel", label: "服装" }, { value: "footwear", label: "鞋靴" }, { value: "bag", label: "箱包" }, { value: "accessory", label: "配饰" }, { value: "beauty", label: "美妆" }, { value: "electronics", label: "数码电器" }, { value: "home", label: "家居" }, { value: "toy", label: "玩具" }, { value: "food", label: "食品" }, { value: "general", label: "通用商品" },
  ];
  const apparelOptions: Array<{ value: ProductSetApparelType; label: string }> = [
    { value: "womenswear", label: "女装" }, { value: "menswear", label: "男装" }, { value: "kidswear", label: "童装" }, { value: "outerwear", label: "外套/户外" }, { value: "sportswear", label: "运动服" }, { value: "intimate", label: "内衣" }, { value: "swimwear", label: "泳装" }, { value: "general", label: "通用服装" },
  ];
  const modelOptions: Array<{ value: ProductSetModelStrategy; label: string }> = [
    { value: "none", label: "不用模特" }, { value: "optional", label: "可选模特" }, { value: "recommended", label: "建议模特" }, { value: "required", label: "必须模特" },
  ];

  function setKind(kind: ProductSetProductKind) {
    const isApparel = kind === "apparel" || kind === "footwear";
    setDraft((current) => ({ ...current, kind, isApparel, needsModel: isApparel ? current.needsModel || current.modelStrategy !== "none" : false, modelStrategy: isApparel ? (current.modelStrategy === "none" ? "recommended" : current.modelStrategy) : "none" }));
  }

  const optionClass = (selected: boolean) => `h-10 truncate rounded-xl border px-2 text-xs font-black transition-[border-color,background-color,color] ${controlRing} ${selected ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "border-slate-200 bg-slate-50 text-slate-500"}`;
  return (
    <DialogFrame
      title="修正商品识别"
      description="识别结果会影响默认模板、是否使用模特和提示词安全边界。"
      onClose={onClose}
      footer={<DialogFooter className="mx-0 mb-0 flex-row justify-end rounded-none border-slate-100 bg-white px-5 py-4"><button type="button" onClick={onClose} className={`h-11 rounded-full bg-slate-100 px-8 text-sm font-black text-slate-600 ${controlRing}`}>取消</button><button type="button" onClick={() => onSave(draft)} className={`h-11 rounded-full bg-slate-950 px-8 text-sm font-black text-white ${controlRing}`}>确认</button></DialogFooter>}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <fieldset><legend className="mb-2 text-xs font-black text-slate-700">商品类型</legend><div role="radiogroup" className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-5">{kindOptions.map((item) => <button key={item.value} type="button" role="radio" aria-checked={draft.kind === item.value} onClick={() => setKind(item.value)} className={optionClass(draft.kind === item.value)}>{item.label}</button>)}</div></fieldset>
        {(draft.kind === "apparel" || draft.kind === "footwear" || draft.isApparel) ? <fieldset><legend className="mb-2 text-xs font-black text-slate-700">服装细分</legend><div role="radiogroup" className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-4">{apparelOptions.map((item) => <button key={item.value} type="button" role="radio" aria-checked={draft.apparelType === item.value} onClick={() => setDraft((current) => ({ ...current, apparelType: item.value, isApparel: true }))} className={optionClass(draft.apparelType === item.value)}>{item.label}</button>)}</div></fieldset> : null}
        <fieldset><legend className="mb-2 text-xs font-black text-slate-700">模特策略</legend><div role="radiogroup" className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-4">{modelOptions.map((item) => <button key={item.value} type="button" role="radio" aria-checked={draft.modelStrategy === item.value} onClick={() => setDraft((current) => ({ ...current, modelStrategy: item.value, needsModel: item.value === "recommended" || item.value === "required" }))} className={optionClass(draft.modelStrategy === item.value)}>{item.label}</button>)}</div></fieldset>
        <label className="block"><span className="sr-only">模特要求</span><textarea name="model-brief" autoComplete="off" value={draft.modelBrief} maxLength={220} onChange={(event) => setDraft((current) => ({ ...current, modelBrief: event.target.value }))} className={`min-h-28 w-full resize-none rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm leading-6 outline-none transition-colors focus-visible:border-[rgba(91,124,255,0.5)] ${controlRing}`} placeholder="例如：成年女性模特，法式通勤场景，姿势自然，突出版型和垂感，不要夸张摆拍…" /></label>
      </div>
    </DialogFrame>
  );
}

export function ModuleEditModal({ template, index, override, productProfile, onSave, onRemove, onClose }: { template: ProductSetResolvedTemplate; index: number; override?: ProductSetModuleOverride; productProfile: ProductSetProductProfile; onSave: (patch: Partial<ProductSetModuleOverride>) => void; onRemove: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState({
    name: override?.name || template.name, moduleRole: override?.moduleRole || template.moduleRole, contentScope: override?.contentScope || template.contentScope, layoutRules: override?.layoutRules || template.layoutRules, textRules: override?.textRules || template.textRules, avoidRules: override?.avoidRules || template.avoidRules, typeDescription: override?.typeDescription || template.typeDescriptionV2 || template.typeDescription, extraDescription: override?.extraDescription || "", aspectRatio: override?.aspectRatio || template.aspectRatio, subjectConsistency: override?.subjectConsistency ?? template.subjectConsistency, modelConsistency: override?.modelConsistency ?? Boolean(template.modelConsistency), intelligentCopy: override?.intelligentCopy ?? template.intelligentCopy, copyDensity: (override?.copyDensity || template.copyDensity || "standard") as ProductSetCopyDensity,
  });
  const usesModel = shouldUseModelForTemplate({ ...template, ...draft }, productProfile);

  return (
    <DialogFrame
      title="编辑生成模块"
      description={`第 ${index + 1} 张 · ${template.imageType === "details" ? "详情页模块" : "主图/辅图模块"}`}
      onClose={onClose}
      footer={<DialogFooter className="mx-0 mb-0 flex-col gap-3 rounded-none border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={onRemove} className={`h-11 shrink-0 rounded-full border border-red-100 bg-red-50 px-5 text-sm font-black text-red-500 ${controlRing}`}>移除本模块</button><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={`h-11 rounded-full bg-slate-100 px-8 text-sm font-black text-slate-600 ${controlRing}`}>取消</button><button type="button" onClick={() => onSave(draft)} className={`h-11 rounded-full bg-slate-950 px-8 text-sm font-black text-white ${controlRing}`}>保存</button></div></DialogFooter>}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="rounded-2xl border border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] px-3 py-3 text-xs leading-5 text-[var(--codex-accent)]">{getProductSetModuleReason(template, productProfile)}</div>
        <div className="grid gap-3 sm:grid-cols-2"><FieldInput label="模块名称" value={draft.name} maxLength={40} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} /><FieldInput label="模块职责" value={draft.moduleRole} maxLength={160} onChange={(value) => setDraft((current) => ({ ...current, moduleRole: value }))} /></div>
        <FieldTextarea label="内容范围" value={draft.contentScope} maxLength={320} onChange={(value) => setDraft((current) => ({ ...current, contentScope: value }))} placeholder="例如：只讲面料与版型，不重复整套卖点；或只展示模特上身与搭配氛围。" />
        <div className="grid gap-3 sm:grid-cols-3"><FieldTextarea label="版式规则" value={draft.layoutRules} maxLength={320} onChange={(value) => setDraft((current) => ({ ...current, layoutRules: value }))} /><FieldTextarea label="文字规则" value={draft.textRules} maxLength={260} onChange={(value) => setDraft((current) => ({ ...current, textRules: value }))} /><FieldTextarea label="禁忌规则" value={draft.avoidRules} maxLength={320} onChange={(value) => setDraft((current) => ({ ...current, avoidRules: value }))} /></div>
        <FieldTextarea label="模板描述" value={draft.typeDescription} maxLength={700} onChange={(value) => setDraft((current) => ({ ...current, typeDescription: value }))} />
        <fieldset><legend className="mb-2 text-xs font-black text-slate-700">生图比例</legend><div role="radiogroup" className="grid grid-cols-4 items-stretch gap-2">{CUSTOM_ASPECTS.map((value) => <button key={value} type="button" role="radio" aria-checked={draft.aspectRatio === value} onClick={() => setDraft((current) => ({ ...current, aspectRatio: value }))} className={`h-10 rounded-xl border text-xs font-black transition-[border-color,background-color,color] ${controlRing} ${draft.aspectRatio === value ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "border-slate-200 bg-slate-50 text-slate-500"}`}>{value === "auto" ? "智能" : value}</button>)}</div></fieldset>
        <div className="grid gap-2 sm:grid-cols-4"><ToggleButton active={draft.subjectConsistency} label="商品一致" onClick={() => setDraft((current) => ({ ...current, subjectConsistency: !current.subjectConsistency }))} /><ToggleButton active={draft.modelConsistency} label="模特一致" onClick={() => setDraft((current) => ({ ...current, modelConsistency: !current.modelConsistency }))} /><ToggleButton active={draft.intelligentCopy} label="智能文案" onClick={() => setDraft((current) => ({ ...current, intelligentCopy: !current.intelligentCopy }))} /><label><span className="sr-only">文案密度</span><select name="module-copy-density" autoComplete="off" value={draft.copyDensity} onChange={(event) => setDraft((current) => ({ ...current, copyDensity: event.target.value as ProductSetCopyDensity }))} className={`h-10 w-full rounded-xl border border-slate-100 bg-slate-50 px-2 text-xs font-bold text-slate-600 outline-none ${controlRing}`}><option value="none">无文案</option><option value="light">轻文案</option><option value="standard">标准文案</option><option value="rich">信息丰富</option></select></label></div>
        <div className={`rounded-2xl px-3 py-3 text-xs leading-5 ${usesModel ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-500"}`}>{usesModel ? "该模块会优先使用模特/上身场景。若不希望出现模特，可把模块职责改为白底、细节、尺码或关闭模特一致性。" : "该模块默认不使用模特，更适合白底、细节、尺寸、材质、包装或参数说明。"}</div>
        <FieldTextarea label="额外描述" value={draft.extraDescription} maxLength={700} onChange={(value) => setDraft((current) => ({ ...current, extraDescription: value }))} placeholder="只写这张图的特殊要求，例如：女装首屏海报不要底部缩略图；细节图只展示连帽、袖口、口袋三个局部。" />
      </div>
    </DialogFrame>
  );
}

export function SettingsModal({ settings, onSettingChange, onClose }: { settings: ProductSetSettings; onSettingChange: <Key extends keyof ProductSetSettings>(key: Key, value: ProductSetSettings[Key]) => void; onClose: () => void }) {
  const choiceClass = (selected: boolean) => `rounded-xl border px-3 text-xs font-bold transition-[border-color,background-color,color] ${controlRing} ${selected ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "border-slate-200 bg-slate-50 text-slate-500"}`;
  return (
    <DialogFrame
      title="更多设置"
      description="用于控制目标市场、图片文案和视觉风格；模型、比例与清晰度在左侧单独配置。"
      onClose={onClose}
      maxWidth="sm:max-w-5xl"
      footer={<DialogFooter className="mx-0 mb-0 flex-row justify-end rounded-none border-slate-100 bg-white px-5 py-4"><button type="button" onClick={onClose} className={`h-11 rounded-full bg-slate-950 px-8 text-sm font-black text-white ${controlRing}`}>确认</button></DialogFooter>}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="space-y-6">
          <OptionGrid title="目标销售国家/地区" options={PRODUCT_SET_COUNTRIES} value={settings.country} onChange={(value) => onSettingChange("country", value)} />
          <OptionGrid title="图片文案语言" options={PRODUCT_SET_LANGUAGES} value={settings.language} onChange={(value) => onSettingChange("language", value)} />
          <OptionGrid title="目标平台" options={PRODUCT_SET_PLATFORMS} value={settings.platform} onChange={(value) => onSettingChange("platform", value)} />
          <fieldset>
            <legend className="mb-2 text-xs font-bold text-slate-700">主题色</legend>
            <div role="radiogroup" className="grid grid-cols-2 items-stretch gap-2">
              {([ ["auto", "智能主题色"], ["custom", "自定义颜色"] ] as Array<[ProductSetThemeMode, string]>).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={settings.themeMode === value} onClick={() => onSettingChange("themeMode", value)} className={`flex h-11 items-center justify-center gap-2 ${choiceClass(settings.themeMode === value)}`}><Palette aria-hidden="true" className="h-4 w-4" /> {label}</button>
              ))}
            </div>
            {settings.themeMode === "custom" ? <label className="mt-2 block"><span className="sr-only">自定义主题色</span><input name="custom-theme-color" autoComplete="off" value={settings.themeColor} maxLength={80} onChange={(event) => onSettingChange("themeColor", event.target.value)} placeholder="例如：奶油白 + 牛仔蓝 + 玫瑰粉…" className={`h-10 w-full rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs outline-none transition-colors focus-visible:border-[rgba(91,124,255,0.5)] ${controlRing}`} /></label> : null}
          </fieldset>
          <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">字体风格</legend><div role="radiogroup" className="grid grid-cols-2 items-stretch gap-2 md:grid-cols-3">{(Object.keys(PRODUCT_SET_FONT_STYLE_LABELS) as ProductSetFontStyle[]).map((value) => <button key={value} type="button" role="radio" aria-checked={settings.fontStyle === value} onClick={() => onSettingChange("fontStyle", value)} className={`h-10 ${choiceClass(settings.fontStyle === value)}`}>{PRODUCT_SET_FONT_STYLE_LABELS[value]}</button>)}</div></fieldset>
          <label className="block"><span className="sr-only">额外描述</span><textarea name="settings-extra-description" autoComplete="off" value={settings.extraDescription || ""} maxLength={600} onChange={(event) => onSettingChange("extraDescription", event.target.value)} placeholder="例如：女装偏法式通勤、不要夸张姿势、文案使用短句…" className={`min-h-28 w-full resize-none rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm leading-6 outline-none transition-colors focus-visible:border-[rgba(91,124,255,0.5)] ${controlRing}`} /></label>
        </div>
      </div>
    </DialogFrame>
  );
}
