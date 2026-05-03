"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { Sparkles, Bot } from "lucide-react";
import type { Message, ChatImage } from "@/lib/agent/types";
import { MessageBubble } from "./MessageBubble";

type Props = {
  messages: Message[];
  sessionImages: ChatImage[];
  isSending: boolean;
  onOpenImage: (url: string) => void;
  onRetry: (messageId: string) => void;
};

export function ChatArea({ messages, sessionImages, isSending, onOpenImage, onRetry }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-lg text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-100 to-pink-100">
            <Sparkles className="h-10 w-10 text-violet-400" />
          </div>
          <h2 className="text-xl font-black text-slate-800">开始一段图像对话</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            上传多张图片后，AI 会自动分析并给出建议。
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">
            在输入框里输入 <span className="font-bold text-violet-500">@</span> 来精确绑定某张图，
            让 Agent 更准确地识别目标图和参考图。
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 rounded-full bg-violet-50 px-5 py-2.5 text-sm font-bold text-violet-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              点击下方 📎 上传图片，或直接拖拽到页面
            </div>
            <p className="text-xs text-slate-300">
              上传后 AI 会自动分析图片内容并推荐操作
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              sessionImages={sessionImages}
              onOpenImage={onOpenImage}
              onRetry={onRetry}
            />
          ))}
        </AnimatePresence>

        {/* 思考中指示器 */}
        {isSending && messages.length > 0 && messages[messages.length - 1].role === "user" && (
          <div className="flex gap-3">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-500">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:300ms]" />
              </div>
              <span className="text-xs font-medium">分析中...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
