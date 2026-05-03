export type ModuleKey =
  | "tryon"
  | "grass"
  | "model"
  | "pose"
  | "model_background"
  | "garment_3d";

export type MessageRole = "user" | "assistant" | "system";

export type TaskStatus =
  | "pending"
  | "uploading"
  | "calling_api"
  | "polling"
  | "completed"
  | "failed";

export interface AgentImage {
  url: string;
  preview: string;
  fileName: string;
  uploading?: boolean;
}

export interface AgentTask {
  id: string;
  module: ModuleKey;
  label: string;
  params: Record<string, unknown>;
  generationId?: string;
  status: TaskStatus;
  progress: number;
  resultUrls: string[];
  error: string | null;
  creditsCost: number;
}

export interface AgentMessage {
  id: string;
  role: MessageRole;
  content: string;
  images?: AgentImage[];
  task?: AgentTask;
  timestamp: number;
}

export interface IntentResult {
  intent: ModuleKey | "unknown";
  confidence: number;
  params: Record<string, unknown>;
  clarification?: string;
  missingFields?: string[];
}

export interface ImageSlot {
  key: string;
  label: string;
  min: number;
  max: number;
}

export interface IntentRule {
  patterns: RegExp[];
  intent: ModuleKey;
  label: string;
  icon: string;
  styleExtractors: Array<{ pattern: RegExp; value: string }>;
  requiredImages: ImageSlot[];
  defaultParams: Record<string, unknown>;
  costMultiplier: number;
}
