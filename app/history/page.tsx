"use client";

import { useEffect, useState } from "react";
import { Download, Clock, XCircle, Loader2, Coins, X, RotateCcw, Copy, Maximize2, Eye, ImageIcon } from "lucide-react";
import { downloadImage, generateDownloadFilename } from "@/lib/utils";
import { getApplyPath, saveApplyPayload, type HistoryJobPayload } from "@/lib/history-apply";

const HISTORY_PAGE_SIZE = 12;

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

export default function HistoryPage() {
  const [state, setState] = useState<"loading" | "noauth" | "error" | "empty" | "ready">("loading");
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [errMsg, setErrMsg] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<HistoryRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailResultIndex, setDetailResultIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const payload = await requestHistoryPage(null, controller.signal).finally(() => clearTimeout(timeout));

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
        setErrMsg(isAbortError ? "历史记录加载超时，请稍后重试" : e instanceof Error ? e.message : "未知错误");
        setState("error");
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const loadMore = async () => {
    if (!hasMore || !nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const payload = await requestHistoryPage(nextCursor);
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
      alert(error instanceof Error ? error.message : "历史记录加载失败");
    } finally {
      setLoadingMore(false);
    }
  };

  const fmt = (d: string) => {
    try { return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d)); }
    catch { return d; }
  };

  const getPayload = (row: HistoryRow) => getRowPayload(row);
  const detailPayload = detailRow ? getPayload(detailRow) : undefined;
  const detailPrompt = detailPayload ? getPromptText(detailPayload) : "";
  const detailImages = detailPayload ? getInputImages(detailPayload) : [];
  const detailResults = detailRow?.result_urls || [];
  const selectedResultIndex = detailResults.length ? Math.min(detailResultIndex, detailResults.length - 1) : 0;
  const selectedResultUrl = detailResults[selectedResultIndex];

  const fetchHistoryDetail = async (row: HistoryRow) => {
    if (getPayload(row)?.kind) return row;

    const res = await fetch(`/api/history?id=${encodeURIComponent(row.id)}`, {
      method: "GET",
      cache: "no-store",
    });
    const payload = await res.json().catch(() => ({})) as { row?: HistoryRow; error?: string };

    if (!res.ok || !payload.row) {
      throw new Error(payload.error || `参数加载失败 (${res.status})`);
    }

    setRows((current) => current.map((item) => (
      item.id === payload.row?.id ? { ...item, ...payload.row } : item
    )));
    return payload.row;
  };

  const openDetail = async (row: HistoryRow, initialResultIndex = 0) => {
    setDetailLoading(true);
    try {
      setDetailResultIndex(initialResultIndex);
      setDetailRow(await fetchHistoryDetail(row));
    } catch (error) {
      alert(error instanceof Error ? error.message : "参数加载失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const applyHistoryRow = async (row: HistoryRow) => {
    setDetailLoading(true);
    try {
      const fullRow = await fetchHistoryDetail(row);
      const payload = getPayload(fullRow);
      if (!payload?.kind) {
        alert("这条历史记录没有可套用参数");
        return;
      }
      saveApplyPayload(payload);
      window.location.href = getApplyPath(payload.kind);
    } catch (error) {
      alert(error instanceof Error ? error.message : "参数加载失败");
    } finally {
      setDetailLoading(false);
    }
  };

  if (state === "loading") return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center">
      <Loader2 className="w-8 h-8 mx-auto animate-spin text-purple-500" />
      <p className="text-gray-400 text-sm mt-3">加载中...</p>
    </div>
  );

  if (state === "noauth") return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center">
      <p className="text-gray-500 mb-4">请先登录</p>
      <a href="/login" className="px-5 py-2.5 rounded-full gradient-brand text-white text-sm font-medium">去登录</a>
    </div>
  );

  if (state === "error") return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center">
      <XCircle className="w-12 h-12 mx-auto mb-3 text-red-300" />
      <p className="text-red-500 text-sm mb-4">{errMsg}</p>
      <button onClick={() => location.reload()} className="px-5 py-2 rounded-full border text-sm hover:bg-gray-50">重试</button>
    </div>
  );

  if (state === "empty") return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center">
      <Clock className="w-12 h-12 mx-auto mb-4 text-gray-200" />
      <p className="text-gray-400 mb-4">暂无记录</p>
      <a href="/create" className="text-purple-600 font-medium hover:underline">去创作</a>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400">作品库</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-950">历史作品</h1>
          <p className="mt-1 text-sm text-gray-500">已加载 {rows.length} 条</p>
        </div>
        <a href="/create" className="inline-flex w-full justify-center rounded-full gradient-brand px-5 py-2.5 text-sm font-medium text-white shadow-sm sm:w-auto">新创作</a>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rows.map((g: HistoryRow) => {
          const payload = getPayload(g);
          const resultUrls = g.result_urls || [];
          const coverUrl = resultUrls[0];
          const moduleLabel = payload?.kind ? formatKind(payload.kind) : "生成作品";
          const status = formatStatus(g.status);
          const credits = g.credits_cost || g.credits_used || "-";

          return (
            <article key={g.id} className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex flex-col sm:flex-row">
                <button
                  type="button"
                  onClick={() => openDetail(g)}
                  className="relative aspect-[4/5] overflow-hidden bg-gray-100 sm:w-44 sm:flex-shrink-0 sm:aspect-[3/4] md:w-52"
                >
                  {coverUrl ? (
                    <img src={coverUrl} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" alt="历史作品封面" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-300">
                      <ImageIcon className="h-9 w-9" />
                      <span className="text-xs text-gray-400">暂无结果</span>
                    </div>
                  )}
                  <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusClasses(g.status)}`}>
                    {status}
                  </span>
                  {resultUrls.length > 1 && (
                    <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
                      {resultUrls.length} 张结果
                    </span>
                  )}
                </button>

                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-gray-950">{moduleLabel}</h2>
                      <p className="mt-0.5 text-xs text-gray-400">{fmt(g.created_at)}</p>
                    </div>
                    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                      <Coins className="h-3.5 w-3.5" />
                      {credits}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400">模型</p>
                      <p className="mt-0.5 truncate font-medium text-gray-800">{g.ai_model || payload?.aiModel || "-"}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400">尺寸</p>
                      <p className="mt-0.5 truncate font-medium text-gray-800">{g.image_size || payload?.imageSize || "-"}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400">结果</p>
                      <p className="mt-0.5 truncate font-medium text-gray-800">{resultUrls.length || 0} 张</p>
                    </div>
                  </div>

                  {resultUrls.length > 1 && (
                    <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
                      {resultUrls.slice(0, 5).map((url, index) => (
                        <button
                          type="button"
                          key={`${url}-${index}`}
                          onClick={() => openDetail(g, index)}
                          className="h-12 w-10 flex-shrink-0 overflow-hidden rounded-md border bg-gray-50"
                        >
                          <img src={url} className="h-full w-full object-cover" alt={`结果 ${index + 1}`} />
                        </button>
                      ))}
                      {resultUrls.length > 5 && (
                        <button
                          type="button"
                          onClick={() => openDetail(g, 5)}
                          className="h-12 w-10 flex-shrink-0 rounded-md border bg-gray-50 text-[10px] font-medium text-gray-500"
                        >
                          +{resultUrls.length - 5}
                        </button>
                      )}
                    </div>
                  )}

                  {g.error_message && (
                    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{g.error_message}</p>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    <button
                      onClick={() => openDetail(g)}
                      disabled={detailLoading}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gray-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      查看作品
                    </button>
                    <button
                      onClick={() => applyHistoryRow(g)}
                      disabled={detailLoading}
                      className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      套用
                    </button>
                    <button
                      onClick={() => coverUrl && downloadHistoryResult(g, coverUrl, 0)}
                      disabled={!coverUrl}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-8 flex justify-center">
        {hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-full border bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
            {loadingMore ? "加载中..." : "加载更多"}
          </button>
        ) : (
          <p className="text-xs text-gray-400">已加载全部历史作品</p>
        )}
      </div>
      {detailLoading && (
        <div className="fixed inset-0 z-[120] bg-black/20 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="rounded-2xl bg-white px-5 py-4 shadow-xl flex items-center gap-3 text-sm text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
            加载参数...
          </div>
        </div>
      )}
      {detailRow && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
          onClick={() => setDetailRow(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-6xl w-full max-h-[92vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 border-b bg-white">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-sm">{formatKind(detailPayload?.kind)}</h3>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{formatStatus(detailRow.status)}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">{fmt(detailRow.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => selectedResultUrl && downloadHistoryResult(detailRow, selectedResultUrl, selectedResultIndex)}
                  disabled={!selectedResultUrl}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  下载
                </button>
                {detailPayload && (
                  <button
                    onClick={() => {
                      saveApplyPayload(detailPayload);
                      window.location.href = getApplyPath(detailPayload.kind);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-3 py-1.5 text-xs font-medium text-white"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    套用
                  </button>
                )}
                <button onClick={() => setDetailRow(null)} className="p-1.5 rounded-full hover:bg-gray-100" aria-label="关闭">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid flex-1 min-h-0 overflow-y-auto lg:grid-cols-[minmax(0,1.15fr)_380px] lg:overflow-hidden">
              <section className="min-h-[420px] bg-neutral-950 p-3 sm:p-5 flex flex-col gap-3">
                <div className="relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-xl bg-black">
                  {selectedResultUrl ? (
                    <button
                      type="button"
                      onClick={() => setLightboxSrc(selectedResultUrl)}
                      className="group flex h-full w-full items-center justify-center"
                    >
                      <img
                        src={selectedResultUrl}
                        className="max-h-[64vh] w-full object-contain"
                        alt={`生成结果 ${selectedResultIndex + 1}`}
                      />
                      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <Maximize2 className="w-3 h-3" />
                        放大
                      </span>
                    </button>
                  ) : (
                    <div className="text-center text-sm text-gray-400">
                      {detailRow.status === "completed" ? "暂无结果图片" : formatStatus(detailRow.status)}
                    </div>
                  )}
                  {detailResults.length > 0 && (
                    <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white">
                      {selectedResultIndex + 1} / {detailResults.length}
                    </div>
                  )}
                </div>

                {detailResults.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {detailResults.map((url, index) => (
                      <button
                        type="button"
                        key={`${url}-${index}`}
                        onClick={() => setDetailResultIndex(index)}
                        className={`h-20 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 bg-neutral-900 transition ${
                          selectedResultIndex === index ? "border-white" : "border-white/10 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <img src={url} className="h-full w-full object-cover" alt={`结果缩略图 ${index + 1}`} />
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <aside className="space-y-5 overflow-y-auto bg-white p-4 sm:p-5 lg:max-h-[calc(92vh-57px)]">
                <section>
                  <h4 className="mb-2 text-xs font-bold text-gray-900">生成信息</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {getParameterItems(detailRow).map((item) => (
                      <div key={item.label} className="min-w-0 border-b border-gray-100 pb-2">
                        <p className="text-[10px] text-gray-400">{item.label}</p>
                        <p className="mt-0.5 break-words text-xs font-medium text-gray-800">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {detailImages.length > 0 && (
                  <section>
                    <h4 className="mb-2 text-xs font-bold text-gray-900">输入图片</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {detailImages.map((image, index) => (
                        <button
                          type="button"
                          key={`${image.label}-${index}`}
                          onClick={() => setLightboxSrc(image.url)}
                          className="min-w-0 text-left"
                        >
                          <img src={image.url} className="h-24 w-full rounded-lg border bg-gray-50 object-cover" alt={image.label} />
                          <p className="mt-1 truncate text-[10px] text-gray-500">{image.label}</p>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {detailPrompt && (
                  <section>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-gray-900">提示词 / 用户输入</h4>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(detailPrompt);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] text-gray-500 hover:text-purple-600"
                      >
                        <Copy className="w-3 h-3" />
                        复制
                      </button>
                    </div>
                    <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">{detailPrompt}</pre>
                  </section>
                )}

                {detailPayload && (
                  <div className="sticky bottom-0 -mx-4 -mb-4 border-t bg-white/95 p-4 backdrop-blur sm:-mx-5 sm:-mb-5 sm:p-5 lg:hidden">
                    <button
                      onClick={() => {
                        saveApplyPayload(detailPayload);
                        window.location.href = getApplyPath(detailPayload.kind);
                      }}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-full gradient-brand px-4 py-2 text-xs font-medium text-white"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      套用参数
                    </button>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      )}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            alt="历史记录大图预览"
          />
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function formatKind(kind?: HistoryJobPayload["kind"]) {
  if (kind === "tryon") return "服装上身";
  if (kind === "garment3d") return "服装转3D";
  if (kind === "model") return "专属模特";
  if (kind === "pose") return "姿势裂变";
  return "未知模块";
}

function formatStatus(status: string) {
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "processing") return "处理中";
  if (status === "pending") return "排队中";
  return status;
}

function getStatusClasses(status: string) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "failed") return "bg-red-50 text-red-600";
  if (status === "processing") return "bg-amber-50 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

class HistoryAuthError extends Error {}

async function requestHistoryPage(cursor?: string | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(`/api/history?${params.toString()}`, {
    method: "GET",
    signal,
    cache: "no-store",
  });

  if (res.status === 401) {
    throw new HistoryAuthError("请先登录");
  }

  const payload = await res.json().catch(() => ({})) as HistoryListPayload;

  if (!res.ok) {
    throw new Error(payload.error || `历史记录加载失败 (${res.status})`);
  }

  return payload;
}

function downloadHistoryResult(row: HistoryRow, url: string, index: number) {
  const ext = url.toLowerCase().includes(".jpg") || url.toLowerCase().includes(".jpeg") ? "jpg" : "png";
  const dateStr = row.created_at
    ? new Date(row.created_at).toISOString().slice(0, 10).replace(/-/g, "")
    : "";
  const filename = dateStr
    ? `vastweargen-history-${dateStr}-${String(index + 1).padStart(2, "0")}.${ext}`
    : generateDownloadFilename("history", index, ext);

  downloadImage(url, filename);
}

function getRowPayload(row: HistoryRow) {
  const payload = row.job_payload;
  if (!payload || typeof payload !== "object") return undefined;

  const kind = (payload as { kind?: unknown }).kind;
  if (kind === "tryon" || kind === "garment3d" || kind === "model" || kind === "pose") {
    return payload as HistoryJobPayload;
  }

  return undefined;
}

function getPromptText(payload: HistoryJobPayload) {
  if (payload.kind === "tryon") return payload.rawPrompt || payload.style || "";
  return payload.prompt || "";
}

function getInputImages(payload: HistoryJobPayload) {
  if (payload.kind === "tryon") {
    return [
      ...payload.clothingUrls.map((url, index) => ({ label: `服装图${index + 1}`, url })),
      ...(payload.referenceUrl ? [{ label: "参考图", url: payload.referenceUrl }] : []),
      ...(payload.modelFaceUrl ? [{ label: "模特脸", url: payload.modelFaceUrl }] : []),
    ];
  }
  if (payload.kind === "garment3d") {
    return [
      { label: "服装图", url: payload.garmentUrl },
      ...(payload.referenceUrl ? [{ label: "3D参考图", url: payload.referenceUrl }] : []),
    ];
  }
  if (payload.kind === "model") {
    return [
      ...payload.referenceUrls.map((url, index) => ({ label: `人物图${index + 1}`, url })),
      ...(payload.hairReferenceUrl ? [{ label: "发型参考", url: payload.hairReferenceUrl }] : []),
      ...(payload.hairColorReferenceUrl ? [{ label: "发色参考", url: payload.hairColorReferenceUrl }] : []),
    ];
  }
  return [{ label: "主图", url: payload.mainImageUrl }];
}

function getParameterItems(row: HistoryRow) {
  const payload = getRowPayload(row);
  const common = [
    { label: "模块", value: formatKind(payload?.kind) },
    { label: "状态", value: row.status },
    { label: "模型", value: String(payload?.aiModel || row.ai_model || "-") },
    { label: "尺寸", value: String(payload?.imageSize || row.image_size || "-") },
    { label: "积分", value: String(row.credits_cost || row.credits_used || "-") },
  ];
  if (!payload) return common;

  if (payload.kind === "tryon") {
    return [
      ...common,
      { label: "比例", value: payload.aspectRatio },
      { label: "生成张数", value: String(payload.genCount) },
      { label: "服装数量", value: String(payload.clothingUrls.length) },
      { label: "模特脸", value: payload.modelFaceUrl ? "已使用" : "未使用" },
      { label: "参考图", value: payload.referenceUrl ? "已使用" : "未使用" },
    ];
  }
  if (payload.kind === "garment3d") {
    return [
      ...common,
      { label: "比例", value: payload.aspectRatio },
      { label: "生成张数", value: String(payload.genCount) },
      { label: "服装类型", value: payload.garmentType || "-" },
      { label: "输出模式", value: payload.outputMode === "reference" ? "参考图模式" : "提示词模式" },
      { label: "3D参考图", value: payload.referenceUrl ? "已使用" : "未使用" },
    ];
  }
  if (payload.kind === "model") {
    return [
      ...common,
      { label: "比例", value: payload.aspectRatio },
      { label: "生成张数", value: String(payload.genCount) },
      { label: "性别", value: payload.gender === "male" ? "男" : "女" },
      { label: "人物参考", value: String(payload.referenceUrls.length) },
      { label: "发型", value: payload.hairStyle || "-" },
      { label: "发色", value: payload.hairColor || "-" },
      { label: "发型参考", value: payload.hairReferenceUrl ? "已使用" : "未使用" },
      { label: "发色参考", value: payload.hairColorReferenceUrl ? "已使用" : "未使用" },
    ];
  }
  return common;
}
