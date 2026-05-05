"use client";

import { create } from "zustand";
import { v4 } from "./uuid";
import type { Conversation, Message, ChatImage, GenerationParams, AgentMode, AgentIntentMode, ChatImageRole } from "@/lib/agent/types";
import { DEFAULT_PARAMS } from "@/lib/agent/types";
import { applyConfirmImageRoles, validateConfirmImageRoles } from "@/lib/agent/confirm-role-params";
import { getCreditCost, normalizeImageSize, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { applyRepairPrompt, type RepairKind } from "@/lib/generation-repair";
import { uploadImage, compressImageForAgent } from "@/lib/utils";
import type {
  PlanValidationResult,
  WorkflowAssetRecord,
  WorkflowCostEstimate,
  WorkflowEventRecord,
  WorkflowPlan,
  WorkflowRecord,
  WorkflowStatus,
  WorkflowStepRecord,
} from "@/lib/agent/workflow/types";

// ---- DB 持久化（Supabase） ----

// ---- 类型 ----
type Store = {
  conversations: Conversation[];
  activeId: string | null;
  messages: Message[];
  inputText: string;
  inputImages: ChatImage[];
  params: GenerationParams;
  intentMode: AgentIntentMode;
  isSending: boolean;
  isAIWriting: boolean;
  sidebarOpen: boolean;
  pollTimers: Map<string, ReturnType<typeof setInterval>>;

  loadConversations: () => Promise<void>;
  openLanding: () => void;
  createConversation: () => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => void;
  setInputText: (t: string) => void;
  addImages: (files: File[]) => Promise<void>;
  removeImage: (i: number) => void;
  clearImages: () => void;
  addReferenceUrl: (url: string) => void;
  setImageRole: (index: number, role: ChatImageRole) => void;
  setParams: (p: Partial<GenerationParams>) => void;
  setIntentMode: (mode: AgentIntentMode) => void;
  setSidebarOpen: (v: boolean) => void;
  receiveAgentEvent: (event: Record<string, unknown>) => void;
  sendMessage: () => Promise<void>;
  aiWrite: () => Promise<void>;
  retryMessage: (id: string) => void;
  confirmGeneration: (messageId: string) => Promise<void>;
  confirmWorkflow: (messageId: string) => Promise<void>;
  cancelWorkflow: (messageId: string) => Promise<void>;
  retryWorkflowStep: (messageId: string, stepId: string) => Promise<void>;
  skipWorkflowStep: (messageId: string, stepId: string) => Promise<void>;
  selectWorkflowStepImage: (messageId: string, stepId: string, selectedImageUrl: string) => Promise<void>;
  editWorkflowStep: (messageId: string, stepId: string, patch: { title?: string; params?: Record<string, unknown>; input?: Record<string, unknown> }) => Promise<void>;
  updateConfirmParams: (messageId: string, params: Partial<GenerationParams>) => void;
  updateConfirmImageRole: (messageId: string, imageIndex: number, role: ChatImageRole) => void;
  sendFeedback: (messageId: string, rating: "good" | "bad", reason?: string, tags?: string[]) => Promise<void>;
  repairGeneration: (messageId: string, repairValue: string) => void;
  reset: () => void;
};

type WorkflowClientPayload = {
  workflow: WorkflowRecord;
  steps: WorkflowStepRecord[];
  events: WorkflowEventRecord[];
  assets: WorkflowAssetRecord[];
  validation?: PlanValidationResult;
  costEstimate?: WorkflowCostEstimate;
  plan?: WorkflowPlan;
};

type WorkflowPlanApiResponse = {
  ok?: boolean;
  plan?: WorkflowPlan;
  validation?: PlanValidationResult;
  costEstimate?: WorkflowCostEstimate;
  error?: string;
};

// ---- 工具 ----
function revoke(urls: string[]) {
  if (typeof window === "undefined") return;
  for (const u of urls) if (u.startsWith("blob:")) URL.revokeObjectURL(u);
}

/**
 * 清理 generation 对象后持久化到 DB
 * 保留 _confirmData（用户未确认时需要它来重新显示确认按钮）
 */
function sanitizeGenerationForDB(gen: unknown): Record<string, unknown> | null {
  if (!gen || typeof gen !== "object") return null;
  const g = gen as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  if (g.status) clean.status = g.status;
  if (typeof g.progress === "number") clean.progress = g.progress;
  if (Array.isArray(g.resultUrls)) clean.resultUrls = g.resultUrls;
  if (g.error) clean.error = g.error;
  if (g.generationId) clean.generationId = g.generationId;
  if (g.creditsUsed) clean.creditsUsed = g.creditsUsed;
  if (g.module) clean.module = g.module;
  // 保留确认数据（pending 状态需要，completed/failed 时清理）
  if (g._confirmData && g.status === "pending") {
    clean._confirmData = g._confirmData;
  }
  if (g._lastRunData) {
    clean._lastRunData = g._lastRunData;
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

/** 保存消息到 DB */
function saveMessage(convId: string, msg: { id?: string; role: string; content: string; images?: ChatImage[]; generation?: unknown; params?: Record<string, unknown>; mode?: string }) {
  console.log("[agent-store] saveMessage:", { convId, role: msg.role, contentLen: msg.content.length, hasGeneration: !!msg.generation });
  fetch(`/api/conversations/${convId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      images: msg.images || [],
      generation: sanitizeGenerationForDB(msg.generation),
      params: msg.params || {},
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

function updateMessageParams(convId: string, messageId: string, params: Record<string, unknown>) {
  fetch(`/api/conversations/${convId}/messages`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, params }),
  }).catch(() => {});
}

function updateMessageImages(convId: string, messageId: string, images: ChatImage[]) {
  fetch(`/api/conversations/${convId}/messages`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, images }),
  }).catch(() => {});
}

function inferDefaultImageRole(index: number): ChatImageRole {
  if (index === 1) return "clothing";
  if (index === 2) return "reference";
  if (index === 3) return "face";
  return "auto";
}

function readSavedIntentMode(): AgentIntentMode {
  return "smart";
}

// ---- Store ----
export const useAgentStore = create<Store>((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  inputText: "",
  inputImages: [],
  params: { ...DEFAULT_PARAMS },
  intentMode: readSavedIntentMode(),
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
    } catch {}
  },

  openLanding: () => {
    revoke(get().inputImages.map((img) => img.url));
    set({
      activeId: null,
      messages: [],
      inputText: "",
      inputImages: [],
      intentMode: "smart",
      isSending: false,
      isAIWriting: false,
    });
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
        intentMode: "smart",
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
      if (s.activeId !== id) return { conversations: convs };
      revoke(s.inputImages.map((img) => img.url));
      return {
        conversations: convs,
        activeId: null,
        messages: [],
        inputText: "",
        inputImages: [],
        isSending: false,
        isAIWriting: false,
      };
    });
  },

  // ======== 输入 ========
  setInputText: (t) => set({ inputText: t }),

  addImages: async (files: File[]) => {
    const current = get().inputImages;
    const start = current.length;
    const placeholders: ChatImage[] = files.map((f, i) => ({
      index: start + i + 1,
      url: URL.createObjectURL(f),
      fileName: f.name,
      role: inferDefaultImageRole(start + i + 1),
      uploading: true,
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
    // 持久化图片到对话（用 hostedUrl 替代 blob URL）
    const { activeId, inputImages } = get();
    if (activeId) {
      const persisted = inputImages.map((img) => ({
        ...img,
        url: img.hostedUrl || img.url,
      }));
      fetch(`/api/conversations/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: persisted }),
      }).catch(() => {});
    }
  },

  removeImage: (index: number) => {
    let nextImages: ChatImage[] = [];
    set((s) => {
      const removed = s.inputImages[index];
      if (removed?.url?.startsWith("blob:")) URL.revokeObjectURL(removed.url);
      nextImages = s.inputImages.filter((_, i) => i !== index).map((img, i) => ({ ...img, index: i + 1 }));
      return { inputImages: nextImages };
    });
    const { activeId } = get();
    if (activeId) {
      fetch(`/api/conversations/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: nextImages }),
      }).catch(() => {});
    }
  },

  clearImages: () => {
    const { activeId, inputImages } = get();
    revoke(inputImages.map((img) => img.url));
    set({ inputImages: [] });
    if (activeId) {
      fetch(`/api/conversations/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [] }),
      }).catch(() => {});
    }
  },

  setImageRole: (index: number, role: ChatImageRole) => {
    set((s) => ({
      inputImages: s.inputImages.map((img) => img.index === index ? { ...img, role } : img),
    }));
    const { activeId, inputImages } = get();
    if (activeId) {
      const persisted = inputImages.map((img) => img.index === index ? { ...img, role } : img);
      fetch(`/api/conversations/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: persisted }),
      }).catch(() => {});
    }
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
          role: "reference",
          uploading: false,
        },
      ],
    }));
  },

  setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
  setIntentMode: (mode) => {
    set({ intentMode: mode });
  },
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  receiveAgentEvent: (event: Record<string, unknown>) => {
    const kind = typeof event.kind === "string" ? event.kind : "";
    if (!kind) return;
    set((s) => {
      const targetIndex = findLatestAssistantMessageIndex(s.messages);
      if (targetIndex < 0) return {};
      const messages = s.messages.map((message, index) => {
        if (index !== targetIndex) return message;
        const liveEvents = Array.isArray(message.params?.agentLiveEvents)
          ? message.params.agentLiveEvents as Record<string, unknown>[]
          : [];
        return {
          ...message,
          params: {
            ...(message.params || {}),
            agentLiveEvents: [...liveEvents, event].slice(-30),
            agentTimeline: mergeTimelineWithBackendEvent(readTimelineFromParams(message.params), event),
          },
        };
      });
      return { messages };
    });
  },

  // ======== 核心：发送消息 ========
  sendMessage: async () => {
    const { inputText, inputImages, params, intentMode, activeId, conversations } = get();
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

    // 用户消息（图片 URL 永久化：优先用 hostedUrl）
    const persistedImages: ChatImage[] = currentImages.map((img) => ({
      ...img,
      url: img.hostedUrl || img.url, // 优先 imgbb URL，blob URL 仅作最后 fallback
    }));

    const userMsg: Message = {
      id: uid(), conversation_id: convId, role: "user", content: trimmed,
      images: persistedImages, generation: null, params: {}, mode: "agent",
      created_at: new Date().toISOString(),
    };

    // AI 消息占位
    const aiMsg: Message = {
      id: uid(), conversation_id: convId, role: "assistant", content: "",
      images: [], generation: null, params: {
        agentTimeline: [
          { label: "接收请求", status: "done", detail: "已拿到文字、图片和当前上下文" },
          { label: "理解意图", status: "running", detail: "正在判断是聊天、生成、工作流还是需要追问" },
          { label: "选择工具", status: "pending", detail: "根据目标和图片关系选择可执行能力" },
          { label: "复核计划", status: "pending", detail: "检查是否误判、是否需要确认或扣分" },
        ],
      }, mode: "agent",
      created_at: new Date().toISOString(),
    };

    set((s) => ({ messages: [...s.messages, userMsg, aiMsg] }));

    // 保存用户消息
    saveMessage(convId, { id: userMsg.id, role: "user", content: trimmed, images: persistedImages, mode: "agent" });

    try {
      // 当前上传的图片
      let imageUrls = currentImages.map((img) => ({
        index: img.index,
        url: img.hostedUrl || img.url,
        role: img.role || "auto",
        fileName: img.fileName,
      })).filter((img) => img.url);

      const history = get().messages
        .filter((m) => m.id !== userMsg.id && m.id !== aiMsg.id)
        .slice(-10)
        .map((m) => ({
          role: m.role,
          content: m.content || (m.generation?.resultUrls?.length ? `[生成了 ${m.generation.resultUrls.length} 张图片]` : ""),
        }));

      const workflowPayload = await maybeCreateWorkflowMessage({
        convId,
        userMessageId: userMsg.id,
        message: trimmed,
        images: imageUrls,
        history,
        intentMode,
        params,
      });

      if (workflowPayload) {
        const reply = buildWorkflowReply(workflowPayload);
        const workflowParams = {
          workflow: workflowPayload,
          agentTimeline: completeAgentTimeline("已拆解成可执行 workflow，等待确认。"),
        };
        set((s) => ({
          isSending: false,
          messages: s.messages.map((m) =>
            m.id === aiMsg.id
              ? { ...m, content: reply, streamingDone: true, params: workflowParams }
              : m
          ),
        }));
        saveMessage(convId, {
          id: aiMsg.id,
          role: "assistant",
          content: reply,
          params: workflowParams,
          mode: "agent",
        });
        return;
      }

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === aiMsg.id
            ? { ...m, params: { ...(m.params || {}), agentTimeline: runningAgentTimeline("选择工具", "已进入 Agent Brain 多工具循环") } }
            : m
        ),
      }));

      // 调用统一 Agent API
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          message: trimmed,
          images: imageUrls,
          history,
          intentMode,
          params: { model: params.model, aspectRatio: params.aspectRatio, imageSize: params.imageSize, count: params.count },
          lastTask: getLastAgentTaskContext(get().messages),
        }),
      });

      const data = await res.json();
      const reply = typeof data.reply === "string" ? data.reply : "处理完成。";
      const traceParams = {
        ...(typeof data.trace_id === "string" ? { traceId: data.trace_id } : {}),
        agentTimeline: completeAgentTimeline(data.action === "confirm_generate" ? "已生成确认卡，等待你确认后执行。" : "已完成理解和回复。"),
      };

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
              params: traceParams,
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
                  taskBrief: data.task_brief,
                },
              },
            } : m
          ),
        }));

        // 保存 AI 消息（含 generation 数据）
        const confirmGen = get().messages.find((m) => m.id === aiMsg.id)?.generation;
        saveMessage(convId, { id: aiMsg.id, role: "assistant", content: reply, generation: confirmGen || null, params: traceParams, mode: "agent" });
      } else {
        // 对话回复
        set((s) => ({
          isSending: false,
          messages: s.messages.map((m) =>
            m.id === aiMsg.id ? { ...m, content: reply, streamingDone: true, params: traceParams } : m
          ),
        }));
        saveMessage(convId, { id: aiMsg.id, role: "assistant", content: reply, params: traceParams, mode: "agent" });
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
  updateConfirmParams: (messageId: string, patch: Partial<GenerationParams>) => {
    let updatedGeneration: unknown = null;
    let convId = "";
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId || !m.generation?._confirmData) return m;
        convId = m.conversation_id;
        const current = readConfirmParams(m.generation._confirmData.params);
        const nextModel = patch.model || current.model;
        const nextRatio = patch.aspectRatio || current.aspectRatio;
        const nextSize = normalizeImageSize(nextModel, patch.imageSize || current.imageSize, nextRatio);
        const nextCount = Math.min(Math.max(Number(patch.count ?? current.count) || 1, 1), 4);
        const nextPrompt = patch.prompt ?? current.prompt;
        const nextCost = getCreditCost(nextModel, nextSize, nextRatio) * nextCount;
        const nextParams = writeConfirmParams(m.generation._confirmData.params, {
          model: nextModel,
          aspectRatio: nextRatio,
          imageSize: nextSize,
          count: nextCount,
          prompt: nextPrompt,
        });
        const nextJobPayload = writeConfirmPayloadParams(m.generation._confirmData.jobPayload, {
          model: nextModel,
          aspectRatio: nextRatio,
          imageSize: nextSize,
          count: nextCount,
          prompt: nextPrompt,
        });
        const generation = {
          ...m.generation,
          creditsUsed: nextCost,
          _confirmData: {
            ...m.generation._confirmData,
            params: nextParams,
            jobPayload: nextJobPayload,
            creditsCost: nextCost,
          },
        };
        updatedGeneration = generation;
        return { ...m, generation };
      }),
    }));
    if (convId && updatedGeneration) updateMessageGeneration(convId, messageId, updatedGeneration);
  },

  updateConfirmImageRole: (messageId: string, imageIndex: number, role: ChatImageRole) => {
    let convId = "";
    let updatedGeneration: unknown = null;
    let updatedUserMessageId = "";
    let updatedUserImages: ChatImage[] = [];
    let nextTrayImages: ChatImage[] = [];

    set((s) => {
      const assistantIndex = s.messages.findIndex((m) => m.id === messageId);
      const assistant = assistantIndex >= 0 ? s.messages[assistantIndex] : null;
      if (!assistant?.generation?._confirmData) return {};

      convId = assistant.conversation_id;
      const previousUserIndex = findPreviousUserImageMessageIndex(s.messages, assistantIndex);
      const sourceImages = previousUserIndex >= 0
        ? s.messages[previousUserIndex].images || []
        : s.inputImages;
      const roleImages = sourceImages.map((img) =>
        img.index === imageIndex ? { ...img, role } : img
      );
      const { params, jobPayload } = applyConfirmImageRoles(
        assistant.generation._confirmData.module,
        assistant.generation._confirmData.params,
        assistant.generation._confirmData.jobPayload,
        roleImages
      );
      const generation = {
        ...assistant.generation,
        _confirmData: {
          ...assistant.generation._confirmData,
          params,
          jobPayload,
        },
      };

      updatedGeneration = generation;
      nextTrayImages = s.inputImages.map((img) => img.index === imageIndex ? { ...img, role } : img);

      const messages = s.messages.map((m, idx) => {
        if (idx === assistantIndex) return { ...m, generation };
        if (idx === previousUserIndex) {
          updatedUserMessageId = m.id;
          updatedUserImages = roleImages;
          return { ...m, images: roleImages };
        }
        return m;
      });

      return {
        messages,
        inputImages: nextTrayImages,
      };
    });

    if (convId && updatedGeneration) updateMessageGeneration(convId, messageId, updatedGeneration);
    if (convId && updatedUserMessageId) updateMessageImages(convId, updatedUserMessageId, updatedUserImages);
    if (convId && nextTrayImages.length) {
      fetch(`/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: nextTrayImages }),
      }).catch(() => {});
    }
  },

  sendFeedback: async (messageId: string, rating: "good" | "bad", reason?: string, tags?: string[]) => {
    const msg = get().messages.find((m) => m.id === messageId);
    if (!msg || msg.role !== "assistant") return;
    const traceId = typeof msg.params?.traceId === "string" ? msg.params.traceId : undefined;
    const nextParams = {
      ...(msg.params || {}),
      feedback: {
        rating,
        status: "sending",
        reason: reason || "",
        tags: tags || [],
        updatedAt: new Date().toISOString(),
      },
    };
    set((s) => ({
      messages: s.messages.map((m) => m.id === messageId ? { ...m, params: nextParams } : m),
    }));
    updateMessageParams(msg.conversation_id, messageId, nextParams);

    try {
      const res = await fetch("/api/agent/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: msg.conversation_id,
          messageId,
          traceId,
          rating,
          reason,
          tags,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "反馈提交失败");
      const doneParams = {
        ...nextParams,
        feedback: {
          ...(nextParams.feedback as Record<string, unknown>),
          status: "saved",
          learned: Boolean(data.learned),
        },
      };
      set((s) => ({
        messages: s.messages.map((m) => m.id === messageId ? { ...m, params: doneParams } : m),
      }));
      updateMessageParams(msg.conversation_id, messageId, doneParams);
    } catch (err) {
      const failedParams = {
        ...nextParams,
        feedback: {
          ...(nextParams.feedback as Record<string, unknown>),
          status: "failed",
          error: err instanceof Error ? err.message : "反馈提交失败",
        },
      };
      set((s) => ({
        messages: s.messages.map((m) => m.id === messageId ? { ...m, params: failedParams } : m),
      }));
      updateMessageParams(msg.conversation_id, messageId, failedParams);
    }
  },

  repairGeneration: (messageId: string, repairValue: string) => {
    let convId = "";
    let updatedGeneration: unknown = null;

    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId || !m.generation?._lastRunData) return m;
        convId = m.conversation_id;
        const lastRun = m.generation._lastRunData;
        const repairKind = getRepairKind(lastRun.module);
        const current = readConfirmParams(lastRun.params);
        const repairedPrompt = applyRepairPrompt(current.prompt || String(lastRun.params.prompt || ""), repairKind, repairValue);
        const nextParams = writeConfirmParams(lastRun.params, { ...current, prompt: repairedPrompt });
        const nextJobPayload = writeConfirmPayloadParams(lastRun.jobPayload, { ...current, prompt: repairedPrompt });
        const generation = {
          ...m.generation,
          status: "pending" as const,
          progress: 0,
          resultUrls: [],
          error: undefined,
          generationId: undefined,
          creditsUsed: lastRun.creditsCost,
          _confirmData: {
            ...lastRun,
            params: nextParams,
            jobPayload: nextJobPayload,
          },
        };
        updatedGeneration = generation;
        return { ...m, generation };
      }),
    }));

    if (convId && updatedGeneration) updateMessageGeneration(convId, messageId, updatedGeneration);
  },

  confirmGeneration: async (messageId: string) => {
    const { messages } = get();
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.generation?._confirmData) {
      console.warn("[agent-store] confirmGeneration: no _confirmData found for", messageId);
      return;
    }
    const convId = msg.conversation_id;

    const confirmData = msg.generation._confirmData as {
      apiPath: string;
      module: string;
      params: Record<string, unknown>;
      jobPayload: Record<string, unknown>;
      creditsCost: number;
    };
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    const previousUserIndex = messageIndex >= 0 ? findPreviousUserImageMessageIndex(messages, messageIndex) : -1;
    const confirmImages = previousUserIndex >= 0 ? messages[previousUserIndex].images || [] : get().inputImages;
    const roleErrors = validateConfirmImageRoles(confirmData.module, confirmData.params, confirmImages)
      .filter((issue) => issue.severity === "error");
    if (roleErrors.length > 0) {
      const errorMessage = roleErrors.map((issue) => issue.message).join("；");
      set((s) => ({
        isSending: false,
        messages: s.messages.map((m) =>
          m.id === messageId && m.generation
            ? { ...m, generation: { ...m.generation, status: "pending" as const, error: errorMessage } }
            : m
        ),
      }));
      const blockedGen = get().messages.find((m) => m.id === messageId)?.generation;
      if (blockedGen) updateMessageGeneration(convId, messageId, blockedGen);
      return;
    }
    let requestProgressTimer: ReturnType<typeof setInterval> | null = null;

    // 更新为 generating 状态
    set((s) => ({
      isSending: true,
      messages: s.messages.map((m) =>
        m.id === messageId && m.generation
          ? { ...m, generation: { ...m.generation, status: "generating" as const, progress: 5 } }
          : m
      ),
    }));
    const generatingGen = get().messages.find((m) => m.id === messageId)?.generation;
    if (generatingGen) {
      updateMessageGeneration(convId, messageId, generatingGen);
    }
    requestProgressTimer = startRequestProgress(set, messageId);

    try {
      // 调用 API 执行生成
      const res = await fetch(confirmData.apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmData.params),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "生成失败");
      }

      if (requestProgressTimer) {
        clearInterval(requestProgressTimer);
        requestProgressTimer = null;
      }

      // 通用生图：直接返回结果（无 generation_id）
      if (data.result_urls && data.result_urls.length > 0) {
        const verifiedResultUrls = await verifyGeneratedResultUrls(data.result_urls);
        set((s) => ({
          isSending: false,
          messages: s.messages.map((m) =>
            m.id === messageId && m.generation
              ? {
                  ...m,
                  generation: {
                    ...m.generation,
                    status: "completed" as const,
                    progress: 100,
                    resultUrls: verifiedResultUrls,
                    creditsUsed: data.credits_cost || confirmData.creditsCost,
                    _lastRunData: confirmData,
                    _confirmData: undefined,
                  },
                }
              : m
          ),
        }));
        const finalGen = get().messages.find((m) => m.id === messageId)?.generation;
        if (finalGen) updateMessageGeneration(convId, messageId, finalGen);
        return;
      }

      // 模块生图：需要轮询
      if (!data.generation_id) {
        throw new Error(data.error || "生成失败");
      }

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === messageId && m.generation
            ? {
                ...m,
                generation: {
                  ...m.generation,
                  status: "generating" as const,
                  progress: 25,
                  generationId: data.generation_id,
                  creditsUsed: data.credits_cost || confirmData.creditsCost,
                  _lastRunData: confirmData,
                  _confirmData: undefined,
                },
              }
            : m
        ),
      }));

      const updatedGen = get().messages.find((m) => m.id === messageId)?.generation;
      if (updatedGen) {
        updateMessageGeneration(convId, messageId, updatedGen);
      }

      pollGeneration(get, set, messageId, convId, data.generation_id, confirmData.module);
    } catch (err) {
      if (requestProgressTimer) {
        clearInterval(requestProgressTimer);
        requestProgressTimer = null;
      }
      const errMsg = err instanceof Error ? err.message : "生成失败";
      set((s) => ({
        isSending: false,
        messages: s.messages.map((m) =>
          m.id === messageId && m.generation
            ? { ...m, generation: { ...m.generation, status: "failed" as const, error: errMsg, _lastRunData: confirmData, _confirmData: undefined } }
            : m
        ),
      }));
      const failedGen = get().messages.find((m) => m.id === messageId)?.generation;
      if (failedGen) updateMessageGeneration(convId, messageId, failedGen);
    }
  },

  confirmWorkflow: async (messageId: string) => {
    const { messages } = get();
    const msg = messages.find((m) => m.id === messageId);
    const payload = getWorkflowPayload(msg?.params);
    const workflowId = payload?.workflow.id;
    if (!msg || !payload || !workflowId) return;

    set((s) => ({
      isSending: true,
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, params: { ...(m.params || {}), workflow: markWorkflowStatus(payload, "queued") } }
          : m
      ),
    }));

    try {
      const res = await fetch(`/api/agent/workflows/${workflowId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoRun: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "确认 workflow 失败");

      const nextPayload = normalizeWorkflowPayload(data) || markWorkflowStatus(payload, "queued");
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === messageId
            ? { ...m, params: { ...(m.params || {}), workflow: nextPayload } }
            : m
        ),
      }));
      updateMessageParams(msg.conversation_id, messageId, { ...(msg.params || {}), workflow: nextPayload });
      pollWorkflow(get, set, messageId, msg.conversation_id, workflowId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "确认 workflow 失败";
      const failedPayload = {
        ...payload,
        workflow: {
          ...payload.workflow,
          status: "failed" as WorkflowStatus,
          error_message: errorMessage,
        },
      };
      set((s) => ({
        isSending: false,
        messages: s.messages.map((m) =>
          m.id === messageId
            ? { ...m, params: { ...(m.params || {}), workflow: failedPayload } }
            : m
        ),
      }));
      updateMessageParams(msg.conversation_id, messageId, { ...(msg.params || {}), workflow: failedPayload });
    }
  },

  cancelWorkflow: async (messageId: string) => {
    await mutateWorkflowFromMessage(get, set, messageId, "cancel", { poll: false });
  },

  retryWorkflowStep: async (messageId: string, stepId: string) => {
    await mutateWorkflowFromMessage(get, set, messageId, `steps/${stepId}/retry`, { poll: true });
  },

  skipWorkflowStep: async (messageId: string, stepId: string) => {
    await mutateWorkflowFromMessage(get, set, messageId, `steps/${stepId}/skip`, { poll: true });
  },

  selectWorkflowStepImage: async (messageId: string, stepId: string, selectedImageUrl: string) => {
    await mutateWorkflowFromMessage(get, set, messageId, `steps/${stepId}/select`, {
      poll: true,
      body: { selectedImageUrl },
    });
  },

  editWorkflowStep: async (messageId: string, stepId: string, patch: { title?: string; params?: Record<string, unknown>; input?: Record<string, unknown> }) => {
    await mutateWorkflowFromMessage(get, set, messageId, `steps/${stepId}/edit`, {
      poll: true,
      body: patch,
    });
  },

  // ======== 重置 ========
  reset: () => {
    get().pollTimers?.forEach((t) => clearInterval(t));
    revoke(get().inputImages.map((img) => img.url));
    set({
      messages: [], inputText: "", inputImages: [], intentMode: "smart", isSending: false,
      activeId: null, conversations: [],
    });
    get().loadConversations();
  },

  pollTimers: new Map(),
}));

async function maybeCreateWorkflowMessage(args: {
  convId: string;
  userMessageId: string;
  message: string;
  images: Array<{ index: number; url: string; role: string; fileName?: string }>;
  history: Array<{ role: string; content: string }>;
  intentMode: AgentIntentMode;
  params: GenerationParams;
}): Promise<WorkflowClientPayload | null> {
  if (!shouldTryWorkflowRequest(args.message, args.images.length, args.intentMode)) return null;

  const planRes = await fetch("/api/agent/workflows/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: args.message,
      images: args.images,
      mode: args.intentMode === "create" ? "agent" : "auto",
      params: {
        model: args.params.model,
        aspectRatio: args.params.aspectRatio,
        imageSize: args.params.imageSize,
        count: args.params.count,
      },
      conversationSummary: args.history
        .map((item) => `${item.role}: ${item.content}`)
        .join("\n")
        .slice(-1800),
    }),
  });

  const planData = await planRes.json().catch(() => ({})) as WorkflowPlanApiResponse;
  if (!planRes.ok) {
    if (args.intentMode === "create" || isStrongWorkflowClientRequest(args.message, args.images.length)) {
      throw new Error(planData.error || "规划 workflow 失败");
    }
    return null;
  }
  if (!shouldUseWorkflowPlan(planData, args.message, args.intentMode, args.images.length)) {
    if (isStrongWorkflowClientRequest(args.message, args.images.length)) {
      throw new Error(planData.plan?.clarificationQuestion || "这个任务应该进入工作流，但规划器没有返回可执行步骤");
    }
    return null;
  }

  const createRes = await fetch("/api/agent/workflows", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `${args.convId}:${args.userMessageId}:workflow`,
    },
    body: JSON.stringify({
      plan: planData.plan,
      images: args.images,
      mode: "agent",
      params: {
        model: args.params.model,
        aspectRatio: args.params.aspectRatio,
        imageSize: args.params.imageSize,
        count: args.params.count,
      },
      conversationId: args.convId,
      idempotencyKey: `${args.convId}:${args.userMessageId}:workflow`,
    }),
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok) throw new Error(createData.error || "创建 workflow 失败");
  return normalizeWorkflowPayload({
    ...createData,
    plan: planData.plan,
    validation: createData.validation || planData.validation,
    costEstimate: createData.costEstimate || planData.costEstimate,
  });
}

function shouldTryWorkflowRequest(text: string, imageCount: number, mode: AgentIntentMode) {
  if (mode === "chat") return false;
  if (mode === "create") return true;
  const normalized = text.trim();
  if (!normalized) return imageCount > 0;
  if (/(\u7136\u540e|\u518d|\u63a5\u7740|\u6700\u540e|\u5148.*\u518d|\u4ece.*\u9009|\u5de5\u4f5c\u6d41|\u5206\u6b65)/.test(normalized)) return true;
  return /(\u751f\u6210|\u8bbe\u8ba1|\u753b|\u91cd\u7ed8|\u6539|\u6362|\u7a7f|\u8bd5\u7a7f|\u4e0a\u8eab|\u59ff\u52bf|\u80cc\u666f|\u6d77\u62a5|\u8be6\u60c5\u9875|\u79cd\u8349|\u4ea7\u54c1|3D|3d|\u6a21\u578b|\u56fe\u751f\u56fe|\u6587\u751f\u56fe)/.test(normalized);
}

function isStrongWorkflowClientRequest(text: string, imageCount: number) {
  if (imageCount > 0 && /(\u7136\u540e|\u518d|\u63a5\u7740|\u6700\u540e|\u5148.*\u518d|\u4ece.*\u9009|\u5de5\u4f5c\u6d41|\u5206\u6b65)/.test(text)) return true;
  if (/图\s*\d+.*(?:穿|换上|穿上|上身).*图\s*\d+|图\s*\d+.*(?:人物|模特|人).*图\s*\d+.*(?:衣服|服装|裙子|上衣|裤子|外套)/.test(text)) return true;
  if (/(\u6bcf\u5f20.*\u5355\u72ec|\u72ec\u7acb\u51fa\u56fe|\u4e0d\u540c\u59ff\u52bf|\u56db\u4e2a.*\u59ff\u52bf|4\u4e2a.*\u59ff\u52bf)/.test(text)) return true;
  return false;
}

function shouldUseWorkflowPlan(
  data: WorkflowPlanApiResponse,
  text: string,
  mode: AgentIntentMode,
  imageCount: number
) {
  const plan = data.plan;
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) return false;
  if (plan.needsClarification) return false;
  const blockingErrors = data.validation?.errors?.filter((issue) => issue.severity === "error") || [];
  if (data.ok === false && blockingErrors.length > 0) return false;
  if (mode === "create") return true;

  const stepTypes = plan.steps.map((step) => step.type);
  const advanced = stepTypes.some((type) =>
    [
      "tryon",
      "pose_variation",
      "garment_3d",
      "commerce_detail",
      "commerce_creative",
      "background_replace",
      "select_image",
      "image_quality_check",
      "prompt_repair",
    ].includes(type)
  );
  const multiStepText = /(\u7136\u540e|\u518d|\u63a5\u7740|\u6700\u540e|\u5148.*\u518d|\u4ece.*\u9009|\u5de5\u4f5c\u6d41|\u5206\u6b65)/.test(text);
  const visualText = /(\u751f\u6210|\u8bbe\u8ba1|\u753b|\u91cd\u7ed8|\u6539|\u6362|\u7a7f|\u59ff\u52bf|\u80cc\u666f|\u6d77\u62a5|\u8be6\u60c5\u9875|\u79cd\u8349|\u4ea7\u54c1|3D|3d|\u56fe\u751f\u56fe|\u6587\u751f\u56fe)/.test(text);

  return advanced || plan.steps.length > 1 || multiStepText || (visualText && imageCount > 0);
}

function buildWorkflowReply(payload: WorkflowClientPayload) {
  const count = payload.steps.length || payload.plan?.steps.length || 0;
  const credits = payload.costEstimate?.total || payload.workflow.cost_estimate?.total || 0;
  const summary = payload.workflow.summary || payload.plan?.summary || "视觉任务";
  return [
    `我已经把这个需求拆成 ${count || 1} 个可执行步骤，确认后会按顺序处理。`,
    "",
    `目标：${summary}`,
    credits ? `预计消耗：${credits} 积分，确认前不会扣费。` : "确认前不会扣费。",
  ].join("\n");
}

function getWorkflowPayload(params: Record<string, unknown> | undefined): WorkflowClientPayload | null {
  if (!params || typeof params !== "object") return null;
  return normalizeWorkflowPayload(params.workflow);
}

function normalizeWorkflowPayload(value: unknown): WorkflowClientPayload | null {
  if (!isPlainObject(value) || !isPlainObject(value.workflow)) return null;
  return {
    workflow: value.workflow as WorkflowRecord,
    steps: Array.isArray(value.steps) ? value.steps as WorkflowStepRecord[] : [],
    events: Array.isArray(value.events) ? value.events as WorkflowEventRecord[] : [],
    assets: Array.isArray(value.assets) ? value.assets as WorkflowAssetRecord[] : [],
    validation: isPlainObject(value.validation) ? value.validation as PlanValidationResult : undefined,
    costEstimate: isPlainObject(value.costEstimate) ? value.costEstimate as WorkflowCostEstimate : undefined,
    plan: isPlainObject(value.plan) ? value.plan as WorkflowPlan : undefined,
  };
}

function markWorkflowStatus(payload: WorkflowClientPayload, status: WorkflowStatus): WorkflowClientPayload {
  return {
    ...payload,
    workflow: {
      ...payload.workflow,
      status,
      updated_at: new Date().toISOString(),
    },
  };
}

function pollWorkflow(
  get: () => Store,
  set: (fn: (s: Store) => Partial<Store>) => void,
  messageId: string,
  convId: string,
  workflowId: string
) {
  const timerKey = `workflow:${workflowId}`;
  const previous = get().pollTimers.get(timerKey);
  if (previous) clearInterval(previous);

  const tick = async () => {
    try {
      const res = await fetch(`/api/agent/workflows/${workflowId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "读取 workflow 状态失败");
      const payload = normalizeWorkflowPayload(data);
      if (!payload) return;
      const terminal = isTerminalWorkflowStatus(payload.workflow.status);

      set((s) => ({
        isSending: terminal ? false : s.isSending,
        messages: s.messages.map((m) =>
          m.id === messageId
            ? { ...m, params: { ...(m.params || {}), workflow: payload } }
            : m
        ),
      }));

      const currentParams = get().messages.find((m) => m.id === messageId)?.params || {};
      updateMessageParams(convId, messageId, { ...currentParams, workflow: payload });

      if (terminal) {
        const currentTimer = get().pollTimers.get(timerKey);
        if (currentTimer) clearInterval(currentTimer);
        set((s) => {
          const timers = new Map(s.pollTimers);
          timers.delete(timerKey);
          return { pollTimers: timers };
        });
      }
    } catch {
      set((s) => ({ isSending: false }));
    }
  };

  const timer = setInterval(tick, 2500);
  set((s) => {
    const timers = new Map(s.pollTimers);
    timers.set(timerKey, timer);
    return { pollTimers: timers };
  });
  void tick();
}

async function mutateWorkflowFromMessage(
  get: () => Store,
  set: (fn: (s: Store) => Partial<Store>) => void,
  messageId: string,
  actionPath: string,
  options: { poll: boolean; body?: Record<string, unknown> }
) {
  const msg = get().messages.find((m) => m.id === messageId);
  const payload = getWorkflowPayload(msg?.params);
  const workflowId = payload?.workflow.id;
  if (!msg || !payload || !workflowId) return;

  set((s) => ({ isSending: options.poll ? true : s.isSending }));
  try {
    const res = await fetch(`/api/agent/workflows/${workflowId}/${actionPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options.body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "workflow 操作失败");
    const nextPayload = normalizeWorkflowPayload(data);
    if (!nextPayload) return;
    set((s) => ({
      isSending: isTerminalWorkflowStatus(nextPayload.workflow.status) ? false : s.isSending,
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, params: { ...(m.params || {}), workflow: nextPayload } }
          : m
      ),
    }));
    updateMessageParams(msg.conversation_id, messageId, { ...(msg.params || {}), workflow: nextPayload });
    if (options.poll && !isTerminalWorkflowStatus(nextPayload.workflow.status)) {
      pollWorkflow(get, set, messageId, msg.conversation_id, workflowId);
    }
  } catch (err) {
    const failedPayload = {
      ...payload,
      workflow: {
        ...payload.workflow,
        error_message: err instanceof Error ? err.message : "workflow 操作失败",
      },
    };
    set((s) => ({
      isSending: false,
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, params: { ...(m.params || {}), workflow: failedPayload } }
          : m
      ),
    }));
    updateMessageParams(msg.conversation_id, messageId, { ...(msg.params || {}), workflow: failedPayload });
  }
}

function isTerminalWorkflowStatus(status: WorkflowStatus | string) {
  return ["completed", "partially_completed", "failed", "cancelled"].includes(status);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

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
  let attempts = 0;

  const timer = setInterval(async () => {
    try {
      attempts++;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const status = data.status as string;
      const resultUrls: string[] = Array.isArray(data.result_urls) ? data.result_urls : [];
      const progress = resultUrls.length > 0 ? 100 : getPollingProgress(status, attempts);
      const done = status === "completed" || resultUrls.length > 0;
      const failed = status === "failed";

      if (done || failed) {
        clearInterval(timer);
        console.log("[agent-store] pollGeneration completed:", { aiMsgId, done, failed, resultCount: resultUrls.length });
        let verifiedResultUrls: string[] = [];
        let finalFailed = failed;
        let finalError = failed ? (data.error || "生成失败") : undefined;

        if (!failed) {
          try {
            verifiedResultUrls = await verifyGeneratedResultUrls(resultUrls);
          } catch (err) {
            finalFailed = true;
            finalError = err instanceof Error ? err.message : "结果图片不可用";
          }
        }

        const finalGeneration = {
          status: finalFailed ? ("failed" as const) : ("completed" as const),
          progress: 100,
          resultUrls: verifiedResultUrls,
          error: finalError,
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

        // 持久化 generation 状态到 DB（用消息自带的 convId，不依赖 activeId）
        const msgConvId = get().messages.find((m) => m.id === aiMsgId)?.conversation_id || get().activeId || "";
        updateMessageGeneration(msgConvId, aiMsgId, {
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

function startRequestProgress(
  set: (fn: (s: Store) => Partial<Store>) => void,
  aiMsgId: string
) {
  return setInterval(() => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== aiMsgId || !m.generation || m.generation.status !== "generating") return m;
        const current = typeof m.generation.progress === "number" ? m.generation.progress : 5;
        const eased = Math.ceil(current + Math.max(1, (90 - current) * 0.08));
        return {
          ...m,
          generation: {
            ...m.generation,
            progress: Math.min(eased, 90),
          },
        };
      }),
    }));
  }, 1500);
}

function getPollingProgress(status: string, attempts: number) {
  if (status === "processing_face_swap") return Math.min(70 + attempts, 92);
  if (status === "processing_tryon") return Math.min(25 + attempts * 1.5, 90);
  if (status === "queued") return Math.min(20 + attempts, 35);
  if (status === "uploading") return Math.min(10 + attempts, 25);
  return Math.min(25 + attempts * 1.5, 90);
}

function readConfirmParams(params: Record<string, unknown>): GenerationParams {
  const model = String(params.model || params.ai_model || DEFAULT_PARAMS.model) as LingyaModel;
  const aspectRatio = String(params.aspectRatio || params.aspect_ratio || DEFAULT_PARAMS.aspectRatio) as AspectRatio;
  const imageSize = String(params.imageSize || params.image_size || DEFAULT_PARAMS.imageSize) as ImageSize;
  const count = Number(params.count || params.gen_count || DEFAULT_PARAMS.count);
  const prompt = typeof params.prompt === "string" ? params.prompt : "";
  return {
    model,
    aspectRatio,
    imageSize,
    count: Math.min(Math.max(count || 1, 1), 4),
    prompt,
  };
}

function writeConfirmParams(params: Record<string, unknown>, next: GenerationParams): Record<string, unknown> {
  const output = { ...params };
  if ("model" in output || !("ai_model" in output)) output.model = next.model;
  if ("aspectRatio" in output || !("aspect_ratio" in output)) output.aspectRatio = next.aspectRatio;
  if ("imageSize" in output || !("image_size" in output)) output.imageSize = next.imageSize;
  if ("count" in output || !("gen_count" in output)) output.count = next.count;
  if ("ai_model" in output) output.ai_model = next.model;
  if ("aspect_ratio" in output) output.aspect_ratio = next.aspectRatio;
  if ("image_size" in output) output.image_size = next.imageSize;
  if ("gen_count" in output) output.gen_count = next.count;
  if (typeof next.prompt === "string") output.prompt = next.prompt;
  return output;
}

function writeConfirmPayloadParams(payload: Record<string, unknown>, next: GenerationParams): Record<string, unknown> {
  const output: Record<string, unknown> = {
    ...payload,
    aiModel: next.model,
    aspectRatio: next.aspectRatio,
    imageSize: next.imageSize,
    genCount: next.count,
  };
  if (typeof next.prompt === "string") output.prompt = next.prompt;
  return output;
}

function getRepairKind(module: string): RepairKind {
  if (module === "grass") return "grass";
  if (module === "pose") return "pose";
  if (module === "model") return "model";
  if (module === "garment_3d") return "garment3d";
  if (module === "model_background") return "modelBackground";
  if (module === "tryon") return "tryon";
  return "general";
}

function getLastAgentTaskContext(messages: Message[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const generation = messages[i].generation;
    const data = generation?._confirmData || generation?._lastRunData;
    if (!data?.module || !data.params) continue;
    return {
      module: data.module,
      label: generation?.module,
      params: data.params,
      prompt: typeof data.params.prompt === "string" ? data.params.prompt : "",
      taskBrief: data.taskBrief,
    };
  }
  return null;
}

function findPreviousUserImageMessageIndex(messages: Message[], beforeIndex: number): number {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user" && Array.isArray(message.images) && message.images.length > 0) {
      return i;
    }
  }
  return -1;
}

async function verifyGeneratedResultUrls(urls: unknown): Promise<string[]> {
  const list = Array.isArray(urls)
    ? urls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    : [];

  if (list.length === 0) {
    throw new Error("生成完成但没有返回结果图片");
  }

  if (typeof window === "undefined") return list;

  await Promise.all(list.map((url) => preloadImage(url)));
  return list;
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (url.startsWith("data:image/")) {
      resolve();
      return;
    }

    const img = new Image();
    const timer = window.setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error("结果图片加载超时，请重试生成"));
    }, 10_000);

    img.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("结果图片不可用，可能被拦截或转存失败"));
    };
    img.src = url;
  });
}

function uid() {
  return v4();
}

function runningAgentTimeline(activeLabel: string, detail: string) {
  const labels = ["接收请求", "理解意图", "选择工具", "复核计划"];
  return labels.map((label) => ({
    label,
    status: label === activeLabel ? "running" : labels.indexOf(label) < labels.indexOf(activeLabel) ? "done" : "pending",
    detail: label === activeLabel ? detail : getTimelineDetail(label),
  }));
}

function completeAgentTimeline(detail: string) {
  return [
    { label: "接收请求", status: "done", detail: "已拿到文字、图片和当前上下文" },
    { label: "理解意图", status: "done", detail: "已完成语义路由和图片关系判断" },
    { label: "选择工具", status: "done", detail: "已选择合适的生成或对话路径" },
    { label: "复核计划", status: "done", detail },
  ];
}

function getTimelineDetail(label: string) {
  const details: Record<string, string> = {
    接收请求: "已拿到文字、图片和当前上下文",
    理解意图: "正在判断是聊天、生成、工作流还是需要追问",
    选择工具: "根据目标和图片关系选择可执行能力",
    复核计划: "检查是否误判、是否需要确认或扣分",
  };
  return details[label] || "";
}

function findLatestAssistantMessageIndex(messages: Message[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return i;
  }
  return -1;
}

function readTimelineFromParams(params: Record<string, unknown> | undefined) {
  if (Array.isArray(params?.agentTimeline)) return params.agentTimeline as Array<{ label: string; status: string; detail?: string }>;
  return completeAgentTimeline("等待后端事件。");
}

function mergeTimelineWithBackendEvent(
  timeline: Array<{ label: string; status: string; detail?: string }>,
  event: Record<string, unknown>
) {
  const kind = typeof event.kind === "string" ? event.kind : "";
  const eventName = typeof event.event === "string" ? event.event : typeof event.type === "string" ? event.type : kind;
  const detail = getBackendEventDetail(event);
  if (kind === "brain_trace") {
    return completeAgentTimeline("后端已完成 Brain trace，可打开“过程”查看详情。");
  }
  if (kind === "workflow_event") {
    return timeline.map((item) =>
      item.label === "复核计划" ? { ...item, status: "running", detail: `后端工作流事件：${eventName} ${detail}`.trim() } : item
    );
  }
  if (kind === "agent_metric") {
    return timeline.map((item) =>
      item.label === "复核计划" ? { ...item, detail: `后端指标：${eventName} ${detail}`.trim() } : item
    );
  }
  return timeline;
}

function getBackendEventDetail(event: Record<string, unknown>) {
  if (typeof event.message === "string") return event.message;
  if (typeof event.module === "string") return event.module;
  if (typeof event.action === "string") return event.action;
  return "";
}
