"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import type { AgentMessage as MessageType } from "@/lib/agent/types";
import { AgentMessage } from "./AgentMessage";
import { AgentQuickStart } from "./AgentQuickStart";

type Props = {
  messages: MessageType[];
  isProcessing: boolean;
  onSelectTemplate: (message: string) => void;
  onConfirm: (messageId: string) => void;
  onRetry: (taskId: string) => void;
  onFollowUp: (text: string) => void;
  onOpenImage: (url: string) => void;
};

export function AgentChatPanel({
  messages,
  isProcessing,
  onSelectTemplate,
  onConfirm,
  onRetry,
  onFollowUp,
  onOpenImage,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8"
    >
      {messages.length === 0 ? (
        <div className="flex min-h-full items-center justify-center">
          <AgentQuickStart onSelect={onSelectTemplate} />
        </div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <AgentMessage
                key={msg.id}
                message={msg}
                onConfirm={onConfirm}
                onRetry={onRetry}
                onFollowUp={onFollowUp}
                onOpenImage={onOpenImage}
              />
            ))}
          </AnimatePresence>

          {isProcessing && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:300ms]" />
                </div>
                思考中...
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
