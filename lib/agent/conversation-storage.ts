import type { Conversation } from "./types";

const STORAGE_KEY = "vastwear-agent-conversations";

export function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  if (typeof window === "undefined") return;
  try {
    // 只保留最近 50 个对话，每个对话最多 100 条消息
    const trimmed = conversations.slice(-50).map((c) => ({
      ...c,
      messages: c.messages.slice(-100),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage 可能满了，静默失败
  }
}

export function deleteConversationFromStorage(id: string): void {
  const conversations = loadConversations();
  saveConversations(conversations.filter((c) => c.id !== id));
}
