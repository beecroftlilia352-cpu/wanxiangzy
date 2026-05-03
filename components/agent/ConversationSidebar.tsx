"use client";

import { Plus, MessageSquare, Trash2, X } from "lucide-react";
import type { Conversation } from "@/lib/agent/types";

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  onCreate: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
};

export function ConversationSidebar({ conversations, activeId, onCreate, onSwitch, onDelete, isOpen, onClose }: Props) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-slate-200/80 bg-white/95 backdrop-blur-xl transition-transform duration-200 lg:static lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3">
          <span className="text-sm font-bold text-slate-700">对话历史</span>
          <div className="flex items-center gap-1">
            <button
              onClick={onCreate}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-violet-50 hover:text-violet-500"
              title="新建对话"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-1">
          {sorted.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              暂无对话，点击 + 新建
            </div>
          ) : (
            sorted.map((conv) => {
              const isActive = conv.id === activeId;
              return (
                <div
                  key={conv.id}
                  className={`group flex cursor-pointer items-center gap-2.5 px-3 py-2.5 mx-1 rounded-xl transition-colors ${
                    isActive
                      ? "bg-violet-50 text-violet-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                  onClick={() => { onSwitch(conv.id); onClose(); }}
                >
                  <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? "text-violet-500" : "text-slate-300"}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${isActive ? "text-violet-800" : ""}`}>
                      {conv.title || "新对话"}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatTime(conv.updatedAt)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
