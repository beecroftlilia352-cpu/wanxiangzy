"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { ChatMessage as MessageType } from "@/lib/agent/types";
import { ChatMessage } from "./ChatMessage";

type Props = {
  messages: MessageType[];
  isGenerating: boolean;
  onOpenImage: (url: string) => void;
  onRetry: (messageId: string) => void;
  onQuickAction: (text: string) => void;
};

export function ChatMessageList({ messages, isGenerating, onOpenImage, onRetry, onQuickAction }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-100 to-pink-100 shadow-inner">
            <Sparkles className="h-10 w-10 text-violet-400" />
          </div>
          <h2 className="text-xl font-black text-slate-800">AI 服装生图</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            上传参考图，输入自然语言指令，AI 帮你生成电商图
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                onClick={() => onQuickAction(action)}
                className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 transition-all hover:border-violet-300 hover:text-violet-600 hover:shadow-sm"
              >
                {action}
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
            <ChatMessage
              key={msg.id}
              message={msg}
              onOpenImage={onOpenImage}
              onRetry={onRetry}
            />
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

const QUICK_ACTIONS = [
  "帮我把衣服穿到模特身上",
  "出一套小红书种草图",
  "做个 3D 立体展示",
  "帮我换一个街拍背景",
];
