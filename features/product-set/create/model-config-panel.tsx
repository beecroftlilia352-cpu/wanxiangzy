import { Activity } from "lucide-react";
import { useTranslations } from "next-intl";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { MODELS } from "@/features/product-set/create/config";
import { getCreditCost, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import type { ProductSetImageType } from "@/lib/product-set";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2";

type ModelConfigPanelProps = {
  aiModel: LingyaModel;
  imageType: ProductSetImageType;
  imageSize: ImageSize;
  qualityMode: "standard" | "advanced";
  supportedSizes: ImageSize[];
  onModelChange: (value: LingyaModel) => void;
  onSizeChange: (value: ImageSize) => void;
  onQualityChange: (value: "standard" | "advanced") => void;
};

export function ModelConfigPanel({
  aiModel,
  imageType,
  imageSize,
  qualityMode,
  supportedSizes,
  onModelChange,
  onSizeChange,
  onQualityChange,
}: ModelConfigPanelProps) {
  const t = useTranslations("ProductSet");
  return (
    <section id="product-set-generation-settings" aria-label={t("create.modelConfig.ariaLabel")} className="space-y-3">
      <fieldset className="rounded-2xl border border-slate-100/80 bg-white/45 p-4">
        <legend className="mb-3 flex items-center gap-2 text-sm font-black text-slate-950 dark:text-stone-100">
          <Activity aria-hidden="true" className="h-4 w-4 text-[var(--codex-accent)]" /> {t("create.modelConfig.model")}
        </legend>
        <div role="radiogroup" className="grid grid-cols-2 items-stretch gap-2">
          {MODELS.map((model) => (
            <button
              key={model.value}
              type="button"
              role="radio"
              aria-checked={aiModel === model.value}
              onClick={() => onModelChange(model.value)}
              className={`min-h-[72px] touch-manipulation rounded-2xl border px-3 py-2.5 text-left transition-[border-color,background-color,color,box-shadow] ${focusRing} ${
                aiModel === model.value
                  ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-slate-950 shadow-[0_10px_26px_rgba(124,58,237,0.12)] dark:text-stone-100"
                  : "border-slate-100 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <RawPreviewImage src={model.icon} alt="" className="h-4 w-4 shrink-0 object-contain" />
                <span className="min-w-0 truncate text-[11px] font-black">{model.label}</span>
                {model.badge ? (
                  <span className="shrink-0 rounded-full bg-[rgba(91,124,255,0.1)] px-1.5 py-0.5 text-[9px] font-black text-[var(--codex-accent)]">
                    {model.badgeKey ? t(model.badgeKey) : model.badge}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 line-clamp-2 block pl-5 text-[11px] font-semibold leading-tight text-slate-400" title={model.descKey ? t(model.descKey) : model.desc}>{model.descKey ? t(model.descKey) : model.desc}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-slate-100/80 bg-white/45 p-4">
        <legend className="mb-3 text-sm font-black text-slate-950 dark:text-stone-100">{t("create.modelConfig.resolution")}</legend>
        <div role="radiogroup" className="grid grid-cols-3 gap-2">
          {supportedSizes.map((size) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={imageSize === size}
              onClick={() => onSizeChange(size)}
              className={`h-10 touch-manipulation rounded-xl border px-2 text-xs font-bold transition-colors ${focusRing} ${
                imageSize === size
                  ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {t("create.modelConfig.sizeCost", { size, cost: getCreditCost(aiModel, size, "3:4") })}
            </button>
          ))}
        </div>
        {imageType === "details" && imageSize === "1K" ? (
          <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-4 text-amber-700">
            {t("create.modelConfig.detailsWarning")}
          </div>
        ) : null}
      </fieldset>

      <fieldset className="rounded-2xl border border-slate-100/80 bg-white/45 p-4">
        <legend className="mb-3 text-sm font-black text-slate-950 dark:text-stone-100">{t("create.modelConfig.quality")}</legend>
        <div role="radiogroup" className="grid grid-cols-2 gap-2">
          {(["standard", "advanced"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={qualityMode === value}
              onClick={() => onQualityChange(value)}
              className={`h-10 touch-manipulation rounded-xl border px-3 text-xs font-bold transition-colors ${focusRing} ${
                qualityMode === value
                  ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {value === "standard" ? t("create.modelConfig.standardMode") : t("create.modelConfig.advancedMode")}
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-2xl border border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] px-3 py-3">
          <p className="text-xs font-black text-[var(--codex-accent)]">{t("create.modelConfig.aspectAutoNote")}</p>
          <p className="mt-1 text-[11px] leading-4 text-[var(--codex-accent)]">{t("create.modelConfig.aspectAutoDetail")}</p>
        </div>
      </fieldset>
    </section>
  );
}
