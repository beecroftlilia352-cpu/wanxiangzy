"use client";

import { create } from "zustand";
import { v4 } from "./uuid";
import type { AgentImage, AgentMessage, AgentTask, ModuleKey } from "@/lib/agent/types";
import { matchIntent, getModuleInfo } from "@/lib/agent/intent-matcher";
import { uploadImage } from "@/lib/utils";

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

function addMessage(
  set: (fn: (s: AgentStore) => Partial<AgentStore>) => void,
  msg: AgentMessage
) {
  set((s) => ({ messages: [...s.messages, msg] }));
}

function startPolling(
  get: () => AgentStore,
  set: (fn: (s: AgentStore) => Partial<AgentStore>) => void,
  task: AgentTask
) {
  const moduleInfo = getModuleInfo(task.module);
  const pollUrl = `/api/${task.module === "model_background" ? "model-background" : task.module}?generation_id=${task.generationId}`;

  const timer = setInterval(async () => {
    try {
      const res = await fetch(pollUrl);
      if (!res.ok) return;
      const data = await res.json();

      const status = data.status as string;
      const resultUrls: string[] = Array.isArray(data.result_urls) ? data.result_urls : [];

      // API 返回 status 字符串，映射为进度百分比
      const STATUS_PROGRESS: Record<string, number> = {
        uploading: 10,
        queued: 20,
        processing_tryon: 50,
        processing_face_swap: 70,
      };
      const progress = resultUrls.length > 0
        ? 100
        : STATUS_PROGRESS[status] ?? 30;

      set((s) => {
        const updated = new Map(s.activeTasks);
        const existing = updated.get(task.id);
        if (!existing) return { activeTasks: updated };

        if (status === "completed" || resultUrls.length > 0) {
          existing.status = "completed";
          existing.progress = 100;
          existing.resultUrls = resultUrls;
          updated.set(task.id, { ...existing });

          // Update the message that contains this task
          const messages = s.messages.map((m) =>
            m.task?.id === task.id ? { ...m, task: { ...existing } } : m
          );

          // Stop polling
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
      // ignore poll errors, will retry
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
  const apiPath = task.module === "model_background"
    ? "/api/model-background"
    : `/api/${task.module}`;

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

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

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

    // Match intent
    const intent = matchIntent(trimmed);

    if (intent.intent === "unknown") {
      const assistantMsg: AgentMessage = {
        id: uid(),
        role: "assistant",
        content: intent.clarification || "我不太理解你的意思，请描述一下你想做什么。",
        timestamp: Date.now(),
      };
      set((s) => ({ messages: [...s.messages, assistantMsg], isProcessing: false }));
      return;
    }

    const moduleInfo = getModuleInfo(intent.intent);
    if (!moduleInfo) return;

    // Build params with uploaded images
    const params: Record<string, unknown> = { ...intent.params };
    const primarySlot = moduleInfo.requiredImages[0];

    if (userImages.length > 0 && primarySlot) {
      if (primarySlot.max > 1) {
        params[primarySlot.key] = userImages.map((img) => img.url);
      } else {
        params[primarySlot.key] = userImages[0].url;
      }
    }

    // Check if we have required images
    const hasRequiredImages = moduleInfo.requiredImages
      .filter((s) => s.min > 0)
      .every((s) => {
        const val = params[s.key];
        if (Array.isArray(val)) return val.length >= s.min;
        return !!val;
      });

    if (!hasRequiredImages) {
      const missingSlots = moduleInfo.requiredImages.filter((s) => s.min > 0);
      const askMsg: AgentMessage = {
        id: uid(),
        role: "assistant",
        content: `好的，我来帮你做**${moduleInfo.label}**。\n\n请上传以下图片：\n${missingSlots.map((s) => `• ${s.label}`).join("\n")}`,
        timestamp: Date.now(),
      };
      // Store pending intent for when user uploads images
      set((s) => ({
        messages: [...s.messages, askMsg],
        isProcessing: false,
        _pendingIntent: intent,
      } as Partial<AgentStore>));
      return;
    }

    // Show confirm card
    const confirmTask: AgentTask = {
      id: uid(),
      module: intent.intent,
      label: moduleInfo.label,
      params,
      status: "pending",
      progress: 0,
      resultUrls: [],
      error: null,
      creditsCost: 0,
    };

    const confirmMsg: AgentMessage = {
      id: uid(),
      role: "assistant",
      content: `我识别到你想做**${moduleInfo.label}**，参数如下：`,
      task: confirmTask,
      timestamp: Date.now(),
    };

    set((s) => {
      const updated = new Map(s.activeTasks);
      updated.set(confirmTask.id, confirmTask);
      return {
        messages: [...s.messages, confirmMsg],
        activeTasks: updated,
        isProcessing: false,
      };
    });
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
            p.preview === preview
              ? { ...p, url: result.url, uploading: false }
              : p
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
