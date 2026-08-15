"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronLeft, ChevronRight, Search, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { cn } from "@/lib/utils";

export type ReferenceScenePickerTab = "recommended" | "exclusive" | "all";
export type ReferenceScenePickerViewFilter = "all" | "front" | "back";
export type ReferenceScenePickerBodyFilter = "all" | "whole" | "upper" | "lower";

export type ReferenceScenePickerItem = {
  id: string;
  url: string;
  label: string;
  childReferences?: ReferenceScenePickerItem[];
  matchReasons?: string[];
  clothCategories?: string[];
  viewTags?: string[];
  cropTags?: string[];
  sceneTags?: string[];
  styleTags?: string[];
};

export type ReferenceScenePickerTabOption<TValue extends string = ReferenceScenePickerTab> = {
  value: TValue;
  label: string;
};

export type ReferenceScenePickerProps<TItem extends ReferenceScenePickerItem = ReferenceScenePickerItem> = {
  open: boolean;
  title?: string;
  description?: string;
  tabs: Array<ReferenceScenePickerTabOption<ReferenceScenePickerTab>>;
  activeTab: ReferenceScenePickerTab;
  onTabChange: (tab: ReferenceScenePickerTab) => void;
  mainReferences: TItem[];
  activeReference: TItem | null;
  childReferences: TItem[];
  selectedCount: number;
  maxSelected: number;
  categoryLabels?: string[];
  viewFilter: ReferenceScenePickerViewFilter;
  onViewFilterChange: (value: ReferenceScenePickerViewFilter) => void;
  bodyFilter: ReferenceScenePickerBodyFilter;
  onBodyFilterChange: (value: ReferenceScenePickerBodyFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  isSelected: (url: string) => boolean;
  onActiveReferenceChange: (url: string) => void;
  onToggleReference: (item: TItem) => void;
  onClearSelected: () => void;
  onClose: () => void;
  onConfirm: () => void;
  onPreview?: (url: string, label: string) => void;
  className?: string;
};

export function ReferenceScenePicker<TItem extends ReferenceScenePickerItem = ReferenceScenePickerItem>({
  open,
  title,
  description,
  tabs,
  activeTab,
  onTabChange,
  mainReferences,
  activeReference,
  childReferences,
  selectedCount,
  maxSelected,
  categoryLabels = [],
  viewFilter,
  onViewFilterChange,
  bodyFilter,
  onBodyFilterChange,
  search,
  onSearchChange,
  isSelected,
  onActiveReferenceChange,
  onToggleReference,
  onClearSelected,
  onClose,
  onConfirm,
  onPreview,
  className,
}: ReferenceScenePickerProps<TItem>) {
  const t = useTranslations("TryonShared");

  if (!open) return null;

  const pickerTitle = title ?? t("scenePicker.title");
  const pickerDescription = description ?? t("scenePicker.description");

  const showAllSceneLayout = activeTab === "all";
  const activeIndex = activeReference
    ? mainReferences.findIndex((item) => item.url === activeReference.url)
    : -1;
  const canMovePreview = showAllSceneLayout && mainReferences.length > 1 && activeIndex >= 0;

  const movePreview = (direction: -1 | 1) => {
    if (!canMovePreview) return;
    const nextIndex = (activeIndex + direction + mainReferences.length) % mainReferences.length;
    const next = mainReferences[nextIndex];
    if (next) onActiveReferenceChange(next.url);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[210] bg-slate-950/34 backdrop-blur-sm lg:left-[calc(var(--studio-nav-rail-width)+var(--studio-task-rail-width)+var(--studio-sidebar-width))] lg:bg-transparent lg:backdrop-blur-0"
        className={cn(
          "z-[211] !bottom-3 !left-3 !right-3 !top-3 !h-auto !w-auto !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden bg-transparent p-0 ring-0 shadow-none lg:!bottom-3 lg:!left-[calc(var(--studio-nav-rail-width)+var(--studio-task-rail-width)+var(--studio-sidebar-width)+20px)] lg:!right-5 lg:!top-6",
          className
        )}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-stone-900">
          <header className="relative flex h-16 shrink-0 items-center justify-center border-b border-slate-100 px-12">
            <div className="min-w-0 text-center">
              <DialogTitle className="truncate text-[13px] font-bold leading-normal text-slate-950">{pickerTitle}</DialogTitle>
              <DialogDescription className="hidden truncate text-[10px] text-slate-400 sm:block">{pickerDescription}</DialogDescription>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              aria-label={t("scenePicker.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="shrink-0 bg-slate-50 px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {tabs.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => onTabChange(item.value)}
                      className={cn(
                        "h-8 rounded-full px-4 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
                        activeTab === item.value
                          ? "bg-violet-100 text-[var(--codex-accent)]"
                          : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:bg-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="h-7 rounded-full bg-violet-100 px-3 text-[10px] font-bold text-[var(--codex-accent)]">
                    {t("scenePicker.allScenes")}
                  </button>
                  <button type="button" className="h-7 rounded-full bg-white px-3 text-[10px] font-medium text-slate-500 dark:bg-stone-900 dark:text-stone-400">
                    {t("scenePicker.studioLook")}
                  </button>
                  <button type="button" className="h-7 rounded-full bg-white px-3 text-[10px] font-medium text-slate-500 dark:bg-stone-900 dark:text-stone-400">
                    {t("scenePicker.realScene")}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <select
                  value={viewFilter}
                  onChange={(event) => onViewFilterChange(event.target.value as ReferenceScenePickerViewFilter)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-500 focus:border-[var(--codex-accent)] focus:outline-none dark:border-white/10 dark:bg-stone-900 dark:text-stone-400"
                  aria-label={t("scenePicker.viewFilterLabel")}
                >
                  <option value="all">{t("scenePicker.viewAll")}</option>
                  <option value="front">{t("scenePicker.viewFront")}</option>
                  <option value="back">{t("scenePicker.viewBack")}</option>
                </select>
                <select
                  value={bodyFilter}
                  onChange={(event) => onBodyFilterChange(event.target.value as ReferenceScenePickerBodyFilter)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-500 focus:border-[var(--codex-accent)] focus:outline-none dark:border-white/10 dark:bg-stone-900 dark:text-stone-400"
                  aria-label={t("scenePicker.bodyFilterLabel")}
                >
                  <option value="all">{t("scenePicker.bodyAll")}</option>
                  <option value="whole">{t("scenePicker.bodyWhole")}</option>
                  <option value="upper">{t("scenePicker.bodyUpper")}</option>
                  <option value="lower">{t("scenePicker.bodyLower")}</option>
                </select>
                {categoryLabels.slice(0, 2).map((category) => (
                  <span key={category} className="inline-flex h-8 max-w-[210px] items-center rounded-lg bg-white px-2.5 text-[11px] font-medium text-slate-600 dark:bg-stone-800 dark:text-stone-300">
                    <span className="truncate">{category}</span>
                    <X className="ml-1 h-3 w-3 text-slate-400" />
                  </span>
                ))}
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={t("scenePicker.searchPlaceholder")}
                    className="h-8 w-[min(260px,calc(100vw-96px))] rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[11px] text-slate-600 outline-none transition focus:border-[var(--codex-accent)]"
                  />
                </label>
              </div>
            </div>
          </div>

          {showAllSceneLayout ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 bg-white lg:grid-cols-[minmax(280px,34%)_minmax(0,1fr)]">
              <ScenePreviewPane
                activeReference={activeReference}
                total={mainReferences.length}
                activeIndex={activeIndex}
                selectedCount={selectedCount}
                maxSelected={maxSelected}
                onPreview={onPreview}
                onPrevious={() => movePreview(-1)}
                onNext={() => movePreview(1)}
                canMove={canMovePreview}
              />
              <div className="studio-scrollbar-hide min-h-0 overflow-y-auto px-4 py-4">
                {mainReferences.length ? (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {mainReferences.map((ref) => (
                      <SceneMainCard
                        key={ref.url}
                        item={ref}
                        active={activeReference?.url === ref.url}
                        selected={isSelected(ref.url)}
                        onClick={() => {
                          onActiveReferenceChange(ref.url);
                          onToggleReference(ref);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <PickerEmptyState label={t("scenePicker.emptyScene")} />
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col bg-white">
              <div className="shrink-0 border-b border-slate-100 px-4 py-3">
                <div className="studio-scrollbar-hide flex gap-3 overflow-x-auto pb-1">
                  {mainReferences.map((ref) => (
                    <button
                      key={ref.url}
                      type="button"
                      onClick={() => onActiveReferenceChange(ref.url)}
                      className={cn(
                        "w-[108px] shrink-0 overflow-hidden rounded-lg border bg-white text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
                        activeReference?.url === ref.url
                          ? "border-[var(--codex-accent)] shadow-sm"
                          : "border-slate-200 hover:border-slate-300"
                      )}
                    >
                      <RawPreviewImage src={ref.url} alt={ref.label || t("scenePicker.mainScene")} className="aspect-[3/4] w-full object-cover" />
                      <p className="line-clamp-2 px-2 py-1.5 text-center text-[11px] font-medium text-slate-700">{ref.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="studio-scrollbar-hide min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <h4 className="mb-4 text-center text-[13px] font-bold text-[var(--codex-accent)]">{t("scenePicker.scenePose")}</h4>
                {childReferences.length ? (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {childReferences.map((ref) => (
                      <SceneChildCard
                        key={ref.url}
                        item={ref}
                        selected={isSelected(ref.url)}
                        onClick={() => onToggleReference(ref)}
                      />
                    ))}
                  </div>
                ) : (
                  <PickerEmptyState label={t("scenePicker.emptyPose")} />
                )}
              </div>
            </div>
          )}

          <footer className="flex h-16 shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white/92 px-4">
            {selectedCount > 0 ? (
              <div className="flex items-center gap-4">
                <span className="text-[11px] font-semibold text-[var(--codex-accent)]">{t("scenePicker.selectedCount", { count: selectedCount, max: maxSelected })}</span>
                <button
                  type="button"
                  onClick={onClearSelected}
                  className="text-[11px] font-medium text-red-500 transition hover:text-red-600"
                >
                  {t("scenePicker.clearAll")}
                </button>
              </div>
            ) : (
              <div />
            )}
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-10 min-w-[120px] rounded-lg border border-slate-200 bg-white px-5 text-[13px] font-bold text-slate-700 transition hover:bg-slate-50"
              >
                {t("scenePicker.cancel")}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!selectedCount}
                className="h-10 min-w-[120px] rounded-lg bg-[var(--codex-accent)] px-5 text-[13px] font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-slate-200"
              >
                {t("scenePicker.confirm")}
              </button>
            </div>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScenePreviewPane({
  activeReference,
  total,
  activeIndex,
  selectedCount,
  maxSelected,
  onPreview,
  onPrevious,
  onNext,
  canMove,
}: {
  activeReference: ReferenceScenePickerItem | null;
  total: number;
  activeIndex: number;
  selectedCount: number;
  maxSelected: number;
  onPreview?: (url: string, label: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  canMove: boolean;
}) {
  const t = useTranslations("TryonShared");
  return (
    <aside className="flex min-h-[320px] flex-col border-b border-slate-100 bg-slate-50 p-4 lg:min-h-0 lg:border-b-0 lg:border-r">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-slate-100">
        {activeReference ? (
          <>
            <button
              type="button"
              onClick={() => onPreview?.(activeReference.url, activeReference.label || t("scenePicker.mainScene"))}
              className="block h-full w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              aria-label={t("scenePicker.previewScene", { label: activeReference.label })}
            >
              <RawPreviewImage src={activeReference.url} alt={activeReference.label || t("scenePicker.mainScene")} className="h-full min-h-[320px] w-full object-cover lg:min-h-0" />
            </button>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-slate-950/68 to-transparent p-3 text-white">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold">{activeReference.label}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {[...(activeReference.viewTags || []), ...(activeReference.cropTags || [])].slice(0, 4).map((tag) => (
                    <span key={tag} className="rounded bg-slate-950/48 px-1.5 py-0.5 text-[10px] font-medium">
                      {tag.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-slate-950/58 px-2 py-1 text-[11px] font-bold">
                {activeIndex >= 0 ? activeIndex + 1 : 0}/{total}
              </span>
            </div>
            {canMove && (
              <>
                <button
                  type="button"
                  onClick={onPrevious}
                  className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/50 text-white transition hover:bg-slate-950/68"
                  aria-label={t("scenePicker.previousScene")}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/50 text-white transition hover:bg-slate-950/68"
                  aria-label={t("scenePicker.nextScene")}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </>
        ) : (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center text-slate-400">
            <Sparkles className="mb-2 h-6 w-6" />
            <p className="text-xs font-medium">{t("scenePicker.notSelected")}</p>
            <p className="mt-1 text-[11px] text-[var(--codex-accent)]">{t("scenePicker.notSelectedHint")}</p>
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl bg-white px-3 py-3">
        <p className="text-center text-xs text-slate-500">
          {t("scenePicker.matchHintPrefix")}
          <span className="font-semibold text-red-500">{t("scenePicker.matchHintHighlight")}</span>
          {t("scenePicker.matchHintSuffix")}
        </p>
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
          <span>{t("scenePicker.totalScenes", { total })}</span>
          {selectedCount > 0 && (
            <span className="font-semibold text-[var(--codex-accent)]">{t("scenePicker.selectedCount", { count: selectedCount, max: maxSelected })}</span>
          )}
        </div>
      </div>
    </aside>
  );
}

function SceneMainCard({
  item,
  active,
  selected,
  onClick,
}: {
  item: ReferenceScenePickerItem;
  active: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("TryonShared");
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-white text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
        active || selected ? "border-[var(--codex-accent)] shadow-sm" : "border-slate-200 hover:border-slate-300"
      )}
      aria-label={t("scenePicker.selectScene", { label: item.label })}
    >
      <RawPreviewImage src={item.url} alt={item.label || t("scenePicker.sceneImage")} className="aspect-[3/4] w-full object-cover transition-transform group-hover:scale-[1.02]" />
      <span className={cn(
        "absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white/92 shadow-sm",
        selected ? "border-[var(--codex-accent)] bg-[var(--codex-accent)]" : "border-white"
      )}>
        {selected && <CheckCircle2 className="h-4 w-4 text-white" />}
      </span>
      <p className="line-clamp-2 px-2 py-2 text-center text-[10px] font-medium leading-4 text-slate-700">{item.label}</p>
    </button>
  );
}

function SceneChildCard({
  item,
  selected,
  onClick,
}: {
  item: ReferenceScenePickerItem;
  selected: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("TryonShared");
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border-2 bg-white text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
        selected ? "border-[var(--codex-accent)] shadow-sm" : "border-transparent hover:border-slate-300"
      )}
      aria-label={t("scenePicker.selectPose", { label: item.label })}
    >
      <RawPreviewImage src={item.url} alt={item.label || t("scenePicker.poseImage")} className="aspect-[3/4] w-full object-cover transition-transform group-hover:scale-[1.02]" />
      <span className={cn(
        "absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white/90 shadow-sm",
        selected ? "border-[var(--codex-accent)] bg-[var(--codex-accent)]" : "border-white"
      )}>
        {selected && <CheckCircle2 className="h-4 w-4 text-white" />}
      </span>
      <p className="line-clamp-2 px-2 py-2 text-center text-[10px] font-medium leading-4 text-slate-700">{item.label}</p>
    </button>
  );
}

function PickerEmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center py-20 text-center text-xs text-slate-400">
      <Sparkles className="mb-2 h-6 w-6" />
      {label}
    </div>
  );
}
