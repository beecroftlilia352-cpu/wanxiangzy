"use client";

import { useState } from "react";
import { Plus, MessageSquare, Trash2, X, Search } from "lucide-react";
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
  const [search, setSearch] = useState("");

  const sorted = [...conversations].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const filtered = search
    ? sorted.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-slate-200/80 bg-white/95 backdrop-blur-xl transition-transform duration-200 lg:static lg:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        {/* Header */}
        <div className="shrink-0 border-b border-slate-100 px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">对话历史</span>
            <div className="flex items-center gap-1">
              <button onClick={onCreate}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-violet-50 hover:text-violet-500"
                title="新建对话"><Plus className="h-4 w-4" /></button>
              <button onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 lg:hidden">
                <X className="h-4 w-4" /></button>
            </div>
          </div>
          {/* 搜索框 */}
          {conversations.length > 3 && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-slate-300" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索对话..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-300"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              {search ? "没有匹配的对话" : "暂无对话"}
            </div>
          ) : (
            filtered.map((conv) => {
              const isActive = conv.id === activeId;
              return (
                <div key={conv.id}
                  className={`group mx-1 flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors ${
                    isActive ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50"
                  }`} onClick={() => { onSwitch(conv.id); onClose(); }}>
                  <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? "text-violet-500" : "text-slate-300"}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[13px] font-medium ${isActive ? "text-violet-800" : ""}`}>
                      {conv.title || "新对话"}
                    </p>
                    <p className="text-[10px] text-slate-400">{formatTime(conv.updated_at)}</p>
                  </div>
                  {conv.mode && (
                    <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold ${
                      conv.mode === "agent" ? "bg-violet-100 text-violet-500" : "bg-slate-100 text-slate-400"
                    }`}>
                      {conv.mode === "agent" ? "Agent" : "Chat"}
                    </span>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover:opacity-100">
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

function formatTime(ts: string): string {
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
