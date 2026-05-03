"use client";

import { create } from "zustand";
import { v4 } from "./uuid";
import type {
  Conversation,
  ChatMessage,
  ChatImage,
  GenerationResult,
  GenerationParams,
} from "@/lib/agent/types";
import { DEFAULT_PARAMS } from "@/lib/agent/types";
import { loadConversations, saveConversations } from "@/lib/agent/conversation-storage";
import { uploadImage } from "@/lib/utils";

const MODULE_API: Record<string, string> = {
  tryon: "/api/tryon",
  grass: "/api/grass",
  model: "/api/model",
  pose: "/api/pose",
  model_background: "/api/model-background",
  garment_3d: "/api/garment-3d",
};

type AgentStore = {
  conversations: Conversation[];
  activeConversationId: string | null;
  inputText: string;
  inputImages: ChatImage[];
  params: GenerationParams;
  isGenerating: boolean;
  pollTimers: Map<string, ReturnType<typeof setInterval>>;

  // 会话管理
  createConversation: () => void;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearAllConversations: () => void;

  // 输入
  setInputText: (text: string) => void;
  addInputImages: (files: File[]) => Promise<void>;
  removeInputImage: (index: number) => void;
  setParams: (params: Partial<GenerationParams>) => void;

  // 核心操作
  sendMessage: () => Promise<void>;
  aiWrite: () => Promise<void>;
  retryGeneration: (messageId: string) => Promise<void>;

  // 计算
  activeConversation: () => Conversation | null;
  estimatedCredits: () => number;
};

function uid(): string {
  return v4();
}

function getActiveConv(conversations: Conversation[], id: string | null): Conversation | null {
  return conversations.find((c) => c.id === id) || null;
}

function updateConversation(
  conversations: Conversation[],
  id: string,
  updater: (c: Conversation) => Conversation
): Conversation[] {
  return conversations.map((c) => (c.id === id ? updater(c) : c));
}

function startPolling(
  get: () => AgentStore,
  set: (fn: (s: AgentStore) => Partial<AgentStore>) => void,
  conversationId: string,
  messageId: string,
  generationId: string,
  module: string
) {
  const pollUrl = `${MODULE_API[module] || `/api/${module}`}?generation_id=${generationId}`;

  const timer = setInterval(async () => {
    try {
      const res = await fetch(pollUrl);
      if (!res.ok) return;
      const data = await res.json();

      const status = data.status as string;
      const resultUrls: string[] = Array.isArray(data.result_urls) ? data.result_urls : [];

      const STATUS_PROGRESS: Record<string, number> = {
        uploading: 10, queued: 20, processing_tryon: 50, processing_face_swap: 70,
      };
      const progress = resultUrls.length > 0 ? 100 : (STATUS_PROGRESS[status] ?? 30);

      const isDone = status === "completed" || resultUrls.length > 0;
      const isFailed = status === "failed";

      if (isDone || isFailed) {
        // 停止轮询
        const timers = get().pollTimers;
        const t = timers.get(messageId);
        if (t) clearInterval(t);
        const newTimers = new Map(timers);
        newTimers.delete(messageId);

        set((s) => ({
          pollTimers: newTimers,
          isGenerating: false,
          conversations: updateConversation(s.conversations, conversationId, (c) => ({
            ...c,
            updatedAt: Date.now(),
            messages: c.messages.map((m) =>
              m.id === messageId && m.generation
                ? {
                    ...m,
                    generation: {
                      ...m.generation,
                      status: isDone ? "completed" : "failed",
                      progress: 100,
                      resultUrls,
                      error: isFailed ? (data.error || "生成失败") : undefined,
                    },
                  }
                : m
            ),
          })),
        }));
        return;
      }

      // 更新进度
      set((s) => ({
        conversations: updateConversation(s.conversations, conversationId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === messageId && m.generation
              ? { ...m, generation: { ...m.generation, progress, status: "generating" } }
              : m
          ),
        })),
      }));
    } catch {
      // ignore
    }
  }, 2000);

  set((s) => {
    const timers = new Map(s.pollTimers);
    timers.set(messageId, timer);
    return { pollTimers: timers };
  });
}

// 持久化中间件
function persist(get: () => AgentStore) {
  const { conversations } = get();
  saveConversations(conversations);
}

export const useAgentStore = create<AgentStore>((set, get) => {
  // 初始化时加载对话
  const initialConversations = loadConversations();
  const initialActiveId = initialConversations.length > 0
    ? initialConversations[initialConversations.length - 1].id
    : null;

  return {
    conversations: initialConversations,
    activeConversationId: initialActiveId,
    inputText: "",
    inputImages: [],
    params: { ...DEFAULT_PARAMS },
    isGenerating: false,
    pollTimers: new Map(),

    activeConversation: () => getActiveConv(get().conversations, get().activeConversationId),

    estimatedCredits: () => {
      const { params, inputImages } = get();
      const model = params.model;
      const baseCost = model === "gpt-image-2" ? 4 : model === "doubao-seedream-4-5-251128" ? 2 : 3;
      return baseCost * params.count;
    },

    createConversation: () => {
      const newConv: Conversation = {
        id: uid(),
        title: "新对话",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      set((s) => {
        const conversations = [...s.conversations, newConv];
        saveConversations(conversations);
        return {
          conversations,
          activeConversationId: newConv.id,
          inputText: "",
          inputImages: [],
        };
      });
    },

    switchConversation: (id: string) => {
      set({ activeConversationId: id, inputText: "", inputImages: [] });
    },

    deleteConversation: (id: string) => {
      set((s) => {
        const conversations = s.conversations.filter((c) => c.id !== id);
        const activeId =
          s.activeConversationId === id
            ? conversations.length > 0
              ? conversations[conversations.length - 1].id
              : null
            : s.activeConversationId;
        saveConversations(conversations);
        return { conversations, activeConversationId: activeId };
      });
    },

    clearAllConversations: () => {
      set({ conversations: [], activeConversationId: null, inputText: "", inputImages: [] });
      saveConversations([]);
    },

    setInputText: (text: string) => set({ inputText: text }),

    addInputImages: async (files: File[]) => {
      const currentImages = get().inputImages;
      const startIndex = currentImages.length;

      const newImages: ChatImage[] = files.map((file, i) => ({
        index: startIndex + i + 1,
        url: URL.createObjectURL(file),
        fileName: file.name,
        uploading: true,
      }));

      set((s) => ({ inputImages: [...s.inputImages, ...newImages] }));

      // 逐个上传
      for (let i = 0; i < files.length; i++) {
        const img = newImages[i];
        try {
          const result = await uploadImage(files[i]);
          set((s) => ({
            inputImages: s.inputImages.map((im) =>
              im.index === img.index ? { ...im, hostedUrl: result.url, uploading: false } : im
            ),
          }));
        } catch {
          set((s) => ({
            inputImages: s.inputImages
              .filter((im) => im.index !== img.index)
              .map((im, idx) => ({ ...im, index: idx + 1 })),
          }));
        }
      }
    },

    removeInputImage: (index: number) => {
      set((s) => {
        const removed = s.inputImages[index];
        if (removed?.url?.startsWith("blob:")) URL.revokeObjectURL(removed.url);
        const remaining = s.inputImages.filter((_, i) => i !== index);
        // 重新编号
        const reindexed = remaining.map((img, i) => ({ ...img, index: i + 1 }));
        return { inputImages: reindexed };
      });
    },

    setParams: (params: Partial<GenerationParams>) => {
      set((s) => ({ params: { ...s.params, ...params } }));
    },

    sendMessage: async () => {
      const { inputText, inputImages, params, activeConversationId, conversations } = get();
      const trimmed = inputText.trim();
      if (!trimmed && inputImages.length === 0) return;

      let convId = activeConversationId;

      // 如果没有活跃对话，创建一个
      if (!convId) {
        const newConv: Conversation = {
          id: uid(),
          title: trimmed.slice(0, 20) || `图片生成 ${new Date().toLocaleString("zh-CN")}`,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        convId = newConv.id;
        set((s) => ({
          conversations: [...s.conversations, newConv],
          activeConversationId: convId,
        }));
      }

      // 构建用户消息
      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: trimmed,
        images: inputImages.length > 0 ? [...inputImages] : undefined,
        timestamp: Date.now(),
      };

      // 更新对话标题
      const titleUpdate = trimmed
        ? trimmed.slice(0, 20)
        : `图片生成 ${new Date().toLocaleString("zh-CN")}`;

      // 添加用户消息 + 清空输入
      set((s) => ({
        inputText: "",
        inputImages: [],
        isGenerating: true,
        conversations: updateConversation(s.conversations, convId!, (c) => ({
          ...c,
          title: c.messages.length === 0 ? titleUpdate : c.title,
          updatedAt: Date.now(),
          messages: [...c.messages, userMsg],
        })),
      }));

      // 添加 AI 消息（pending 状态）
      const aiMsgId = uid();
      const aiMsg: ChatMessage = {
        id: aiMsgId,
        role: "assistant",
        content: "",
        generation: {
          status: "pending",
          progress: 0,
          resultUrls: [],
        },
        timestamp: Date.now(),
      };

      set((s) => ({
        conversations: updateConversation(s.conversations, convId!, (c) => ({
          ...c,
          messages: [...c.messages, aiMsg],
        })),
      }));

      // 调用生成 API
      try {
        const imageUrls = inputImages
          .map((img) => img.hostedUrl || img.url)
          .filter(Boolean);

        // 构建历史上下文
        const conv = get().conversations.find((c) => c.id === convId);
        const history = (conv?.messages || [])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(-6)
          .map((m) => ({
            role: m.role,
            content: m.generation?.resultUrls?.length
              ? `[生成了 ${m.generation.resultUrls.length} 张图片]`
              : m.content,
          }));

        const res = await fetch("/api/agent/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed || "根据上传的图片生成",
            images: imageUrls.map((url, i) => ({ index: i + 1, url })),
            params: {
              model: params.model,
              aspectRatio: params.aspectRatio,
              imageSize: params.imageSize,
              count: params.count,
            },
            history,
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.generation_id) {
          throw new Error(data.error || "生成失败");
        }

        // 更新 AI 消息为 generating 状态
        set((s) => ({
          conversations: updateConversation(s.conversations, convId!, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    generation: {
                      status: "generating" as const,
                      progress: 10,
                      resultUrls: [],
                      generationId: data.generation_id,
                      creditsUsed: data.credits_cost,
                      module: data.module,
                    },
                  }
                : m
            ),
          })),
        }));

        // 开始轮询
        startPolling(get, set, convId!, aiMsgId, data.generation_id, data.module || "tryon");
      } catch (err) {
        set((s) => ({
          isGenerating: false,
          conversations: updateConversation(s.conversations, convId!, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    content: err instanceof Error ? err.message : "生成失败",
                    generation: {
                      status: "failed" as const,
                      progress: 0,
                      resultUrls: [],
                      error: err instanceof Error ? err.message : "生成失败",
                    },
                  }
                : m
            ),
          })),
        }));
      }

      // 持久化
      persist(get);
    },

    aiWrite: async () => {
      const { inputImages } = get();
      if (inputImages.length === 0) return;

      const imageUrls = inputImages.map((img) => img.hostedUrl || img.url).filter(Boolean);

      try {
        const res = await fetch("/api/agent/ai-write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images: imageUrls,
            currentPrompt: get().inputText,
          }),
        });

        const data = await res.json();
        if (data.optimizedPrompt) {
          set({ inputText: data.optimizedPrompt });
        }
      } catch {
        // 静默失败
      }
    },

    retryGeneration: async (messageId: string) => {
      // 找到对应消息，重新发送
      const conv = getActiveConv(get().conversations, get().activeConversationId);
      if (!conv) return;

      const msg = conv.messages.find((m) => m.id === messageId);
      if (!msg) return;

      // 找到前一条用户消息
      const msgIndex = conv.messages.findIndex((m) => m.id === messageId);
      const userMsg = conv.messages.slice(0, msgIndex).reverse().find((m) => m.role === "user");
      if (!userMsg) return;

      // 重新设置输入并发送
      set({
        inputText: userMsg.content,
        inputImages: userMsg.images || [],
      });
      await get().sendMessage();
    },
  };
});
