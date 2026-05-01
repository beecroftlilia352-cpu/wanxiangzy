"use client";

import { useEffect, useState } from "react";
import { Download, Clock, CheckCircle, XCircle, Loader2, Coins, X } from "lucide-react";

export default function HistoryPage() {
  const [state, setState] = useState<"loading" | "noauth" | "error" | "empty" | "ready">("loading");
  const [rows, setRows] = useState<any[]>([]);
  const [errMsg, setErrMsg] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const res = await fetch("/api/history", {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        }).finally(() => clearTimeout(timeout));

        if (cancelled) return;
        if (res.status === 401) { setState("noauth"); return; }
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrMsg(payload.error || `历史记录加载失败 (${res.status})`);
          setState("error");
          return;
        }
        const data = payload.rows || [];
        setRows(data);
        setState(data.length ? "ready" : "empty");
      } catch (e: any) {
        if (cancelled) return;
        setErrMsg(e.name === "AbortError" ? "历史记录加载超时，请稍后重试" : e.message || "未知错误");
        setState("error");
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const fmt = (d: string) => {
    try { return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d)); }
    catch { return d; }
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
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">历史记录</h1>
          <p className="text-gray-400 text-sm">{rows.length} 条</p>
        </div>
        <a href="/create" className="inline-flex w-full sm:w-auto justify-center px-4 py-2 rounded-full gradient-brand text-white text-sm font-medium">新创作</a>
      </div>
      <div className="space-y-3">
        {rows.map((g: any) => (
          <div key={g.id} className="bg-white border rounded-xl p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {g.status === "completed" ? <CheckCircle className="w-4 h-4 text-green-500" /> :
                 g.status === "failed" ? <XCircle className="w-4 h-4 text-red-500" /> :
                 <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />}
                <span className="text-sm font-medium">{g.status === "completed" ? "已完成" : g.status === "failed" ? "失败" : "处理中"}</span>
                <span className="text-xs text-gray-400">{fmt(g.created_at)}</span>
              </div>
              <span className="text-xs text-amber-600 flex items-center gap-1"><Coins className="w-3 h-3" />{g.credits_cost || g.credits_used}</span>
            </div>
            <div className="flex gap-4 min-w-0">
              {g.result_urls?.length > 0 && (
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-gray-400 mb-1">结果</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">{g.result_urls.map((u: string, i: number) => (
                    <div
                      key={i}
                      className="relative group rounded-lg overflow-hidden border w-24 cursor-zoom-in"
                      onClick={() => setLightboxSrc(u)}
                    >
                      <img
                        src={u}
                        className="w-full aspect-[3/4] object-cover bg-gray-50"
                        alt={`历史结果 ${i + 1}`}
                      />
                      <a
                        href={`/api/download-image?url=${encodeURIComponent(u)}&filename=${encodeURIComponent(`tryon-${i + 1}.jpg`)}`}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-white/90 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Download className="w-3 h-3" />
                      </a>
                    </div>
                  ))}</div>
                </div>
              )}
            </div>
            {g.error_message && <p className="text-xs text-red-500 mt-2">{g.error_message}</p>}
          </div>
        ))}
      </div>
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
