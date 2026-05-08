export type HistoryModuleFilter =
  | "all"
  | "tryon"
  | "grass"
  | "productSet"
  | "modelBackground"
  | "generalImage"
  | "pose"
  | "model"
  | "garment3d"
  | "faceSwap";

export type HistoryStatusFilter = "all" | "completed" | "processing" | "pending" | "failed";

export type HistoryFilterStateCopy = {
  moduleLabel: string;
  statusLabel: string;
  summary: string;
  activeDescription: string;
  isFiltered: boolean;
  emptyTitle: string;
  emptyMessage: string;
  emptyActionLabel: string;
  noMatchMessage: string;
};

const MODULE_FILTER_LABELS: Record<HistoryModuleFilter, string> = {
  all: "全部模块",
  tryon: "服装上身",
  grass: "服装种草",
  productSet: "商品套图",
  modelBackground: "模特换背景",
  generalImage: "通用生图",
  pose: "姿势裂变",
  model: "专属模特",
  garment3d: "服装 3D",
  faceSwap: "AI 换脸",
};

const STATUS_FILTER_LABELS: Record<HistoryStatusFilter, string> = {
  all: "全部状态",
  completed: "已完成",
  processing: "处理中",
  pending: "排队中",
  failed: "失败",
};

export function getHistoryFilterStateCopy(
  moduleFilter: HistoryModuleFilter,
  statusFilter: HistoryStatusFilter
): HistoryFilterStateCopy {
  const moduleLabel = MODULE_FILTER_LABELS[moduleFilter] || moduleFilter;
  const statusLabel = STATUS_FILTER_LABELS[statusFilter] || statusFilter;
  const isFiltered = moduleFilter !== "all" || statusFilter !== "all";
  const summary = isFiltered ? `当前筛选：${moduleLabel} / ${statusLabel}` : "当前筛选：全部模块 / 全部状态";

  return {
    moduleLabel,
    statusLabel,
    summary,
    activeDescription: isFiltered
      ? `正在查看「${moduleLabel}」中「${statusLabel}」的历史作品。`
      : "正在查看全部历史作品。",
    isFiltered,
    emptyTitle: isFiltered ? "当前筛选下还没有作品" : "还没有作品",
    emptyMessage: isFiltered
      ? "这个模块和状态组合暂时没有历史记录。可以清除筛选查看全部作品，或开始一次新的创作。"
      : "完成一次服装上身、姿势裂变、专属模特或服装 3D 后，作品会自动进入资产库。",
    emptyActionLabel: isFiltered ? "清除筛选" : "开始创作",
    noMatchMessage: isFiltered
      ? "当前已加载记录里没有匹配项，可以清除筛选、切换筛选，或继续加载更多历史记录。"
      : "当前已加载记录里没有可显示的作品，可以继续加载更多历史记录或开始创作。",
  };
}
