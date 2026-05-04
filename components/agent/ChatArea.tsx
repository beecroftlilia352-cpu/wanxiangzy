"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Sparkles, Bot, ArrowDown } from "lucide-react";
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
  { icon: "🔍", text: "帮我分析这张图片" },
  { icon: "👗", text: "服装换装试穿" },
  { icon: "📸", text: "生成小红书种草图" },
  { icon: "💡", text: "给我拍摄创意建议" },
  { icon: "🖼️", text: "换个背景" },
  { icon: "💬", text: "你是谁？你有什么能力？" },
];

export function ChatArea({ messages, sessionImages, isSending, onOpenImage, onRetry, onQuickAction }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // 智能滚动：只在用户在底部时自动滚
  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isSending, isAtBottom]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 120;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtBottom(true);
  };

  // 判断是否显示思考指示器
  const lastMsg = messages[messages.length - 1];
  const showThinking = isSending && lastMsg && lastMsg.role === "assistant" && !lastMsg.content && !lastMsg.generation;

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 sm:p-8">
        <div className="max-w-lg text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 shadow-lg shadow-violet-200">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-lg font-bold text-slate-700">有什么可以帮你的吗？</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            上传图片我能帮你分析内容、生成创意、换装试穿<br className="hidden sm:inline" />
            也可以直接聊天，问我任何关于服装视觉的问题
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {PRESET_QUESTIONS.map((q) => (
              <button
                key={q.text}
                onClick={() => onQuickAction(q.text)}
                className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-600 transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 hover:shadow-sm"
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
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={scrollRef} onScroll={handleScroll} role="log" aria-label="对话消息" aria-live="polite" className="h-full overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-1">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                prevMessage={i > 0 ? messages[i - 1] : undefined}
                sessionImages={sessionImages}
                onOpenImage={onOpenImage}
                onRetry={onRetry}
              />
            ))}
          </AnimatePresence>

          {/* 思考指示器 */}
          {showThinking && (
            <div className="flex gap-2.5 py-1">
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-sm shadow-violet-200">
                <Bot className="h-3.5 w-3.5 animate-pulse" />
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

      {/* 回到底部按钮 */}
      {!isAtBottom && messages.length > 3 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-md backdrop-blur-sm transition-all hover:bg-white hover:shadow-lg"
        >
          <ArrowDown className="h-3 w-3" />
          回到底部
        </button>
      )}
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
          style={{ animation: "thinking-dot 1.4s ease-in-out infinite", animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}
