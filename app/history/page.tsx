"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Clock, Search, XCircle, Loader2, Coins, X, RotateCcw, Maximize2, Eye, ImageIcon, ZoomIn, ZoomOut, Plus, Play } from "lucide-react";
import { downloadImagesAsZip } from "@/lib/download-batch";
import { downloadImage, generateDownloadFilename } from "@/lib/utils";
import { getImageVariantUrl } from "@/lib/image-variants";
import { getApplyPath, type HistoryJobPayload } from "@/lib/history-apply";
import { inferMediaExtension, isLikelyVideoUrl } from "@/lib/media";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StudioMediaLightbox } from "@/components/studio/StudioMediaLightbox";
import {
  buildHistoryFilterUrl,
  buildHistoryDetailUrl,
  getHistoryFailureRecoveryCopy,
  getHistoryFiltersFromSearch,
  getHistoryFilterStateCopy,
  normalizeHistoryStatusFilter,
  type HistoryFailureRecoveryCopy,
  type HistoryModuleFilter,
  type HistoryStatusFilter,
} from "@/lib/history-page-state";
import { isRunningStatus } from "@/lib/generation-status";
import { AUTO_DESIGN_PLATFORMS } from "@/lib/tryon-scene";
import {
  getGarment3dDisplayStyleLabel,
  getModelShootStyleLabel,
  getPoseSeriesStyleLabel,
} from "@/lib/module-style-presets";
import { normalizeModelBackgroundSourceUrls } from "@/lib/model-background";
import { getMaterialEnhancementLevelLabel } from "@/lib/material-enhancement";
import { getFaceSwapModeLabel, getFaceSwapModeNote, normalizeFaceSwapMode } from "@/lib/face-swap";
import {
  PRODUCT_RETOUCH_CATEGORY_OPTIONS,
  PRODUCT_RETOUCH_MODE_OPTIONS,
  type ProductRetouchMode,
} from "@/lib/product-retouch";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { HistoryFilterTabs } from "@/components/history/HistoryFilterTabs";

const HISTORY_PAGE_SIZE = 12;

const MODULE_FILTERS: { value: HistoryModuleFilter; label: string; labelKey: string }[] = [
  { value: "all", label: "全部模块", labelKey: "History.moduleFilters.all" },
  { value: "tryon", label: "服装上身", labelKey: "History.moduleFilters.tryon" },
  { value: "grass", label: "服装种草", labelKey: "History.moduleFilters.grass" },
  { value: "productRetouch", label: "商品精修", labelKey: "History.moduleFilters.productRetouch" },
  { value: "productSet", label: "商品套图", labelKey: "History.moduleFilters.productSet" },
  { value: "modelBackground", label: "模特换背景", labelKey: "History.moduleFilters.modelBackground" },
  { value: "materialEnhancement", label: "材质增强", labelKey: "History.moduleFilters.materialEnhancement" },
  { value: "generalImage", label: "通用生图", labelKey: "History.moduleFilters.generalImage" },
  { value: "outfitFusion", label: "搭配融图", labelKey: "History.moduleFilters.outfitFusion" },
  { value: "pose", label: "姿势裂变", labelKey: "History.moduleFilters.pose" },
  { value: "model", label: "专属模特", labelKey: "History.moduleFilters.model" },
  { value: "garment3d", label: "服装 3D", labelKey: "History.moduleFilters.garment3d" },
  { value: "faceSwap", label: "换脸", labelKey: "History.moduleFilters.faceSwap" },
  { value: "videoImageToVideo", label: "图生视频", labelKey: "History.moduleFilters.videoImageToVideo" },
  { value: "videoMotion", label: "动作模仿", labelKey: "History.moduleFilters.videoMotion" },
  { value: "videoFirstLastFrame", label: "首尾帧", labelKey: "History.moduleFilters.videoFirstLastFrame" },
];

const STATUS_FILTERS: { value: HistoryStatusFilter; label: string; labelKey: string }[] = [
  { value: "all", label: "全部状态", labelKey: "History.statusFilters.all" },
  { value: "completed", label: "已完成", labelKey: "History.statusFilters.completed" },
  { value: "processing", label: "处理中", labelKey: "History.statusFilters.processing" },
  { value: "pending", label: "排队中", labelKey: "History.statusFilters.pending" },
  { value: "failed", label: "失败", labelKey: "History.statusFilters.failed" },
];

type HistoryRow = {
  id: string;
  status: string;
  error_message?: string | null;
  credits_cost?: number | null;
  credits_used?: number | null;
  ai_model?: string | null;
  image_size?: string | null;
  result_urls?: string[];
  created_at: string;
  completed_at?: string | null;
  clothing_urls?: string[];
  model_face_url?: string | null;
  reference_url?: string | null;
  job_payload?: HistoryJobPayload | Record<string, unknown>;
};

type HistoryListPayload = {
  rows?: HistoryRow[];
  hasMore?: boolean;
  nextCursor?: string | null;
  error?: string;
};

function getInitialHistoryFilters() {
  if (typeof window === "undefined") {
    return { moduleFilter: "all" as HistoryModuleFilter, statusFilter: "all" as HistoryStatusFilter };
  }

  return getHistoryFiltersFromSearch(window.location.search);
}

function getInitialHistoryDetailId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("detail") || "";
}

function replaceHistoryFilterUrl(moduleFilter: HistoryModuleFilter, statusFilter: HistoryStatusFilter) {
  if (typeof window === "undefined") return;

  window.history.replaceState(window.history.state, "", buildHistoryFilterUrl(window.location.href, moduleFilter, statusFilter));
}

function replaceHistoryDetailUrl(detailId: string | null) {
  if (typeof window === "undefined") return;

  window.history.replaceState(window.history.state, "", buildHistoryDetailUrl(window.location.href, detailId));
}

async function requestHistoryDetail(t: HistoryT, id: string) {
  const res = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
    method: "GET",
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({})) as { row?: HistoryRow; error?: string };

  if (!res.ok || !payload.row) {
    throw new Error(payload.error || `${t("paramLoadFailed")} (${res.status})`);
  }

  return payload.row;
}

export default function HistoryPage() {
  const router = useRouter();
  const t = useTranslations("History");
  const tAny = useTranslations(); // 数据键全路径（History.* / LibShared.*），用全局 t 解析
  const detailReturnFocusRef = useRef<HTMLElement | null>(null);
  const lightboxReturnFocusRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<"loading" | "noauth" | "error" | "empty" | "ready">("loading");
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [errMsg, setErrMsg] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<HistoryRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [detailResultIndex, setDetailResultIndex] = useState(0);
  const [detailZoom, setDetailZoom] = useState(100);
  const [initialFilters] = useState(getInitialHistoryFilters);
  const [initialDetailId] = useState(getInitialHistoryDetailId);
  const [pendingDetailId, setPendingDetailId] = useState(initialDetailId);
  const [moduleFilter, setModuleFilter] = useState<HistoryModuleFilter>(initialFilters.moduleFilter);
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>(initialFilters.statusFilter);
  const [reloadToken, setReloadToken] = useState(0);
  const filterState = useMemo(
    () => getHistoryFilterStateCopy(moduleFilter, statusFilter),
    [moduleFilter, statusFilter]
  );

  const moduleFilterOptions = useMemo(
    () => MODULE_FILTERS.map((item) => ({ value: item.value, label: item.labelKey ? tAny(item.labelKey) : item.label })),
    [tAny]
  );

  const statusFilterOptions = useMemo(
    () => STATUS_FILTERS.map((item) => ({ value: item.value, label: item.labelKey ? tAny(item.labelKey) : item.label })),
    [tAny]
  );

  useEffect(() => {
    replaceHistoryFilterUrl(moduleFilter, statusFilter);
  }, [moduleFilter, statusFilter, reloadToken]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setErrMsg("");
    setRows([]);
    setHasMore(false);
    setNextCursor(null);

    (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const payload = await requestHistoryPage(t, {
          moduleFilter,
          statusFilter,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (cancelled) return;
        const data = payload.rows || [];
        setRows(data);
        setHasMore(Boolean(payload.hasMore));
        setNextCursor(payload.nextCursor || null);
        setState(data.length ? "ready" : "empty");
      } catch (e: unknown) {
        if (cancelled) return;
        if (e instanceof HistoryAuthError) {
          setState("noauth");
          return;
        }
        const isAbortError = e instanceof DOMException && e.name === "AbortError";
        setErrMsg(isAbortError ? t("historyLoadTimeout") : e instanceof Error ? e.message : t("genericError"));
        setState("error");
      }
    })();

    return () => { cancelled = true; };
  }, [moduleFilter, statusFilter, searchQuery]);

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(value.trim());
    }, 400);
  }

  // 触底自动加载（保留底部按钮作手动兜底）
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, moduleFilter, statusFilter]);

  const loadMore = async () => {
    if (!hasMore || !nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const payload = await requestHistoryPage(t, {
        cursor: nextCursor,
        moduleFilter,
        statusFilter,
        q: searchQuery,
      });
      const incomingRows = payload.rows || [];
      setRows((current) => {
        const seen = new Set(current.map((row) => row.id));
        return [
          ...current,
          ...incomingRows.filter((row) => !seen.has(row.id)),
        ];
      });
      setHasMore(Boolean(payload.hasMore));
      setNextCursor(payload.nextCursor || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("historyLoadFailed"));
    } finally {
      setLoadingMore(false);
    }
  };

  const fmt = (d: string) => {
    try { return new Intl.DateTimeFormat(document.documentElement.lang || "zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d)); }
    catch { return d; }
  };

  const getPayload = (row: HistoryRow) => getRowPayload(row);
  const detailPayload = detailRow ? getPayload(detailRow) : undefined;
  const detailImages = detailPayload ? getInputImages(t, detailPayload, detailRow) : [];
  const detailResults = detailRow?.result_urls || [];
  const detailRowId = detailRow?.id || "";
  const detailRowStatus = detailRow?.status || "";
  const detailResultCount = detailResults.length;
  const selectedResultIndex = detailResults.length ? Math.min(detailResultIndex, detailResults.length - 1) : 0;
  const selectedResultUrl = detailResults[selectedResultIndex];
  const detailFailureCopy = detailRow ? getHistoryFailureRecoveryCopy({
    status: detailRow.status,
    errorMessage: detailRow.error_message,
    hasApplyParams: Boolean(detailPayload?.kind),
  }) : null;
  const filteredRows = useMemo(() => rows.filter((row) => {
    const payload = getRowPayload(row);
    const moduleMatch = moduleFilter === "all" || payload?.kind === moduleFilter;
    const normalizedStatus = normalizeHistoryStatusFilter(row.status);
    const statusMatch = statusFilter === "all" || normalizedStatus === statusFilter;
    return moduleMatch && statusMatch;
  }), [rows, moduleFilter, statusFilter]);

  const handleModuleFilterChange = (value: HistoryModuleFilter) => {
    setModuleFilter(value);
  };

  const handleStatusFilterChange = (value: HistoryStatusFilter) => {
    setStatusFilter(value);
  };

  const clearFilters = () => {
    setModuleFilter("all");
    setStatusFilter("all");
  };

  const fetchHistoryDetail = async (row: HistoryRow) => {
    if (getPayload(row)?.kind) return row;

    const payload = await requestHistoryDetail(t, row.id);
    setRows((current) => current.map((item) => (
      item.id === payload.id ? { ...item, ...payload } : item
    )));
    return payload;
  };

  useEffect(() => {
    if (!pendingDetailId || state === "loading" || state === "noauth") return;

    let cancelled = false;
    setDetailLoading(true);
    setDetailResultIndex(0);
    setDetailZoom(100);

    requestHistoryDetail(t, pendingDetailId)
      .then((row) => {
        if (cancelled) return;
        setDetailRow(row);
        setRows((current) => current.map((item) => (
          item.id === row.id ? { ...item, ...row } : item
        )));
      })
      .catch((error) => {
        if (!cancelled) {
          replaceHistoryDetailUrl(null);
          toast.error(error instanceof Error ? error.message : t("paramLoadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPendingDetailId("");
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pendingDetailId, state]);

  const openDetail = async (row: HistoryRow, initialResultIndex = 0) => {
    detailReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    replaceHistoryDetailUrl(row.id);
    setDetailLoading(true);
    try {
      setDetailResultIndex(initialResultIndex);
      setDetailZoom(100);
      setDetailRow(await fetchHistoryDetail(row));
    } catch (error) {
      replaceHistoryDetailUrl(null);
      toast.error(error instanceof Error ? error.message : t("paramLoadFailed"));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailRow(null);
    replaceHistoryDetailUrl(null);
  };

  const openLightbox = (url: string) => {
    lightboxReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setLightboxSrc(url);
  };

  useEffect(() => {
    if (!detailRowId) return;
    const running = isRunningStatus(detailRowStatus);
    if (!running) return;

    let cancelled = false;
    const pollDetail = async () => {
      try {
        const res = await fetch(`/api/history?id=${encodeURIComponent(detailRowId)}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = await res.json().catch(() => ({})) as { row?: HistoryRow };
        if (!res.ok || !payload.row || cancelled) return;
        const nextRow: HistoryRow = payload.row;

        const previousCount = detailResultCount;
        const nextCount = nextRow.result_urls?.length || 0;
        if (nextCount > previousCount && selectedResultIndex >= Math.max(previousCount - 1, 0)) {
          setDetailResultIndex(nextCount - 1);
          setDetailZoom(100);
        }

        setDetailRow((current) => current?.id === nextRow.id ? { ...current, ...nextRow } : current);
        setRows((current) => current.map((item) => (
          item.id === nextRow.id ? { ...item, ...nextRow } : item
        )));
      } catch {
        // Keep the current preview usable if a transient poll fails.
      }
    };

    const timer = window.setInterval(pollDetail, 8_000);
    pollDetail();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [detailRowId, detailRowStatus, detailResultCount, selectedResultIndex]);

  const applyHistoryRow = async (row: HistoryRow) => {
    setDetailLoading(true);
    try {
      const fullRow = await fetchHistoryDetail(row);
      const payload = getPayload(fullRow);
      if (!payload?.kind) {
        toast.error(t("noApplyParams"));
        return;
      }
      router.push(getApplyPath(payload.kind, fullRow.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("paramLoadFailed"));
    } finally {
      setDetailLoading(false);
    }
  };

  const retryHistoryLoad = () => {
    setReloadToken((current) => current + 1);
  };

  const openCreate = () => {
    router.push("/create");
  };

  const openLogin = () => {
    router.push("/login");
  };

  if (state === "loading") return (
    <HistoryLoadingSkeleton />
  );

  if (state === "noauth") return (
    <div className="studio-empty-stage flex min-h-[calc(100dvh-64px)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-[30px] border border-white/80 bg-white/75 p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-lg shadow-slate-300/40">
          <ImageIcon className="h-7 w-7 text-slate-500" />
        </div>
        <h1 className="text-2xl font-black text-slate-950 dark:text-stone-100">{t("loginTitle")}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{t("loginDesc")}</p>
        <button type="button" onClick={openLogin} className="gradient-brand mt-6 inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-black text-white shadow-xl shadow-slate-300/40">{t("loginAction")}</button>
      </div>
    </div>
  );

  if (state === "error") return (
    <div className="studio-empty-stage flex min-h-[calc(100dvh-64px)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg rounded-[30px] border border-white/80 bg-white/75 p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
        <XCircle className="mx-auto mb-4 h-12 w-12 text-red-300" />
        <h1 className="text-xl font-black text-slate-950 dark:text-stone-100">{t("loadErrorTitle")}</h1>
        <p className="mx-auto mt-3 max-w-sm rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-600">
          {filterState.summaryKey ? tAny(filterState.summaryKey, filterState.summaryParams) : filterState.summary}
        </p>
        <p className="mt-3 text-sm leading-6 text-red-500">{errMsg}</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {t("retryHint")}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <button type="button" onClick={retryHistoryLoad} className="h-11 rounded-full border border-slate-200 bg-white px-6 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">{t("retry")}</button>
          {filterState.isFiltered && (
            <button onClick={clearFilters} className="h-11 rounded-full border border-slate-200 bg-slate-50 px-6 text-sm font-bold text-slate-600 hover:bg-white">
              {t("clearFilters")}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (state === "empty") return (
    <div className="studio-empty-stage flex min-h-[calc(100dvh-64px)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg rounded-[30px] border border-white/80 bg-white/75 p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
        <Clock className="mx-auto mb-4 h-12 w-12 text-slate-300" />
        <h1 className="text-2xl font-black text-slate-950 dark:text-stone-100">{filterState.emptyTitleKey ? tAny(filterState.emptyTitleKey) : filterState.emptyTitle}</h1>
        <p className="mx-auto mt-3 max-w-sm rounded-2xl bg-white/80 px-4 py-3 text-sm font-bold leading-6 text-slate-700">
          {filterState.summaryKey ? tAny(filterState.summaryKey, filterState.summaryParams) : filterState.summary}
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-500">{filterState.emptyMessageKey ? tAny(filterState.emptyMessageKey) : filterState.emptyMessage}</p>
        {filterState.isFiltered ? (
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <button onClick={clearFilters} className="gradient-brand inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-black text-white shadow-xl shadow-slate-300/40">
              <X className="h-4 w-4" />
              {filterState.emptyActionLabelKey ? tAny(filterState.emptyActionLabelKey) : filterState.emptyActionLabel}
            </button>
            <button type="button" onClick={openCreate} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
              <Plus className="h-4 w-4" />
              {t("startCreate")}
            </button>
          </div>
        ) : (
          <button type="button" onClick={openCreate} className="gradient-brand mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-black text-white shadow-xl shadow-slate-300/40">
            <Plus className="h-4 w-4" />
            {t("startCreate")}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="studio-workbench history-workbench min-h-[calc(100dvh-64px)] px-4 py-6 sm:py-8">
      <HistorySkeletonStyles />
      <div className="mx-auto mb-5 flex max-w-7xl flex-col gap-4 rounded-2xl border border-[var(--codex-border)] bg-[var(--codex-surface-strong)] p-4 shadow-[0_14px_44px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-black text-[var(--codex-ink)]">{t("title")}</h1>
            <p className="mt-0.5 text-xs text-[var(--codex-faint)]">{t("titleCount", { count: filteredRows.length })}{filterState.activeDescriptionKey ? ` · ${tAny(filterState.activeDescriptionKey, filterState.activeDescriptionParams)}` : (filterState.activeDescription ? ` · ${filterState.activeDescription}` : "")}</p>
          </div>
          <button type="button" onClick={openCreate} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--codex-accent)] px-4 text-xs font-black text-white shadow-[0_8px_20px_rgba(91,124,255,0.3)] transition hover:opacity-90">
            <Plus className="h-4 w-4" />
            {t("newCreate")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--codex-border)] pt-3">
          <HistoryFilterTabs
            label={t("filterCategory")}
            options={moduleFilterOptions}
            value={moduleFilter}
            onChange={handleModuleFilterChange}
            tone="brand"
          />
          <HistoryFilterTabs
            label={t("filterStatus")}
            options={statusFilterOptions}
            value={statusFilter}
            onChange={handleStatusFilterChange}
          />
          <label className="ml-auto flex h-8 min-w-0 items-center gap-2 rounded-full border border-[var(--codex-border)] bg-[var(--codex-surface-soft)] px-3 sm:w-56">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--codex-faint)]" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchAria")}
              className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-[var(--codex-ink)] outline-none placeholder:text-[var(--codex-faint)]"
            />
          </label>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {filteredRows.map((g: HistoryRow) => {
          const payload = getPayload(g);
          const resultUrls = g.result_urls || [];
          const coverUrl = resultUrls[0];
          const moduleLabel = payload?.kind ? formatKind(t, payload.kind) : t("generatedWork");
          const status = formatStatus(t, g.status);
          const credits = g.credits_cost || g.credits_used || "-";
          const failureCopy = getHistoryFailureRecoveryCopy({
            status: g.status,
            errorMessage: g.error_message,
            hasApplyParams: Boolean(payload?.kind),
          });
          const reuseLabel = failureCopy?.applyLabel || getHistoryReuseLabel(t, payload);

          return (
            <article key={g.id} className="group relative overflow-hidden rounded-2xl border border-[var(--codex-border)] bg-[var(--codex-surface-strong)] shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-[transform,box-shadow] duration-150 hover:-translate-y-1 hover:shadow-[0_20px_52px_rgba(15,23,42,0.12)]">
              <button
                type="button"
                onClick={() => openDetail(g)}
                aria-label={t("viewDetailsAria", { module: moduleLabel })}
                className="relative aspect-[3/4] w-full overflow-hidden bg-slate-100"
              >
                {coverUrl ? (
                  <HistoryMediaPreview url={coverUrl} variant="card" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" alt={t("coverAlt")} />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-300">
                    <ImageIcon className="h-9 w-9" />
                    <span className="text-xs text-gray-400 dark:text-stone-500">{t("noResult")}</span>
                  </div>
                )}
                <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold backdrop-blur ${getStatusClasses(g.status)}`}>
                  {status}
                </span>
                {resultUrls.length > 1 && (
                  <span className="absolute right-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                    {t("imagesCount", { count: resultUrls.length })}
                  </span>
                )}
                {/* hover 操作浮层 */}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/55 to-transparent p-3 pt-8 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => { event.stopPropagation(); openDetail(g); }}
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-white/92 px-3 text-[11px] font-bold text-slate-800 shadow-sm backdrop-blur transition hover:bg-white"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {t("viewDetail")}
                  </span>
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => { event.stopPropagation(); applyHistoryRow(g); }}
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-white/92 px-3 text-[11px] font-bold text-slate-800 shadow-sm backdrop-blur transition hover:bg-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {reuseLabel}
                  </span>
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (resultUrls.length > 1) {
                        void downloadImagesAsZip({ urls: resultUrls, filename: `pixel-diffusion-${g.id.slice(0, 8)}`, label: t("zipLabel") });
                      } else if (coverUrl) {
                        downloadHistoryResult(g, coverUrl, 0);
                      }
                    }}
                    className={`inline-flex h-8 items-center gap-1 rounded-full bg-white/92 px-3 text-[11px] font-bold text-slate-800 shadow-sm backdrop-blur transition hover:bg-white ${!coverUrl ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {resultUrls.length > 1 ? t("downloadZip") : t("download")}
                  </span>
                </span>
              </button>
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-[var(--codex-ink)]">{moduleLabel}</p>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--codex-faint)]">{fmt(g.created_at)} · {g.ai_model || payload?.aiModel || ""}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  <Coins className="h-3 w-3" />
                  {credits}
                </span>
              </div>

              {(failureCopy || g.error_message) && (
                <p
                  className="mx-3 mb-2.5 truncate rounded-md bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300"
                  title={failureCopy ? `${failureCopy.title}：${failureCopy.reason}` : g.error_message || undefined}
                >
                  {failureCopy ? failureCopy.title : g.error_message}
                </p>
              )}
            </article>
          );
        })}
        {filteredRows.length === 0 && !loadingMore && (
          <div className="col-span-full rounded-[28px] border border-white/80 bg-white/70 p-8 text-center shadow-[0_18px_54px_rgba(15,23,42,0.07)] backdrop-blur-2xl">
            <ImageIcon className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <h2 className="text-base font-black text-slate-950 dark:text-stone-100">{t("noMatchTitle")}</h2>
            <p className="mx-auto mt-3 max-w-md rounded-2xl bg-white/75 px-4 py-3 text-sm font-bold leading-6 text-slate-700">
              {filterState.summaryKey ? tAny(filterState.summaryKey, filterState.summaryParams) : filterState.summary}
            </p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{filterState.noMatchMessageKey ? tAny(filterState.noMatchMessageKey) : filterState.noMatchMessage}</p>
            {filterState.isFiltered && (
              <button onClick={clearFilters} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-5 text-sm font-bold text-slate-600 hover:bg-white">
                <X className="h-4 w-4" />
                {t("clearFilters")}
              </button>
            )}
          </div>
        )}
        {loadingMore && Array.from({ length: 2 }).map((_, index) => (
          <HistoryCardSkeleton key={`loading-more-${index}`} />
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <div ref={loadMoreSentinelRef} className="h-1 w-full" aria-hidden="true" />
        {hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-full border bg-white px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-stone-300 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
            {loadingMore ? t("loadingMore") : t("loadMore")}
          </button>
        ) : (
          <p className="text-xs text-gray-400 dark:text-stone-500">{t("allLoaded")}</p>
        )}
      </div>
      <DetailLoadingSkeleton open={detailLoading} />
      <Dialog
        open={Boolean(detailRow)}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        {detailRow && (
          <DialogContent
            showCloseButton={false}
            returnFocusRef={detailReturnFocusRef}
            overlayClassName="z-[139] bg-slate-950/30 backdrop-blur-xl"
            className="z-[140] flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-[28px] border border-white/70 bg-white/85 p-0 shadow-[0_28px_90px_rgba(15,23,42,0.28)] backdrop-blur-2xl sm:max-h-[calc(100dvh-3rem)] sm:max-w-6xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 bg-white/70 px-4 py-3 backdrop-blur-xl sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-sm font-bold leading-5">{formatKind(t, detailPayload?.kind)}</DialogTitle>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:text-stone-400">{formatStatus(t, detailRow.status)}</span>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-stone-500 mt-0.5">{fmt(detailRow.created_at)}</p>
                <DialogDescription className="sr-only">
                  {t("detailDesc")}
                </DialogDescription>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => selectedResultUrl && downloadHistoryResult(detailRow, selectedResultUrl, selectedResultIndex)}
                  disabled={!selectedResultUrl}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/75 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-stone-300 shadow-sm backdrop-blur hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t("download")}
                </button>
                {detailPayload && (
                  <button
                    type="button"
                    onClick={() => {
                      router.push(getApplyPath(detailPayload.kind, detailRow.id));
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-3 py-1.5 text-xs font-medium text-white"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {detailFailureCopy?.applyLabel || getHistoryReuseLabel(t, detailPayload)}
                  </button>
                )}
                <button type="button" onClick={closeDetail} className="rounded-full p-1.5 outline-none transition-[background-color,box-shadow] hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2" aria-label={t("closeDetailAria")}>
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 overflow-y-auto bg-white/35 lg:grid-cols-[minmax(0,1.15fr)_380px] lg:overflow-hidden">
              <section className="flex min-h-[440px] flex-col gap-4 bg-[#eef0f3] p-3 sm:p-5">
                <div className="relative flex min-h-[330px] flex-1 items-center justify-center overflow-hidden rounded-[22px] bg-[#eef0f3]">
                  {selectedResultUrl ? (
                    <button
                      type="button"
                      onClick={() => openLightbox(selectedResultUrl)}
                      className="group flex h-full w-full items-center justify-center p-2 sm:p-4"
                    >
                      <HistoryMediaPreview
                        url={selectedResultUrl}
                        variant="preview"
                        className="max-h-[62vh] w-full object-contain transition-transform duration-200"
                        style={{ transform: `scale(${detailZoom / 100})` }}
                        alt={t("resultAlt", { index: selectedResultIndex + 1 })}
                        controls
                      />
                      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[11px] text-gray-700 dark:text-stone-300 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100">
                        <Maximize2 className="w-3 h-3" />
                        {t("enlarge")}
                      </span>
                    </button>
                  ) : (
                    <div className="max-w-sm px-5 text-center text-sm text-gray-500 dark:text-stone-400">
                      {detailFailureCopy ? (
                        <>
                          <p className="font-bold text-red-600">{detailFailureCopy.title}</p>
                          <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-stone-400">{detailFailureCopy.recoveryHint}</p>
                        </>
                      ) : normalizeHistoryStatusFilter(detailRow.status) === "completed" ? t("noResultImages") : formatStatus(t, detailRow.status)}
                    </div>
                  )}
                  {detailResults.length > 0 && (
                    <div className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:text-stone-300 shadow-sm backdrop-blur">
                      {selectedResultIndex + 1} / {detailResults.length}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-stone-400">
                    <ZoomOut className="h-4 w-4" />
                    <input
                      type="range"
                      min="70"
                      max="150"
                      step="5"
                      value={detailZoom}
                      onChange={(event) => setDetailZoom(Number(event.target.value))}
                      className="h-2 w-full min-w-48 cursor-pointer accent-slate-700 sm:w-64"
                      aria-label={t("zoomAria")}
                    />
                    <ZoomIn className="h-4 w-4" />
                    <span className="w-10 text-right tabular-nums text-gray-700 dark:text-stone-300">{detailZoom}%</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailZoom(100)}
                    className="rounded-full border border-gray-200/80 bg-white/50 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-stone-400 backdrop-blur hover:bg-white/80"
                  >
                    {t("reset")}
                  </button>
                </div>

                {detailResults.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {detailResults.map((url, index) => (
                      <button
                        type="button"
                        key={`${url}-${index}`}
                        onClick={() => {
                          setDetailResultIndex(index);
                          setDetailZoom(100);
                        }}
                        className={`h-20 w-16 flex-shrink-0 overflow-hidden rounded-xl border-2 bg-white shadow-sm transition ${
                          selectedResultIndex === index ? "border-slate-900 ring-2 ring-slate-200" : "border-white/80 opacity-75 hover:opacity-100"
                        }`}
                      >
                        <HistoryMediaPreview url={url} variant="thumb" alt={t("resultThumbAlt", { index: index + 1 })} />
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <aside className="space-y-5 overflow-y-auto border-l border-white/70 bg-white/75 p-4 backdrop-blur-xl sm:p-5 lg:max-h-[calc(92vh-57px)]">
                <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{t("reuseParams")}</p>
                  <h4 className="mt-1 text-sm font-black text-slate-950 dark:text-stone-100">{t("reuseThisWork")}</h4>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{t("reuseDesc")}</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    {detailPayload && (
                      <button
                        type="button"
                        onClick={() => router.push(getApplyPath(detailPayload.kind, detailRow.id))}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white shadow-sm hover:bg-slate-800"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> {detailFailureCopy?.applyLabel || getHistoryReuseLabel(t, detailPayload)}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => selectedResultUrl && downloadHistoryResult(detailRow, selectedResultUrl, selectedResultIndex)}
                      disabled={!selectedResultUrl}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/80 bg-white/85 px-3 text-xs font-bold text-slate-700 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" /> {t("downloadSingle")}
                    </button>
                    {detailResults.length > 1 && (
                      <button
                        type="button"
                        onClick={() => void downloadImagesAsZip({
                          urls: detailResults,
                          filename: `pixel-diffusion-${detailRow.id.slice(0, 8)}`,
                          label: t("zipLabel"),
                        })}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[rgba(91,124,255,0.4)] bg-[rgba(91,124,255,0.1)] px-3 text-xs font-bold text-[var(--codex-accent)] shadow-sm transition hover:bg-[rgba(91,124,255,0.16)]"
                      >
                        <Download className="h-3.5 w-3.5" /> {t("downloadAllZip", { count: detailResults.length })}
                      </button>
                    )}
                  </div>
                </section>

                <section>
                  <h4 className="mb-2 text-xs font-bold text-gray-900 dark:text-stone-100">{t("generateInfo")}</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {getParameterItems(t, detailRow).map((item) => (
                      <div key={item.label} className="min-w-0 border-b border-gray-100 pb-2">
                        <p className="text-[10px] text-gray-400 dark:text-stone-500">{item.label}</p>
                        <p className="mt-0.5 break-words text-xs font-medium text-gray-800">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {detailFailureCopy && (
                  <section>
                    <HistoryFailureNotice copy={detailFailureCopy} />
                  </section>
                )}

                {detailImages.length > 0 && (
                  <section>
                    <h4 className="mb-2 text-xs font-bold text-gray-900 dark:text-stone-100">{t("inputImages")}</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {detailImages.map((image, index) => (
                        <button
                          type="button"
                          key={`${image.label}-${index}`}
                          onClick={() => openLightbox(image.url)}
                          className="group min-w-0 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                        >
                          <div className="relative h-24 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
                            <HistoryMediaPreview
                              url={image.url}
                              variant="thumb"
                              className="transition duration-300 group-hover:scale-110 group-focus-visible:scale-110"
                              alt={image.label}
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/0 transition duration-200 group-hover:bg-slate-950/18 group-focus-visible:bg-slate-950/18">
                              <span className="flex h-8 w-8 scale-90 items-center justify-center rounded-full border border-white/70 bg-white/85 text-gray-700 dark:text-stone-300 opacity-0 shadow-sm backdrop-blur transition duration-200 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100">
                                <ZoomIn className="h-4 w-4" />
                              </span>
                            </div>
                          </div>
                          <p className="mt-1 truncate text-[10px] text-gray-500 dark:text-stone-400">{image.label}</p>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {detailPayload && (
                  <div className="sticky bottom-0 -mx-4 -mb-4 border-t bg-white/95 p-4 backdrop-blur sm:-mx-5 sm:-mb-5 sm:p-5 lg:hidden">
                    <button
                      onClick={() => {
                        router.push(getApplyPath(detailPayload.kind, detailRow.id));
                      }}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-full gradient-brand px-4 py-2 text-xs font-medium text-white"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {detailFailureCopy?.applyLabel || t("applyParams")}
                    </button>
                  </div>
                )}
              </aside>
            </div>
          </DialogContent>
        )}
      </Dialog>
      <StudioMediaLightbox
        src={lightboxSrc}
        alt={t("lightboxAlt")}
        kind={lightboxSrc && isLikelyVideoUrl(lightboxSrc) ? "video" : "image"}
        mediaClassName="max-h-[calc(100dvh-3rem)] max-w-full rounded-[20px] object-contain shadow-2xl"
        returnFocusRef={lightboxReturnFocusRef}
        onClose={() => setLightboxSrc(null)}
      />
    </div>
  );
}

function HistoryLoadingSkeleton() {
  return (
    <div className="studio-workbench history-workbench min-h-[calc(100dvh-64px)] px-4 py-6 sm:py-8">
      <HistorySkeletonStyles />
      <div className="mx-auto mb-5 max-w-7xl rounded-2xl border border-[var(--codex-border)] bg-[var(--codex-surface-strong)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-28 rounded-full" />
            <SkeletonBlock className="h-3 w-40 rounded-full" />
          </div>
          <SkeletonBlock className="h-9 w-24 rounded-full" />
        </div>
        <div className="mt-3 flex gap-2 border-t border-[var(--codex-border)] pt-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-8 w-16 rounded-full" />
          ))}
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <HistoryCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

function HistoryCardSkeleton() {
  return (
    <article className="history-skeleton-card overflow-hidden rounded-2xl border border-[var(--codex-border)] bg-[var(--codex-surface-strong)] shadow-sm">
      <SkeletonBlock className="aspect-[3/4] rounded-none" />
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-3.5 w-24 rounded-full" />
          <SkeletonBlock className="h-2.5 w-32 rounded-full" />
        </div>
        <SkeletonBlock className="h-5 w-12 rounded-full" />
      </div>
    </article>
  );
}

function DetailLoadingSkeleton({ open }: { open: boolean }) {
  const t = useTranslations("History");
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[119] bg-slate-950/25 backdrop-blur-xl"
        className="z-[120] grid max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-5xl gap-0 overflow-y-auto rounded-[28px] border border-white/75 bg-white/85 p-0 shadow-[0_28px_90px_rgba(15,23,42,0.28)] backdrop-blur-2xl [overscroll-behavior:contain] sm:max-w-5xl lg:grid-cols-[minmax(0,1.2fr)_340px] lg:overflow-hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        aria-busy="true"
      >
        <DialogTitle className="sr-only">{t("detailLoadingTitle")}</DialogTitle>
        <DialogDescription className="sr-only">{t("detailLoadingDesc")}</DialogDescription>
        <div className="bg-[#eef0f3] p-5">
          <div className="mb-4 flex items-center justify-between">
            <SkeletonBlock className="h-4 w-20 rounded-full" />
            <SkeletonBlock className="h-8 w-24 rounded-full" />
          </div>
          <SkeletonBlock className="h-[52vh] min-h-72 rounded-[24px]" />
          <div className="mt-4 flex items-center gap-3">
            <SkeletonBlock className="h-2 flex-1 rounded-full" />
            <SkeletonBlock className="h-8 w-16 rounded-full" />
          </div>
        </div>
        <div className="space-y-5 bg-white/75 p-5">
          <div className="space-y-3">
            <SkeletonBlock className="h-4 w-20 rounded-full" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="space-y-2 border-b border-gray-100 pb-2">
                  <SkeletonBlock className="h-3 w-12 rounded-full" />
                  <SkeletonBlock className="h-4 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <SkeletonBlock className="h-4 w-20 rounded-full" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-24 rounded-xl" />
              ))}
            </div>
          </div>
          <SkeletonBlock className="h-32 rounded-xl" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`history-skeleton ${className}`} />;
}

function HistoryFailureNotice({ copy }: { copy: HistoryFailureRecoveryCopy }) {
  const tAny = useTranslations(); // 数据键全路径（LibShared.history.*）
  return (
    <div className="mt-3 rounded-xl border border-red-100 bg-red-50/80 px-3 py-2 text-xs leading-5 text-red-700">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">{copy.titleKey ? tAny(copy.titleKey) : copy.title}</p>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-red-500">
          {copy.applyLabelKey ? tAny(copy.applyLabelKey) : copy.applyLabel}
        </span>
      </div>
      <dl className="mt-2 space-y-1.5">
        <div>
          <dt className="text-[10px] font-black uppercase text-red-400">{copy.reasonLabelKey ? tAny(copy.reasonLabelKey) : copy.reasonLabel}</dt>
          <dd className="mt-0.5 font-medium text-red-700">{copy.reasonKey ? tAny(copy.reasonKey) : copy.reason}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-black uppercase text-red-400">{copy.recoveryLabelKey ? tAny(copy.recoveryLabelKey) : copy.recoveryLabel}</dt>
          <dd className="mt-0.5 text-red-600">{copy.recoveryHintKey ? tAny(copy.recoveryHintKey, copy.recoveryHintParams) : copy.recoveryHint}</dd>
        </div>
      </dl>
    </div>
  );
}

function HistoryMediaPreview({
  url,
  variant,
  className = "",
  alt,
  style,
  controls = false,
}: {
  url: string;
  variant: "card" | "thumb" | "preview";
  className?: string;
  alt: string;
  style?: CSSProperties;
  controls?: boolean;
}) {
  const isVideo = isLikelyVideoUrl(url);
  const mediaClass = `${variant === "preview" ? "max-h-full max-w-full object-contain" : "h-full w-full object-cover"} ${className}`.trim();

  if (isVideo) {
    return (
      <span className={`relative block overflow-hidden bg-black ${variant === "preview" ? "max-h-full max-w-full" : "h-full w-full"}`}>
        <video
          src={url}
          className={mediaClass}
          style={style}
          controls={controls}
          muted={!controls}
          playsInline
          preload="metadata"
          onClick={(event) => {
            if (controls) event.stopPropagation();
          }}
        />
        {!controls && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/58 shadow-sm backdrop-blur">
              <Play className="h-3.5 w-3.5 fill-current" />
            </span>
          </span>
        )}
      </span>
    );
  }

  return <RawPreviewImage src={getImageVariantUrl(url, variant)} className={mediaClass} style={style} alt={alt} />;
}

function HistorySkeletonStyles() {
  return (
    <style>{`
      .history-skeleton {
        position: relative;
        overflow: hidden;
        background: linear-gradient(110deg, #eef1f5 8%, #f8fafc 18%, #e7ebf1 33%);
        background-size: 220% 100%;
        animation: history-skeleton-sweep 1.35s ease-in-out infinite;
      }

      .history-skeleton::after {
        content: "";
        position: absolute;
        inset: 0;
        transform: translateX(-120%);
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.72), transparent);
        animation: history-skeleton-glow 1.6s ease-in-out infinite;
      }

      .history-skeleton-card {
        animation: history-skeleton-float 2.8s ease-in-out infinite;
      }

      .history-skeleton-card:nth-child(2n) {
        animation-delay: 0.16s;
      }

      .history-skeleton-card:nth-child(3n) {
        animation-delay: 0.28s;
      }

      @keyframes history-skeleton-sweep {
        0% { background-position: 120% 0; }
        100% { background-position: -120% 0; }
      }

      @keyframes history-skeleton-glow {
        0% { transform: translateX(-120%); }
        55%, 100% { transform: translateX(120%); }
      }

      @keyframes history-skeleton-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }

      @media (prefers-reduced-motion: reduce) {
        .history-skeleton,
        .history-skeleton::after,
        .history-skeleton-card {
          animation: none;
        }
      }
    `}</style>
  );
}

type HistoryT = ReturnType<typeof useTranslations<"History">>;

function formatKind(t: HistoryT, kind?: HistoryJobPayload["kind"]) {
  if (kind === "tryon") return t("categories.tryon");
  if (kind === "grass") return t("categories.grass");
  if (kind === "productRetouch") return t("categories.productRetouch");
  if (kind === "productSet") return t("categories.productSet");
  if (kind === "modelBackground") return t("categories.modelBackground");
  if (kind === "materialEnhancement") return t("categories.materialEnhancement");
  if (kind === "generalImage") return t("categories.generalImage");
  if (kind === "outfitFusion") return t("categories.outfitFusion");
  if (kind === "garment3d") return t("categories.garment3d");
  if (kind === "faceSwap") return t("categories.faceSwap");
  if (kind === "model") return t("categories.model");
  if (kind === "pose") return t("categories.pose");
  if (kind === "videoImageToVideo") return t("categories.videoImageToVideo");
  if (kind === "videoMotion") return t("categories.videoMotion");
  if (kind === "videoFirstLastFrame") return t("categories.videoFirstLastFrame");
  return t("unknownModule");
}

function formatStatus(t: HistoryT, status: string) {
  const normalizedStatus = normalizeHistoryStatusFilter(status);
  if (normalizedStatus === "completed") return t("statusFilters.completed");
  if (normalizedStatus === "failed") return t("statusFilters.failed");
  if (normalizedStatus === "processing") return t("statusFilters.processing");
  if (normalizedStatus === "pending") return t("statusFilters.pending");
  return status;
}

function formatGrassSceneMode(t: HistoryT, mode?: string) {
  if (mode === "custom_prompt") return t("grassSceneMode.customPrompt");
  if (mode === "upload_reference") return t("grassSceneMode.uploadReference");
  if (mode === "system_reference") return t("grassSceneMode.systemReference");
  return "-";
}

function formatGrassSceneBackgroundMode(t: HistoryT, mode?: string) {
  if (mode === "similar_style") return t("grassSceneBg.similarStyle");
  if (mode === "reference_scene" || !mode) return t("grassSceneBg.referenceScene");
  return "-";
}

function getProductRetouchModeLabel(t: HistoryT, mode?: ProductRetouchMode) {
  return PRODUCT_RETOUCH_MODE_OPTIONS.find((item) => item.value === mode)?.label || t("moduleFilters.productRetouch");
}

function getProductRetouchCategoryLabel(t: HistoryT, category?: string) {
  return PRODUCT_RETOUCH_CATEGORY_OPTIONS.find((item) => item.value === category)?.label || category || t("autoRecognize");
}

function getStatusClasses(status: string) {
  const normalizedStatus = normalizeHistoryStatusFilter(status);
  if (normalizedStatus === "completed") return "bg-emerald-50 text-emerald-700";
  if (normalizedStatus === "failed") return "bg-red-50 text-red-600";
  if (normalizedStatus === "processing") return "bg-amber-50 text-amber-700";
  if (normalizedStatus === "pending") return "bg-sky-50 text-sky-700";
  return "bg-gray-100 text-gray-600 dark:text-stone-400";
}

class HistoryAuthError extends Error {}

async function requestHistoryPage(
  t: HistoryT,
  {
    cursor,
    moduleFilter,
    statusFilter,
    q,
    signal,
  }: {
    cursor?: string | null;
    moduleFilter?: HistoryModuleFilter;
    statusFilter?: HistoryStatusFilter;
    q?: string;
    signal?: AbortSignal;
  }
) {
  const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  if (q && q.trim()) params.set("q", q.trim());
  if (moduleFilter && moduleFilter !== "all") params.set("module", moduleFilter);
  if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);

  const res = await fetch(`/api/history?${params.toString()}`, {
    method: "GET",
    signal,
    cache: "no-store",
  });

  if (res.status === 401) {
    throw new HistoryAuthError();
  }

  const payload = await res.json().catch(() => ({})) as HistoryListPayload;

  if (!res.ok) {
    throw new Error(payload.error || `${t("historyLoadFailed")} (${res.status})`);
  }

  return payload;
}

function downloadHistoryResult(row: HistoryRow, url: string, index: number) {
  const ext = inferMediaExtension(url, isLikelyVideoUrl(url) ? "mp4" : "png");
  const dateStr = row.created_at
    ? new Date(row.created_at).toISOString().slice(0, 10).replace(/-/g, "")
    : "";
  const filename = dateStr
    ? `pixel-diffusion-${dateStr}-${String(index + 1).padStart(2, "0")}.${ext}`
    : generateDownloadFilename("history", index, ext);

  downloadImage(url, filename);
}

function getRowPayload(row: HistoryRow) {
  const payload = row.job_payload;
  if (!payload || typeof payload !== "object") return undefined;

  const kind = (payload as { kind?: unknown }).kind;
  if (kind === "tryon" || kind === "grass" || kind === "productRetouch" || kind === "productSet" || kind === "modelBackground" || kind === "materialEnhancement" || kind === "generalImage" || kind === "outfitFusion" || kind === "garment3d" || kind === "model" || kind === "pose" || kind === "faceSwap" || kind === "videoImageToVideo" || kind === "videoMotion" || kind === "videoFirstLastFrame") {
    return payload as HistoryJobPayload;
  }

  return undefined;
}


function getTryonReferenceUrls(payload: Extract<HistoryJobPayload, { kind: "tryon" }>) {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of [...(Array.isArray(payload.referenceUrls) ? payload.referenceUrls : []), payload.referenceUrl]) {
    if (typeof value !== "string" || !value.trim() || seen.has(value.trim())) continue;
    seen.add(value.trim());
    urls.push(value.trim());
  }
  return urls;
}

function getPoseReferenceUrls(payload: Extract<HistoryJobPayload, { kind: "pose" }>) {
  return uniqueUrlList(payload.poseReferenceUrls);
}

function getPoseGarmentAngleUrls(payload: Extract<HistoryJobPayload, { kind: "pose" }>) {
  const angleUrls = Array.isArray(payload.garmentAngleReferences)
    ? payload.garmentAngleReferences
        .map((item) => item && typeof item === "object" ? item.url : "")
        .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    : [];
  return uniqueUrlList(angleUrls.length ? angleUrls : payload.garmentDetailUrls);
}

function uniqueUrlList(value: unknown) {
  const seen = new Set<string>();
  const urls: string[] = [];
  if (!Array.isArray(value)) return urls;
  for (const item of value) {
    const url = typeof item === "string" ? item.trim() : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}


function getPayloadDisplaySize(t: HistoryT, payload?: HistoryJobPayload) {
  if (!payload) return "";
  if (payload.kind === "videoImageToVideo" || payload.kind === "videoMotion" || payload.kind === "videoFirstLastFrame") {
    return `${payload.resolution} · ${payload.aspectRatio || "9:16"} · ${t("secondSuffix", { duration: payload.duration || 5 })}`;
  }
  return "imageSize" in payload ? payload.imageSize : "";
}

function getVideoModeLabel(t: HistoryT, mode?: string) {
  return mode === "fast" ? t("videoMode.fast") : t("videoMode.high");
}

function getVideoAudioLabel(t: HistoryT, payload: Extract<HistoryJobPayload, { kind: "videoImageToVideo" | "videoMotion" | "videoFirstLastFrame" }>) {
  if (payload.audioMode === "off" || payload.generateAudio === false) return t("videoAudio.mute");
  if (payload.audioMode === "custom" || payload.audioUrl) return t("videoAudio.upload");
  return t("videoAudio.smart");
}

function getHistoryReuseLabel(t: HistoryT, payload?: HistoryJobPayload) {
  if (!payload?.kind) return t("applyParams");
  return t("reuseTo", { module: formatKind(t, payload.kind) });
}

function getInputImages(t: HistoryT, payload: HistoryJobPayload, row?: HistoryRow | null) {
  if (payload.kind === "tryon") {
    const referenceUrls = getTryonReferenceUrls(payload);
    return [
      ...payload.clothingUrls.map((url, index) => ({
        label: payload.clothingRoles?.[index] ? t(`clothingRole.${payload.clothingRoles[index]}`) : t("inputImages.clothing"),
        url,
      })),
      ...referenceUrls.map((url, index) => ({ label: referenceUrls.length > 1 ? t("inputImages.reference", { index: index + 1 }) : t("inputImages.referenceSingle"), url })),
      ...(payload.modelFaceUrl ? [{ label: t("inputImages.modelFace"), url: payload.modelFaceUrl }] : []),
    ];
  }
  if (payload.kind === "garment3d") {
    return [
      { label: t("inputImages.clothing"), url: payload.garmentUrl },
      ...(payload.referenceUrl ? [{ label: t("inputImages.garment3dRef"), url: payload.referenceUrl }] : []),
    ];
  }
  if (payload.kind === "grass") {
    return [
      { label: t("inputImages.clothing"), url: payload.garmentUrl },
      ...(payload.referenceUrl ? [{ label: t("inputImages.grassRef"), url: payload.referenceUrl }] : []),
    ];
  }
  if (payload.kind === "productSet") {
    return payload.productImageUrls.map((url, index) => ({ label: t("inputImages.product", { index: index + 1 }), url }));
  }
  if (payload.kind === "productRetouch") {
    return uniqueUrlList(row?.clothing_urls).map((url, index) => ({ label: t("inputImages.productOriginal", { index: index + 1 }), url }));
  }
  if (payload.kind === "modelBackground") {
    return [
      ...normalizeModelBackgroundSourceUrls(payload.sourceUrls, payload.sourceUrl).map((url, index) => ({ label: t("inputImages.original", { index: index + 1 }), url })),
      ...(payload.modelReferenceUrl ? [{ label: t("inputImages.modelRef"), url: payload.modelReferenceUrl }] : []),
      ...(payload.backgroundReferenceUrl ? [{ label: t("inputImages.backgroundRef"), url: payload.backgroundReferenceUrl }] : []),
    ];
  }
  if (payload.kind === "materialEnhancement") {
    return [
      { label: t("inputImages.original"), url: payload.sourceUrl },
      { label: t("inputImages.highResClothing"), url: payload.garmentUrl },
    ];
  }
  if (payload.kind === "generalImage" || payload.kind === "outfitFusion") {
    const labelKey = payload.kind === "outfitFusion" ? "inputImages.input" : "inputImages.reference";
    return payload.referenceUrls.map((url, index) => ({ label: t(labelKey, { index: index + 1 }), url }));
  }
  if (payload.kind === "model") {
    return [
      ...payload.referenceUrls.map((url, index) => ({ label: t("inputImages.person", { index: index + 1 }), url })),
      ...(payload.hairReferenceUrl ? [{ label: t("inputImages.hairRef"), url: payload.hairReferenceUrl }] : []),
      ...(payload.hairColorReferenceUrl ? [{ label: t("inputImages.hairColorRef"), url: payload.hairColorReferenceUrl }] : []),
    ];
  }
  if (payload.kind === "pose") {
    return [
      { label: t("inputImages.main"), url: payload.mainImageUrl },
      ...getPoseReferenceUrls(payload).map((url, index) => ({ label: t("inputImages.poseRef", { index: index + 1 }), url })),
      ...getPoseGarmentAngleUrls(payload).map((url, index) => ({ label: t("inputImages.garmentAngle", { index: index + 1 }), url })),
    ];
  }
  if (payload.kind === "videoImageToVideo") {
    return [{ label: t("inputImages.input"), url: payload.imageUrl }];
  }
  if (payload.kind === "videoMotion") {
    return [
      { label: t("inputImages.modelImage"), url: payload.modelImageUrl },
      { label: t("inputImages.referenceVideo"), url: payload.referenceVideoUrl },
    ];
  }
  if (payload.kind === "videoFirstLastFrame") {
    return [
      { label: t("inputImages.firstFrame"), url: payload.firstFrameUrl },
      { label: t("inputImages.lastFrame"), url: payload.lastFrameUrl },
    ];
  }
  if (payload.kind === "faceSwap") {
    return [
      { label: t("inputImages.sourceModel"), url: payload.sourceUrl },
      { label: t("inputImages.targetFace"), url: payload.faceUrl },
    ];
  }
  return [];
}

function getParameterItems(t: HistoryT, row: HistoryRow) {
  const payload = getRowPayload(row);
  const common = [
    { label: t("params.module"), value: formatKind(t, payload?.kind) },
    { label: t("params.status"), value: formatStatus(t, row.status) },
    { label: t("params.model"), value: String(payload?.aiModel || row.ai_model || "-") },
    { label: t("params.size"), value: String(getPayloadDisplaySize(t, payload) || row.image_size || "-") },
    { label: t("params.credits"), value: String(row.credits_cost || row.credits_used || "-") },
  ];
  if (!payload) return common;

  if (payload.kind === "tryon") {
    return [
      ...common,
      { label: t("params.ratio"), value: payload.aspectRatio },
      { label: t("params.genCount"), value: String(payload.genCount) },
      { label: t("params.tryonMode"), value: payload.clothingMode === "multi" ? t("params.multiTryon") : t("params.singleTryon") },
      { label: t("params.clothingRole"), value: payload.clothingRoles?.map((role) => t(`clothingRole.${role}`)).join("、") || "-" },
      { label: t("params.clothingCount"), value: String(payload.clothingUrls.length) },
      { label: t("params.modelFace"), value: payload.modelFaceUrl ? t("used") : t("unused") },
      { label: t("params.reference"), value: t("resultCount", { count: getTryonReferenceUrls(payload).length }) },
      { label: t("params.sceneMode"), value: payload.sceneMode ? t(`sceneMode.${payload.sceneMode}`) : "-" },
      { label: t("params.autoDesign"), value: payload.autoDesign ? AUTO_DESIGN_PLATFORMS.find((item) => item.value === payload.autoDesign?.platform)?.label || t("used") : t("unused") },
    ];
  }
  if (payload.kind === "garment3d") {
    return [
      ...common,
      { label: t("params.ratio"), value: payload.aspectRatio },
      { label: t("params.genCount"), value: String(payload.genCount) },
      { label: t("params.garmentType"), value: payload.garmentType || "-" },
      { label: t("params.outputMode"), value: payload.outputMode === "reference" ? t("params.referenceMode") : t("params.promptMode") },
      { label: t("params.displayStyle"), value: getGarment3dDisplayStyleLabel(payload.displayStyle) },
      { label: t("params.ref3d"), value: payload.referenceUrl ? t("used") : t("unused") },
    ];
  }
  if (payload.kind === "model") {
    return [
      ...common,
      { label: t("params.ratio"), value: payload.aspectRatio },
      { label: t("params.genCount"), value: String(payload.genCount) },
      { label: t("params.gender"), value: payload.gender === "male" ? t("params.male") : t("params.female") },
      { label: t("params.modelStyle"), value: getModelShootStyleLabel(payload.modelStyle) },
      { label: t("params.personRef"), value: String(payload.referenceUrls.length) },
      { label: t("params.hairStyle"), value: payload.hairStyle || "-" },
      { label: t("params.hairColor"), value: payload.hairColor || "-" },
      { label: t("params.hairRef"), value: payload.hairReferenceUrl ? t("used") : t("unused") },
      { label: t("params.hairColorRef"), value: payload.hairColorReferenceUrl ? t("used") : t("unused") },
    ];
  }
  if (payload.kind === "grass") {
    return [
      ...common,
      { label: t("params.ratio"), value: payload.aspectRatio },
      { label: t("params.genCount"), value: String(payload.genCount) },
      { label: t("params.template"), value: payload.templateId },
      { label: t("params.sceneMode"), value: formatGrassSceneMode(t, payload.sceneMode) },
      { label: t("params.sceneControl"), value: payload.sceneMode === "custom_prompt" ? t("params.promptScene") : formatGrassSceneBackgroundMode(t, payload.sceneBackgroundMode) },
      { label: t("params.grassRef"), value: payload.referenceUrl ? t("used") : t("unused") },
      { label: t("params.modelControl"), value: payload.changeModel ? t("params.changeModel") : t("params.keepModel") },
    ];
  }
  if (payload.kind === "productSet") {
    return [
      ...common,
      { label: t("params.ratio"), value: payload.aspectRatio },
      { label: t("params.genCount"), value: String(payload.genCount) },
      { label: t("params.createMode"), value: payload.mode === "custom" ? t("params.customSet") : t("params.smartSet") },
      { label: t("params.imageType"), value: payload.imageType === "details" ? t("params.detailPage") : t("params.mainAux") },
      { label: t("params.productImage"), value: t("resultCount", { count: payload.productImageUrls.length }) },
      { label: t("params.targetPlatform"), value: payload.settings?.platform || "-" },
      { label: t("params.targetRegion"), value: payload.settings?.country || "-" },
      { label: t("params.copyLanguage"), value: payload.settings?.language || "-" },
      { label: t("params.templateCount"), value: String(payload.selectedTemplateIds?.length || payload.customTemplates?.length || payload.genCount) },
    ];
  }
  if (payload.kind === "productRetouch") {
    const sourceCount = Math.ceil(payload.expectedCount / Math.max(1, payload.variantsPerSource));
    return [
      ...common,
      { label: t("params.ratio"), value: payload.aspectRatio },
      { label: t("params.retouchMode"), value: getProductRetouchModeLabel(t, payload.mode) },
      { label: t("params.category"), value: getProductRetouchCategoryLabel(t, payload.category) },
      { label: t("params.originalImage"), value: t("resultCount", { count: sourceCount }) },
      { label: t("params.perResult"), value: t("resultCount", { count: payload.variantsPerSource }) },
      { label: t("params.expectedResult"), value: t("resultCount", { count: payload.expectedCount }) },
      { label: t("params.skillVersion"), value: payload.skillVersion || "-" },
    ];
  }
  if (payload.kind === "modelBackground") {
    const sourceCount = normalizeModelBackgroundSourceUrls(payload.sourceUrls, payload.sourceUrl).length || 1;
    return [
      ...common,
      { label: t("params.ratio"), value: payload.aspectRatio },
      { label: t("params.originalCount"), value: t("resultCount", { count: sourceCount }) },
      { label: t("params.genCount"), value: sourceCount > 1 ? `${sourceCount} × ${payload.genCount} = ${sourceCount * payload.genCount}` : String(payload.genCount) },
      { label: t("params.operationMode"), value: t(`mode.${payload.mode}`) },
      { label: t("params.backgroundSource"), value: t(`sourceMode.${payload.backgroundSource}`) },
      { label: t("params.backgroundTemplate"), value: payload.templateId },
      { label: t("params.modelRef"), value: payload.modelReferenceUrl ? t("used") : t("unused") },
      { label: t("params.backgroundRef"), value: payload.backgroundReferenceUrl ? t("used") : t("unused") },
    ];
  }
  if (payload.kind === "materialEnhancement") {
    return [
      ...common,
      { label: t("params.ratio"), value: payload.aspectRatio },
      { label: t("params.genCount"), value: String(payload.genCount) },
      { label: t("params.garmentType"), value: payload.garmentType || "-" },
      { label: t("params.enhanceMode"), value: getMaterialEnhancementLevelLabel(payload.enhancementLevel) },
      { label: t("params.highResClothing"), value: payload.garmentUrl ? t("used") : t("unused") },
    ];
  }
  if (payload.kind === "generalImage" || payload.kind === "outfitFusion") {
    return [
      ...common,
      { label: t("params.mode"), value: payload.kind === "outfitFusion" ? t("moduleFilters.outfitFusion") : payload.mode === "text-to-image" ? t("params.textToImage") : t("params.imageToImage") },
      { label: t("params.ratio"), value: payload.aspectRatio },
      { label: t("params.genCount"), value: String(payload.genCount) },
      { label: payload.kind === "outfitFusion" ? t("params.inputMaterial") : t("params.reference"), value: t("resultCount", { count: payload.referenceUrls.length }) },
    ];
  }
  if (payload.kind === "pose") {
    const referenceCount = getPoseReferenceUrls(payload).length;
    const referenceCopies = Math.max(1, Math.floor(Number(payload.poseReferenceCopies || 1)));
    const poseCount = payload.genCount || payload.poseCount || (referenceCount ? referenceCount * referenceCopies : 1);
    return [
      ...common,
      { label: t("params.ratio"), value: payload.aspectRatio || t("smart") },
      { label: t("params.genCount"), value: String(poseCount) },
      { label: t("params.creativeMode"), value: referenceCount ? t("params.referenceMode") : t("params.freeMode") },
      ...(referenceCount ? [
        { label: t("params.poseRef"), value: t("resultCount", { count: referenceCount }) },
        { label: t("params.perCount"), value: String(referenceCopies) },
      ] : []),
      { label: t("params.shootStyle"), value: getPoseSeriesStyleLabel(payload.poseStyle) },
    ];
  }
  if (payload.kind === "videoImageToVideo") {
    return [
      ...common,
      { label: t("params.generateMode"), value: getVideoModeLabel(t, payload.modelMode) },
      { label: t("params.ratio"), value: payload.aspectRatio || "9:16" },
      { label: t("params.videoDuration"), value: t("secondSuffix", { duration: payload.duration || 5 }) },
      { label: t("params.generateCount"), value: String(payload.genCount || 1) },
      { label: t("params.resolution"), value: payload.resolution },
      { label: t("params.audio"), value: getVideoAudioLabel(t, payload) },
      { label: t("params.audioControl"), value: payload.audioPrompt || "-" },
      { label: t("params.actionTemplate"), value: payload.templateTitle || "-" },
    ];
  }
  if (payload.kind === "videoMotion") {
    return [
      ...common,
      { label: t("params.generateMode"), value: getVideoModeLabel(t, payload.modelMode) },
      { label: t("params.ratio"), value: payload.aspectRatio || "9:16" },
      { label: t("params.videoDuration"), value: t("secondSuffix", { duration: payload.duration || 5 }) },
      { label: t("params.generateCount"), value: String(payload.genCount || 1) },
      { label: t("params.resolution"), value: payload.resolution },
      { label: t("params.audio"), value: getVideoAudioLabel(t, payload) },
      { label: t("params.audioControl"), value: payload.audioPrompt || "-" },
      { label: t("params.videoModel"), value: "HappyHorse" },
      { label: t("params.actionTemplate"), value: payload.templateTitle || "-" },
      { label: t("params.referenceVideo"), value: payload.referenceVideoUrl ? t("used") : t("unused") },
    ];
  }
  if (payload.kind === "videoFirstLastFrame") {
    return [
      ...common,
      { label: t("params.generateMode"), value: getVideoModeLabel(t, payload.modelMode) },
      { label: t("params.ratio"), value: payload.aspectRatio || "9:16" },
      { label: t("params.videoDuration"), value: t("secondSuffix", { duration: payload.duration || 5 }) },
      { label: t("params.generateCount"), value: String(payload.genCount || 1) },
      { label: t("params.resolution"), value: payload.resolution },
      { label: t("params.audio"), value: getVideoAudioLabel(t, payload) },
      { label: t("params.audioControl"), value: payload.audioPrompt || "-" },
      { label: t("params.firstFrame"), value: payload.firstFrameUrl ? t("used") : t("unused") },
      { label: t("params.lastFrame"), value: payload.lastFrameUrl ? t("used") : t("unused") },
    ];
  }
  if (payload.kind === "faceSwap") {
    const faceSwapMode = normalizeFaceSwapMode(payload.faceSwapMode);
    return [
      ...common,
      { label: t("params.ratio"), value: payload.aspectRatio },
      { label: t("params.genCount"), value: String(payload.genCount) },
      { label: t("params.faceSwapScope"), value: getFaceSwapModeLabel(faceSwapMode) },
      { label: t("params.sourceModel"), value: payload.sourceUrl ? t("used") : t("unused") },
      { label: t("params.targetFace"), value: payload.faceUrl ? t("used") : t("unused") },
      { label: t("params.rule"), value: getFaceSwapModeNote(faceSwapMode) },
    ];
  }
  return common;
}
