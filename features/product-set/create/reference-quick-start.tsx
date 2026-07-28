import type { RefObject } from "react";
import { ChevronRight, Settings2 } from "lucide-react";
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
  label: string;
  role: string;
  description: string;
  scope: string;
};

const REFERENCE_INTENT_OPTIONS: Record<ProductSetImageType, ReferenceIntentOption[]> = {
  main: [
    { label: "自动识别", role: "主图参考风格", description: "参考图模式：自动识别参考图的构图、光影、场景和视觉风格，生成适合上架或投放的商品图。", scope: "" },
    { label: "上身展示", role: "模特上身展示", description: "参考模特姿态、镜头距离和上身效果，突出商品穿着表现。", scope: "突出商品上身效果、版型和穿搭氛围。" },
    { label: "卖点海报", role: "卖点海报", description: "参考海报式构图和视觉层级，生成更适合点击和投放的商品主图。", scope: "突出核心卖点、第一眼吸引力和商品辨识度。" },
    { label: "场景氛围", role: "场景氛围图", description: "参考场景、光影和情绪氛围，让商品图更有生活感。", scope: "突出使用场景、穿搭情绪和品牌调性。" },
  ],
  details: [
    { label: "自动拆屏", role: "详情页参考风格", description: "参考图模式：自动识别参考图的版式、信息层级和视觉风格，按所选屏数拆成详情页方案。", scope: "" },
    { label: "首屏海报", role: "详情页首屏海报", description: "参考首屏海报的构图、标题层级和氛围，生成详情页开场屏。", scope: "用于详情页开头，突出风格、商品定位和第一眼吸引力。" },
    { label: "卖点说明", role: "核心卖点说明", description: "参考信息展示方式，把商品卖点拆成清晰易懂的详情页模块。", scope: "用于展示核心卖点、功能利益点和购买理由。" },
    { label: "细节材质", role: "细节材质展示", description: "参考局部特写和细节排版，生成面料、工艺或结构说明屏。", scope: "用于展示面料质感、细节工艺、版型或功能结构。" },
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
  onAddCustomTemplate,
}: ReferenceQuickStartProps) {
  const unit = imageType === "main" ? "张" : "屏";
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
        : imageType === "details" ? "参考图详情方案" : "参考图主图方案",
    }));
  }

  return (
    <div className="space-y-3">
      <input ref={customRefInputRef} aria-hidden="true" tabIndex={-1} type="file" accept="image/*" className="hidden" onChange={(event) => onUploadCustomReference("style", event.target.files?.[0])} />
      <input ref={customModelRefInputRef} aria-hidden="true" tabIndex={-1} type="file" accept="image/*" className="hidden" onChange={(event) => onUploadCustomReference("model", event.target.files?.[0])} />
      <input ref={customOtherRefInputRef} aria-hidden="true" tabIndex={-1} type="file" accept="image/*" className="hidden" onChange={(event) => onUploadCustomReference("other", event.target.files?.[0])} />

      <div className="rounded-2xl bg-white p-2 shadow-sm">
        <ReferenceUploadButton label="主参考图" hint="风格 / 版式" url={customDraft.referenceImageUrls[0]} loading={isUploadingCustomRef} onClick={() => customRefInputRef.current?.click()} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <ReferenceUploadButton label="模特参考" hint="可选" url={customDraft.modelReferenceImageUrls[0]} loading={isUploadingCustomRef} onClick={() => customModelRefInputRef.current?.click()} />
        <ReferenceUploadButton label={`补充参考 ${customDraft.otherReferenceImageUrls.length}/3`} hint="可选" url={customDraft.otherReferenceImageUrls[0]} loading={isUploadingCustomRef} onClick={() => customOtherRefInputRef.current?.click()} />
      </div>

      <fieldset className="rounded-2xl bg-white px-3 py-3">
        <legend className="sr-only">参考重点</legend>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-black text-slate-500">参考重点</p>
          <span className="rounded-full bg-[rgba(91,124,255,0.1)] px-2 py-0.5 text-[10px] font-black text-[var(--codex-accent)]">{activeIntent.label}</span>
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
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <details className="group rounded-2xl border border-slate-100 bg-white px-3 py-2">
        <summary className={`flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-xs font-black text-slate-600 ${focusRing}`}>
          <span className="inline-flex items-center gap-1.5"><Settings2 aria-hidden="true" className="h-3.5 w-3.5 text-[var(--codex-accent)]" /> 高级设置</span>
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-3 space-y-3">
          <fieldset>
            <legend className="mb-2 text-[11px] font-black text-slate-500">画面比例</legend>
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
                  {getAspectRatioLabel(value)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 items-stretch gap-2">
            <ToggleButton active={customDraft.subjectConsistency} label="商品一致" onClick={() => onCustomDraftChange((current) => ({ ...current, subjectConsistency: !current.subjectConsistency }))} />
            <ToggleButton active={customDraft.modelConsistency} label="模特一致" onClick={() => onCustomDraftChange((current) => ({ ...current, modelConsistency: !current.modelConsistency }))} />
            <ToggleButton active={customDraft.intelligentCopy} label="智能文案" onClick={() => onCustomDraftChange((current) => ({ ...current, intelligentCopy: !current.intelligentCopy }))} />
            <label>
              <span className="sr-only">文案密度</span>
              <select
                name="reference-copy-density"
                autoComplete="off"
                value={customDraft.copyDensity}
                onChange={(event) => onCustomDraftChange((current) => ({ ...current, copyDensity: event.target.value as ProductSetCopyDensity }))}
                className={`h-10 w-full rounded-xl border border-slate-100 bg-slate-50 px-2 text-xs font-bold text-slate-600 ${focusRing}`}
              >
                <option value="none">无文案</option>
                <option value="light">轻文案</option>
                <option value="standard">标准文案</option>
                <option value="rich">信息丰富</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="sr-only">特殊要求</span>
            <textarea
              name="reference-extra-description"
              autoComplete="off"
              value={customDraft.extraDescription}
              maxLength={600}
              onChange={(event) => onCustomDraftChange((current) => ({ ...current, extraDescription: event.target.value }))}
              className={`min-h-16 w-full resize-none rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 transition-colors focus-visible:border-[rgba(91,124,255,0.5)] ${focusRing}`}
              placeholder="例如：不要文字、不要模特露脸、突出细节…"
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
        {!hasReferenceImage ? "请先上传主参考图" : !hasCount ? `请先选择${imageType === "main" ? "张数" : "屏数"}` : `添加参考图并生成 ${genCount} ${unit}方案`}
      </button>
    </div>
  );
}
