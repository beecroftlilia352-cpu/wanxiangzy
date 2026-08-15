import { Activity, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { MODELS } from "@/features/product-set/create/config";
import type { ImageSize, LingyaModel } from "@/lib/api/lingya";

type GenerationSettingsSummaryProps = {
  aiModel: LingyaModel;
  imageSize: ImageSize;
  qualityMode: "standard" | "advanced";
  expanded: boolean;
  onToggle: () => void;
};

export function GenerationSettingsSummary({
  aiModel,
  imageSize,
  qualityMode,
  expanded,
  onToggle,
}: GenerationSettingsSummaryProps) {
  const t = useTranslations("ProductSet");
  const model = MODELS.find((item) => item.value === aiModel);

  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls="product-set-generation-settings"
      onClick={onToggle}
      className="flex w-full touch-manipulation items-center justify-between gap-3 rounded-3xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-colors hover:border-[rgba(91,124,255,0.3)] hover:bg-[rgba(91,124,255,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-[var(--codex-accent)]">
          <Activity className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-black text-slate-950 dark:text-stone-100">{t("create.genSettings.title")}</span>
          <span className="mt-1 block truncate text-xs font-bold text-slate-400">
            {model?.label || aiModel} · {imageSize} · {qualityMode === "advanced" ? t("create.genSettings.advQuality") : t("create.genSettings.stdQuality")}
          </span>
        </span>
      </span>
      <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-slate-50 px-2.5 text-[11px] font-black text-slate-500">
        {expanded ? t("common.collapse") : t("create.genSettings.adjust")}
        <ChevronRight aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </span>
    </button>
  );
}
