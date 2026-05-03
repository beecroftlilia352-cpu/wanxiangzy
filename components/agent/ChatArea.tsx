"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
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
            上传多张图片后，直接输入指令。<br/>
            你也可以在输入框里输入 <span className="font-bold text-violet-500">@</span> 来精确绑定某张图，<br/>
            让 Agent 更准确地识别目标图和参考图。
          </p>
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
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
