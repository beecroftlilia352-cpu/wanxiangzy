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
  { icon: "👕", text: "帮我把衣服穿到模特身上", desc: "上传服装图，生成换装效果图" },
  { icon: "📱", text: "帮我出一套小红书种草图", desc: "生成街拍、咖啡店等生活感穿搭图" },
  { icon: "📦", text: "帮我做 3D 立体商品展示", desc: "平铺图转无真人的 3D 服装展示" },
  { icon: "🖼️", text: "帮我换个背景", desc: "白底图换街拍、换场景、换模特" },
  { icon: "🧍", text: "帮我做四宫格姿势裂变", desc: "一张图生成四种不同姿势" },
  { icon: "👤", text: "帮我建一个专属模特", desc: "融合参考人脸，创建稳定 AI 模特" },
];

export function ChatArea({ messages, sessionImages, isSending, onOpenImage, onRetry, onQuickAction }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-xl text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-100 to-pink-100">
            <Sparkles className="h-10 w-10 text-violet-400" />
          </div>
          <h2 className="text-xl font-black text-slate-800">VastWear 图像智能体</h2>
          <p className="mt-2 text-sm text-slate-400">
            上传服装图片，输入指令，AI 帮你生成电商视觉内容
          </p>

          {/* 预设问题 */}
          <div className="mt-8 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-300">试试问我</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESET_QUESTIONS.map((q) => (
                <button
                  key={q.text}
                  onClick={() => onQuickAction(q.text)}
                  className="group flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-left transition-all hover:border-violet-300 hover:shadow-md"
                >
                  <span className="mt-0.5 text-lg">{q.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-700 group-hover:text-violet-700">{q.text}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{q.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 提示 */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              📎 上传图片
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5">
              <span className="font-bold text-violet-500">@</span>
              绑定图片精确引用
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5">
              💬 Chat 对话 / 🤖 Agent 生图
            </span>
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
