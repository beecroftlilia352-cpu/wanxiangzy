import { Bookmark, ChevronRight, Loader2, Save, Trash2 } from "lucide-react";
import type { SavedProductSetPlan } from "@/lib/product-set-ui-state";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2";
const savedPlanDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type FavoritePlanPanelProps = {
  embedded?: boolean;
  plans: SavedProductSetPlan[];
  draftName: string;
  defaultName: string;
  currentPlanCount: number;
  showList: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onDraftNameChange: (value: string) => void;
  onSave: () => void;
  onApply: (plan: SavedProductSetPlan) => void;
  onDelete: (id: string) => void;
  onToggleList?: () => void;
};

export function FavoritePlanPanel({
  embedded = false,
  plans,
  draftName,
  defaultName,
  currentPlanCount,
  showList,
  isLoading,
  isSaving,
  onDraftNameChange,
  onSave,
  onApply,
  onDelete,
  onToggleList,
}: FavoritePlanPanelProps) {
  const shouldShowList = embedded || showList;

  return (
    <section aria-label="我的收藏模板" className={`${embedded ? "" : "mt-3"} rounded-2xl border border-slate-100 bg-slate-50 p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="inline-flex items-center gap-1.5 text-xs font-black text-slate-800">
            <Bookmark aria-hidden="true" className="h-3.5 w-3.5 text-[var(--codex-accent)]" /> 我的收藏模板
          </h3>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">
            收藏当前视觉方案或自定义模板，下次换商品后直接套用。
          </p>
        </div>
        {!embedded && onToggleList ? (
          <button
            type="button"
            aria-expanded={showList}
            aria-controls="favorite-plan-list"
            onClick={onToggleList}
            className={`inline-flex h-8 shrink-0 touch-manipulation items-center gap-1 rounded-full bg-white px-2.5 text-[11px] font-black text-[var(--codex-accent)] transition-colors hover:bg-[rgba(91,124,255,0.12)] ${focusRing}`}
          >
            {plans.length} 套
            <ChevronRight aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${showList ? "rotate-90" : ""}`} />
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">收藏方案名称</span>
          <input
            name="favorite-plan-name"
            autoComplete="off"
            value={draftName}
            maxLength={40}
            onChange={(event) => onDraftNameChange(event.target.value)}
            placeholder={`${defaultName}…`}
            className={`h-10 w-full rounded-xl border border-slate-100 bg-white px-3 text-xs font-bold text-slate-700 transition-colors focus-visible:border-[rgba(91,124,255,0.5)] ${focusRing}`}
          />
        </label>
        <button
          type="button"
          onClick={onSave}
          disabled={currentPlanCount <= 0 || isSaving}
          className={`inline-flex h-10 shrink-0 touch-manipulation items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-black text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
        >
          {isSaving ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" className="h-3.5 w-3.5" />}
          {isSaving ? "收藏中…" : "收藏"}
        </button>
      </div>

      {shouldShowList ? (
        <div id="favorite-plan-list" aria-live="polite" className="mt-3 space-y-2">
          {isLoading ? (
            <p className="rounded-2xl bg-white px-3 py-4 text-center text-xs text-slate-400">
              正在加载账号收藏方案…
            </p>
          ) : plans.length ? plans.map((plan) => (
            <article key={plan.id} className="rounded-2xl border border-white bg-white px-3 py-3 shadow-sm">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-xs font-black text-slate-800">{plan.name}</h4>
                  <p className="mt-0.5 truncate text-[11px] font-bold text-slate-400">
                    {formatSavedPlanMeta(plan)} · {formatSavedPlanTime(plan.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onApply(plan)}
                  className={`h-8 shrink-0 touch-manipulation rounded-full bg-[rgba(91,124,255,0.1)] px-3 text-[11px] font-black text-[var(--codex-accent)] transition-colors hover:bg-[rgba(91,124,255,0.12)] ${focusRing}`}
                >
                  套用
                </button>
                <button
                  type="button"
                  aria-label={`删除收藏方案${plan.name}`}
                  onClick={() => onDelete(plan.id)}
                  className={`flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 ${focusRing}`}
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </div>
              {plan.planPreview.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {plan.planPreview.slice(0, 4).map((module, index) => (
                    <span key={`${plan.id}-${module.name}-${index}`} className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                      {module.usesModel ? "模特 · " : ""}{module.name}
                    </span>
                  ))}
                  {plan.planPreview.length > 4 ? (
                    <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                      +{plan.planPreview.length - 4}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </article>
          )) : (
            <p className="rounded-2xl bg-white px-3 py-4 text-center text-xs text-slate-400">
              暂无账号收藏方案。先调整好当前生成计划，再点收藏。
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function formatSavedPlanMeta(plan: SavedProductSetPlan) {
  const modeLabel = plan.mode === "custom" ? "自定义方案" : "视觉方案";
  const imageTypeLabel = plan.imageType === "details" ? "详情页" : "主图";
  const unit = plan.imageType === "details" ? "屏" : "张";
  const count = plan.planPreview.length || plan.genCount;
  return `${modeLabel} · ${imageTypeLabel} · ${count}${unit}`;
}

function formatSavedPlanTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : savedPlanDateFormatter.format(date);
}
