"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowDown, Bot, Clock3, History, Plus, Sparkles } from "lucide-react";
import type {
  ChatImage,
  ChatImageRole,
  Conversation,
  GenerationParams,
  Message,
} from "@/lib/agent/types";
import { MessageBubble } from "./MessageBubble";

type Props = {
  messages: Message[];
  sessionImages: ChatImage[];
  isSending: boolean;
  recentConversation?: Conversation;
  onOpenImage: (url: string) => void;
  onRetry: (messageId: string) => void;
  onConfirm?: (messageId: string) => void;
  onUpdateConfirmParams?: (messageId: string, params: Partial<GenerationParams>) => void;
  onUpdateConfirmImageRole?: (messageId: string, imageIndex: number, role: ChatImageRole) => void;
  onUseAsReference?: (url: string) => void;
  onContinueRecent?: (id: string) => void;
  onNewConversation?: () => void;
  onOpenHistory?: () => void;
  onQuickAction: (text: string) => void;
};

const PRESET_QUESTIONS = [
  { icon: "生成", text: "帮我生成一张时尚街拍" },
  { icon: "试穿", text: "服装换装试穿" },
  { icon: "种草", text: "生成小红书种草图" },
  { icon: "分析", text: "帮我分析这张图片" },
  { icon: "创意", text: "给我拍摄创意建议" },
  { icon: "能力", text: "你是谁？你能做什么？" },
];

const IMAGE_SUGGESTIONS = [
  { icon: "上身", text: "帮我把这件衣服穿到模特身上" },
  { icon: "种草", text: "帮我出一套小红书种草图" },
  { icon: "3D", text: "帮我做 3D 立体展示" },
  { icon: "换景", text: "帮我换个背景" },
  { icon: "裂变", text: "帮我做四宫格姿势裂变" },
  { icon: "重绘", text: "根据这张图重新生成一张" },
  { icon: "分析", text: "分析这件衣服的风格和适合场景" },
  { icon: "建议", text: "给我拍摄创意建议" },
];

export function ChatArea({
  messages,
  sessionImages,
  isSending,
  recentConversation,
  onOpenImage,
  onRetry,
  onConfirm,
  onUpdateConfirmParams,
  onUpdateConfirmImageRole,
  onUseAsReference,
  onContinueRecent,
  onNewConversation,
  onOpenHistory,
  onQuickAction,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isSending, isAtBottom]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 120;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtBottom(true);
  };

  const lastMsg = messages[messages.length - 1];
  const showThinking = isSending && lastMsg && lastMsg.role === "assistant" && !lastMsg.content && !lastMsg.generation;

  if (messages.length === 0) {
    const hasImages = sessionImages.length > 0;

    return (
      <div className="flex flex-1 items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-2xl text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 shadow-lg shadow-violet-200">
            <Sparkles className="h-8 w-8 text-white" />
          </div>

          {hasImages ? (
            <>
              <h2 className="text-lg font-bold text-slate-700">图片已就绪，告诉我你想做什么</h2>
              <p className="mt-1.5 text-sm text-slate-400">
                已上传 {sessionImages.length} 张图片，选择下方操作或输入自定义指令。
              </p>
              <QuickActions items={IMAGE_SUGGESTIONS} onQuickAction={onQuickAction} tone="violet" />
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-slate-700">开启一个干净的新任务</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                历史会话会保留，但不会自动带入旧图片和旧意图，避免影响本次生成判断。
              </p>

              <div className="mt-5 flex flex-col gap-2 rounded-2xl border border-slate-200/70 bg-white/80 p-2 text-left shadow-sm backdrop-blur sm:flex-row">
                <button
                  onClick={onNewConversation}
                  className="flex flex-1 items-center gap-3 rounded-xl bg-slate-950 px-3.5 py-3 text-white transition-all hover:bg-slate-800"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <Plus className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">新建创作</span>
                    <span className="block truncate text-xs text-white/60">从空白上下文开始</span>
                  </span>
                </button>

                {recentConversation && onContinueRecent && (
                  <button
                    onClick={() => onContinueRecent(recentConversation.id)}
                    className="flex flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-slate-700 transition-all hover:border-violet-200 hover:bg-violet-50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                      <Clock3 className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">继续上次</span>
                      <span className="block truncate text-xs text-slate-400">
                        {recentConversation.title || "未命名会话"}
                      </span>
                    </span>
                  </button>
                )}

                <button
                  onClick={onOpenHistory}
                  className="hidden items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-slate-500 transition-all hover:border-violet-200 hover:bg-violet-50 lg:flex"
                >
                  <History className="h-4 w-4" />
                  <span className="text-sm font-bold">历史</span>
                </button>
              </div>

              <QuickActions items={PRESET_QUESTIONS} onQuickAction={onQuickAction} tone="slate" />
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-label="对话消息"
        aria-live="polite"
        className="h-full overflow-y-auto px-4 py-4 sm:px-6"
      >
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
                onConfirm={onConfirm}
                onUpdateConfirmParams={onUpdateConfirmParams}
                onUpdateConfirmImageRole={onUpdateConfirmImageRole}
                onUseAsReference={onUseAsReference}
              />
            ))}
          </AnimatePresence>

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

function QuickActions({
  items,
  onQuickAction,
  tone,
}: {
  items: Array<{ icon: string; text: string }>;
  onQuickAction: (text: string) => void;
  tone: "slate" | "violet";
}) {
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      {items.map((q) => (
        <button
          key={q.text}
          onClick={() => onQuickAction(q.text)}
          className={
            tone === "violet"
              ? "rounded-full border border-violet-200 bg-violet-50 px-3.5 py-2 text-sm font-medium text-violet-700 transition-all hover:bg-violet-100 hover:shadow-sm"
              : "rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-600 transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 hover:shadow-sm"
          }
        >
          <span className="mr-1 text-[11px] font-bold opacity-70">{q.icon}</span>
          {q.text}
        </button>
      ))}
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
