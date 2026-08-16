import { useTranslations } from "next-intl";
import { ResolutionSelector } from "@/components/studio/ResolutionSelector";
import { StudioModelSelector } from "@/components/studio/StudioModelSelector";
import { getCreditCost, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { useStudioImageModelOptions } from "@/lib/studio-models";
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
  const modelOptions = useStudioImageModelOptions();
  return (
    <section id="product-set-generation-settings" aria-label={t("create.modelConfig.ariaLabel")} className="space-y-3">
      <StudioModelSelector
        models={modelOptions}
        value={aiModel}
        onChange={onModelChange}
        ariaLabel={t("create.modelConfig.model")}
      />

      <div className="py-1">
        <ResolutionSelector
          title={t("create.modelConfig.resolution")}
          options={supportedSizes.map((size) => ({
            value: size,
            label: size,
            description: t("create.modelConfig.sizeCost", { size, cost: getCreditCost(aiModel, size, "3:4") }),
          }))}
          value={imageSize}
          onChange={onSizeChange}
          ariaLabel={t("create.modelConfig.resolution")}
        />
        {imageType === "details" && imageSize === "1K" ? (
          <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-4 text-amber-700">
            {t("create.modelConfig.detailsWarning")}
          </div>
        ) : null}
      </div>

      <fieldset className="rounded-2xl border border-slate-100/80 bg-white/45 p-4">
        <legend className="studio-control-title mb-3">{t("create.modelConfig.quality")}</legend>
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
