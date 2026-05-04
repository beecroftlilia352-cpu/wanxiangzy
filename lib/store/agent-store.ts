"use client";

import { create } from "zustand";
import { v4 } from "./uuid";
import type { Conversation, Message, ChatImage, GenerationParams, AgentMode } from "@/lib/agent/types";
import { DEFAULT_PARAMS } from "@/lib/agent/types";
import { uploadImage } from "@/lib/utils";

// ---- 类型 ----
type Store = {
  conversations: Conversation[];
  activeId: string | null;
  messages: Message[];
  inputText: string;
  inputImages: ChatImage[];
  params: GenerationParams;
  isSending: boolean;
  isAIWriting: boolean;
  sidebarOpen: boolean;
  pollTimers: Map<string, ReturnType<typeof setInterval>>;

  loadConversations: () => Promise<void>;
  createConversation: () => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => void;
  setInputText: (t: string) => void;
  addImages: (files: File[]) => Promise<void>;
  removeImage: (i: number) => void;
  setParams: (p: Partial<GenerationParams>) => void;
  setSidebarOpen: (v: boolean) => void;
  sendMessage: () => Promise<void>;
  aiWrite: () => Promise<void>;
  retryMessage: (id: string) => void;
  confirmGeneration: (messageId: string) => Promise<void>;
  reset: () => void;
};

// ---- 工具 ----
function revoke(urls: string[]) {
  if (typeof window === "undefined") return;
  for (const u of urls) if (u.startsWith("blob:")) URL.revokeObjectURL(u);
}

// ---- Store ----
export const useAgentStore = create<Store>((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  inputText: "",
  inputImages: [],
  params: { ...DEFAULT_PARAMS },
  isSending: false,
  isAIWriting: false,
  sidebarOpen: false,

  // ======== 对话管理 ========
  loadConversations: async () => {
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) return;
      const data = await res.json();
      set({ conversations: data });
      if (data.length > 0 && !get().activeId) get().switchConversation(data[0].id);
    } catch {}
  },

  createConversation: async () => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "新对话", mode: "agent" }),
      });
      if (!res.ok) return;
      const conv = await res.json();
      set((s) => ({
        conversations: [conv, ...s.conversations],
        activeId: conv.id,
        messages: [],
        inputText: "",
        inputImages: [],
      }));
    } catch {}
  },

  switchConversation: async (id: string) => {
    set({ activeId: id, messages: [], inputText: "", inputImages: [], isSending: false });
    const conv = get().conversations.find((c) => c.id === id);
    if (conv) set({ inputImages: Array.isArray(conv.images) ? conv.images : [] });
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      if (res.ok) set({ messages: await res.json() });
    } catch {}
  },

  deleteConversation: (id: string) => {
    fetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {});
    set((s) => {
      const convs = s.conversations.filter((c) => c.id !== id);
      const newActive = s.activeId === id ? (convs[0]?.id || null) : s.activeId;
      return { conversations: convs, activeId: newActive, messages: newActive === s.activeId ? s.messages : [] };
    });
  },

  // ======== 输入 ========
  setInputText: (t) => set({ inputText: t }),

  addImages: async (files: File[]) => {
    const current = get().inputImages;
    const start = current.length;
    const placeholders: ChatImage[] = files.map((f, i) => ({
      index: start + i + 1, url: URL.createObjectURL(f), fileName: f.name, uploading: true,
    }));
    set((s) => ({ inputImages: [...s.inputImages, ...placeholders] }));

    for (let i = 0; i < files.length; i++) {
      try {
        const result = await uploadImage(files[i]);
        set((s) => ({
          inputImages: s.inputImages.map((img) =>
            img.index === placeholders[i].index ? { ...img, hostedUrl: result.url, uploading: false } : img
          ),
        }));
      } catch {
        set((s) => ({
          inputImages: s.inputImages.filter((img) => img.index !== placeholders[i].index)
            .map((img, idx) => ({ ...img, index: idx + 1 })),
        }));
      }
    }
    // 持久化
    const { activeId, inputImages } = get();
    if (activeId) {
      fetch(`/api/conversations/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: inputImages }),
      }).catch(() => {});
    }
  },

  removeImage: (index: number) => {
    set((s) => {
      const removed = s.inputImages[index];
      if (removed?.url?.startsWith("blob:")) URL.revokeObjectURL(removed.url);
      return { inputImages: s.inputImages.filter((_, i) => i !== index).map((img, i) => ({ ...img, index: i + 1 })) };
    });
  },

  setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),

  // ======== 核心：发送消息 ========
  sendMessage: async () => {
    const { inputText, inputImages, params, activeId, conversations } = get();
    const trimmed = inputText.trim();
    if (!trimmed && inputImages.length === 0) return;

    // 确保有对话
    let convId = activeId;
    if (!convId) {
      await get().createConversation();
      convId = get().activeId;
      if (!convId) return;
    }

    // 快照图片并清空输入
    const currentImages = [...inputImages];
    set({ inputText: "", inputImages: [], isSending: true });

    // 持久化图片
    if (currentImages.length > 0) {
      fetch(`/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: currentImages }),
      }).catch(() => {});
    }

    // 更新对话标题
    const conv = conversations.find((c) => c.id === convId);
    if (conv && conv.title === "新对话") {
      const title = trimmed.slice(0, 25) || "图片生成";
      fetch(`/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }).catch(() => {});
      set((s) => ({
        conversations: s.conversations.map((c) => c.id === convId ? { ...c, title } : c),
      }));
    }

    // 用户消息
    const userMsg: Message = {
      id: uid(), conversation_id: convId, role: "user", content: trimmed,
      images: currentImages, generation: null, params: {}, mode: "agent",
      created_at: new Date().toISOString(),
    };

    // AI 消息占位
    const aiMsg: Message = {
      id: uid(), conversation_id: convId, role: "assistant", content: "",
      images: [], generation: null, params: {}, mode: "agent",
      created_at: new Date().toISOString(),
    };

    set((s) => ({ messages: [...s.messages, userMsg, aiMsg] }));

    // 保存用户消息
    fetch(`/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content: trimmed, images: currentImages, mode: "agent" }),
    }).catch(() => {});

    try {
      const imageUrls = currentImages.map((img) => ({ index: img.index, url: img.hostedUrl || img.url })).filter((img) => img.url);
      const history = get().messages
        .filter((m) => m.id !== userMsg.id && m.id !== aiMsg.id)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content || "" }));

      // 调用统一 Agent API
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          images: imageUrls,
          history,
          params: { model: params.model, aspectRatio: params.aspectRatio, imageSize: params.imageSize, count: params.count },
        }),
      });

      const data = await res.json();
      const reply = typeof data.reply === "string" ? data.reply : "处理完成。";

      // [DEBUG] 打印 API 响应
      console.log("[agent-store] API response:", { action: data.action, module: data.module, credits_cost: data.credits_cost, api_path: data.api_path, replyLength: reply.length });

      if (data.action === "confirm_generate" && data.api_path) {
        // 生图任务：显示确认卡片（需要用户确认后才扣积分执行）
        set((s) => ({
          isSending: false,
          messages: s.messages.map((m) =>
            m.id === aiMsg.id ? {
              ...m,
              content: reply,
              streamingDone: true,
              generation: {
                status: "pending" as const,
                progress: 0,
                resultUrls: [],
                module: data.module_label || data.module,
                creditsUsed: data.credits_cost,
                // 存储待确认的参数
                _confirmData: {
                  apiPath: data.api_path,
                  module: data.module,
                  params: data.generation_params,
                  jobPayload: data.job_payload,
                  creditsCost: data.credits_cost,
                },
              },
            } : m
          ),
        }));

        // 保存 AI 消息
        fetch(`/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "assistant", content: reply, mode: "agent" }),
        }).catch(() => {});
      } else {
        // 对话回复
        set((s) => ({
          isSending: false,
          messages: s.messages.map((m) =>
            m.id === aiMsg.id ? { ...m, content: reply, streamingDone: true } : m
          ),
        }));

        fetch(`/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "assistant", content: reply, mode: "agent" }),
        }).catch(() => {});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "处理失败";
      set((s) => ({
        isSending: false,
        messages: s.messages.map((m) =>
          m.id === aiMsg.id ? { ...m, content: msg, streamingDone: true, generation: null } : m
        ),
      }));
    }
  },

  // ======== AI 帮写 ========
  aiWrite: async () => {
    const { inputImages } = get();
    if (inputImages.length === 0) return;
    const urls = inputImages.map((img) => img.hostedUrl || img.url).filter(Boolean);
    if (urls.length === 0) return;

    set({ isAIWriting: true });
    try {
      const res = await fetch("/api/agent/ai-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: urls, currentPrompt: get().inputText }),
      });
      const data = await res.json();
      if (data.optimizedPrompt) set({ inputText: data.optimizedPrompt });
    } catch {}
    set({ isAIWriting: false });
  },

  // ======== 重试 ========
  retryMessage: (id: string) => {
    const { messages } = get();
    const idx = messages.findIndex((m) => m.id === id);
    if (idx < 1) return;
    const userMsg = messages[idx - 1];
    if (userMsg.role !== "user") return;
    set({ inputText: userMsg.content, inputImages: userMsg.images || [] });
    get().sendMessage();
  },

  // ======== 确认生图（用户确认后才扣积分执行） ========
  confirmGeneration: async (messageId: string) => {
    const { messages, activeId } = get();
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.generation?._confirmData) return;

    const confirmData = msg.generation._confirmData as {
      apiPath: string;
      module: string;
      params: Record<string, unknown>;
      jobPayload: Record<string, unknown>;
      creditsCost: number;
    };

    // [DEBUG] 打印确认生成参数
    console.log("[agent-store] confirmGeneration:", {
      apiPath: confirmData.apiPath,
      module: confirmData.module,
      creditsCost: confirmData.creditsCost,
      params: confirmData.params,
    });

    // 更新为 generating 状态
    set((s) => ({
      isSending: true,
      messages: s.messages.map((m) =>
        m.id === messageId && m.generation
          ? { ...m, generation: { ...m.generation, status: "generating" as const, progress: 5 } }
          : m
      ),
    }));

    try {
      // 调用模块 API 执行生成
      const res = await fetch(confirmData.apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmData.params),
      });
      const data = await res.json();

      if (!res.ok || !data.generation_id) {
        throw new Error(data.error || "生成失败");
      }

      // 更新为轮询状态
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === messageId && m.generation
            ? {
                ...m,
                generation: {
                  ...m.generation,
                  status: "generating" as const,
                  progress: 10,
                  generationId: data.generation_id,
                  creditsUsed: data.credits_cost || confirmData.creditsCost,
                  _confirmData: undefined,
                },
              }
            : m
        ),
      }));

      // 开始轮询
      pollGeneration(get, set, messageId, activeId!, data.generation_id, confirmData.module);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "生成失败";
      set((s) => ({
        isSending: false,
        messages: s.messages.map((m) =>
          m.id === messageId && m.generation
            ? { ...m, generation: { ...m.generation, status: "failed" as const, error: errMsg, _confirmData: undefined } }
            : m
        ),
      }));
    }
  },

  // ======== 重置 ========
  reset: () => {
    get().pollTimers?.forEach((t) => clearInterval(t));
    revoke(get().inputImages.map((img) => img.url));
    set({
      messages: [], inputText: "", inputImages: [], isSending: false,
      activeId: null, conversations: [],
    });
    get().loadConversations();
  },

  pollTimers: new Map(),
}));

// ======== 轮询 ========
function pollGeneration(
  get: () => Store,
  set: (fn: (s: Store) => Partial<Store>) => void,
  aiMsgId: string,
  convId: string,
  generationId: string,
  module: string
) {
  const apiPath = module === "model_background" ? "model-background" : module;
  const url = `/api/${apiPath}?generation_id=${generationId}`;
  const PROGRESS: Record<string, number> = { uploading: 10, queued: 20, processing_tryon: 50, processing_face_swap: 70 };

  const timer = setInterval(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const status = data.status as string;
      const resultUrls: string[] = Array.isArray(data.result_urls) ? data.result_urls : [];
      const progress = resultUrls.length > 0 ? 100 : (PROGRESS[status] ?? 30);
      const done = status === "completed" || resultUrls.length > 0;
      const failed = status === "failed";

      if (done || failed) {
        clearInterval(timer);
        set((s) => ({
          isSending: false,
          messages: s.messages.map((m) =>
            m.id === aiMsgId && m.generation ? {
              ...m,
              generation: {
                ...m.generation,
                status: done ? "completed" : "failed",
                progress: 100,
                resultUrls,
                error: failed ? (data.error || "生成失败") : undefined,
              },
            } : m
          ),
        }));
        return;
      }

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === aiMsgId && m.generation ? { ...m, generation: { ...m.generation, progress, status: "generating" } } : m
        ),
      }));
    } catch {}
  }, 2000);

  set((s) => {
    const timers = new Map(s.pollTimers);
    timers.set(aiMsgId, timer);
    return { pollTimers: timers };
  });
}

function uid() {
  return v4();
}
