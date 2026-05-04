"use client";

import { create } from "zustand";
import { v4 } from "./uuid";
import type { Conversation, Message, ChatImage, GenerationParams, AgentMode } from "@/lib/agent/types";
import { DEFAULT_PARAMS } from "@/lib/agent/types";
import { uploadImage, compressImageForAgent } from "@/lib/utils";

// ---- DB 持久化（Supabase） ----

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
  addReferenceUrl: (url: string) => void;
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

/**
 * 清理 generation 对象，移除仅内存使用的字段后持久化到 DB
 */
function sanitizeGenerationForDB(gen: unknown): Record<string, unknown> | null {
  if (!gen || typeof gen !== "object") return null;
  const g = gen as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  // 只保留需要持久化的字段
  if (g.status) clean.status = g.status;
  if (typeof g.progress === "number") clean.progress = g.progress;
  if (Array.isArray(g.resultUrls)) clean.resultUrls = g.resultUrls;
  if (g.error) clean.error = g.error;
  if (g.generationId) clean.generationId = g.generationId;
  if (g.creditsUsed) clean.creditsUsed = g.creditsUsed;
  if (g.module) clean.module = g.module;
  // _confirmData 永不持久化（仅内存中的待确认状态）
  return Object.keys(clean).length > 0 ? clean : null;
}

/** 保存消息到 DB */
function saveMessage(convId: string, msg: { role: string; content: string; images?: ChatImage[]; generation?: unknown; mode?: string }) {
  console.log("[agent-store] saveMessage:", { convId, role: msg.role, contentLen: msg.content.length, hasGeneration: !!msg.generation });
  fetch(`/api/conversations/${convId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: msg.role,
      content: msg.content,
      images: msg.images || [],
      generation: sanitizeGenerationForDB(msg.generation),
      mode: msg.mode || "agent",
    }),
  }).catch(() => {});
}

/** 更新消息的 generation 状态 */
function updateMessageGeneration(convId: string, messageId: string, generation: unknown) {
  const clean = sanitizeGenerationForDB(generation);
  console.log("[agent-store] updateMessageGeneration:", { messageId, status: (clean as Record<string, unknown>)?.status });
  fetch(`/api/conversations/${convId}/messages`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, generation: clean }),
  }).catch(() => {});
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
    if (conv && Array.isArray(conv.images)) {
      set({ inputImages: conv.images });
    }
    // 从 DB 加载消息
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      if (res.ok) {
        const dbMessages = await res.json();
        if (Array.isArray(dbMessages)) {
          set({ messages: dbMessages });
        }
      }
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
        const compressed = await compressImageForAgent(files[i]);
        const result = await uploadImage(compressed);
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

  /** 将远程 URL 直接加入图片托盘（用于"用作参考图"） */
  addReferenceUrl: (url: string) => {
    if (!url) return;
    set((s) => ({
      inputImages: [
        ...s.inputImages,
        {
          index: s.inputImages.length + 1,
          url,
          hostedUrl: url,
          fileName: "参考图",
          uploading: false,
        },
      ],
    }));
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

    // 快照图片（保留在托盘中），只清空文字
    const currentImages = [...inputImages];
    set({ inputText: "", isSending: true });

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
    saveMessage(convId, { role: "user", content: trimmed, images: currentImages, mode: "agent" });

    try {
      // 当前上传的图片
      let imageUrls = currentImages.map((img) => ({ index: img.index, url: img.hostedUrl || img.url })).filter((img) => img.url);

      // 如果当前没有图片，从历史消息中提取最近的图片
      if (imageUrls.length === 0) {
        const recentUserMsgs = get().messages
          .filter((m) => m.role === "user" && m.images && m.images.length > 0)
          .slice(-3);
        for (const msg of recentUserMsgs) {
          for (const img of msg.images || []) {
            const url = img.hostedUrl || img.url;
            if (url && !imageUrls.some((existing) => existing.url === url)) {
              imageUrls.push({ index: imageUrls.length + 1, url });
            }
          }
        }
      }

      const history = get().messages
        .filter((m) => m.id !== userMsg.id && m.id !== aiMsg.id)
        .slice(-10)
        .map((m) => ({
          role: m.role,
          content: m.content || (m.generation?.resultUrls?.length ? `[生成了 ${m.generation.resultUrls.length} 张图片]` : ""),
        }));

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

      console.log("[agent-store] sendMessage response:", {
        action: data.action,
        module: data.module,
        module_label: data.module_label,
        api_path: data.api_path,
        credits_cost: data.credits_cost,
        replyLen: reply.length,
        hasImages: imageUrls.length > 0,
      });

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

        // 保存 AI 消息（含 generation 数据）
        const confirmGen = get().messages.find((m) => m.id === aiMsg.id)?.generation;
        saveMessage(convId, { role: "assistant", content: reply, generation: confirmGen || null, mode: "agent" });
      } else {
        // 对话回复
        set((s) => ({
          isSending: false,
          messages: s.messages.map((m) =>
            m.id === aiMsg.id ? { ...m, content: reply, streamingDone: true } : m
          ),
        }));
        saveMessage(convId, { role: "assistant", content: reply, mode: "agent" });
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
    if (!msg?.generation?._confirmData) {
      console.warn("[agent-store] confirmGeneration: no _confirmData found for", messageId);
      return;
    }

    const confirmData = msg.generation._confirmData as {
      apiPath: string;
      module: string;
      params: Record<string, unknown>;
      jobPayload: Record<string, unknown>;
      creditsCost: number;
    };

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

      // 持久化更新后的 generation 到 DB
      const updatedGen = get().messages.find((m) => m.id === messageId)?.generation;
      if (updatedGen) {
        updateMessageGeneration(activeId || "", messageId, updatedGen);
      }

      // 开始轮询
      console.log("[agent-store] confirmGeneration success, starting poll:", {
        generationId: data.generation_id,
        module: confirmData.module,
        creditsCost: data.credits_cost,
      });
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
        console.log("[agent-store] pollGeneration completed:", { aiMsgId, done, failed, resultCount: resultUrls.length });

        const finalGeneration = {
          status: done ? ("completed" as const) : ("failed" as const),
          progress: 100,
          resultUrls,
          error: failed ? (data.error || "生成失败") : undefined,
        };

        set((s) => ({
          isSending: false,
          messages: s.messages.map((m) =>
            m.id === aiMsgId && m.generation ? {
              ...m,
              generation: { ...m.generation, ...finalGeneration },
            } : m
          ),
        }));

        // 持久化 generation 状态到 DB
        updateMessageGeneration(get().activeId || "", aiMsgId, {
          ...get().messages.find((m) => m.id === aiMsgId)?.generation,
          ...finalGeneration,
        });

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
