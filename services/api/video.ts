"use client";

import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { modelOptionName, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };

type RequestOptions = { signal?: AbortSignal };
type GenerationStartResponse = { generation_id?: string; error?: string };
type GenerationStatusResponse = {
  status?: string;
  status_group?: string;
  result_urls?: string[];
  error?: string | null;
};

const POLL_DELAY_MS = 3_000;
const POLL_ATTEMPTS = 180;

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], _videoReferences: ReferenceVideo[] = [], _audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationResult> {
  if (!references.length) throw new Error("视频生成需要至少连接一张参考图");
  const imageUrl = await referenceImageToUrl(references[0]);
  const start = await fetchJson<GenerationStartResponse>(
    "/api/video/image-to-video",
    {
      method: "POST",
      body: {
        imageUrl,
        prompt: prompt.trim() || "让画面自然动起来，保持主体外观与摄影质感一致。",
        modelMode: resolveModelMode(config),
        resolution: resolveVideoResolution(config),
        duration: resolveVideoDuration(config),
        genCount: 1,
        aspectRatio: resolveAspectRatio(config),
        audioMode: config.videoGenerateAudio === "true" ? "generated" : "off",
      },
    },
    options,
  );

  if (!start.generation_id) throw new Error(start.error || "视频任务创建失败");
  return pollVideoGeneration(start.generation_id, options);
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
  if (result.blob) return uploadMediaFile(result.blob, "video");
  if (result.url) return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
  throw new Error("视频接口没有返回可播放的视频");
}

async function pollVideoGeneration(generationId: string, options?: RequestOptions): Promise<VideoGenerationResult> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    assertNotAborted(options?.signal);
    const status = await fetchJson<GenerationStatusResponse>(`/api/video/image-to-video?generation_id=${encodeURIComponent(generationId)}`, { method: "GET" }, options);
    const url = status.result_urls?.find(Boolean);
    if ((status.status_group === "completed" || status.status === "completed") && url) return { url, mimeType: "video/mp4" };
    if (status.status_group === "failed" || status.status === "failed") throw new Error(status.error || "视频生成失败");
    await delay(POLL_DELAY_MS, options?.signal);
  }
  throw new Error("视频生成超时，请稍后重试");
}

async function referenceImageToUrl(image: ReferenceImage) {
  const direct = image.url || image.dataUrl;
  if (direct && !direct.startsWith("blob:")) return direct;
  const dataUrl = await imageToDataUrl(image);
  if (!dataUrl) throw new Error("参考图读取失败，请重新上传图片");
  return dataUrl;
}

function resolveModelMode(config: AiConfig) {
  const model = modelOptionName(config.model || config.videoModel).toLowerCase();
  return model.includes("fast") ? "fast" : "pro";
}

function resolveVideoResolution(config: AiConfig) {
  const value = `${config.vquality || ""}`.toLowerCase();
  if (value.includes("1080") || value === "high") return "1080p";
  return "720p";
}

function resolveVideoDuration(config: AiConfig) {
  return Math.max(3, Math.min(15, Math.round(Number(config.videoSeconds) || 5)));
}

function resolveAspectRatio(config: AiConfig) {
  const ratio = `${config.size || "auto"}`;
  return ["auto", "3:4", "9:16", "1:1", "4:3", "16:9"].includes(ratio) ? ratio : "auto";
}

async function fetchJson<T>(url: string, init: { method: "GET" | "POST"; body?: unknown }, options?: RequestOptions): Promise<T> {
  const response = await fetch(url, {
    method: init.method,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: options?.signal,
    cache: "no-store",
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(readErrorMessage(payload, response.statusText));
  return payload as T;
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 300) };
  }
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
  }
  return fallback || "请求失败";
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

export async function videoReferenceToUrl(video: ReferenceVideo) {
  if (video.url && !video.url.startsWith("blob:")) return video.url;
  if (video.storageKey) {
    const blob = await getMediaBlob(video.storageKey);
    if (blob) return blobToDataUrl(blob);
  }
  throw new Error("参考视频需要是可访问 URL 或本地已保存文件");
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取媒体失败"));
    reader.readAsDataURL(blob);
  });
}
