"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowDown, Bot, Boxes, Camera, LayoutTemplate, Shirt, Sparkles, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
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
  onConfirmWorkflow?: (messageId: string) => void;
  onCancelWorkflow?: (messageId: string) => void;
  onRetryWorkflowStep?: (messageId: string, stepId: string) => void;
  onSkipWorkflowStep?: (messageId: string, stepId: string) => void;
  onSelectWorkflowStepImage?: (messageId: string, stepId: string, selectedImageUrl: string) => void;
  onEditWorkflowStep?: (messageId: string, stepId: string, patch: { title?: string; params?: Record<string, unknown>; input?: Record<string, unknown> }) => void;
  onRepair?: (messageId: string, repairValue: string) => void;
  onUpdateConfirmParams?: (messageId: string, params: Partial<GenerationParams>) => void;
  onUpdateConfirmImageRole?: (messageId: string, imageIndex: number, role: ChatImageRole) => void;
  onUseAsReference?: (url: string) => void;
  onFeedback?: (messageId: string, rating: "good" | "bad", reason?: string, tags?: string[]) => void;
  onContinueRecent?: (id: string) => void;
  onNewConversation?: () => void;
  onOpenHistory?: () => void;
  onQuickAction: (text: string) => void;
};

const PRESET_QUESTIONS = [
  { icon: <Camera className="h-4 w-4" />, title: "时尚街拍", text: "帮我生成一张时尚街拍" },
  { icon: <LayoutTemplate className="h-4 w-4" />, title: "电商详情页", text: "生成一套适合电商平台的详情页" },
  { icon: <Boxes className="h-4 w-4" />, title: "3D 展示", text: "生成一张3D立体商品展示图" },
  { icon: <Wand2 className="h-4 w-4" />, title: "拍摄方案", text: "给我一套商业拍摄创意" },
];

const IMAGE_SUGGESTIONS = [
  { icon: <Shirt className="h-4 w-4" />, title: "换装", text: "图2人物穿图1衣服" },
  { icon: <Sparkles className="h-4 w-4" />, title: "姿势裂变", text: "生成4个不同姿势，每张单独出图" },
  { icon: <LayoutTemplate className="h-4 w-4" />, title: "电商详情页", text: "根据这些图生成适合电商平台的详情页" },
  { icon: <Boxes className="h-4 w-4" />, title: "3D 展示", text: "做一张3D立体商品展示图" },
];

export function ChatArea({
  messages,
  sessionImages,
  isSending,
  onOpenImage,
  onRetry,
  onConfirm,
  onConfirmWorkflow,
  onCancelWorkflow,
  onRetryWorkflowStep,
  onSkipWorkflowStep,
  onSelectWorkflowStepImage,
  onEditWorkflowStep,
  onRepair,
  onUpdateConfirmParams,
  onUpdateConfirmImageRole,
  onUseAsReference,
  onFeedback,
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
  const lastMsgHasAgentTimeline = hasVisibleAgentTimeline(lastMsg);
  const showThinking =
    isSending &&
    lastMsg &&
    lastMsg.role === "assistant" &&
    !lastMsg.content &&
    !lastMsg.generation &&
    !lastMsgHasAgentTimeline;

  if (messages.length === 0) {
    const hasImages = sessionImages.length > 0;
    const suggestions = hasImages ? IMAGE_SUGGESTIONS : PRESET_QUESTIONS;

    return (
      <div className="flex flex-1 items-start justify-center px-4 pb-10 pt-[11vh] sm:px-8 sm:pt-[13vh]">
        <div className="w-full max-w-3xl">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <h2 className="text-[28px] font-semibold leading-tight tracking-normal text-slate-900 sm:text-4xl">
              {hasImages ? "想对这些图片做什么？" : "今天想创作什么？"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {hasImages
                ? `${sessionImages.length} 张附件图已就绪，直接描述目标即可。`
                : "像聊天一样输入需求，我会判断是对话、分析还是生成。"}
            </p>
          </div>

          <QuickActions
            items={suggestions}
            onQuickAction={onQuickAction}
            hasImages={hasImages}
          />

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
                onConfirmWorkflow={onConfirmWorkflow}
                onCancelWorkflow={onCancelWorkflow}
                onRetryWorkflowStep={onRetryWorkflowStep}
                onSkipWorkflowStep={onSkipWorkflowStep}
                onSelectWorkflowStepImage={onSelectWorkflowStepImage}
                onEditWorkflowStep={onEditWorkflowStep}
                onRepair={onRepair}
                onUpdateConfirmParams={onUpdateConfirmParams}
                onUpdateConfirmImageRole={onUpdateConfirmImageRole}
                onUseAsReference={onUseAsReference}
                onFeedback={onFeedback}
                onQuickAction={onQuickAction}
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

function hasVisibleAgentTimeline(message: Message | undefined) {
  if (!message || message.role !== "assistant") return false;
  if (!message.params || typeof message.params !== "object") return false;
  return message.params.showAgentTimeline === true && Array.isArray(message.params.agentTimeline);
}

function QuickActions({
  items,
  onQuickAction,
  hasImages,
}: {
  items: Array<{ icon: ReactNode; title: string; text: string }>;
  onQuickAction: (text: string) => void;
  hasImages?: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-3 text-center text-xs text-slate-400">
        {hasImages ? "也可以直接输入自己的目标，Agent 会自动判断图片关系。" : "这些只是起点，也可以像聊天一样自由描述。"}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {items.map((q) => (
          <button
            key={q.text}
            onClick={() => onQuickAction(q.text)}
            className="group inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3.5 py-2 text-left text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/70 hover:shadow-md"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors group-hover:bg-white group-hover:text-violet-600">
              {q.icon}
            </span>
            <span className="min-w-0 truncate font-semibold text-slate-700">{q.title}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {items.slice(0, 3).map((q) => (
          <button
            key={`${q.text}-example`}
            onClick={() => onQuickAction(q.text)}
            className="max-w-full truncate rounded-full bg-slate-100/70 px-3 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-600"
            title={q.text}
          >
            {q.text}
          </button>
        ))}
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
          style={{ animation: "thinking-dot 1.4s ease-in-out infinite", animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}
