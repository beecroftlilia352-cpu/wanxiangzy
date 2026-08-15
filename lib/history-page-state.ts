import { normalizeGenerationStatus } from "@/lib/generation-status";

export type HistoryModuleFilter =
  | "all"
  | "tryon"
  | "grass"
  | "productRetouch"
  | "productSet"
  | "modelBackground"
  | "materialEnhancement"
  | "generalImage"
  | "outfitFusion"
  | "pose"
  | "model"
  | "garment3d"
  | "faceSwap"
  | "videoImageToVideo"
  | "videoMotion"
  | "videoFirstLastFrame";

export type HistoryStatusFilter = "all" | "completed" | "processing" | "pending" | "failed";

export type HistoryFilterStateCopy = {
  moduleLabel: string;
  moduleLabelKey?: string;
  statusLabel: string;
  statusLabelKey?: string;
  summary: string;
  summaryKey?: string;
  summaryParams?: Record<string, string | number>;
  activeDescription: string;
  activeDescriptionKey?: string;
  activeDescriptionParams?: Record<string, string | number>;
  isFiltered: boolean;
  emptyTitle: string;
  emptyTitleKey?: string;
  emptyMessage: string;
  emptyMessageKey?: string;
  emptyActionLabel: string;
  emptyActionLabelKey?: string;
  noMatchMessage: string;
  noMatchMessageKey?: string;
};

export type HistoryFailureRecoveryCopy = {
  title: string;
  titleKey?: string;
  reasonLabel: string;
  reasonLabelKey?: string;
  reason: string;
  reasonKey?: string;
  recoveryLabel: string;
  recoveryLabelKey?: string;
  recoveryHint: string;
  recoveryHintKey?: string;
  recoveryHintParams?: Record<string, string | number>;
  applyLabel: string;
  applyLabelKey?: string;
};

const MODULE_FILTER_LABELS: Record<HistoryModuleFilter, string> = {
  all: "全部模块",
  tryon: "服装上身",
  grass: "服装种草",
  productRetouch: "商品精修",
  productSet: "商品套图",
  modelBackground: "模特换背景",
  materialEnhancement: "材质增强",
  generalImage: "通用生图",
  outfitFusion: "搭配融图",
  pose: "姿势裂变",
  model: "专属模特",
  garment3d: "服装 3D",
  faceSwap: "换脸",
  videoImageToVideo: "图生视频",
  videoMotion: "动作模仿",
  videoFirstLastFrame: "首尾帧",
};

const STATUS_FILTER_LABELS: Record<HistoryStatusFilter, string> = {
  all: "全部状态",
  completed: "已完成",
  processing: "处理中",
  pending: "排队中",
  failed: "失败",
};

export const HISTORY_MODULE_FILTER_KEYS: Record<HistoryModuleFilter, string> = {
  all: "LibShared.history.module.all",
  tryon: "LibShared.history.module.tryon",
  grass: "LibShared.history.module.grass",
  productRetouch: "LibShared.history.module.productRetouch",
  productSet: "LibShared.history.module.productSet",
  modelBackground: "LibShared.history.module.modelBackground",
  materialEnhancement: "LibShared.history.module.materialEnhancement",
  generalImage: "LibShared.history.module.generalImage",
  outfitFusion: "LibShared.history.module.outfitFusion",
  pose: "LibShared.history.module.pose",
  model: "LibShared.history.module.model",
  garment3d: "LibShared.history.module.garment3d",
  faceSwap: "LibShared.history.module.faceSwap",
  videoImageToVideo: "LibShared.history.module.videoImageToVideo",
  videoMotion: "LibShared.history.module.videoMotion",
  videoFirstLastFrame: "LibShared.history.module.videoFirstLastFrame",
};

export const HISTORY_STATUS_FILTER_KEYS: Record<HistoryStatusFilter, string> = {
  all: "LibShared.history.status.all",
  completed: "LibShared.history.status.completed",
  processing: "LibShared.history.status.processing",
  pending: "LibShared.history.status.pending",
  failed: "LibShared.history.status.failed",
};

const MODULE_FILTER_VALUES = new Set<HistoryModuleFilter>(
  Object.keys(MODULE_FILTER_LABELS) as HistoryModuleFilter[]
);
const STATUS_FILTER_VALUES = new Set<HistoryStatusFilter>(
  Object.keys(STATUS_FILTER_LABELS) as HistoryStatusFilter[]
);

export function parseHistoryModuleFilter(value: string | null | undefined): HistoryModuleFilter {
  return value && MODULE_FILTER_VALUES.has(value as HistoryModuleFilter) ? (value as HistoryModuleFilter) : "all";
}

export function parseHistoryStatusFilter(value: string | null | undefined): HistoryStatusFilter {
  return value && STATUS_FILTER_VALUES.has(value as HistoryStatusFilter) ? (value as HistoryStatusFilter) : "all";
}

export function normalizeHistoryStatusFilter(status?: string | null): Exclude<HistoryStatusFilter, "all"> | string {
  return normalizeGenerationStatus(status);
}

export function getHistoryFiltersFromSearch(search: string | URLSearchParams) {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;

  return {
    moduleFilter: parseHistoryModuleFilter(params.get("module")),
    statusFilter: parseHistoryStatusFilter(params.get("status")),
  };
}

export function buildHistoryFilterUrl(
  currentHref: string,
  moduleFilter: HistoryModuleFilter,
  statusFilter: HistoryStatusFilter
) {
  const url = new URL(currentHref, "http://history.local");

  if (moduleFilter === "all") {
    url.searchParams.delete("module");
  } else {
    url.searchParams.set("module", moduleFilter);
  }

  if (statusFilter === "all") {
    url.searchParams.delete("status");
  } else {
    url.searchParams.set("status", statusFilter);
  }

  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}

export function buildHistoryDetailUrl(currentHref: string, detailId: string | null) {
  const url = new URL(currentHref, "http://history.local");

  if (detailId) {
    url.searchParams.set("detail", detailId);
  } else {
    url.searchParams.delete("detail");
  }

  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}

export function getHistoryFilterStateCopy(
  moduleFilter: HistoryModuleFilter,
  statusFilter: HistoryStatusFilter
): HistoryFilterStateCopy {
  const moduleLabel = MODULE_FILTER_LABELS[moduleFilter] || moduleFilter;
  const statusLabel = STATUS_FILTER_LABELS[statusFilter] || statusFilter;
  const isFiltered = moduleFilter !== "all" || statusFilter !== "all";
  const isFailedFilter = statusFilter === "failed";
  const summary = isFiltered ? `当前筛选：${moduleLabel} / ${statusLabel}` : "当前筛选：全部模块 / 全部状态";

  return {
    moduleLabel,
    moduleLabelKey: HISTORY_MODULE_FILTER_KEYS[moduleFilter],
    statusLabel,
    statusLabelKey: HISTORY_STATUS_FILTER_KEYS[statusFilter],
    summary,
    summaryKey: isFiltered ? "LibShared.history.filterSummary" : "LibShared.history.filterSummaryAll",
    summaryParams: { moduleLabel, statusLabel },
    activeDescription: isFiltered
      ? isFailedFilter
        ? `正在查看「${moduleLabel}」中的失败记录，可检查失败原因并套用参数重新生成。`
        : `正在查看「${moduleLabel}」中「${statusLabel}」的历史作品。`
      : "正在查看全部历史作品。",
    activeDescriptionKey: isFiltered
      ? isFailedFilter
        ? "LibShared.history.activeFailedDescription"
        : "LibShared.history.activeFilteredDescription"
      : "LibShared.history.activeAllDescription",
    activeDescriptionParams: { moduleLabel, statusLabel },
    isFiltered,
    emptyTitle: isFailedFilter ? "还没有失败记录" : isFiltered ? "当前筛选下还没有作品" : "还没有作品",
    emptyTitleKey: isFailedFilter
      ? "LibShared.history.emptyFailedTitle"
      : isFiltered
        ? "LibShared.history.emptyFilteredTitle"
        : "LibShared.history.emptyTitle",
    emptyMessage: isFailedFilter
      ? "当前筛选下暂时没有失败任务。失败记录会在这里显示原因，并保留可套用的参数入口，方便调整后重新生成。"
      : isFiltered
        ? "这个模块和状态组合暂时没有历史记录。可以清除筛选查看全部作品，或开始一次新的创作。"
      : "完成一次服装上身、姿势裂变、专属模特或服装 3D 后，作品会自动进入资产库。",
    emptyMessageKey: isFailedFilter
      ? "LibShared.history.emptyFailedMessage"
      : isFiltered
        ? "LibShared.history.emptyFilteredMessage"
        : "LibShared.history.emptyMessage",
    emptyActionLabel: isFiltered ? "清除筛选" : "开始创作",
    emptyActionLabelKey: isFiltered
      ? "LibShared.history.emptyActionClear"
      : "LibShared.history.emptyActionCreate",
    noMatchMessage: isFailedFilter
      ? "当前已加载记录里没有失败项。可以继续加载更多历史记录，或清除筛选查看可下载、可套用的作品。"
      : isFiltered
        ? "当前已加载记录里没有匹配项，可以清除筛选、切换筛选，或继续加载更多历史记录。"
      : "当前已加载记录里没有可显示的作品，可以继续加载更多历史记录或开始创作。",
    noMatchMessageKey: isFailedFilter
      ? "LibShared.history.noMatchFailed"
      : isFiltered
        ? "LibShared.history.noMatchFiltered"
        : "LibShared.history.noMatchAll",
  };
}

export function getHistoryFailureRecoveryCopy({
  status,
  errorMessage,
  hasApplyParams,
}: {
  status: string;
  errorMessage?: string | null;
  hasApplyParams: boolean;
}): HistoryFailureRecoveryCopy | null {
  const normalizedStatus = status.trim().toLowerCase();
  if (normalizeHistoryStatusFilter(normalizedStatus) !== "failed") return null;

  const trimmedError = errorMessage?.trim();
  const applyLabel = hasApplyParams ? "套用参数重试" : "重新创作";

  return {
    title: "生成失败",
    titleKey: "LibShared.history.failureTitle",
    reasonLabel: "失败原因",
    reasonLabelKey: "LibShared.history.failureReasonLabel",
    reason: trimmedError || "没有返回明确原因。建议先检查输入素材和生成参数后再试。",
    reasonKey: trimmedError ? undefined : "LibShared.history.failureReasonDefault",
    recoveryLabel: "下一步",
    recoveryLabelKey: "LibShared.history.failureRecoveryLabel",
    recoveryHint: hasApplyParams
      ? `点击“${applyLabel}”会带回原参数，调整输入素材或生成参数后重新生成。`
      : "这条记录缺少可套用参数，建议回到创作页重新选择图片和参数。",
    recoveryHintKey: hasApplyParams
      ? "LibShared.history.failureRecoveryHintApply"
      : "LibShared.history.failureRecoveryHintNoApply",
    recoveryHintParams: { applyLabel },
    applyLabel,
    applyLabelKey: hasApplyParams
      ? "LibShared.history.failureApplyRetry"
      : "LibShared.history.failureApplyRecreate",
  };
}
