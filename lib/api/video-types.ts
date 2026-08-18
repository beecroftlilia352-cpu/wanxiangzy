import type {
  AiVideoAspectRatio,
  AiVideoAudioMode,
  AiVideoDuration,
  AiVideoModelMode,
  AiVideoResolution,
} from "@/lib/ai-video";
import type { VideoProviderName } from "@/lib/api/video-catalog";
import type { AiDeploymentAdapterConfig } from "@/lib/ai-control-plane/types";

export type VideoTaskProgress = {
  taskId?: string;
  status: "queued" | "running" | "completed" | "failed";
  providerStatus?: string;
  requestId?: string;
  progress: number;
  urls?: string[];
  error?: string;
  providerDetails?: Record<string, unknown>;
};

export type VideoGenerationResult = {
  url: string;
  urls: string[];
  taskId: string;
  requestId?: string;
  providerStatus: string;
  prompt: string;
  compiledPrompt: string;
  providerDetails?: Record<string, unknown>;
};

export type VideoTaskResume = {
  taskId: string;
  requestId?: string;
};

type VideoExecutionControl = {
  /** Stable per-generation/slot key forwarded to providers that support it. */
  idempotencyKey?: string;
  /** Persisted upstream task checkpoint. When present, submission is skipped. */
  resumeTask?: VideoTaskResume;
};

export type VideoImageToVideoInput = VideoExecutionControl & {
  provider: VideoProviderName;
  imageUrl: string;
  prompt: string;
  modelMode: AiVideoModelMode;
  duration: AiVideoDuration;
  resolution: AiVideoResolution;
  aspectRatio: AiVideoAspectRatio;
  audioMode: AiVideoAudioMode;
  audioUrl?: string | null;
  audioPrompt?: string | null;
  generateAudio: boolean;
  onProgress?: (update: VideoTaskProgress) => Promise<void> | void;
};

export type VideoMotionControlInput = VideoExecutionControl & {
  provider: VideoProviderName;
  modelImageUrl: string;
  referenceVideoUrl: string;
  prompt?: string;
  modelMode: AiVideoModelMode;
  duration: AiVideoDuration;
  resolution: AiVideoResolution;
  aspectRatio: AiVideoAspectRatio;
  audioMode: AiVideoAudioMode;
  audioUrl?: string | null;
  audioPrompt?: string | null;
  generateAudio: boolean;
  onProgress?: (update: VideoTaskProgress) => Promise<void> | void;
};

export type VideoFirstLastFrameInput = VideoExecutionControl & {
  provider: VideoProviderName;
  firstFrameUrl: string;
  lastFrameUrl: string;
  prompt: string;
  modelMode: AiVideoModelMode;
  duration: AiVideoDuration;
  resolution: AiVideoResolution;
  aspectRatio: AiVideoAspectRatio;
  audioMode: AiVideoAudioMode;
  audioUrl?: string | null;
  audioPrompt?: string | null;
  generateAudio: boolean;
  onProgress?: (update: VideoTaskProgress) => Promise<void> | void;
};

export type NewApiVideoProviderConfig = {
  provider: "minimax" | "seedance";
  apiBase: string;
  apiKey: string;
  signal?: AbortSignal;
  adapterConfig?: AiDeploymentAdapterConfig;
};
