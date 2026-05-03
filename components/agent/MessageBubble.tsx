"use client";

import { motion } from "framer-motion";
import { Bot, User, Loader2, CheckCircle2, AlertCircle, Download, ZoomIn, RefreshCw, Copy } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Message } from "@/lib/agent/types";
import { renderMentionSegments } from "@/lib/agent/mention-parser";
import { downloadImage, generateDownloadFilename } from "@/lib/utils";

type Props = {
  message: Message;
  sessionImages: Array<{ index: number; url: string }>;
  onOpenImage: (url: string) => void;
  onRetry: (messageId: string) => void;
};

export function MessageBubble({ message, sessionImages, onOpenImage, onRetry }: Props) {
  const { role, content, images, generation } = message;
  const [copied, setCopied] = useState(false);

  if (role === "system") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-400">{content}</span>
      </motion.div>
    );
  }

  const isUser = role === "user";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        isUser ? "bg-violet-600 text-white" : "bg-gradient-to-br from-violet-500 to-pink-500 text-white"
      }`}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={`max-w-[80%] min-w-0 flex flex-col gap-2`}>
        {/* 文本内容 */}
        {content && (
          <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser ? "rounded-br-md bg-violet-600 text-white" : "rounded-bl-md border border-slate-200/80 bg-white text-slate-800"
          }`}>
            {isUser ? (
              // 用户消息：渲染 @ 标签
              <div className="whitespace-pre-wrap">
                {renderMentionSegments(content).map((seg, i) =>
                  seg.type === "mention" ? (
                    <span key={i} className="inline-flex items-center gap-0.5 rounded-md bg-white/20 px-1.5 py-0.5 font-bold text-white/90">
                      {seg.value}
                    </span>
                  ) : (
                    <span key={i}>{seg.value}</span>
                  )
                )}
              </div>
            ) : (
              // AI 消息：Markdown 渲染
              <div className="prose-agent">
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
            )}
            {!isUser && content.length > 10 && (
              <button onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="mt-2 flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600">
                {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copied ? "已复制" : "复制"}
              </button>
            )}
          </div>
        )}

        {/* 用户消息中的图片 */}
        {isUser && images && images.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {images.map((img, i) => (
              <button key={i} onClick={() => onOpenImage(img.url)}
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-violet-200">
                <img src={img.url} alt={`图${img.index}`} className="h-full w-full object-cover" />
                <span className="absolute bottom-0 left-0 right-0 bg-violet-600/80 text-center text-[9px] font-bold text-white">图{img.index}</span>
              </button>
            ))}
          </div>
        )}

        {/* 生成进度 */}
        {generation && (generation.status === "pending" || generation.status === "generating") && (
          <div className="w-full max-w-sm rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
              <span className="text-sm font-bold text-slate-700">图片生成中</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-700"
                style={{ width: `${Math.max(generation.progress, 3)}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{generation.progress < 20 ? "准备中..." : generation.progress < 90 ? "生成中..." : "即将完成..."}</span>
              <span className="font-bold text-violet-600">{generation.progress}%</span>
            </div>
          </div>
        )}

        {/* 生成结果 */}
        {generation && generation.status === "completed" && generation.resultUrls.length > 0 && (
          <div className="w-full max-w-md">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="font-bold">生成完成</span>
              {generation.creditsUsed ? <span className="text-slate-400">· {generation.creditsUsed} 积分</span> : null}
            </div>
            <div className={`grid gap-2 ${generation.resultUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {generation.resultUrls.map((url, i) => (
                <div key={i} className="group relative cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm"
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
            <button onClick={() => onRetry(message.id)}
              className="mt-2 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-violet-200 hover:text-violet-600">
              <RefreshCw className="h-3 w-3" /> 重新生成
            </button>
          </div>
        )}

        {/* 生成失败 */}
        {generation && generation.status === "failed" && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
            <div className="flex items-center gap-1.5 font-bold"><AlertCircle className="h-3.5 w-3.5" /> 生成失败</div>
            <p className="mt-1">{generation.error || "未知错误"}</p>
            <button onClick={() => onRetry(message.id)}
              className="mt-2 flex items-center gap-1 rounded-lg bg-red-100 px-3 py-1.5 font-bold text-red-700 hover:bg-red-200">
              <RefreshCw className="h-3 w-3" /> 重试
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
