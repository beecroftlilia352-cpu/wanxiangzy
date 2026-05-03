"use client";

import { motion } from "framer-motion";
import { Bot, User, Download, ZoomIn, RefreshCw, Copy, CheckCircle2, AlertCircle } from "lucide-react";
import { useState } from "react";
import type { ChatMessage as MessageType } from "@/lib/agent/types";
import { GenerationProgress } from "./GenerationProgress";
import { GeneratedResult } from "./GeneratedResult";
import { downloadImage, generateDownloadFilename } from "@/lib/utils";

type Props = {
  message: MessageType;
  onOpenImage: (url: string) => void;
  onRetry: (messageId: string) => void;
};

export function ChatMessage({ message, onOpenImage, onRetry }: Props) {
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-violet-600 text-white" : "bg-gradient-to-br from-violet-500 to-pink-500 text-white"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className={`max-w-[80%] min-w-0 ${isUser ? "items-end" : "items-start"} flex flex-col gap-2`}>
        {/* Text */}
        {content && (
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              isUser
                ? "rounded-br-md bg-violet-600 text-white"
                : "rounded-bl-md border border-slate-200/80 bg-white text-slate-800"
            }`}
          >
            <div className="whitespace-pre-wrap">{content}</div>
            {/* Copy button for AI messages */}
            {!isUser && content.length > 10 && (
              <button
                onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
              >
                {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copied ? "已复制" : "复制"}
              </button>
            )}
          </div>
        )}

        {/* User uploaded images with labels */}
        {images && images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div key={i} className="group relative">
                <div className="h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <img src={img.hostedUrl || img.url} alt={`图${img.index}`} className="h-full w-full object-cover" />
                </div>
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                  图{img.index}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Generation progress */}
        {generation && (generation.status === "pending" || generation.status === "generating") && (
          <GenerationProgress generation={generation} />
        )}

        {/* Generation result */}
        {generation && generation.status === "completed" && generation.resultUrls.length > 0 && (
          <GeneratedResult
            urls={generation.resultUrls}
            creditsUsed={generation.creditsUsed}
            onOpen={onOpenImage}
            onRetry={() => onRetry(message.id)}
          />
        )}

        {/* Generation error */}
        {generation && generation.status === "failed" && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertCircle className="h-3.5 w-3.5" />
              生成失败
            </div>
            <p className="mt-1">{generation.error || "未知错误"}</p>
            <button
              onClick={() => onRetry(message.id)}
              className="mt-2 flex items-center gap-1 rounded-lg bg-red-100 px-3 py-1.5 font-bold text-red-700 hover:bg-red-200"
            >
              <RefreshCw className="h-3 w-3" />
              重试
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
