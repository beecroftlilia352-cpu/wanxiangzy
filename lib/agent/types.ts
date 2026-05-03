import type { LingyaModel, AspectRatio, ImageSize } from "@/lib/api/lingya";

// ---- 会话 ----
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// ---- 消息 ----
export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  images?: ChatImage[];
  generation?: GenerationResult;
  timestamp: number;
}

// ---- 图片（带编号） ----
export interface ChatImage {
  index: number;        // 1-based: 图1, 图2...
  url: string;          // blob preview 或 hosted URL
  hostedUrl?: string;   // imgbb URL
  fileName: string;
  uploading?: boolean;
}

// ---- 生成结果 ----
export type GenerationStatus = "pending" | "generating" | "completed" | "failed";

export interface GenerationResult {
  status: GenerationStatus;
  progress: number;
  resultUrls: string[];
  error?: string;
  generationId?: string;
  creditsUsed?: number;
  module?: string;
}

// ---- 生成参数 ----
export interface GenerationParams {
  model: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  count: number;
}

export const DEFAULT_PARAMS: GenerationParams = {
  model: "gpt-image-2",
  aspectRatio: "3:4",
  imageSize: "1K",
  count: 1,
};

// ---- 模块类型（复用） ----
export type ModuleKey =
  | "tryon"
  | "grass"
  | "model"
  | "pose"
  | "model_background"
  | "garment_3d";
