export type ModuleKey =
  | "tryon"
  | "grass"
  | "model"
  | "pose"
  | "model_background"
  | "garment_3d";

// ---- 服装分析 ----
export interface GarmentAnalysis {
  imageUrl: string;
  fileName: string;
  category: string;     // "连衣裙" | "上装" | "下装" | "外套" | "连体衣"
  style: string;        // "甜美" | "简约" | "复古" | "运动" | "通勤"
  colors: string[];     // ["白色", "碎花"]
  season: string;       // "春夏" | "秋冬" | "四季"
  suggestion: string;   // AI 建议文案
  status: "pending" | "analyzing" | "done" | "error";
}

// ---- 推荐方案 ----
export interface RecommendedPlan {
  id: string;
  icon: string;           // lucide icon name
  title: string;          // "电商主图"
  description: string;    // "服装上身 · 3:4 · 电商白底"
  modules: ModuleKey[];   // 单模块或多步骤
  params: Record<string, unknown>;
  creditsPerItem: number;
  isRecommended: boolean;
  aiReason?: string;      // "碎花裙适合韩系街拍风格"
}

// ---- 生产任务 ----
export type TaskStepStatus = "pending" | "running" | "completed" | "failed";

export interface TaskStep {
  module: ModuleKey;
  label: string;
  status: TaskStepStatus;
  progress: number;
  generationId?: string;
  resultUrls: string[];
  error?: string;
}

export type ProductionTaskStatus = "pending" | "running" | "completed" | "failed";

export interface ProductionTask {
  id: string;
  garmentUrl: string;
  garmentName: string;
  garmentThumb: string;
  plan: RecommendedPlan;
  steps: TaskStep[];
  currentStep: number;
  status: ProductionTaskStatus;
}

// ---- Agent 视图状态 ----
export type AgentView = "empty" | "analyzing" | "plans" | "configuring" | "producing" | "results";
