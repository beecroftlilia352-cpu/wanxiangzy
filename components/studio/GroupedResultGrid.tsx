"use client";

import { memo, useMemo } from "react";
import { CheckCircle2, Download, Loader2, RotateCcw, X as XIcon, ZoomIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { downloadImage, generateDownloadFilename } from "@/lib/utils";
import { getImageVariantUrl } from "@/lib/image-variants";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";

export type GroupedResultSource = {
  id: string;
  /** 行标题（例如 "原图 1"） */
  label: string;
  /** 该 source 的缩略图 URL */
  thumbnail: string;
  /** 角标徽章（可选） */
  badge?: React.ReactNode;
};

export type GroupedResultTarget = {
  id: string;
  /** 列标题（"英语" / "目标脸" 等） */
  label: string;
  /** 副标题（"English"） */
  sublabel?: string;
  /** 角标徽章 */
  badge?: React.ReactNode;
};

export type GroupedResultCellStatus = "completed" | "running" | "failed" | "idle";

export type GroupedResultCell = {
  sourceId: string;
  targetId: string;
  url?: string | null;
  status: GroupedResultCellStatus;
  progress?: number;
  failureLabel?: string;
  failureDetail?: string;
};

export type GroupedResultGridProps = {
  sources: GroupedResultSource[];
  targets: GroupedResultTarget[];
  results: GroupedResultCell[];
  /** 顶部 disclaimer 文案；不传则用默认电商合规文案 */
  disclaimer?: React.ReactNode;
  /** 顶部时间戳（ISO 字符串），不传则用当前时间 */
  createdAt?: string | null;
  /** 自定义打开图片的回调，传入 sourceIndex / targetIndex */
  onOpen?: (params: { sourceIndex: number; targetIndex: number; url: string }) => void;
  /** 重试某个具体组合 */
  onRetry?: (params: { sourceId: string; targetId: string }) => void;
  /** 桌面端默认每张结果卡的长宽比 */
  cellAspect?: string;
  /** 自定义失败标签 */
  failureLabel?: string;
  /** 自定义失败详情 */
  failureDetail?: string;
};

const DEFAULT_CELL_ASPECT = "3 / 4";

function formatTaskTimestamp(value?: string | null, fallback?: string) {
  const source = value || fallback;
  if (!source) return "";
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return source;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function GroupedResultGrid({
  sources,
  targets,
  results,
  disclaimer,
  createdAt,
  onOpen,
  onRetry,
  cellAspect = DEFAULT_CELL_ASPECT,
  failureLabel,
  failureDetail,
}: GroupedResultGridProps) {
  const t = useTranslations("Shared");
  const resolvedDisclaimer = disclaimer ?? t("groupIdDisclaimer");
  const cellMap = useMemo(() => {
    const map = new Map<string, GroupedResultCell>();
    for (const cell of results) {
      map.set(`${cell.sourceId}::${cell.targetId}`, cell);
    }
    return map;
  }, [results]);

  const fallbackTimestamp = useMemo(() => new Date().toISOString(), []);
  const timestamp = formatTaskTimestamp(createdAt, fallbackTimestamp);

  const columnCount = Math.max(targets.length, 1);
  const rowCount = sources.length;
  // 顶部时间戳 + 内容两行；列头是 targets 数组
  // 整体：行号 = sources.length + 1 (头部列名) + 1 (时间戳)? 不，把时间戳放最上面
  // 实际网格：1 行 = 列名 (1 col 空白) + targets.length cols
  //         sources.length 行 = source col (缩略图) + targets.length 结果
  const sourceColumnWidth = "minmax(120px, 160px)";
  const targetColumnWidth = "minmax(0, 1fr)";

  if (!rowCount) {
    return null;
  }

  const gridStyle = {
    gridTemplateColumns: `${sourceColumnWidth} repeat(${columnCount}, ${targetColumnWidth})`,
  } as React.CSSProperties;

  return (
    <div className="studio-result-set w-full max-w-[min(1480px,100%)]">
      <p className="studio-result-disclaimer">{resolvedDisclaimer}</p>
      <p className="studio-result-time">{timestamp}</p>

      <div className="grid w-full gap-3 sm:gap-4" style={gridStyle}>
        {/* 第一行：列头。左上角空白，右侧 targets 标签 */}
        <div aria-hidden="true" />
        {targets.map((target) => (
          <div
            key={`target-${target.id}`}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-center shadow-[0_4px_14px_rgba(15,23,42,0.04)] backdrop-blur"
          >
            <div className="min-w-0 text-center">
              <div className="truncate text-[13px] font-black text-slate-900" title={target.label}>
                {target.label}
              </div>
              {target.sublabel ? (
                <div className="truncate text-[10px] font-semibold text-slate-400" title={target.sublabel}>
                  {target.sublabel}
                </div>
              ) : null}
            </div>
            {target.badge ? <div className="shrink-0">{target.badge}</div> : null}
          </div>
        ))}

        {/* 后续行：每个 source 一行 */}
        {sources.map((source, sourceIndex) => (
          <SourceRow
            key={source.id}
            source={source}
            targets={targets}
            cellMap={cellMap}
            sourceIndex={sourceIndex}
            onOpen={onOpen}
            onRetry={onRetry}
            cellAspect={cellAspect}
            failureLabel={failureLabel}
            failureDetail={failureDetail}
          />
        ))}
      </div>
    </div>
  );
}

type SourceRowProps = {
  source: GroupedResultSource;
  targets: GroupedResultTarget[];
  cellMap: Map<string, GroupedResultCell>;
  sourceIndex: number;
  onOpen?: GroupedResultGridProps["onOpen"];
  onRetry?: GroupedResultGridProps["onRetry"];
  cellAspect: string;
  failureLabel?: string;
  failureDetail?: string;
};

const SourceRow = memo(function SourceRow({
  source,
  targets,
  cellMap,
  sourceIndex,
  onOpen,
  onRetry,
  cellAspect,
  failureLabel,
  failureDetail,
}: SourceRowProps) {
  return (
    <>
      {/* 行首：原图缩略图。套用 task variant 的 role 标记样式 + role label */}
      <div className="studio-result-reference-thumb self-stretch" style={{ aspectRatio: cellAspect }}>
        <RawPreviewImage
          src={getImageVariantUrl(source.thumbnail, "thumb")}
          alt={source.label}
          loading="lazy"
          decoding="async"
          className="grouped-row-thumb-img"
        />
        <span className="studio-result-reference-label">{source.label}</span>
        {source.badge ? <span className="absolute right-1 top-1">{source.badge}</span> : null}
      </div>

      {/* 行内：每个 target 一个结果 cell */}
      {targets.map((target, targetIndex) => {
        const cell = cellMap.get(`${source.id}::${target.id}`);
        return (
          <ResultCellView
            key={`${source.id}::${target.id}`}
            cell={cell}
            sourceLabel={source.label}
            targetLabel={target.label}
            cellAspect={cellAspect}
            failureLabel={failureLabel}
            failureDetail={failureDetail}
            onOpen={onOpen ? () => {
              if (cell?.url) {
                onOpen({ sourceIndex, targetIndex, url: cell.url });
              }
            } : undefined}
            onRetry={onRetry ? () => onRetry({ sourceId: source.id, targetId: target.id }) : undefined}
          />
        );
      })}
    </>
  );
});

type ResultCellViewProps = {
  cell: GroupedResultCell | undefined;
  sourceLabel: string;
  targetLabel: string;
  cellAspect: string;
  failureLabel?: string;
  failureDetail?: string;
  onOpen?: () => void;
  onRetry?: () => void;
};

const ResultCellView = memo(function ResultCellView({
  cell,
  sourceLabel,
  targetLabel,
  cellAspect,
  failureLabel,
  failureDetail,
  onOpen,
  onRetry,
}: ResultCellViewProps) {
  const t = useTranslations("Shared");
  const status: GroupedResultCellStatus = cell?.status ?? "idle";
  const url = cell?.url ?? null;
  const progress = Math.max(0, Math.min(99, Math.round(Number(cell?.progress || 0))));
  const failed = status === "failed" || (!url && status !== "running" && status !== "idle");
  const running = status === "running";
  const completed = status === "completed" && Boolean(url);

  const cellStyle = { aspectRatio: cellAspect } as React.CSSProperties;
  const effectiveFailureLabel = failureLabel || cell?.failureLabel || t("thisImageFailed");
  const effectiveFailureDetail = failureDetail || cell?.failureDetail;

  // 通过 URL 的 hash 简单映射到序号，保证下载文件名稳定递增
  const downloadCurrent = () => {
    if (!url) return;
    const seed = Array.from(url).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    void downloadImage(url, generateDownloadFilename("grouped-result", seed, "png"));
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow",
        completed && "border-emerald-200 hover:shadow-md",
        failed && "border-rose-200 bg-rose-50/40",
        running && "border-violet-300 bg-[rgba(91,124,255,0.1)]/30 shadow-[0_0_0_1px_rgba(91,124,255,0.18)]",
        !completed && !failed && !running && "border-slate-200 bg-slate-50/40"
      )}
      style={cellStyle}
    >
      {url ? (
        <div className="relative h-full w-full">
          <button
            type="button"
            onClick={onOpen}
            className="absolute inset-0 z-[1]"
            aria-label={t("viewGroupResult", { source: sourceLabel, target: targetLabel })}
          >
            <span className="sr-only">{t("viewGroupSr", { source: sourceLabel, target: targetLabel })}</span>
          </button>
          <RawPreviewImage src={url} alt={`${sourceLabel} ${targetLabel}`} className="absolute inset-0 h-full w-full object-cover" />
          <span className="pointer-events-none absolute left-1.5 top-1.5 z-[2] inline-flex h-6 items-center gap-1 rounded-full bg-emerald-500/95 px-2 text-[10px] font-black text-white shadow-sm">
            <CheckCircle2 className="h-3 w-3" />
            {t("completed")}
          </span>
          <button
            type="button"
            aria-label={t("downloadGroup", { source: sourceLabel, target: targetLabel })}
            title={t("download")}
            onClick={(event) => {
              event.stopPropagation();
              downloadCurrent();
            }}
            className="grouped-cell-download"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
          {failed ? (
            <>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-rose-500">
                <XIcon className="h-4 w-4" />
              </span>
              <p className="text-[12px] font-black text-rose-700">{effectiveFailureLabel}</p>
              {effectiveFailureDetail ? (
                <p className="line-clamp-2 text-[10px] font-semibold leading-4 text-rose-500/80">{effectiveFailureDetail}</p>
              ) : null}
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-1 text-[10px] font-black text-white shadow-sm transition hover:bg-rose-600"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t("retry")}
                </button>
              ) : null}
            </>
          ) : running ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-[var(--codex-accent)]" />
              <p className="text-[12px] font-black text-violet-700">{progress ? `${progress}%` : t("generating")}</p>
            </>
          ) : (
            <>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-200/70 text-slate-400">
                <ZoomIn className="h-4 w-4" />
              </span>
              <p className="text-[12px] font-semibold text-slate-400">{t("waitingToGenerate")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
});
