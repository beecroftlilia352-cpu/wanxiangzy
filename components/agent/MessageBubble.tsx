"use client";

import { motion } from "framer-motion";
import { Bot, User, Loader2, CheckCircle2, AlertCircle, Download, ZoomIn, RefreshCw, Copy } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/agent/types";
import { renderMentionSegments } from "@/lib/agent/mention-parser";
import { downloadImage, generateDownloadFilename } from "@/lib/utils";

type Props = {
  message: Message;
  prevMessage?: Message;
  sessionImages: Array<{ index: number; url: string }>;
  onOpenImage: (url: string) => void;
  onRetry: (messageId: string) => void;
};

export function MessageBubble({ message, prevMessage, sessionImages, onOpenImage, onRetry }: Props) {
  const { role, content, images, generation, created_at } = message;
  const [copied, setCopied] = useState(false);

  if (role === "system") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-1">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-400">{content}</span>
      </motion.div>
    );
  }

  const isUser = role === "user";
  if (!isUser && !content && !generation) return null;

  // 消息分组：同角色连续消息隐藏头像
  const isGrouped = prevMessage && prevMessage.role === role;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""} ${isGrouped ? "mt-0.5" : "mt-3"}`}
    >
      {/* 头像（分组时隐藏） */}
      {isGrouped ? (
        <div className="w-7 shrink-0" />
      ) : (
        <div className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-violet-600 text-white" : "bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-sm shadow-violet-200"
        }`}>
          {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
        </div>
      )}

      <div className={`flex min-w-0 max-w-[80%] flex-col ${isUser ? "items-end" : "items-start"}`}>
        {/* 名称 + 时间（分组时只显示时间） */}
        {!isGrouped && (
          <div className={`mb-1 flex items-center gap-2 text-[11px] text-slate-400 ${isUser ? "flex-row-reverse" : ""}`}>
            <span className="font-medium">{isUser ? "你" : "AI 助手"}</span>
            <span className="text-slate-300">·</span>
            <span>{formatTime(created_at)}</span>
          </div>
        )}

        {/* 文本内容 */}
        {content && (
          <div className={`group/msg relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "rounded-br-md bg-violet-600 text-white"
              : "rounded-bl-md border border-slate-200/80 bg-white text-slate-800"
          }`}>
            {isUser ? (
              <div className="whitespace-pre-wrap">
                {renderMentionSegments(content).map((seg, i) =>
                  seg.type === "mention" ? (
                    <span key={i} className="inline-flex items-center gap-0.5 rounded-md bg-white/20 px-1.5 py-0.5 font-bold text-white/90">{seg.value}</span>
                  ) : (
                    <span key={i}>{seg.value}</span>
                  )
                )}
              </div>
            ) : (
              <div className="prose-agent">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            )}

            {/* 消息操作栏（AI 消息 hover 显示） */}
            {!isUser && (
              <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover/msg:opacity-100">
                <button
                  onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? "已复制" : "复制"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 用户消息中的图片 */}
        {isUser && images && images.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {images.map((img, i) => (
              <button key={i} onClick={() => onOpenImage(img.url)}
                className="group relative h-12 w-12 overflow-hidden rounded-lg border border-violet-200 shadow-sm transition-transform hover:scale-105">
                <img src={img.url} alt={`图${img.index}`} className="h-full w-full object-cover" />
                <span className="absolute bottom-0 left-0 right-0 bg-violet-600/80 text-center text-[8px] font-bold leading-tight text-white">图{img.index}</span>
              </button>
            ))}
          </div>
        )}

        {/* ===== 任务状态卡片 ===== */}

        {/* 生成中 */}
        {generation && (generation.status === "pending" || generation.status === "generating") && (
          <div className="mt-1.5 w-full max-w-sm overflow-hidden rounded-xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/50 shadow-sm">
            <div className="px-4 pt-3 pb-2.5">
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
                    <div className="absolute inset-0 animate-ping rounded-lg bg-violet-200 opacity-30" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-700">正在生成</p>
                    <p className="text-[10px] text-slate-400">{generation.module || "图像生成"}</p>
                  </div>
                </div>
                <span className="text-sm font-black tabular-nums text-violet-600">{generation.progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-violet-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500 transition-all duration-700 ease-out"
                  style={{ width: `${Math.max(generation.progress, 3)}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] text-slate-400">
                {generation.progress < 15 ? "正在准备素材..." :
                 generation.progress < 40 ? "AI 正在绘制..." :
                 generation.progress < 70 ? "生成中，请稍候..." :
                 generation.progress < 95 ? "即将完成..." : "处理结果中..."}
              </p>
            </div>
          </div>
        )}

        {/* 生成完成 */}
        {generation && generation.status === "completed" && generation.resultUrls.length > 0 && (
          <div className="mt-1.5 w-full max-w-md">
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-bold text-emerald-700">生成完成</span>
              <div className="flex-1" />
              {generation.creditsUsed ? <span className="text-[11px] text-emerald-600">消耗 {generation.creditsUsed} 积分</span> : null}
              {generation.module && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">{generation.module}</span>}
            </div>
            <div className={`grid gap-2 ${generation.resultUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {generation.resultUrls.map((url, i) => (
                <div key={i} className="group relative cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm transition-shadow hover:shadow-md"
                  onClick={() => onOpenImage(url)}>
                  <img src={url} alt={`结果 ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/10 group-hover:opacity-100">
                    <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); downloadImage(url, generateDownloadFilename("agent", i)); }}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 opacity-0 shadow transition-opacity hover:bg-white group-hover:opacity-100">
                    <Download className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => onRetry(message.id)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-violet-200 hover:text-violet-600">
                <RefreshCw className="h-3 w-3" /> 重新生成
              </button>
              <button onClick={() => generation.resultUrls.forEach((url, i) => downloadImage(url, generateDownloadFilename("agent", i)))}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-emerald-200 hover:text-emerald-600">
                <Download className="h-3 w-3" /> 全部下载
              </button>
            </div>
          </div>
        )}

        {/* 生成失败 */}
        {generation && generation.status === "failed" && (
          <div className="mt-1.5 w-full max-w-sm overflow-hidden rounded-xl border border-red-200 bg-gradient-to-br from-white to-red-50/50">
            <div className="px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-100">
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-red-700">生成失败</p>
                  <p className="truncate text-[10px] text-red-500">{generation.error || "未知错误"}</p>
                </div>
              </div>
              <button onClick={() => onRetry(message.id)}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-50 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-100">
                <RefreshCw className="h-3 w-3" /> 重新生成
              </button>
            </div>
          </div>
        )}

        {/* 分组消息的时间（仅最后一条显示） */}
        {isGrouped && (
          <span className="mt-0.5 text-[10px] text-slate-300 opacity-0 transition-opacity group-hover:opacity-100">
            {formatTimeShort(created_at)}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (isToday) return time;
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function formatTimeShort(ts: string): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}
