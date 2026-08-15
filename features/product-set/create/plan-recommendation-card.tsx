import { useTranslations } from "next-intl";
import {
  buildProductSetPlanRecommendation,
  type ProductSetImageType,
} from "@/lib/product-set";

type PlanRecommendationCardProps = {
  recommendation: ReturnType<typeof buildProductSetPlanRecommendation>;
  imageType: ProductSetImageType;
  compact?: boolean;
};

export function PlanRecommendationCard({
  recommendation,
  imageType,
  compact = false,
}: PlanRecommendationCardProps) {
  const t = useTranslations("ProductSet");
  const riskClass = recommendation.riskLevel === "low"
    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
    : "border-amber-100 bg-amber-50 text-amber-700";
  const unit = imageType === "main" ? t("units.mainImage") : t("units.detailPage");

  return (
    <section
      aria-label={t("create.recommendation.ariaLabel")}
      className={`${compact ? "" : "mb-3"} rounded-2xl border border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] p-3`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black text-[var(--codex-accent)]">{t("create.recommendation.ariaLabel")}</p>
          <h4 className="mt-1 truncate text-sm font-black text-slate-950 text-pretty dark:text-stone-100">
            {recommendation.title}
          </h4>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">
            {recommendation.summary}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${riskClass}`}>
          {recommendation.riskLevel === "high" ? t("create.recommendation.safeTemplate") : recommendation.riskLevel === "medium" ? t("create.recommendation.withModel") : t("create.recommendation.lowRisk")}
        </span>
      </div>
      <div className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-[var(--codex-accent)]">
        {t("create.recommendation.recommended", { count: recommendation.suggestedCount, unit })}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {recommendation.modules.slice(0, compact ? 4 : 6).map((module) => (
          <span key={module.key} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-stone-300">
            {module.usesModel ? `${t("create.recommendation.modelPrefix")} ` : ""}{module.name}
          </span>
        ))}
        {compact && recommendation.modules.length > 4 ? (
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-400">
            +{recommendation.modules.length - 4}
          </span>
        ) : null}
      </div>
    </section>
  );
}
