"use client";

import { motion } from "framer-motion";
import { Bot, User, AlertCircle } from "lucide-react";
import type { AgentMessage as MessageType } from "@/lib/agent/types";
import { AgentConfirmCard } from "./AgentConfirmCard";
import { AgentTaskCard } from "./AgentTaskCard";
import { AgentResultGrid } from "./AgentResultGrid";
import { AgentFollowUp } from "./AgentFollowUp";

type Props = {
  message: MessageType;
  onConfirm: (messageId: string) => void;
  onRetry: (taskId: string) => void;
  onFollowUp: (text: string) => void;
  onOpenImage: (url: string) => void;
};

export function AgentMessage({ message, onConfirm, onRetry, onFollowUp, onOpenImage }: Props) {
  const { role, content, images, task } = message;

  if (role === "system") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center"
      >
        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5 text-xs text-slate-500">
          <AlertCircle className="h-3 w-3" />
          {content}
        </div>
      </motion.div>
    );
  }

  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`flex max-w-[85%] gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {/* Avatar */}
        <div
          className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isUser
              ? "bg-violet-600 text-white"
              : "bg-gradient-to-br from-violet-500 to-pink-500 text-white"
          }`}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>

        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            isUser
              ? "rounded-br-md bg-violet-600 text-white shadow-sm"
              : "rounded-bl-md border border-slate-200/80 bg-white text-slate-800 shadow-sm"
          }`}
        >
          {/* Text content with basic markdown bold */}
          <div className="whitespace-pre-wrap leading-relaxed">
            {content.split(/(\*\*.*?\*\*)/).map((part, i) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={i} className={isUser ? "font-black" : "font-bold text-slate-900"}>
                  {part.slice(2, -2)}
                </strong>
              ) : (
                <span key={i}>{part}</span>
              )
            )}
          </div>

          {/* Attached images (user) */}
          {images && images.length > 0 && (
            <div className={`mt-2 grid gap-1.5 ${images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {images.map((img, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-xl border border-white/20"
                  style={{ maxHeight: "160px" }}
                >
                  <img
                    src={img.url || img.preview}
                    alt={img.fileName}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Confirm card (before execution) */}
          {task && task.status === "pending" && (
            <AgentConfirmCard task={task} onConfirm={() => onConfirm(message.id)} />
          )}

          {/* Task card (during execution) */}
          {task &&
            (task.status === "calling_api" || task.status === "polling" || task.status === "uploading") && (
              <AgentTaskCard task={task} />
            )}

          {/* Result images */}
          {task && task.status === "completed" && task.resultUrls.length > 0 && (
            <>
              <AgentResultGrid urls={task.resultUrls} onOpen={onOpenImage} />
              <AgentFollowUp module={task.module} onAction={onFollowUp} />
            </>
          )}

          {/* Error state */}
          {task && task.status === "failed" && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
              <p className="font-bold">生成失败</p>
              <p className="mt-1">{task.error}</p>
              <button
                onClick={() => onRetry(task.id)}
                className="mt-2 rounded-lg bg-red-100 px-3 py-1.5 font-bold text-red-700 hover:bg-red-200"
              >
                重试
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
