import type { LingyaModel, AspectRatio, ImageSize } from "@/lib/api/lingya";

export type AgentMode = "chat" | "agent";
export type AgentIntentMode = "chat" | "smart" | "create";
export type ChatImageRole = "auto" | "clothing" | "reference" | "face" | "background" | "source";

// ---- 数据库模型 ----
export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  mode: AgentMode;
  images: ChatImage[];
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  images: ChatImage[];
  generation: GenerationResult | null;
  taskPlan?: TaskPlan;
  params: Record<string, unknown>;
  mode: AgentMode;
  created_at: string;
  streamingDone?: boolean;
}

// ---- 前端模型 ----
export interface ChatImage {
  index: number;
  url: string;
  hostedUrl?: string;
  fileName: string;
  role?: ChatImageRole;
  uploading?: boolean;
}

export type GenerationStatus = "pending" | "generating" | "completed" | "failed";

export interface AgentTaskBrief {
  outputType: string;
  goal: string;
  imageUsage: string;
  focus: string;
  check: string;
}

export interface GenerationResult {
  status: GenerationStatus;
  progress: number;
  resultUrls: string[];
  error?: string;
  generationId?: string;
  creditsUsed?: number;
  module?: string;
  // 待确认的生图参数（用户确认后才执行）
  _confirmData?: {
    apiPath: string;
    module: string;
    params: Record<string, unknown>;
    jobPayload: Record<string, unknown>;
    creditsCost: number;
    taskBrief?: AgentTaskBrief;
  };
  _lastRunData?: {
    apiPath: string;
    module: string;
    params: Record<string, unknown>;
    jobPayload: Record<string, unknown>;
    creditsCost: number;
    taskBrief?: AgentTaskBrief;
  };
}

export interface GenerationParams {
  model: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  count: number;
  prompt?: string;
}

export const DEFAULT_PARAMS: GenerationParams = {
  model: "gpt-image-2",
  aspectRatio: "3:4",
  imageSize: "1K",
  count: 1,
};

// ---- 任务计划 ----
export type PlanStepStatus = "pending" | "running" | "completed" | "failed";

export interface PlanStep {
  id: string;
  tool: string;
  label: string;
  description: string;
  params: Record<string, unknown>;
  depends_on: string[];
  status: PlanStepStatus;
  result?: { text?: string; images?: string[] };
}

export interface TaskPlan {
  title: string;
  steps: PlanStep[];
  status: "planning" | "executing" | "completed" | "failed";
}

// ---- @ 引用 ----
export interface MentionRef {
  imageIndex: number;
  startPos: number;
  endPos: number;
}
