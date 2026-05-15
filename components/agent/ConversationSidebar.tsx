"use client";

import { useMemo, useState } from "react";
import { MessageSquare, Plus, Search, Trash2, X } from "lucide-react";
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

type ConversationGroup = {
  label: string;
  items: Conversation[];
};

export function ConversationSidebar({
  conversations,
  activeId,
  onCreate,
  onSwitch,
  onDelete,
  isOpen,
  onClose,
}: Props) {
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = [...conversations].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
    const filtered = query
      ? sorted.filter((c) => (c.title || "新对话").toLowerCase().includes(query))
      : sorted;
    return groupConversations(filtered);
  }, [conversations, search]);

  const hasConversations = conversations.length > 0;
  const isSearching = search.trim().length > 0;

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={onClose} />}
      <aside
        role="navigation"
        aria-label="对话历史"
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-slate-200/80 bg-white/92 shadow-2xl shadow-slate-900/5 backdrop-blur-xl transition-transform duration-200 lg:static lg:translate-x-0 lg:shadow-none ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="shrink-0 border-b border-slate-100 px-3 py-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
          <p className="text-sm font-bold text-slate-800">工作流助手</p>
              <p className="text-[11px] text-slate-400">历史保留，新任务不继承旧附件</p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 lg:hidden"
              aria-label="关闭历史"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={onCreate}
            className="mb-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-bold text-white shadow-sm transition-all hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            新建对话
          </button>

          {hasConversations && (
            <div className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 transition-all focus-within:border-[rgba(91,124,255,0.22)] focus-within:bg-white">
              <Search className="h-3.5 w-3.5 text-slate-300" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索历史"
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-300"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="flex h-5 w-5 items-center justify-center rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                  aria-label="清空搜索"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="custom-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {groups.length === 0 ? (
            <EmptyState searching={isSearching} />
          ) : (
            groups.map((group) => (
              <section key={group.label} className="mb-3">
                <div className="sticky top-0 z-10 bg-white/90 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 backdrop-blur">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((conv) => (
                    <ConversationRow
                      key={conv.id}
                      conversation={conv}
                      active={conv.id === activeId}
                      onSwitch={() => {
                        onSwitch(conv.id);
                        onClose();
                      }}
                      onDelete={() => onDelete(conv.id)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

function ConversationRow({
  conversation,
  active,
  onSwitch,
  onDelete,
}: {
  conversation: Conversation;
  active: boolean;
  onSwitch: () => void;
  onDelete: () => void;
}) {
  const title = conversation.title || "新对话";

  return (
    <div
      className={`group relative flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 transition-all ${
        active ? "bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "text-slate-650 hover:bg-slate-50"
      }`}
      onClick={onSwitch}
      title={title}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          active ? "bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "bg-slate-100 text-slate-400 group-hover:text-slate-500"
        }`}
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-[13px] leading-5 ${active ? "font-bold" : "font-medium"}`}>{title}</p>
        <p className="truncate text-[10px] text-slate-400">
          {formatTime(conversation.updated_at)}
          {conversation.mode === "agent" ? " · Agent" : " · Chat"}
        </p>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm(`删除「${title}」？`)) onDelete();
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 focus:opacity-100"
        aria-label={`删除 ${title}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-5 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <MessageSquare className="h-4 w-4" />
      </div>
      <p className="text-sm font-bold text-slate-600">{searching ? "没有找到相关会话" : "还没有历史会话"}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        {searching ? "换个关键词试试。" : "新建对话后，生成和分析记录会显示在这里。"}
      </p>
    </div>
  );
}

function groupConversations(conversations: Conversation[]): ConversationGroup[] {
  const buckets = new Map<string, Conversation[]>();
  for (const conversation of conversations) {
    const label = getGroupLabel(conversation.updated_at);
    const current = buckets.get(label) || [];
    current.push(conversation);
    buckets.set(label, current);
  }

  return Array.from(buckets.entries()).map(([label, items]) => ({ label, items }));
}

function getGroupLabel(ts: string): string {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (sameDay(date, today)) return "今天";
  if (sameDay(date, yesterday)) return "昨天";

  const diffDays = Math.floor((startOfDay(today).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (diffDays < 7) return "最近 7 天";
  if (date.getFullYear() === today.getFullYear()) {
    return date.toLocaleDateString("zh-CN", { month: "long" });
  }
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long" });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatTime(ts: string): string {
  const date = new Date(ts);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
