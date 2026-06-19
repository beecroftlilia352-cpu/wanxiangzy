"use client";

import { nanoid } from "nanoid";

import { imageToDataUrl } from "@/services/image-storage";
import { modelOptionName, type AiConfig, type ModelChannel } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

export type AiTextMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

export type ResponseToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  thoughtSignature?: string;
};

export type ResponseInputMessage =
  | AiTextMessage
  | { type: "function_call"; call_id: string; name: string; arguments: string; thoughtSignature?: string }
  | { role: "tool"; tool_call_id: string; content: string };

export type ResponseFunctionTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
};

export type ToolResponseResult = {
  content: string;
  toolCalls: ResponseToolCall[];
};

type ToolChoice = "auto" | "required" | { type: "function"; name: string };
type RequestOptions = { signal?: AbortSignal };
type CanvasImageResult = { id: string; dataUrl: string };
type GenerationStartResponse = {
  generation_id?: string;
  error?: string;
};
type GenerationStatusResponse = {
  status?: string;
  status_group?: string;
  result_urls?: string[];
  module_results?: Array<{ result_urls?: string[]; urls?: string[]; url?: string }>;
  error?: string | null;
};

const IMAGE_MODELS = ["nano-banana-2", "nano-banana-pro", "gpt-image-2"];
const TEXT_MODELS = ["gpt-4o-mini", "gpt-4.1-mini", "deepseek-chat"];
const POLL_DELAY_MS = 2_000;
const POLL_ATTEMPTS = 180;

export async function requestGeneration(config: AiConfig, prompt: string, options?: RequestOptions): Promise<CanvasImageResult[]> {
  return startAndPollImageGeneration({
    mode: "text-to-image",
    prompt: withSystemPrompt(config, prompt),
    config,
    referenceUrls: [],
    options,
  });
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], mask?: ReferenceImage, options?: RequestOptions): Promise<CanvasImageResult[]> {
  const referenceUrls = await Promise.all(references.slice(0, 8).map(referenceImageToUrl));
  if (mask) {
    const maskUrl = await referenceImageToUrl(mask);
    referenceUrls.push(maskUrl);
  }

  const requestPrompt = mask
    ? `${withSystemPrompt(config, prompt)}\n\n请参考最后一张图作为局部编辑蒙版，仅在蒙版指示区域内改变画面，其余主体、构图和质感尽量保持一致。`
    : withSystemPrompt(config, prompt);

  return startAndPollImageGeneration({
    mode: "image-to-image",
    prompt: requestPrompt,
    config,
    referenceUrls,
    options,
  });
}

export async function requestImageQuestion(config: AiConfig, messages: AiTextMessage[], onDelta: (text: string) => void, options?: RequestOptions) {
  const result = await requestCanvasText({
    messages: withSystemMessage(config, messages),
    maxTokens: 1400,
    options,
  });
  const content = result.content || "没有返回内容";
  onDelta(content);
  return content;
}

export async function requestToolResponse(config: AiConfig, messages: ResponseInputMessage[], tools: ResponseFunctionTool[], toolChoice: ToolChoice = "auto", onDelta?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
  const result = await requestCanvasText({
    messages: withSystemMessage(config, messages),
    tools,
    toolChoice,
    maxTokens: 1800,
    options,
  });
  if (result.content) onDelta?.(result.content);
  return result;
}

export async function fetchImageModels(_config: Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat">) {
  return IMAGE_MODELS;
}

export async function fetchChannelModels(channel: ModelChannel) {
  return channel.id === "platform" ? [...IMAGE_MODELS, ...TEXT_MODELS, "happyhorse-1.0-i2v"] : channel.models;
}

async function startAndPollImageGeneration(input: {
  mode: "text-to-image" | "image-to-image";
  prompt: string;
  config: AiConfig;
  referenceUrls: string[];
  options?: RequestOptions;
}) {
  assertNotAborted(input.options?.signal);
  const genCount = resolveImageCount(input.config);
  const start = await fetchJson<GenerationStartResponse>(
    "/api/general-image",
    {
      method: "POST",
      body: {
        mode: input.mode,
        prompt: input.prompt,
        reference_urls: input.mode === "image-to-image" ? input.referenceUrls : [],
        ai_model: resolveImageModel(input.config),
        aspect_ratio: resolveAspectRatio(input.config),
        image_size: resolveImageSize(input.config),
        gen_count: genCount,
        module: "generalImage",
      },
    },
    input.options,
  );

  if (!start.generation_id) throw new Error(start.error || "图像任务创建失败");
  return pollImageGeneration(start.generation_id, input.options);
}

async function pollImageGeneration(generationId: string, options?: RequestOptions): Promise<CanvasImageResult[]> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    assertNotAborted(options?.signal);
    const status = await fetchJson<GenerationStatusResponse>(`/api/general-image?generation_id=${encodeURIComponent(generationId)}`, { method: "GET" }, options);
    const urls = collectResultUrls(status);
    if ((status.status_group === "completed" || status.status === "completed") && urls.length) {
      return urls.map((dataUrl) => ({ id: nanoid(), dataUrl }));
    }
    if (status.status_group === "failed" || status.status === "failed") {
      throw new Error(status.error || "图像生成失败");
    }
    await delay(POLL_DELAY_MS, options?.signal);
  }
  throw new Error("图像生成超时，请稍后重试");
}

async function requestCanvasText(input: {
  messages: ResponseInputMessage[];
  tools?: ResponseFunctionTool[];
  toolChoice?: ToolChoice;
  maxTokens?: number;
  options?: RequestOptions;
}): Promise<ToolResponseResult> {
  return fetchJson<ToolResponseResult>(
    "/api/infinite-canvas/text",
    {
      method: "POST",
      body: {
        messages: input.messages,
        tools: input.tools,
        toolChoice: input.toolChoice,
        maxTokens: input.maxTokens,
      },
    },
    input.options,
  );
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

function collectResultUrls(status: GenerationStatusResponse) {
  const moduleUrls =
    status.module_results?.flatMap((item) => {
      if (Array.isArray(item.result_urls)) return item.result_urls;
      if (Array.isArray(item.urls)) return item.urls;
      return item.url ? [item.url] : [];
    }) || [];
  return Array.from(new Set([...(status.result_urls || []), ...moduleUrls].filter(Boolean)));
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (record.error && typeof record.error === "object" && typeof (record.error as Record<string, unknown>).message === "string") {
      return String((record.error as Record<string, unknown>).message);
    }
    if (typeof record.message === "string") return record.message;
  }
  return fallback || "请求失败";
}

async function referenceImageToUrl(image: ReferenceImage) {
  const direct = image.url || image.dataUrl;
  if (direct && !direct.startsWith("blob:")) return direct;
  const dataUrl = await imageToDataUrl(image);
  if (!dataUrl) throw new Error("参考图读取失败，请重新上传图片");
  return dataUrl;
}

function resolveImageModel(config: AiConfig) {
  const model = modelOptionName(config.model || config.imageModel).toLowerCase();
  if (model.includes("gpt-image")) return "gpt-image-2";
  if (model.includes("nano-banana-pro") || model.includes("banana-pro")) return "nano-banana-pro";
  return "nano-banana-2";
}

function resolveImageSize(config: AiConfig) {
  const quality = `${config.quality || ""}`.toLowerCase();
  if (quality.includes("4k") || quality === "high" || quality === "hd") return "4K";
  if (quality.includes("2k") || quality === "medium") return "2K";
  return "1K";
}

function resolveAspectRatio(config: AiConfig) {
  const ratio = `${config.size || "auto"}`.trim();
  return ["auto", "1:1", "9:16", "16:9", "4:3", "3:4", "2:3", "3:2", "4:5", "5:4", "21:9"].includes(ratio) ? ratio : "auto";
}

function resolveImageCount(config: AiConfig) {
  return Math.max(1, Math.min(4, Math.floor(Math.abs(Number(config.canvasImageCount || config.count)) || 1)));
}

function withSystemPrompt(config: AiConfig, prompt: string) {
  const systemPrompt = config.systemPrompt.trim();
  return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function withSystemMessage<T extends ResponseInputMessage>(config: AiConfig, messages: T[]): ResponseInputMessage[] {
  const systemPrompt = config.systemPrompt.trim();
  return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
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
