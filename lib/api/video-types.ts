import type {
  AiVideoAspectRatio,
  AiVideoAudioMode,
  AiVideoDuration,
  AiVideoModelMode,
  AiVideoResolution,
} from "@/lib/ai-video";

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

export type VideoImageToVideoInput = {
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

export type VideoMotionControlInput = {
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

export type VideoFirstLastFrameInput = {
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
};
