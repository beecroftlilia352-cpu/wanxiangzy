import { Edit3, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { getAspectRatioLabel } from "@/features/product-set/create/config";
import {
  getProductSetModuleReason,
  shouldUseModelForTemplate,
  type ProductSetProductProfile,
  type ProductSetResolvedTemplate,
} from "@/lib/product-set";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2";

type PlanListProps = {
  templates: ProductSetResolvedTemplate[];
  productProfile: ProductSetProductProfile;
  limit?: number;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
};

export function PlanList({
  templates,
  productProfile,
  limit,
  onEdit,
  onRemove,
}: PlanListProps) {
  const t = useTranslations("ProductSet");
  if (!templates.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs text-slate-400">
        {t("create.planList.empty")}
      </div>
    );
  }

  const visibleTemplates = typeof limit === "number" ? templates.slice(0, limit) : templates;
  const hiddenCount = templates.length - visibleTemplates.length;

  return (
    <div>
      <ol className="space-y-2" aria-label={t("create.planList.ariaLabel")}>
        {visibleTemplates.map((template, index) => (
          <li key={`${template.source}-${template.id}`} className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-2">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-[var(--codex-accent)] shadow-sm">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black text-slate-800">{template.name}</p>
              <p className="truncate text-[11px] text-slate-400">{template.imageType === "details" ? t("create.planList.details") : t("create.planList.main")} · {getAspectRatioLabel(template.aspectRatio, t)} · {template.moduleRole}</p>
              <p className="mt-1 line-clamp-1 text-[10px] text-slate-400">{getProductSetModuleReason(template, productProfile)}</p>
            </div>
            {shouldUseModelForTemplate(template, productProfile) ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{t("create.planList.model")}</span>
            ) : null}
            <button
              type="button"
              aria-label={t("create.planList.editAria", { name: template.name })}
              onClick={() => onEdit(index)}
              className={`flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-[rgba(91,124,255,0.12)] hover:text-[var(--codex-accent)] ${focusRing}`}
            >
              <Edit3 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={t("create.planList.removeAria", { name: template.name })}
              onClick={() => onRemove(index)}
              className={`flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 ${focusRing}`}
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ol>
      {hiddenCount > 0 ? (
        <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-2 text-center text-[11px] font-bold text-slate-400">
          {t("create.planList.collapsed", { count: hiddenCount })}
        </div>
      ) : null}
    </div>
  );
}
