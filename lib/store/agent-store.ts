"use client";

import { create } from "zustand";
import { v4 } from "./uuid";
import type { AgentImage, AgentMessage, AgentTask, ModuleKey } from "@/lib/agent/types";
import { getModuleInfo } from "@/lib/agent/intent-matcher";
import { uploadImage } from "@/lib/utils";

const MODULE_LABELS: Record<string, string> = {
  tryon: "服装上身",
  grass: "服装种草图",
  model: "专属模特",
  pose: "姿势裂变",
  model_background: "换背景/换模特",
  garment_3d: "服装 3D",
};

// API 路径映射
const MODULE_API: Record<string, string> = {
  tryon: "/api/tryon",
  grass: "/api/grass",
  model: "/api/model",
  pose: "/api/pose",
  model_background: "/api/model-background",
  garment_3d: "/api/garment-3d",
};

type AgentStore = {
  messages: AgentMessage[];
  isProcessing: boolean;
  pendingImages: AgentImage[];
  activeTasks: Map<string, AgentTask>;
  pollTimers: Map<string, ReturnType<typeof setInterval>>;

  sendMessage: (text: string) => Promise<void>;
  attachImages: (files: File[]) => Promise<void>;
  removePendingImage: (index: number) => void;
  confirmTask: (messageId: string) => Promise<void>;
  retryTask: (taskId: string) => void;
  reset: () => void;
};

function uid(): string {
  return v4();
}

function startPolling(
  get: () => AgentStore,
  set: (fn: (s: AgentStore) => Partial<AgentStore>) => void,
  task: AgentTask
) {
  const pollUrl = `${MODULE_API[task.module] || `/api/${task.module}`}?generation_id=${task.generationId}`;

  const timer = setInterval(async () => {
    try {
      const res = await fetch(pollUrl);
      if (!res.ok) return;
      const data = await res.json();

      const status = data.status as string;
      const resultUrls: string[] = Array.isArray(data.result_urls) ? data.result_urls : [];

      const STATUS_PROGRESS: Record<string, number> = {
        uploading: 10,
        queued: 20,
        processing_tryon: 50,
        processing_face_swap: 70,
      };
      const progress = resultUrls.length > 0 ? 100 : (STATUS_PROGRESS[status] ?? 30);

      set((s) => {
        const updated = new Map(s.activeTasks);
        const existing = updated.get(task.id);
        if (!existing) return { activeTasks: updated };

        if (status === "completed" || resultUrls.length > 0) {
          existing.status = "completed";
          existing.progress = 100;
          existing.resultUrls = resultUrls;
          updated.set(task.id, { ...existing });

          const messages = s.messages.map((m) =>
            m.task?.id === task.id ? { ...m, task: { ...existing } } : m
          );

          const timers = new Map(s.pollTimers);
          const t = timers.get(task.id);
          if (t) clearInterval(t);
          timers.delete(task.id);

          return { activeTasks: updated, messages, pollTimers: timers };
        }

        if (status === "failed") {
          existing.status = "failed";
          existing.error = data.error || data.error_message || "生成失败";
          updated.set(task.id, { ...existing });

          const messages = s.messages.map((m) =>
            m.task?.id === task.id ? { ...m, task: { ...existing } } : m
          );

          const timers = new Map(s.pollTimers);
          const t = timers.get(task.id);
          if (t) clearInterval(t);
          timers.delete(task.id);

          return { activeTasks: updated, messages, pollTimers: timers };
        }

        existing.progress = progress;
        existing.status = "polling";
        updated.set(task.id, { ...existing });

        const messages = s.messages.map((m) =>
          m.task?.id === task.id ? { ...m, task: { ...existing } } : m
        );

        return { activeTasks: updated, messages };
      });
    } catch {
      // ignore poll errors
    }
  }, 2000);

  set((s) => {
    const timers = new Map(s.pollTimers);
    timers.set(task.id, timer);
    return { pollTimers: timers };
  });
}

async function executeTask(
  get: () => AgentStore,
  set: (fn: (s: AgentStore) => Partial<AgentStore>) => void,
  task: AgentTask
) {
  const apiPath = MODULE_API[task.module] || `/api/${task.module}`;

  set((s) => {
    const updated = new Map(s.activeTasks);
    task.status = "calling_api";
    task.progress = 5;
    updated.set(task.id, { ...task });
    const messages = s.messages.map((m) =>
      m.task?.id === task.id ? { ...m, task: { ...task } } : m
    );
    return { activeTasks: updated, messages };
  });

  try {
    const res = await fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task.params),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    task.generationId = data.generation_id;
    task.creditsCost = data.credits_cost ?? 0;
    task.status = "polling";
    task.progress = 10;

    set((s) => {
      const updated = new Map(s.activeTasks);
      updated.set(task.id, { ...task });
      const messages = s.messages.map((m) =>
        m.task?.id === task.id ? { ...m, task: { ...task } } : m
      );
      return { activeTasks: updated, messages };
    });

    startPolling(get, set, task);
  } catch (err) {
    task.status = "failed";
    task.error = err instanceof Error ? err.message : "请求失败";

    set((s) => {
      const updated = new Map(s.activeTasks);
      updated.set(task.id, { ...task });
      const messages = s.messages.map((m) =>
        m.task?.id === task.id ? { ...m, task: { ...task } } : m
      );
      return { activeTasks: updated, messages, isProcessing: false };
    });
  }
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  messages: [],
  isProcessing: false,
  pendingImages: [],
  activeTasks: new Map(),
  pollTimers: new Map(),

  sendMessage: async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed && get().pendingImages.length === 0) return;

    const userImages = [...get().pendingImages];

    // Add user message
    const userMsg: AgentMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      images: userImages.length > 0 ? userImages : undefined,
      timestamp: Date.now(),
    };
    set((s) => ({
      messages: [...s.messages, userMsg],
      pendingImages: [],
      isProcessing: true,
    }));

    try {
      // Build conversation history for LLM
      const history = get().messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-12)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.task
            ? `${m.content}\n[执行了 ${MODULE_LABELS[m.task.module] || m.task.module} 任务]`
            : m.content,
        }));

      // Call LLM-powered agent API
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          imageUrls: userImages.map((img) => img.url).filter(Boolean),
          history,
        }),
      });

      if (!res.ok) {
        throw new Error(`API error ${res.status}`);
      }

      const data = await res.json();
      const { reply, intent, params: llmParams, missing, confidence } = data;

      // If LLM identified an intent with high confidence
      if (intent && confidence >= 0.5) {
        const moduleInfo = getModuleInfo(intent as ModuleKey);

        if (moduleInfo) {
          // Merge LLM params with uploaded images
          const mergedParams: Record<string, unknown> = { ...moduleInfo.defaultParams, ...llmParams };

          // Auto-fill image slots from uploaded images
          const primarySlot = moduleInfo.requiredImages[0];
          if (userImages.length > 0 && primarySlot) {
            if (primarySlot.max > 1 && !mergedParams[primarySlot.key]) {
              mergedParams[primarySlot.key] = userImages.map((img) => img.url).filter(Boolean);
            } else if (!mergedParams[primarySlot.key]) {
              mergedParams[primarySlot.key] = userImages[0].url;
            }
          }

          // Check if all required images are present
          const hasAllRequired = moduleInfo.requiredImages
            .filter((s) => s.min > 0)
            .every((s) => {
              const val = mergedParams[s.key];
              if (Array.isArray(val)) return val.length >= s.min;
              return !!val;
            });

          if (hasAllRequired) {
            // All info ready → show confirm card
            const task: AgentTask = {
              id: uid(),
              module: intent as ModuleKey,
              label: moduleInfo.label,
              params: mergedParams,
              status: "pending",
              progress: 0,
              resultUrls: [],
              error: null,
              creditsCost: 0,
            };

            const assistantMsg: AgentMessage = {
              id: uid(),
              role: "assistant",
              content: reply || `好的，我来帮你做**${moduleInfo.label}**。`,
              task,
              timestamp: Date.now(),
            };

            set((s) => {
              const updated = new Map(s.activeTasks);
              updated.set(task.id, task);
              return {
                messages: [...s.messages, assistantMsg],
                activeTasks: updated,
                isProcessing: false,
              };
            });
            return;
          }
        }
      }

      // Otherwise show LLM's conversational reply
      const assistantMsg: AgentMessage = {
        id: uid(),
        role: "assistant",
        content: reply || "我不太理解你的意思，请再描述一下。",
        timestamp: Date.now(),
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isProcessing: false,
      }));
    } catch (err) {
      // Fallback: show error message
      const errorMsg: AgentMessage = {
        id: uid(),
        role: "assistant",
        content: "AI 服务暂时不可用，请稍后重试。",
        timestamp: Date.now(),
      };

      set((s) => ({
        messages: [...s.messages, errorMsg],
        isProcessing: false,
      }));
    }
  },

  attachImages: async (files: File[]) => {
    for (const file of files) {
      const preview = URL.createObjectURL(file);
      const img: AgentImage = { url: "", preview, fileName: file.name, uploading: true };

      set((s) => ({ pendingImages: [...s.pendingImages, img] }));

      try {
        const result = await uploadImage(file);
        set((s) => ({
          pendingImages: s.pendingImages.map((p) =>
            p.preview === preview ? { ...p, url: result.url, uploading: false } : p
          ),
        }));
      } catch {
        set((s) => ({
          pendingImages: s.pendingImages.filter((p) => p.preview !== preview),
        }));
      }
    }
  },

  removePendingImage: (index: number) => {
    set((s) => {
      const removed = s.pendingImages[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return { pendingImages: s.pendingImages.filter((_, i) => i !== index) };
    });
  },

  confirmTask: async (messageId: string) => {
    const msg = get().messages.find((m) => m.id === messageId);
    if (!msg?.task || msg.task.status !== "pending") return;

    set({ isProcessing: true });
    await executeTask(get, set, msg.task);
    set({ isProcessing: false });
  },

  retryTask: (taskId: string) => {
    const task = get().activeTasks.get(taskId);
    if (!task) return;
    task.status = "pending";
    task.progress = 0;
    task.error = null;
    task.resultUrls = [];
    task.generationId = undefined;
    executeTask(get, set, task);
  },

  reset: () => {
    const timers = get().pollTimers;
    timers.forEach((t) => clearInterval(t));
    get().pendingImages.forEach((img) => {
      if (img.preview) URL.revokeObjectURL(img.preview);
    });
    set({
      messages: [],
      isProcessing: false,
      pendingImages: [],
      activeTasks: new Map(),
      pollTimers: new Map(),
    });
  },
}));
