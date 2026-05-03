"use client";

import { create } from "zustand";
import { v4 } from "./uuid";
import type { Conversation, Message, ChatImage, GenerationResult, GenerationParams, AgentMode } from "@/lib/agent/types";
import { DEFAULT_PARAMS } from "@/lib/agent/types";
import { uploadImage } from "@/lib/utils";

const MODULE_API: Record<string, string> = {
  tryon: "/api/tryon", grass: "/api/grass", model: "/api/model",
  pose: "/api/pose", model_background: "/api/model-background", garment_3d: "/api/garment-3d",
};

type Store = {
  conversations: Conversation[];
  activeId: string | null;
  messages: Message[];
  inputText: string;
  inputImages: ChatImage[];
  mode: AgentMode;
  params: GenerationParams;
  isSending: boolean;
  isAIWriting: boolean;
  isLoadingConv: boolean;
  sidebarOpen: boolean;

  loadConversations: () => Promise<void>;
  createConversation: () => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversationImages: () => Promise<void>;
  setInputText: (text: string) => void;
  addImages: (files: File[]) => Promise<void>;
  removeImage: (index: number) => void;
  triggerAnalysis: () => Promise<void>;
  setMode: (mode: AgentMode) => void;
  setParams: (p: Partial<GenerationParams>) => void;
  setSidebarOpen: (open: boolean) => void;
  sendMessage: () => Promise<void>;
  aiWrite: () => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
};

function activeConv(conversations: Conversation[], id: string | null): Conversation | null {
  return conversations.find((c) => c.id === id) || null;
}

function startPolling(get: () => Store, set: (fn: (s: Store) => Partial<Store>) => void, msgId: string, genId: string, module: string) {
  const url = `${MODULE_API[module] || `/api/${module}`}?generation_id=${genId}`;
  const timer = setInterval(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const status = data.status as string;
      const resultUrls: string[] = Array.isArray(data.result_urls) ? data.result_urls : [];
      const PROGRESS: Record<string, number> = { uploading: 10, queued: 20, processing_tryon: 50, processing_face_swap: 70 };
      const progress = resultUrls.length > 0 ? 100 : (PROGRESS[status] ?? 30);
      const done = status === "completed" || resultUrls.length > 0;
      const failed = status === "failed";

      if (done || failed) {
        clearInterval(timer);
        // 更新 DB
        const gen: GenerationResult = {
          status: done ? "completed" : "failed", progress: 100, resultUrls,
          error: failed ? (data.error || "生成失败") : undefined,
        };
        fetch(`/api/conversations/${get().activeId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "assistant", content: done ? "" : "生成失败", generation: gen, mode: "agent" }),
        }).catch(() => {});

        set((s) => ({
          isSending: false,
          messages: s.messages.map((m) =>
            m.id === msgId && m.generation
              ? { ...m, generation: { ...m.generation, status: done ? "completed" : "failed", progress: 100, resultUrls, error: failed ? (data.error || "生成失败") : undefined } }
              : m
          ),
        }));
        return;
      }

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === msgId && m.generation ? { ...m, generation: { ...m.generation, progress, status: "generating" } } : m
        ),
      }));
    } catch {}
  }, 2000);
}

export const useAgentStore = create<Store>((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  inputText: "",
  inputImages: [],
  mode: "agent",
  params: { ...DEFAULT_PARAMS },
  isSending: false,
  isAIWriting: false,
  isLoadingConv: false,
  sidebarOpen: false,

  loadConversations: async () => {
    set({ isLoadingConv: true });
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) return;
      const data = await res.json();
      set({ conversations: data, isLoadingConv: false });
      // 如果有对话但没有活跃的，选第一个
      if (data.length > 0 && !get().activeId) {
        get().switchConversation(data[0].id);
      }
    } catch {
      set({ isLoadingConv: false });
    }
  },

  createConversation: async () => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "新对话", mode: get().mode }),
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
    // 加载对话的图片和消息
    const conv = get().conversations.find((c) => c.id === id);
    if (conv) {
      set({ inputImages: Array.isArray(conv.images) ? conv.images : [], mode: conv.mode || "agent" });
    }
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      if (res.ok) set({ messages: await res.json() });
    } catch {}
  },

  deleteConversation: async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      set((s) => {
        const convs = s.conversations.filter((c) => c.id !== id);
        const newActive = s.activeId === id ? (convs.length > 0 ? convs[0].id : null) : s.activeId;
        return { conversations: convs, activeId: newActive, messages: newActive ? s.messages : [] };
      });
      if (get().activeId) get().switchConversation(get().activeId!);
    } catch {}
  },

  updateConversationImages: async () => {
    const { activeId, inputImages } = get();
    if (!activeId) return;
    try {
      await fetch(`/api/conversations/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: inputImages }),
      });
    } catch {}
  },

  setInputText: (text: string) => set({ inputText: text }),

  addImages: async (files: File[]) => {
    const current = get().inputImages;
    const startIdx = current.length;
    const placeholders: ChatImage[] = files.map((f, i) => ({
      index: startIdx + i + 1, url: URL.createObjectURL(f), fileName: f.name, uploading: true,
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
    // 持久化图片到对话
    get().updateConversationImages();

    // 上传完成后自动分析图片
    const readyImages = get().inputImages.filter((img) => !img.uploading);
    if (readyImages.length > 0) {
      get().triggerAnalysis();
    }
  },

  removeImage: (index: number) => {
    set((s) => {
      const removed = s.inputImages[index];
      if (removed?.url?.startsWith("blob:")) URL.revokeObjectURL(removed.url);
      const remaining = s.inputImages.filter((_, i) => i !== index).map((img, i) => ({ ...img, index: i + 1 }));
      return { inputImages: remaining };
    });
    get().updateConversationImages();
  },

  triggerAnalysis: async () => {
    const { inputImages, activeId, messages, isSending } = get();
    if (isSending) return;
    const readyImages = inputImages.filter((img) => !img.uploading && img.hostedUrl);
    if (readyImages.length === 0) return;

    // 不重复分析：如果已有 AI 分析消息则跳过
    const hasAnalysis = messages.some((m) => m.role === "assistant" && m.content.length > 0);
    if (hasAnalysis) return;

    // 确保有对话
    let convId = activeId;
    if (!convId) {
      await get().createConversation();
      convId = get().activeId;
      if (!convId) return;
    }

    set({ isSending: true });

    const aiMsgId = v4();
    const aiMsg: Message = {
      id: aiMsgId, conversation_id: convId, role: "assistant", content: "",
      images: [], generation: null, params: {}, mode: "chat", created_at: new Date().toISOString(),
    };
    set((s) => ({ messages: [...s.messages, aiMsg] }));

    try {
      const imageUrls = readyImages.map((img) => ({ index: img.index, url: img.hostedUrl! }));
      const fileNames = readyImages.map((img) => `图${img.index}: ${img.fileName}`).join("、");

      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `用户刚上传了 ${readyImages.length} 张图片（${fileNames}）。请简要分析每张图片的内容（品类、颜色、风格），然后告诉用户可以用这些图片做什么。回复简洁，用 Markdown 列表格式。`,
          images: imageUrls,
          mode: "chat",
        }),
      });

      if (res.headers.get("content-type")?.includes("text/event-stream") && res.body) {
        // 流式读取
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              if (parsed.chunk) {
                set((s) => ({
                  messages: s.messages.map((m) =>
                    m.id === aiMsgId ? { ...m, content: (m.content || "") + parsed.chunk } : m
                  ),
                }));
              }
              if (parsed.done) {
                const finalReply = typeof parsed.reply === "string" ? parsed.reply : (get().messages.find((m) => m.id === aiMsgId)?.content || "");
                set((s) => ({
                  messages: s.messages.map((m) =>
                    m.id === aiMsgId ? { ...m, content: finalReply, streamingDone: true } : m
                  ),
                }));
              }
            } catch {}
          }
        }
      } else {
        const data = await res.json();
        const reply = data.reply || `已收到 ${readyImages.length} 张图片。`;
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === aiMsgId ? { ...m, content: reply, streamingDone: true } : m
          ),
        }));
      }

      // 保存到 DB
      const finalMsg = get().messages.find((m) => m.id === aiMsgId);
      if (finalMsg?.content) {
        fetch(`/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "assistant", content: finalMsg.content, mode: "chat" }),
        }).catch(() => {});
      }
    } catch {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === aiMsgId ? { ...m, content: `已收到 ${readyImages.length} 张图片，输入指令告诉我你想做什么。` } : m
        ),
      }));
    }

    set({ isSending: false });
  },

  setMode: (mode: AgentMode) => {
    set({ mode });
    const { activeId } = get();
    if (activeId) {
      fetch(`/api/conversations/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      }).catch(() => {});
    }
  },

  setParams: (p: Partial<GenerationParams>) => set((s) => ({ params: { ...s.params, ...p } })),
  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),

  sendMessage: async () => {
    const { inputText, inputImages, mode, activeId, params, conversations } = get();
    const trimmed = inputText.trim();
    if (!trimmed && inputImages.length === 0) return;

    let convId = activeId;
    if (!convId) {
      await get().createConversation();
      convId = get().activeId;
      if (!convId) return;
    }

    // 保存用户消息到 DB
    const userMsgData = {
      role: "user" as const, content: trimmed,
      images: inputImages.map((img) => ({ index: img.index, url: img.hostedUrl || img.url, fileName: img.fileName })),
      mode,
    };

    // 更新对话标题
    const conv = get().conversations.find((c) => c.id === convId);
    if (conv && conv.title === "新对话") {
      fetch(`/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed.slice(0, 25) || "图片生成" }),
      }).catch(() => {});
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, title: trimmed.slice(0, 25) || "图片生成" } : c
        ),
      }));
    }

    set({ inputText: "", isSending: true });

    // 添加用户消息到 UI
    const userMsg: Message = {
      id: v4(), conversation_id: convId, ...userMsgData,
      generation: null, params: {}, created_at: new Date().toISOString(),
    };

    // 添加 AI 消息占位（不预设 generation，等 Chat API 判断后再设置）
    const aiMsg: Message = {
      id: v4(), conversation_id: convId, role: "assistant", content: "",
      images: [], generation: null,
      params: {}, mode, created_at: new Date().toISOString(),
    };

    set((s) => ({ messages: [...s.messages, userMsg, aiMsg] }));

    // 保存用户消息到 DB
    fetch(`/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userMsgData),
    }).catch(() => {});

    try {
      const imageUrls = inputImages.map((img) => ({ index: img.index, url: img.hostedUrl || img.url })).filter((img) => img.url);

      const history = get().messages
        .filter((m) => m.id !== userMsg.id && m.id !== aiMsg.id)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content || (m.generation?.resultUrls?.length ? `[生成了图片]` : "") }));

      // 统一调用 Chat API（流式返回）
      const chatRes = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, images: imageUrls, history, mode }),
      });

      let chatData: { reply?: string; action?: string; module?: string; generation_id?: string; credits_cost?: number } = {};

      // 检查是否是流式响应
      const contentType = chatRes.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && chatRes.body) {
        // 流式读取
        const reader = chatRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              try {
                const parsed = JSON.parse(trimmed.slice(6));
                if (parsed.chunk) {
                  // 增量更新 AI 消息内容
                  set((s) => ({
                    messages: s.messages.map((m) =>
                      m.id === aiMsg.id ? { ...m, content: (m.content || "") + parsed.chunk } : m
                    ),
                  }));
                }
                if (parsed.done) {
                  chatData = parsed;
                  // 流完成，用 LLM 解析后的干净 reply 替换内容，标记 streamingDone
                  const finalReply = typeof parsed.reply === "string" ? parsed.reply : (get().messages.find((m) => m.id === aiMsg.id)?.content || "");
                  set((s) => ({
                    messages: s.messages.map((m) =>
                      m.id === aiMsg.id ? { ...m, content: finalReply, streamingDone: true } : m
                    ),
                  }));
                }
              } catch {}
            }
          }
        } catch {
          // stream error, use whatever we have
        }
      } else {
        // 非流式降级
        chatData = await chatRes.json();
        // 非流式直接完成
        const finalReply = typeof chatData.reply === "string" ? chatData.reply : "";
        if (finalReply) {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === aiMsg.id ? { ...m, content: finalReply, streamingDone: true } : m
            ),
          }));
        }
      }

      if (chatData.action === "generate" && imageUrls.length > 0) {
        // LLM 判断需要生图 → 调用 Generate API
        const genRes = await fetch("/api/agent/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed, images: imageUrls,
            params: { model: params.model, aspectRatio: params.aspectRatio, imageSize: params.imageSize, count: params.count },
            history,
          }),
        });
        const genData = await genRes.json();

        if (!genRes.ok || !genData.generation_id) {
          throw new Error(genData.error || "生成失败");
        }

        // 显示 AI 的对话回复 + 生成进度
        const reply = chatData.reply || "正在为你生成...";
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === aiMsg.id ? {
              ...m,
              content: reply,
              generation: { status: "generating", progress: 10, resultUrls: [], generationId: genData.generation_id, creditsUsed: genData.credits_cost, module: genData.module },
            } : m
          ),
        }));

        // 保存 AI 回复到 DB
        fetch(`/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "assistant", content: reply, mode }),
        }).catch(() => {});

        startPolling(get, set, aiMsg.id, genData.generation_id, genData.module || "tryon");
      } else {
        // 普通对话回复
        const reply = chatData.reply || "我没有理解你的意思。";
        set((s) => ({
          isSending: false,
          messages: s.messages.map((m) => m.id === aiMsg.id ? { ...m, content: reply, generation: null } : m),
        }));

        // 保存 AI 回复到 DB
        fetch(`/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "assistant", content: reply, mode }),
        }).catch(() => {});
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "处理失败";
      set((s) => ({
        isSending: false,
        messages: s.messages.map((m) =>
          m.id === aiMsg.id ? { ...m, content: errMsg, generation: null } : m
        ),
      }));
    }
  },

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
      if (data.optimizedPrompt) {
        set({ inputText: data.optimizedPrompt, isAIWriting: false });
      } else {
        set({ isAIWriting: false });
        // 添加系统消息提示
        const sysMsg: Message = {
          id: v4(), conversation_id: get().activeId || "", role: "system",
          content: "AI 帮写未能生成内容，请检查图片是否已上传完成。", images: [],
          generation: null, params: {}, mode: "chat", created_at: new Date().toISOString(),
        };
        set((s) => ({ messages: [...s.messages, sysMsg] }));
      }
    } catch (err) {
      set({ isAIWriting: false });
      const sysMsg: Message = {
        id: v4(), conversation_id: get().activeId || "", role: "system",
        content: `AI 帮写失败：${err instanceof Error ? err.message : "网络错误"}`, images: [],
        generation: null, params: {}, mode: "chat", created_at: new Date().toISOString(),
      };
      set((s) => ({ messages: [...s.messages, sysMsg] }));
    }
  },

  retryMessage: async (messageId: string) => {
    const { messages } = get();
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 1) return;
    const userMsg = messages[idx - 1];
    if (userMsg.role !== "user") return;
    set({ inputText: userMsg.content, inputImages: userMsg.images || [] });
    await get().sendMessage();
  },
}));
