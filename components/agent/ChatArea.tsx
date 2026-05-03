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
  onQuickAction: (text: string) => void;
};

const PRESET_QUESTIONS = [
  { icon: "📸", text: "生成小红书种草图" },
  { icon: "👗", text: "服装换装试穿" },
  { icon: "🌿", text: "种草场景图" },
  { icon: "🎭", text: "模特姿势裂变" },
  { icon: "🖼️", text: "更换背景" },
  { icon: "💬", text: "你是谁？" },
];

export function ChatArea({ messages, sessionImages, isSending, onOpenImage, onRetry, onQuickAction }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-lg text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 shadow-lg shadow-violet-200">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-lg font-bold text-slate-700">有什么可以帮你的吗？</h2>
          <p className="mt-1.5 text-sm text-slate-400">
            随时上传图片告诉我你的需求吧！
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {PRESET_QUESTIONS.map((q) => (
              <button
                key={q.text}
                onClick={() => onQuickAction(q.text)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 hover:shadow-sm"
              >
                {q.icon} {q.text}
              </button>
            ))}
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

        {/* 思考中指示器 — 最后一条 AI 消息还没有内容时显示 */}
        {isSending && (() => {
          const last = messages[messages.length - 1];
          return last && last.role === "assistant" && !last.content && !last.generation;
        })() && (
          <div className="flex gap-3">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-md shadow-violet-200">
              <Bot className="h-4 w-4 animate-pulse" />
            </div>
            <div className="flex items-center gap-3 rounded-2xl rounded-bl-md border border-violet-100 bg-gradient-to-r from-violet-50 to-pink-50 px-4 py-3">
              <ThinkingDots />
              <span className="text-xs font-semibold text-violet-600">思考中...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full bg-violet-400"
          style={{
            animation: "thinking-dot 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}
