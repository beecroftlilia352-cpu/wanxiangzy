import type { LingyaModel, AspectRatio, ImageSize } from "@/lib/api/lingya";

export type AgentMode = "chat" | "agent";

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
  params: Record<string, unknown>;
  mode: AgentMode;
  created_at: string;
  streamingDone?: boolean;  // true when streaming is complete, ready for markdown render
}

// ---- 前端模型 ----
export interface ChatImage {
  index: number;
  url: string;
  hostedUrl?: string;
  fileName: string;
  uploading?: boolean;
}

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

// ---- @ 引用 ----
export interface MentionRef {
  imageIndex: number;
  startPos: number;
  endPos: number;
}
