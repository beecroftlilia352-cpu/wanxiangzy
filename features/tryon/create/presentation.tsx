import type { CSSProperties, ReactNode, RefObject } from "react";
import { CheckCircle2, Loader2, Upload, X, XCircle } from "lucide-react";
import { ClientPortal } from "@/components/ClientPortal";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import {
  VisualAnalysisStatusCard,
  type VisualAnalysisInlineStatus,
  type VisualAnalysisSummaryItem,
} from "@/components/studio/VisualAnalysisStatus";
import {
  GARMENT_DETAIL_SWITCH_DESCRIPTION,
  GARMENT_DETAIL_UPLOAD_FOOTNOTE,
  MAX_GARMENT_DETAIL_IMAGES,
  type GarmentDetailReferenceGroup,
} from "@/lib/garment-detail-references";
import type { TryOnClothingMode, TryOnRuleDemo } from "@/lib/tryon-upload-rules";
import { TRYON_UPLOAD_RULES } from "@/lib/tryon-upload-rules";
import { MAX_TRYON_REFERENCE_IMAGES } from "./constants";
import { getGarmentDetailOwnerLabel, type VisibleClothingItem } from "./clothing-utils";

type TryOnUploadRule = (typeof TRYON_UPLOAD_RULES)[TryOnClothingMode];

export type TryOnLightboxImage = {
  src: string;
  alt: string;
};

export type TryOnInlineStatus = VisualAnalysisInlineStatus;

export type TryOnReferenceAnalysisSummary = VisualAnalysisSummaryItem;

export function TryOnAnalysisStatusBadge({
  status,
  className = "",
  children,
}: {
  status: TryOnInlineStatus | null;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <VisualAnalysisStatusCard status={status} className={className}>
      {children}
    </VisualAnalysisStatusCard>
  );
}

export function TryOnReferenceAnalysisStatus({
  status,
  summaries,
  isAnalyzing,
}: {
  status: TryOnInlineStatus | null;
  summaries: TryOnReferenceAnalysisSummary[];
  isAnalyzing: boolean;
}) {
  return (
    <VisualAnalysisStatusCard
      status={status}
      summaries={summaries}
      isAnalyzing={isAnalyzing}
      className="mb-2"
    />
  );
}

export function ReferenceSelectionFooter({
  selectedCount,
  isSaving,
  onClear,
  onSave,
}: {
  selectedCount: number;
  isSaving: boolean;
  onClear: () => void;
  onSave: () => void;
}) {
  if (selectedCount <= 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-end gap-3 text-[11px] font-medium">
      <span className="text-[var(--codex-accent)]">已选 {selectedCount}/{MAX_TRYON_REFERENCE_IMAGES}</span>
      <button
        type="button"
        onClick={onClear}
        disabled={!selectedCount}
        className="text-red-500 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        全部删除
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={!selectedCount || isSaving}
        className="text-[var(--codex-accent)] transition hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSaving ? "收藏中" : "收藏为模板"}
      </button>
    </div>
  );
}

export function GarmentDetailReferencePanel({
  enabled,
  total,
  clothingItems,
  uploadedClothingUrls,
  groups,
  unassignedUrls,
  inputRef,
  clothingMode,
  isDragging,
  setDragging,
  isUploading,
  onToggle,
  onFiles,
  onOpenClothingPicker,
  onOpenLightbox,
  onRemoveDetail,
  onSetDetailTarget,
}: {
  enabled: boolean;
  total: number;
  clothingItems: VisibleClothingItem[];
  uploadedClothingUrls: string[];
  groups: GarmentDetailReferenceGroup[];
  unassignedUrls: string[];
  inputRef: RefObject<HTMLInputElement | null>;
  clothingMode: TryOnClothingMode;
  isDragging: boolean;
  setDragging: (dragging: boolean) => void;
  isUploading: boolean;
  onToggle: () => void;
  onFiles: (files: File[]) => void | Promise<void>;
  onOpenClothingPicker: (role: "upper" | "single") => void;
  onOpenLightbox: (src: string, alt: string) => void;
  onRemoveDetail: (url: string, clothingIndex?: number) => void;
  onSetDetailTarget: (clothingIndex: number) => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-all ${
          enabled
            ? "border-blue-300 bg-blue-50 text-blue-800 dark:border-[rgba(91,140,255,0.55)] dark:bg-[rgba(91,140,255,0.18)] dark:text-[#cfd8ff]"
            : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-white/10 dark:bg-[#1c1c1e] dark:text-stone-200 dark:hover:border-white/20"
        }`}
      >
        <span className="min-w-0">
          <span className="block text-sm font-black">服装细节参考</span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-stone-400">
            {GARMENT_DETAIL_SWITCH_DESCRIPTION}
          </span>
        </span>
        <span className={`ml-3 flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${enabled ? "bg-[var(--codex-accent)]" : "bg-neutral-200 dark:bg-white/10"}`}>
          <span className={`h-5 w-5 rounded-full bg-white shadow transition dark:bg-stone-100 ${enabled ? "translate-x-5" : "translate-x-0"}`} />
        </span>
      </button>

      {enabled && (
        <StudioUploadSection
          title={(
            <span className="flex items-center gap-2">
              给每件服装补细节
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                {total}/{MAX_GARMENT_DETAIL_IMAGES}
              </span>
            </span>
          )}
          inputRef={inputRef}
          onFiles={onFiles}
          multiple
          isDragging={isDragging}
          setDragging={setDragging}
          className="rounded-2xl border border-blue-100 bg-blue-50/35 p-3"
        >
          {(openFileDialog) => {
            const detailSlots = clothingItems
              .map((item) => ({
                item,
                clothingIndex: uploadedClothingUrls.findIndex((url) => url === item.url),
              }))
              .filter((entry) => entry.clothingIndex >= 0);
            const remainingDetailCount = MAX_GARMENT_DETAIL_IMAGES - total;
            const canAddDetail = remainingDetailCount > 0 && !isUploading;
            const openDetailDialog = (clothingIndex: number) => {
              onSetDetailTarget(clothingIndex);
              openFileDialog();
            };

            return (
              <div className="space-y-3">
                {detailSlots.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => onOpenClothingPicker(clothingMode === "multi" ? "upper" : "single")}
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-blue-200 bg-white/85 p-3 text-left text-blue-700 transition hover:border-blue-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <Upload className="h-5 w-5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold">先上传服装主图</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-blue-700/75">
                        上传后可以在对应服装下补充领口、面料、logo、背面或侧面细节。
                      </span>
                    </span>
                  </button>
                ) : (
                  <div className="grid gap-3">
                    {detailSlots.map(({ item, clothingIndex }) => {
                      const details = groups.find((group) => group.clothingIndex === clothingIndex)?.urls || [];
                      const roleLabel = getGarmentDetailOwnerLabel(item.role, clothingIndex);
                      return (
                        <div
                          key={`${item.url}-${clothingIndex}`}
                          onPointerEnter={() => onSetDetailTarget(clothingIndex)}
                          className="rounded-xl border border-blue-100 bg-white/90 p-2.5 shadow-sm"
                        >
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => onOpenLightbox(item.preview, `${roleLabel}主图`)}
                              className="relative h-24 w-[72px] shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                              aria-label={`预览${roleLabel}主图`}
                            >
                              <RawPreviewImage src={item.preview} alt={`${roleLabel}主图`} className="h-full w-full object-cover" />
                              <span className="absolute bottom-1 left-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                                {roleLabel}
                              </span>
                            </button>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-black text-slate-900">{roleLabel}细节</p>
                                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                                    只放这一件的材质、结构或局部特写。
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                                  {details.length} 张
                                </span>
                              </div>

                              <div className="mt-2 grid grid-cols-4 gap-2">
                                {details.map((url, index) => (
                                  <div key={url} className="group relative overflow-hidden rounded-lg border border-blue-200 bg-white">
                                    <button
                                      type="button"
                                      onClick={() => onOpenLightbox(url, `${roleLabel}细节${index + 1}`)}
                                      className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                      aria-label={`预览${roleLabel}细节${index + 1}`}
                                    >
                                      <RawPreviewImage src={url} alt={`${roleLabel}细节${index + 1}`} className="aspect-square w-full object-cover" />
                                      <span className="absolute bottom-1 left-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                                        {index + 1}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onRemoveDetail(url, clothingIndex)}
                                      className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm transition hover:text-red-500"
                                      aria-label={`移除${roleLabel}细节${index + 1}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => openDetailDialog(clothingIndex)}
                                  disabled={!canAddDetail}
                                  className={`flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed bg-white text-blue-500 transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 ${isDragging ? "border-blue-400 bg-blue-50" : "border-blue-200"}`}
                                  aria-label={`添加${roleLabel}细节图`}
                                  title={remainingDetailCount <= 0 ? `最多 ${MAX_GARMENT_DETAIL_IMAGES} 张细节图` : `添加${roleLabel}细节图`}
                                >
                                  {isUploading ? <Loader2 className="mb-1 h-4 w-4 animate-spin" /> : <Upload className="mb-1 h-4 w-4" />}
                                  <span className="text-[11px] font-semibold">添加</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {unassignedUrls.length > 0 && (
                  <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-amber-800">历史未归属细节</p>
                      <span className="text-[10px] font-semibold text-amber-700">
                        {unassignedUrls.length} 张
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {unassignedUrls.map((url, index) => (
                        <div key={url} className="relative overflow-hidden rounded-lg border border-amber-200 bg-white">
                          <button
                            type="button"
                            onClick={() => onOpenLightbox(url, `未归属细节${index + 1}`)}
                            className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                            aria-label={`预览未归属细节${index + 1}`}
                          >
                            <RawPreviewImage src={url} alt={`未归属细节${index + 1}`} className="aspect-square w-full object-cover" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveDetail(url)}
                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm transition hover:text-red-500"
                            aria-label={`移除未归属细节${index + 1}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-4 text-amber-700">
                      旧任务带来的细节图没有服装归属，生成时只会在明显匹配时轻量使用。
                    </p>
                  </div>
                )}

                <p className="rounded-lg bg-blue-50/70 px-2.5 py-2 text-[11px] leading-relaxed text-blue-800">
                  {GARMENT_DETAIL_UPLOAD_FOOTNOTE}
                </p>
              </div>
            );
          }}
        </StudioUploadSection>
      )}
    </div>
  );
}

export function TryOnRulePopover({
  open,
  style,
  clothingMode,
  rule,
  onMouseEnter,
  onMouseLeave,
  onApplyDemo,
}: {
  open: boolean;
  style: CSSProperties & { maxHeight: number };
  clothingMode: TryOnClothingMode;
  rule: TryOnUploadRule;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onApplyDemo: (demo: TryOnRuleDemo) => void;
}) {
  if (!open) return null;
  return (
    <ClientPortal>
      <div
        className="fixed z-[240] w-[min(760px,calc(100vw-32px))] overflow-hidden rounded-[24px] border border-white/80 bg-white/[0.96] shadow-[0_28px_90px_rgba(15,23,42,0.18)] backdrop-blur-2xl animate-fade-in"
        style={style}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-500">{rule.shortTitle}</p>
            <h3 className="mt-1 text-base font-bold text-slate-950">{rule.title}</h3>
            <p className="mt-1 text-xs text-slate-500">{rule.uploadSpecText}</p>
          </div>
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-600">Hover 预览</span>
        </div>

        <div className="studio-scrollbar-hide overflow-y-auto px-5 py-4" style={{ maxHeight: style.maxHeight - 88 }}>
          <div className={`grid gap-3 ${clothingMode === "multi" ? "md:grid-cols-3" : "md:grid-cols-5"}`}>
            {rule.demos.map((demo, demoIndex) => (
              <div key={`${clothingMode}-${demo.title}-${demoIndex}`} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
                <div className={`grid gap-1 ${demo.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {demo.images.map((image, imageIndex) => (
                    <div key={`${demo.title}-${image.role}-${imageIndex}-${image.url}`} className="relative overflow-hidden rounded-xl bg-white">
                      <RawPreviewImage src={image.url} alt={image.title} className="aspect-square w-full object-cover" />
                      <CheckCircle2 className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white text-emerald-500" />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-700">{demo.title}</p>
                  <button
                    type="button"
                    onClick={() => onApplyDemo(demo)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-violet-200 hover:text-violet-600"
                  >
                    试一试
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl bg-red-50/40 p-3">
            <p className="mb-3 text-center text-xs font-medium text-slate-500">{rule.deprecatedTitle}</p>
            <div className="mx-auto grid max-w-lg grid-cols-3 gap-3">
              {rule.deprecatedImages.map((image) => (
                <div key={image.title} className="rounded-2xl border border-red-100 bg-white/70 p-2 text-center">
                  <div className="relative overflow-hidden rounded-xl bg-white">
                    <RawPreviewImage src={image.url} alt={image.title} className="aspect-square w-full object-cover" />
                    <XCircle className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white text-red-500" />
                  </div>
                  <p className="mt-2 text-xs font-medium text-slate-600">{image.title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ClientPortal>
  );
}

export function TryOnLightbox({
  image,
  onClose,
}: {
  image: TryOnLightboxImage | null;
  onClose: () => void;
}) {
  if (!image) return null;
  return (
    <ClientPortal>
      <div
        className="fixed inset-0 z-[180] flex cursor-zoom-out items-center justify-center bg-slate-950/66 p-4 backdrop-blur-xl sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-label={image.alt}
        onClick={onClose}
      >
        <RawPreviewImage
          src={image.src}
          alt={image.alt}
          className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_32px_120px_rgba(0,0,0,0.45)]"
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/85 bg-white/90 text-slate-700 shadow-[0_12px_34px_rgba(15,23,42,0.22)] backdrop-blur transition-colors hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:right-6 sm:top-6"
          aria-label="关闭图片预览"
          title="关闭图片预览"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </ClientPortal>
  );
}
