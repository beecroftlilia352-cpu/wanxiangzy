"use client";

import { nanoid } from "nanoid";

import { imageToDataUrl } from "@/services/image-storage";
import { modelOptionName, type AiConfig, type ModelChannel } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import {
    createAdaptivePollDelay,
    fetchWithAbortAndTimeout,
    getTotalPollBudgetMs,
    isAbortLikeError,
} from "@/lib/poll/status-poll";
import { POLL_FETCH_TIMEOUT_MS } from "@/lib/poll/constants";

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
// `onGenerationStarted` fires synchronously after the server POST returns and
// the generation id is known — before the long poll begins. Callers (notably
// the canvas) use it to persist the id onto a node so a page refresh can
// reconcile the in-flight generation instead of marking it failed.
type RequestOptions = { signal?: AbortSignal; onGenerationStarted?: (generationId: string) => void };
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

// Raised distinct error so callers (and the canvas rehydration flow) can
// distinguish "wall-clock budget exhausted" from a generic API failure.
export const IMAGE_GENERATION_BUDGET_EXHAUSTED = "IMAGE_GENERATION_BUDGET_EXHAUSTED";

/**
 * A handle to an in-flight image generation. `generationId` is available
 * synchronously after the server-side POST returns (so callers can persist
 * it onto a node before the long poll completes), while `resultPromise`
 * resolves once the worker reports completion or throws on failure.
 */
export type GenerationHandle = {
  generationId: string;
  resultPromise: Promise<CanvasImageResult[]>;
};

export async function requestGeneration(config: AiConfig, prompt: string, options?: RequestOptions): Promise<CanvasImageResult[]> {
  const handle = await startImageGeneration({
    mode: "text-to-image",
    prompt: withSystemPrompt(config, prompt),
    config,
    referenceUrls: [],
    options,
  });
  options?.onGenerationStarted?.(handle.generationId);
  return handle.resultPromise;
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

  const handle = await startImageGeneration({
    mode: "image-to-image",
    prompt: requestPrompt,
    config,
    referenceUrls,
    options,
  });
  options?.onGenerationStarted?.(handle.generationId);
  return handle.resultPromise;
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

export async function startImageGeneration(input: {
  mode: "text-to-image" | "image-to-image";
  prompt: string;
  config: AiConfig;
  referenceUrls: string[];
  options?: RequestOptions;
}): Promise<GenerationHandle> {
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
  // Capture the generation_id synchronously so callers can persist it onto a
  // node before the long poll completes. The result promise resolves once the
  // worker reports completion (or throws on failure / budget exhaustion).
  const generationId = start.generation_id;
  const resultPromise = pollImageGeneration(generationId, input.options);
  return { generationId, resultPromise };
}

async function pollImageGeneration(generationId: string, options?: RequestOptions): Promise<CanvasImageResult[]> {
  // Adaptive 5s → 7s → 10s → 15s schedule with hidden-tab override. Budget
  // scales with the expected number of images so a batch of 4 gets the same
  // per-image patience without blowing past the platform's cap.
  const expectedCount = 1;
  const budgetMs = getTotalPollBudgetMs(expectedCount);
  const wait = createAdaptivePollDelay();
  const deadline = Date.now() + budgetMs;
  let attempt = 0;
  while (true) {
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (Date.now() >= deadline) throw new Error(IMAGE_GENERATION_BUDGET_EXHAUSTED);
    let status: GenerationStatusResponse;
    try {
      status = await fetchGenerationStatus(generationId, options);
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      // Transient network failure: keep waiting within budget. The shared
      // primitives handle per-request timeouts and the adaptive delay.
      attempt += 1;
      await wait(attempt, options?.signal || new AbortController().signal);
      continue;
    }
    const urls = collectResultUrls(status);
    if ((status.status_group === "completed" || status.status === "completed") && urls.length) {
      return urls.map((dataUrl) => ({ id: nanoid(), dataUrl }));
    }
    if (status.status_group === "failed" || status.status === "failed") {
      throw new Error(status.error || "图像生成失败");
    }
    attempt += 1;
    await wait(attempt, options?.signal || new AbortController().signal);
  }
}

async function fetchGenerationStatus(generationId: string, options?: RequestOptions): Promise<GenerationStatusResponse> {
  const url = `/api/generation-status?generation_id=${encodeURIComponent(generationId)}`;
  // Prefer the shared timeout-aware fetch when we have a parent signal so a
  // stalled request doesn't burn the whole budget. Fall back to fetchJson for
  // compatibility (and tests) that don't pass a signal.
  if (options?.signal) {
    const response = await fetchWithAbortAndTimeout(url, options.signal, POLL_FETCH_TIMEOUT_MS);
    const payload = await readJson(response);
    if (!response.ok) throw new Error(readErrorMessage(payload, response.statusText));
    return payload as GenerationStatusResponse;
  }
  return fetchJson<GenerationStatusResponse>(url, { method: "GET" }, options);
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

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}
