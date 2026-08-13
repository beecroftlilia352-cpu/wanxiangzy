import {
  AI_VIDEO_DEFAULT_ASPECT_RATIO,
  AI_VIDEO_DEFAULT_DURATION,
  normalizeAiVideoAudioMode,
  normalizeAiVideoFixedAspectRatio,
  type AiVideoAspectRatio,
  type AiVideoAudioMode,
  type AiVideoDuration,
  type AiVideoModelMode,
  type AiVideoResolution,
} from "@/lib/ai-video";
import type {
  HappyHorseFirstLastFrameInput,
  HappyHorseImageToVideoInput,
  HappyHorseMotionControlInput,
  VideoGenerationResult,
  VideoTaskProgress,
} from "@/lib/api/happyhorse-video";

// MiniMax H3 delivered through the new-api gateway (e.g. https://api.new.bi).
// Endpoints follow the NewAPI "openai-video" convention:
//   POST /v1/video/generations
//   GET  /v1/video/generations/{task_id}
const MINIMAX_SUBMIT_PATH = "/v1/video/generations";
const MINIMAX_QUERY_PATH = "/v1/video/generations";
const VIDEO_SUBMIT_PROGRESS_MAX = 10;
const VIDEO_POLL_INTERVAL_MS = 10_000;
const VIDEO_POLL_TIMEOUT_MS = 20 * 60 * 1000;

export type MiniMaxVideoProviderConfig = {
  apiBase: string;
  apiKey: string;
  model: string;
};

export async function generateMinimaxImageToVideo(
  input: HappyHorseImageToVideoInput,
  provider: MiniMaxVideoProviderConfig,
): Promise<VideoGenerationResult> {
  const prompt = buildMiniMaxPrompt(buildImageToVideoPrompt(input.prompt, input.aspectRatio), input);
  const body = buildMiniMaxTaskBody({
    model: resolveMiniMaxModel(provider.model, input.modelMode, input.resolution),
    prompt,
    image: input.imageUrl,
    duration: toMiniMaxDuration(input.duration),
  });

  const completed = await runMiniMaxTask(provider, body, input.onProgress);
  return toVideoResult(completed, prompt, body);
}

export async function generateMinimaxMotionControl(
  input: HappyHorseMotionControlInput,
  provider: MiniMaxVideoProviderConfig,
): Promise<VideoGenerationResult> {
  const prompt = buildMiniMaxPrompt(buildMotionControlPrompt(input.prompt), input);
  // new.bi's MiniMax H3 channel only forwards `reference_image` for reference-to-video;
  // `reference_video` / `reference_video_url` / `reference_videos` are silently dropped by
  // the gateway, and `video` / `video_url` are forwarded but rejected by the upstream model.
  // We therefore send the model image as the subject reference and drive motion via the
  // text prompt. The caller still validates/receives referenceVideoUrl for future gateways.
  const body = buildMiniMaxTaskBody({
    model: resolveMiniMaxModel(provider.model, input.modelMode, input.resolution),
    prompt,
    referenceImage: input.modelImageUrl,
    duration: toMiniMaxDuration(input.duration),
  });

  const completed = await runMiniMaxTask(provider, body, input.onProgress);
  return toVideoResult(completed, prompt, body);
}

export async function generateMinimaxFirstLastFrame(
  input: HappyHorseFirstLastFrameInput,
  provider: MiniMaxVideoProviderConfig,
): Promise<VideoGenerationResult> {
  const prompt = buildMiniMaxPrompt(buildFirstLastFramePrompt(input.prompt, input.aspectRatio), input);
  const body = buildMiniMaxTaskBody({
    model: resolveMiniMaxModel(provider.model, input.modelMode, input.resolution),
    prompt,
    firstFrameImage: input.firstFrameUrl,
    lastFrameImage: input.lastFrameUrl,
    duration: toMiniMaxDuration(input.duration),
  });

  const completed = await runMiniMaxTask(provider, body, input.onProgress);
  return toVideoResult(completed, prompt, body);
}

function toVideoResult(completed: MiniMaxPollState, prompt: string, body: Record<string, unknown>): VideoGenerationResult {
  return {
    url: completed.urls[0],
    urls: completed.urls,
    taskId: completed.taskId,
    requestId: completed.requestId,
    providerStatus: completed.providerStatus,
    prompt,
    compiledPrompt: JSON.stringify(body),
    providerDetails: completed.providerDetails,
  };
}

function buildMiniMaxTaskBody(params: {
  model: string;
  prompt: string;
  image?: string;
  firstFrameImage?: string;
  lastFrameImage?: string;
  referenceImage?: string;
  duration: number;
}) {
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    duration: params.duration,
  };
  if (params.image) body.image = params.image;
  if (params.firstFrameImage) body.first_frame_image = params.firstFrameImage;
  if (params.lastFrameImage) body.last_frame_image = params.lastFrameImage;
  if (params.referenceImage) body.reference_image = params.referenceImage;
  return body;
}

function buildMiniMaxPrompt(prompt: string, input: { audioMode: AiVideoAudioMode; audioPrompt?: string | null; generateAudio?: boolean }) {
  const audioMode = normalizeAiVideoAudioMode(input.audioMode);
  if (audioMode === "off") {
    return [
      prompt,
      "声音要求：生成静音视频，不添加人声、音乐、环境声或动作音效；如果模型必须输出音轨，音轨保持完全静音。",
    ].join("\n");
  }
  const audioPrompt = input.audioPrompt?.trim();
  return [
    prompt,
    audioPrompt
      ? `音效要求：${audioPrompt}`
      : "音效要求：生成干净自然的商业展示环境声和轻动作音效，节奏贴合画面。",
  ].join("\n");
}

function buildImageToVideoPrompt(prompt: string, aspectRatio: AiVideoAspectRatio) {
  const trimmed = prompt.trim();
  return [
    trimmed,
    "以输入首帧图片作为人物、服装和画面风格参考，保持主体身份、服装结构、颜色、材质和比例一致。",
    "生成真实商业摄影风格的短视频，镜头稳定，动作自然，不添加字幕、水印或无关人物。",
    buildAspectRatioPrompt(aspectRatio),
  ].filter(Boolean).join("\n");
}

function buildFirstLastFramePrompt(prompt: string, aspectRatio: AiVideoAspectRatio) {
  const trimmed = prompt.trim();
  return [
    trimmed || "根据首帧和尾帧生成顺滑过渡视频。",
    "首帧图片必须作为视频开头的主体参考，尾帧图片必须作为视频结尾的目标参考；中间过程自然衔接。",
    "保持人物身份、服装结构、颜色、材质和画面主体一致，使用稳定商业摄影运镜，不添加字幕、水印、额外人物或无关物体。",
    buildAspectRatioPrompt(aspectRatio),
  ].join("\n");
}

function buildMotionControlPrompt(prompt?: string) {
  const trimmed = prompt?.trim();
  return [
    trimmed || "将参考视频中的人物动作节奏和镜头运动应用到参考图像中的模特身上。",
    "视频素材只用于动作、节奏和运镜；人物身份、服装、比例和画面主体以参考图像为准。",
    "保持真实商业摄影质感，避免转场、字幕、水印和额外人物。",
  ].join("\n");
}

function buildAspectRatioPrompt(aspectRatio: AiVideoAspectRatio) {
  if (aspectRatio === "auto") {
    return "输出画面优先沿用输入图片的自然比例，主体自然铺满画面，不添加黑边、白边、留白边框或画中画式缩放。";
  }
  const fixed = normalizeAiVideoFixedAspectRatio(aspectRatio || AI_VIDEO_DEFAULT_ASPECT_RATIO);
  return `输出画面必须保持 ${fixed} 比例，主体铺满画面，不添加黑边、白边、留白边框或画中画式缩放。`;
}

function resolveMiniMaxModel(baseModel: string, modelMode: AiVideoModelMode, resolution: AiVideoResolution) {
  const model = baseModel.trim() || "minimax-h3";
  if (model === "minimax-h3") {
    return resolution === "1080p" ? "minimax-h3" : "minimax-h3-768p";
  }
  return model;
}

function toMiniMaxDuration(duration?: AiVideoDuration) {
  const numeric = Math.round(duration ?? AI_VIDEO_DEFAULT_DURATION);
  return Math.min(15, Math.max(5, Number.isFinite(numeric) ? numeric : AI_VIDEO_DEFAULT_DURATION));
}

type MiniMaxPollState = {
  taskId: string;
  requestId?: string;
  providerStatus: string;
  status: VideoTaskProgress["status"];
  progress: number;
  urls: string[];
  error?: string;
  providerDetails?: Record<string, unknown>;
};

async function runMiniMaxTask(
  provider: MiniMaxVideoProviderConfig,
  body: Record<string, unknown>,
  onProgress: HappyHorseImageToVideoInput["onProgress"],
): Promise<MiniMaxPollState> {
  await onProgress?.({
    status: "queued",
    providerStatus: "SUBMITTING",
    progress: 1,
    providerDetails: buildMiniMaxProviderDetails({ requestBody: body }),
  });

  const submitted = await submitJson(`${provider.apiBase}${MINIMAX_SUBMIT_PATH}`, provider.apiKey, body);
  const video = extractMiniMaxVideoObject(submitted) || {};
  const taskId = typeof video.task_id === "string" && video.task_id ? video.task_id : extractMiniMaxTaskId(submitted);
  if (!taskId) throw new Error(`MiniMax 视频接口未返回 task_id，响应字段: ${describeResponseKeys(submitted)}`);

  const requestId = extractMiniMaxRequestId(submitted);
  const providerStatus = typeof video.status === "string" && video.status ? video.status : "queued";
  await onProgress?.({
    taskId,
    requestId,
    status: "queued",
    providerStatus,
    progress: VIDEO_SUBMIT_PROGRESS_MAX,
    providerDetails: buildMiniMaxProviderDetails({ requestBody: body, submitResponse: submitted, taskId, requestId }),
  });

  const startedAt = Date.now();
  let lastState: MiniMaxPollState = {
    taskId,
    requestId,
    providerStatus,
    status: "queued",
    progress: VIDEO_SUBMIT_PROGRESS_MAX,
    urls: [],
  };

  while (Date.now() - startedAt < VIDEO_POLL_TIMEOUT_MS) {
    await sleep(VIDEO_POLL_INTERVAL_MS);
    const elapsed = Date.now() - startedAt;
    let json: unknown;
    try {
      json = await getJson(`${provider.apiBase}${MINIMAX_QUERY_PATH}/${encodeURIComponent(taskId)}`, provider.apiKey);
    } catch {
      lastState = {
        ...lastState,
        status: "running",
        providerStatus: "PollingRetry",
        progress: Math.max(lastState.progress, Math.min(95, VIDEO_SUBMIT_PROGRESS_MAX + Math.round((elapsed / VIDEO_POLL_TIMEOUT_MS) * 85))),
        error: "",
      };
      await onProgress?.({
        taskId: lastState.taskId,
        requestId: lastState.requestId,
        status: lastState.status,
        providerStatus: lastState.providerStatus,
        progress: lastState.progress,
        urls: lastState.urls,
        error: "",
        providerDetails: lastState.providerDetails,
      });
      continue;
    }

    const state = normalizeMiniMaxPollState(json, taskId, requestId);
    lastState = {
      ...state,
      progress: state.status === "completed"
        ? 100
        : state.status === "failed"
          ? Math.max(state.progress, 100)
          : Math.max(state.progress, Math.min(95, VIDEO_SUBMIT_PROGRESS_MAX + Math.round((elapsed / VIDEO_POLL_TIMEOUT_MS) * 85))),
    };

    await onProgress?.({
      taskId: lastState.taskId,
      requestId: lastState.requestId,
      status: lastState.status,
      providerStatus: lastState.providerStatus,
      progress: lastState.progress,
      urls: lastState.urls,
      error: lastState.error,
      providerDetails: lastState.providerDetails,
    });

    if (lastState.status === "completed" && lastState.urls.length) return lastState;
    if (lastState.status === "failed") throw new Error(lastState.error || "视频生成失败");
  }

  throw new Error(`视频生成超时，可稍后在任务队列或作品库查看。MiniMax task_id: ${lastState.taskId}`);
}

function normalizeMiniMaxPollState(
  json: unknown,
  fallbackTaskId: string,
  fallbackRequestId: string | undefined,
): MiniMaxPollState {
  const video = extractMiniMaxVideoObject(json);
  const outerStatus = extractMiniMaxOuterStatus(json);
  const status = normalizeMiniMaxStatus(video?.status ?? outerStatus);
  const urls = extractMiniMaxVideoUrls(video) || extractMiniMaxVideoUrls(json);

  return {
    taskId: typeof video?.task_id === "string" && video.task_id ? video.task_id : fallbackTaskId,
    requestId: extractMiniMaxRequestId(json) || fallbackRequestId,
    providerStatus: (typeof video?.status === "string" && video.status) || outerStatus || "processing",
    status: status === "completed" ? "completed" : status === "failed" ? "failed" : "running",
    progress: typeof video?.progress === "number" ? video.progress : 0,
    urls,
    error: status === "failed" ? extractMiniMaxErrorMessage(json) : undefined,
    providerDetails: buildMiniMaxProviderDetails({ latestResponse: json, taskId: fallbackTaskId }),
  };
}

function normalizeMiniMaxStatus(value: unknown): "completed" | "failed" | "running" {
  const status = String(value ?? "").toLowerCase();
  if (["completed", "succeeded", "success", "successful", "done"].includes(status)) return "completed";
  if (["failed", "fail", "cancelled", "canceled", "error"].includes(status)) return "failed";
  return "running";
}

function extractMiniMaxOuterStatus(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  const data = record.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const outer = data as Record<string, unknown>;
    if (typeof outer.status === "string") return outer.status;
    if (typeof outer.progress === "string") return outer.progress;
  }
  return "";
}

function extractMiniMaxVideoObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractMiniMaxVideoObject(item);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.object === "video") return record;
  for (const entryValue of Object.values(record)) {
    const found = extractMiniMaxVideoObject(entryValue);
    if (found) return found;
  }
  return null;
}

function extractMiniMaxTaskId(value: unknown): string {
  const candidates = findMiniMaxValuesByKey(value, ["task_id", "id"]);
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function extractMiniMaxRequestId(value: unknown): string | undefined {
  const candidates = findMiniMaxValuesByKey(value, ["request_id", "trace_id", "trace-id"]);
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function extractMiniMaxVideoUrls(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const direct = typeof record.video_url === "string" ? record.video_url : "";
  const output = record.output;
  const urls = new Set<string>();
  if (direct && /^https?:\/\//i.test(direct)) urls.add(direct);
  if (typeof output === "string" && /^https?:\/\//i.test(output)) urls.add(output);
  if (Array.isArray(output)) {
    for (const item of output) {
      if (typeof item === "string" && /^https?:\/\//i.test(item)) urls.add(item);
    }
  }
  // Fallback: any http(s) URL that looks like a video file.
  walkMiniMax(value, (entry, key) => {
    if (typeof entry !== "string" || !/^https?:\/\//i.test(entry)) return;
    const keyLooksVideo = /video|result_url|download_url|file_url/i.test(key || "");
    const valueLooksVideo = /\.(mp4|mov|webm|m4v)(?:$|[?#])/i.test(entry);
    if (keyLooksVideo || valueLooksVideo) urls.add(entry);
  });
  return [...urls];
}

function extractMiniMaxErrorMessage(value: unknown): string {
  const candidates = findMiniMaxValuesByKey(value, ["fail_reason", "error", "error_message", "message", "msg"]);
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() && !/^success$/i.test(candidate.trim())) {
      return candidate.trim();
    }
    if (candidate && typeof candidate === "object") {
      const nested = extractMiniMaxErrorMessage(candidate);
      if (nested) return nested;
    }
  }
  return "";
}

function findMiniMaxValuesByKey(value: unknown, keys: string[]) {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));
  const values: unknown[] = [];
  walkMiniMax(value, (entry, key) => {
    if (key && normalizedKeys.has(key.toLowerCase())) values.push(entry);
  });
  return values;
}

function walkMiniMax(value: unknown, visit: (entry: unknown, key?: string) => void, key?: string) {
  visit(value, key);
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry) => walkMiniMax(entry, visit));
    return;
  }
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    walkMiniMax(entryValue, visit, entryKey);
  }
}

function describeResponseKeys(value: unknown) {
  if (!value || typeof value !== "object") return typeof value;
  return Object.keys(value as Record<string, unknown>).slice(0, 12).join(", ") || "empty";
}

function buildMiniMaxProviderDetails(input: {
  requestBody?: Record<string, unknown>;
  submitResponse?: unknown;
  latestResponse?: unknown;
  taskId?: string;
  requestId?: string;
}) {
  const out: Record<string, unknown> = { platform: "newapi-minimax" };
  if (input.taskId) out.taskId = input.taskId;
  if (input.requestId) out.requestId = input.requestId;
  if (input.requestBody !== undefined) out.request = input.requestBody;
  if (input.submitResponse !== undefined) out.submitResponse = limitProviderDetail(input.submitResponse);
  if (input.latestResponse !== undefined) out.latestResponse = limitProviderDetail(input.latestResponse);
  out.updatedAt = new Date().toISOString();
  return out;
}

function limitProviderDetail(value: unknown): unknown {
  const text = JSON.stringify(value);
  if (text.length <= 20_000) return value;
  return { truncated: true, preview: text.slice(0, 20_000) };
}

async function submitJson(url: string, apiKey: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: buildMiniMaxHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  return readJsonResponse(response, "视频任务提交失败");
}

async function getJson(url: string, apiKey: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: buildMiniMaxHeaders(apiKey),
    signal: AbortSignal.timeout(60_000),
  });
  return readJsonResponse(response, "视频任务查询失败");
}

async function readJsonResponse(response: Response, prefix: string) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${prefix}: HTTP ${response.status} ${formatMiniMaxErrorBody(text)}`);
  if (!text.trim()) throw new Error(`${prefix}: 响应为空`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${prefix}: 响应不是 JSON`);
  }
}

function buildMiniMaxHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "identity",
  };
}

function formatMiniMaxErrorBody(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "响应为空";
  try {
    const json = JSON.parse(trimmed);
    const message = typeof json?.error?.message === "string" ? json.error.message : "";
    const type = typeof json?.error?.type === "string" ? json.error.type : "";
    return [message, type].filter(Boolean).join(" | ") || trimmed.slice(0, 300);
  } catch {
    return trimmed.slice(0, 300);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
