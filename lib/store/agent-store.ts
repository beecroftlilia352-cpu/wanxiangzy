"use client";

import { create } from "zustand";
import { v4 } from "./uuid";
import type {
  AgentView,
  GarmentAnalysis,
  ProductionTask,
  RecommendedPlan,
  TaskStep,
} from "@/lib/agent/types";
import { analyzeGarment } from "@/lib/agent/garment-analyzer";
import { generateRecommendations } from "@/lib/agent/recommendation-engine";
import { uploadImage } from "@/lib/utils";

const MODULE_API: Record<string, string> = {
  tryon: "/api/tryon",
  grass: "/api/grass",
  model: "/api/model",
  pose: "/api/pose",
  model_background: "/api/model-background",
  garment_3d: "/api/garment-3d",
};

const MODULE_LABELS: Record<string, string> = {
  tryon: "服装上身",
  grass: "种草图",
  model: "专属模特",
  pose: "姿势裂变",
  model_background: "换背景",
  garment_3d: "3D 展示",
};

type AgentStore = {
  // 视图状态
  view: AgentView;
  // 服装数据
  garments: GarmentAnalysis[];
  garmentUrls: Map<string, string>; // local preview → hosted URL
  recommendations: RecommendedPlan[];
  selectedPlan: RecommendedPlan | null;
  // 生产数据
  tasks: ProductionTask[];
  pollTimers: Map<string, ReturnType<typeof setInterval>>;
  // 计算属性
  completedCount: number;
  totalImages: number;
  overallProgress: number;
  totalCredits: number;

  // Actions
  addGarments: (files: File[]) => Promise<void>;
  removeGarment: (index: number) => void;
  selectPlan: (plan: RecommendedPlan) => void;
  startProduction: () => Promise<void>;
  retryTask: (taskId: string) => void;
  reset: () => void;
};

function uid(): string {
  return v4();
}

function computeCompletedCount(tasks: ProductionTask[]): number {
  return tasks.filter((t) => t.status === "completed").length;
}

function computeTotalImages(tasks: ProductionTask[]): number {
  return tasks.reduce((sum, t) => sum + t.steps.reduce((s, step) => s + step.resultUrls.length, 0), 0);
}

function computeOverallProgress(tasks: ProductionTask[]): number {
  if (tasks.length === 0) return 0;
  const total = tasks.reduce((sum, t) => {
    if (t.status === "completed") return sum + 100;
    if (t.status === "failed") return sum + 0;
    const stepProgress = t.steps.reduce((s, step) => {
      if (step.status === "completed") return s + 100;
      if (step.status === "running") return s + step.progress;
      return s;
    }, 0);
    return sum + (t.steps.length > 0 ? stepProgress / t.steps.length : 0);
  }, 0);
  return Math.round(total / tasks.length);
}

function buildSteps(plan: RecommendedPlan, garmentUrl: string): TaskStep[] {
  return plan.modules.map((module) => ({
    module,
    label: MODULE_LABELS[module] || module,
    status: "pending" as const,
    progress: 0,
    resultUrls: [],
  }));
}

function buildParams(plan: RecommendedPlan, garmentUrl: string): Record<string, unknown> {
  const firstModule = plan.modules[0];
  const params: Record<string, unknown> = { ...plan.params };

  // 根据模块设置图片参数
  if (firstModule === "tryon") {
    params.clothing_urls = [garmentUrl];
  } else if (firstModule === "grass" || firstModule === "garment_3d") {
    params.garment_url = garmentUrl;
  } else if (firstModule === "pose") {
    params.main_image_url = garmentUrl;
  } else if (firstModule === "model_background") {
    params.source_url = garmentUrl;
  } else if (firstModule === "model") {
    params.reference_urls = [garmentUrl];
  }

  return params;
}

function startPolling(
  get: () => AgentStore,
  set: (fn: (s: AgentStore) => Partial<AgentStore>) => void,
  taskId: string,
  stepIndex: number,
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

      set((s) => {
        const tasks = s.tasks.map((t) => {
          if (t.id !== taskId) return t;
          const steps = t.steps.map((step, i) => {
            if (i !== stepIndex) return step;
            if (status === "completed" || resultUrls.length > 0) {
              return { ...step, status: "completed" as const, progress: 100, resultUrls };
            }
            if (status === "failed") {
              return { ...step, status: "failed" as const, error: data.error || "生成失败" };
            }
            return { ...step, status: "running" as const, progress };
          });

          const allDone = steps.every((s) => s.status === "completed");
          const anyFailed = steps.some((s) => s.status === "failed");
          const taskStatus = allDone ? "completed" as const : anyFailed ? "failed" as const : "running" as const;

          return { ...t, steps, status: taskStatus, currentStep: stepIndex };
        });

        // 如果当前步骤完成且有下一步，执行下一步
        const task = tasks.find((t) => t.id === taskId);
        const currentStepDone = task?.steps[stepIndex]?.status === "completed";
        const nextStepIndex = stepIndex + 1;
        const hasNextStep = task && nextStepIndex < task.steps.length;

        if (currentStepDone && hasNextStep && resultUrls.length > 0) {
          // 停止当前轮询
          const timers = new Map(s.pollTimers);
          const t = timers.get(`${taskId}-${stepIndex}`);
          if (t) clearInterval(t);
          timers.delete(`${taskId}-${stepIndex}`);

          // 启动下一步（延迟执行，不在 set 内触发）
          setTimeout(() => {
            executeStep(get, set, taskId, nextStepIndex);
          }, 500);

          return { tasks, pollTimers: timers, ...computeDerived(tasks) };
        }

        // 如果任务完成或失败，停止轮询
        if (task?.status === "completed" || task?.status === "failed") {
          const timers = new Map(s.pollTimers);
          const t = timers.get(`${taskId}-${stepIndex}`);
          if (t) clearInterval(t);
          timers.delete(`${taskId}-${stepIndex}`);
          return { tasks, pollTimers: timers, ...computeDerived(tasks) };
        }

        return { tasks, ...computeDerived(tasks) };
      });
    } catch {
      // ignore
    }
  }, 2000);

  set((s) => {
    const timers = new Map(s.pollTimers);
    timers.set(`${taskId}-${stepIndex}`, timer);
    return { pollTimers: timers };
  });
}

async function executeStep(
  get: () => AgentStore,
  set: (fn: (s: AgentStore) => Partial<AgentStore>) => void,
  taskId: string,
  stepIndex: number
) {
  const task = get().tasks.find((t) => t.id === taskId);
  if (!task || stepIndex >= task.steps.length) return;

  const step = task.steps[stepIndex];
  const module = step.module;
  const apiPath = MODULE_API[module] || `/api/${module}`;
  const params = buildParams(task.plan, task.garmentUrl);

  // 更新步骤状态为 running
  set((s) => ({
    tasks: s.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            status: "running" as const,
            steps: t.steps.map((step, i) =>
              i === stepIndex ? { ...step, status: "running" as const, progress: 5 } : step
            ),
          }
        : t
    ),
  }));

  try {
    const res = await fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const generationId = data.generation_id;

    // 更新 generationId
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              steps: t.steps.map((step, i) =>
                i === stepIndex ? { ...step, generationId } : step
              ),
            }
          : t
      ),
    }));

    // 开始轮询
    startPolling(get, set, taskId, stepIndex, generationId, module);
  } catch (err) {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: "failed" as const,
              steps: t.steps.map((step, i) =>
                i === stepIndex
                  ? { ...step, status: "failed" as const, error: err instanceof Error ? err.message : "请求失败" }
                  : step
              ),
            }
          : t
      ),
    }));
  }
}

function computeDerived(tasks: ProductionTask[]) {
  return {
    completedCount: computeCompletedCount(tasks),
    totalImages: computeTotalImages(tasks),
    overallProgress: computeOverallProgress(tasks),
  };
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  view: "empty",
  garments: [],
  garmentUrls: new Map(),
  recommendations: [],
  selectedPlan: null,
  tasks: [],
  pollTimers: new Map(),
  completedCount: 0,
  totalImages: 0,
  overallProgress: 0,
  totalCredits: 0,

  addGarments: async (files: File[]) => {
    // 1. 先显示占位（analyzing 状态）
    const placeholders: GarmentAnalysis[] = files.map((file) => ({
      imageUrl: URL.createObjectURL(file),
      fileName: file.name,
      category: "服装",
      style: "",
      colors: [],
      season: "",
      suggestion: "",
      status: "analyzing" as const,
    }));

    set((s) => ({
      view: "analyzing",
      garments: [...s.garments, ...placeholders],
    }));

    // 2. 逐个上传 + 分析
    for (let i = 0; i < files.length; i++) {
      const placeholder = placeholders[i];

      try {
        // 上传到 imgbb
        const uploadResult = await uploadImage(files[i]);
        const hostedUrl = uploadResult.url;

        // 更新 URL 映射
        set((s) => {
          const urls = new Map(s.garmentUrls);
          urls.set(placeholder.imageUrl, hostedUrl);
          return { garmentUrls: urls };
        });

        // AI 分析
        const analysis = await analyzeGarment(hostedUrl, files[i].name);

        set((s) => ({
          garments: s.garments.map((g) =>
            g.imageUrl === placeholder.imageUrl
              ? { ...analysis, imageUrl: placeholder.imageUrl, status: "done" as const }
              : g
          ),
        }));
      } catch {
        set((s) => ({
          garments: s.garments.map((g) =>
            g.imageUrl === placeholder.imageUrl
              ? { ...g, status: "error" as const }
              : g
          ),
        }));
      }
    }

    // 3. 生成推荐方案（基于第一张图的分析结果）
    set((s) => {
      const firstAnalysis = s.garments.find((g) => g.status === "done");
      const recs = firstAnalysis ? generateRecommendations(firstAnalysis) : [];
      const totalCredits = recs.length > 0 ? recs[0].creditsPerItem * s.garments.length : 0;
      return {
        view: s.garments.length > 0 ? "plans" : "empty",
        recommendations: recs,
        selectedPlan: recs.find((r) => r.isRecommended) || recs[0] || null,
        totalCredits,
      };
    });
  },

  removeGarment: (index: number) => {
    set((s) => {
      const removed = s.garments[index];
      if (removed?.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(removed.imageUrl);
      const garments = s.garments.filter((_, i) => i !== index);
      const totalCredits = s.selectedPlan ? s.selectedPlan.creditsPerItem * garments.length : 0;
      return {
        garments,
        totalCredits,
        view: garments.length === 0 ? "empty" : s.view,
      };
    });
  },

  selectPlan: (plan: RecommendedPlan) => {
    set((s) => ({
      selectedPlan: plan,
      totalCredits: plan.creditsPerItem * s.garments.length,
    }));
  },

  startProduction: async () => {
    const { garments, selectedPlan, garmentUrls } = get();
    if (!selectedPlan || garments.length === 0) return;

    // 创建生产任务
    const tasks: ProductionTask[] = garments
      .filter((g) => g.status === "done")
      .map((g) => {
        const hostedUrl = garmentUrls.get(g.imageUrl) || g.imageUrl;
        return {
          id: uid(),
          garmentUrl: hostedUrl,
          garmentName: g.fileName,
          garmentThumb: g.imageUrl,
          plan: selectedPlan,
          steps: buildSteps(selectedPlan, hostedUrl),
          currentStep: 0,
          status: "pending" as const,
        };
      });

    set({
      tasks,
      view: "producing",
      ...computeDerived(tasks),
    });

    // 逐个执行第一个步骤
    for (const task of tasks) {
      await executeStep(get, set, task.id, 0);
    }
  },

  retryTask: (taskId: string) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;

    // 重置任务状态
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: "pending" as const,
              currentStep: 0,
              steps: t.steps.map((s) => ({
                ...s,
                status: "pending" as const,
                progress: 0,
                resultUrls: [],
                error: undefined,
                generationId: undefined,
              })),
            }
          : t
      ),
    }));

    // 重新执行
    executeStep(get, set, taskId, 0);
  },

  reset: () => {
    const timers = get().pollTimers;
    timers.forEach((t) => clearInterval(t));
    get().garments.forEach((g) => {
      if (g.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(g.imageUrl);
    });
    set({
      view: "empty",
      garments: [],
      garmentUrls: new Map(),
      recommendations: [],
      selectedPlan: null,
      tasks: [],
      pollTimers: new Map(),
      completedCount: 0,
      totalImages: 0,
      overallProgress: 0,
      totalCredits: 0,
    });
  },
}));
