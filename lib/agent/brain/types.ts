import type { AgentImageInput } from "@/lib/agent/decision-utils";
import type { AgentIntentMode } from "@/lib/agent/types";
import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";

export type AgentBrainAction = "chat" | "generate" | "clarify";

export type AgentBrainModule =
  | "general"
  | "tryon"
  | "grass"
  | "garment_3d"
  | "model"
  | "model_background"
  | "pose"
  | "face_swap";

export type AgentBrainSource = "llm" | "deterministic" | "fallback";

export type BrainVisualTaskType =
  | "commerce_detail"
  | "commerce_creative"
  | "reference_redesign"
  | "text_to_image"
  | "image_to_image";

export type AgentBrainTraceEvent = {
  stage: string;
  status: "ok" | "warn" | "blocked" | "fallback" | "error";
  summary: string;
  data?: Record<string, unknown>;
  provider?: string;
  model?: string;
  latencyMs?: number;
};

export type AgentBrainTrace = {
  id: string;
  version: "agent-brain-v2";
  startedAt: string;
  finishedAt?: string;
  latencyMs?: number;
  events: AgentBrainTraceEvent[];
  final?: {
    action: AgentBrainAction;
    module: AgentBrainModule | null;
    confidence: number;
    source: AgentBrainSource;
  };
  flags?: Record<string, unknown>;
};

export type ImageUnderstandingItem = {
  index: number;
  role: "person" | "clothing" | "product" | "background" | "style" | "source" | "reference" | "face" | "unknown";
  roleConfidence: number;
  subject?: string;
  garment?: string;
  background?: string;
  styleTags: string[];
  risks: string[];
};

export type ImageUnderstandingResult = {
  summary: string;
  images: ImageUnderstandingItem[];
  confidence: number;
  source: AgentBrainSource;
};

export type BrainVisualTaskPlan = {
  module: "general";
  label: string;
  taskType: "commerce_detail" | "commerce_creative" | "reference_redesign";
  preferredAspectRatio?: AspectRatio;
  prompt: string;
  useImages: boolean;
  confidence: number;
};

export type AgentBrainDecision = {
  action: AgentBrainAction;
  reply: string;
  module: AgentBrainModule | null;
  params: Record<string, unknown>;
  style: string | null;
  confidence: number;
  missingFields: string[];
  source: AgentBrainSource;
  visualTaskPlan: BrainVisualTaskPlan | null;
  imageUnderstanding: ImageUnderstandingResult | null;
  safety: {
    allowed: boolean;
    requiresClarification: boolean;
    reasons: string[];
    blockedModules: string[];
  };
  trace: AgentBrainTrace;
};

export type AgentBrainRequest = {
  userId?: string;
  conversationId?: string | null;
  userText: string;
  images: AgentImageInput[];
  history?: Array<{ role: string; content: string }>;
  intentMode: AgentIntentMode;
  params?: {
    model?: string;
    aspectRatio?: string;
    imageSize?: string;
    count?: number;
  };
  userPreferences?: Record<string, unknown> | null;
  projectKnowledge?: Array<Record<string, unknown>> | null;
  featureFlags?: Record<string, unknown> | null;
  lastTask?: {
    module?: string;
    label?: string;
    params?: Record<string, unknown>;
    prompt?: string;
    taskBrief?: Record<string, unknown>;
  } | null;
};

export type NormalizedGenerationDefaults = {
  model: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  count: number;
};
