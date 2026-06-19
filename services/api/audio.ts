"use client";

import { audioMimeType } from "@/lib/audio-generation";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import type { AiConfig } from "@/stores/use-config-store";

type RequestOptions = { signal?: AbortSignal };

export async function requestAudioGeneration(config: AiConfig, prompt: string, options?: RequestOptions): Promise<Blob> {
  const response = await fetch("/api/infinite-canvas/audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model: config.audioModel || config.model,
      voice: config.audioVoice,
      format: config.audioFormat,
      speed: config.audioSpeed,
      instructions: config.audioInstructions,
    }),
    signal: options?.signal,
  });

  const data = (await response.json().catch(() => ({}))) as { error?: string; audio?: string; url?: string; mimeType?: string };
  if (!response.ok) {
    throw new Error(data.error || `音频生成失败 (${response.status})`);
  }

  const audioUrl = data.audio || data.url;
  if (!audioUrl) throw new Error("音频生成没有返回结果");

  const audioResponse = await fetch(audioUrl, { signal: options?.signal });
  if (!audioResponse.ok) throw new Error(`音频结果下载失败 (${audioResponse.status})`);

  const bytes = await audioResponse.arrayBuffer();
  return new Blob([bytes], { type: data.mimeType || audioMimeType(config.audioFormat) });
}

export async function storeGeneratedAudio(blob: Blob, format = "mp3"): Promise<UploadedFile> {
  const audio = blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: audioMimeType(format) });
  return uploadMediaFile(audio, "audio");
}
