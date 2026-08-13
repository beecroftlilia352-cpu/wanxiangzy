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

const MINIMAX_SUBMIT_PATH = "/v2/video_generation";
const MINIMAX_QUERY_PATH = "/v2/query/video_generation";
const VIDEO_SUBMIT_PROGRESS_MAX = 10;
const VIDEO_POLL_INTERVAL_MS = 10_000;
const VIDEO_POLL_TIMEOUT_MS = 20 * 60 * 1000;

export type MiniMaxVideoProviderConfig = {
  apiBase: string;
  apiKey: string;
  model: string;
};

type MiniMaxContentItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string }; role: "first_frame" | "last_frame" | "reference_image" }
  | { type: "video_url"; video_url: { url: string }; role: "reference_video" }
  | { type: "audio_url"; audio_url: { url: string }; role: "reference_audio" };

type MiniMaxTask = {
  id?: string;
  status?: string;
  content?: { url?: string } | null;
  error?: unknown;
};

export async function generateMinimaxImageToVideo(
  input: HappyHorseImageToVideoInput,
  provider: MiniMaxVideoProviderConfig,
): Promise<VideoGenerationResult> {
  const prompt = buildMiniMaxPrompt(buildImageToVideoPrompt(input.prompt, input.aspectRatio), input);
  const body = buildMiniMaxTaskBody(provider.model, {
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: input.imageUrl }, role: "first_frame" },
      ...buildMiniMaxAudioContent(input),
    ],
    duration: toMiniMaxDuration(input.duration),
    resolution: toMiniMaxResolution(input.modelMode, input.resolution),
  });

  const completed = await runMiniMaxTask(provider, body, input.onProgress);

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

export async function generateMinimaxMotionControl(
  input: HappyHorseMotionControlInput,
  provider: MiniMaxVideoProviderConfig,
): Promise<VideoGenerationResult> {
  const prompt = buildMiniMaxPrompt(buildMotionControlPrompt(input.prompt), input);
  const body = buildMiniMaxTaskBody(provider.model, {
    content: [
      { type: "text", text: prompt },
      { type: "video_url", video_url: { url: input.referenceVideoUrl }, role: "reference_video" },
      { type: "image_url", image_url: { url: input.modelImageUrl }, role: "reference_image" },
      ...buildMiniMaxAudioContent(input),
    ],
    duration: toMiniMaxDuration(input.duration),
    resolution: toMiniMaxResolution(input.modelMode, input.resolution),
  });

  const completed = await runMiniMaxTask(provider, body, input.onProgress);

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

export async function generateMinimaxFirstLastFrame(
  input: HappyHorseFirstLastFrameInput,
  provider: MiniMaxVideoProviderConfig,
): Promise<VideoGenerationResult> {
  const prompt = buildMiniMaxPrompt(buildFirstLastFramePrompt(input.prompt, input.aspectRatio), input);
  const body = buildMiniMaxTaskBody(provider.model, {
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: input.firstFrameUrl }, role: "first_frame" },
      { type: "image_url", image_url: { url: input.lastFrameUrl }, role: "last_frame" },
      ...buildMiniMaxAudioContent(input),
    ],
    duration: toMiniMaxDuration(input.duration),
    resolution: toMiniMaxResolution(input.modelMode, input.resolution),
  });

  const completed = await runMiniMaxTask(provider, body, input.onProgress);

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

function buildMiniMaxTaskBody(model: string, params: { content: MiniMaxContentItem[]; duration: number; resolution: string }) {
  const body: Record<string, unknown> = {
    model,
    content: params.content,
    duration: params.duration,
    resolution: params.resolution,
  };
  return body;
}

function buildMiniMaxAudioContent(input: { audioMode: AiVideoAudioMode; audioUrl?: string | null }): MiniMaxContentItem[] {
  const audioMode = normalizeAiVideoAudioMode(input.audioMode);
  if (audioMode === "custom" && input.audioUrl?.trim()) {
    return [{ type: "audio_url", audio_url: { url: input.audioUrl.trim() }, role: "reference_audio" }];
  }
  return [];
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

function toMiniMaxResolution(modelMode: AiVideoModelMode, resolution: AiVideoResolution) {
  if (modelMode === "fast") return "768P";
  return resolution === "1080p" ? "2K" : "768P";
}

function toMiniMaxDuration(duration?: AiVideoDuration) {
  const numeric = Math.round(duration ?? AI_VIDEO_DEFAULT_DURATION);
  return Math.min(15, Math.max(4, Number.isFinite(numeric) ? numeric : AI_VIDEO_DEFAULT_DURATION));
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
  const taskId = extractMiniMaxTaskId(submitted);
  if (!taskId) throw new Error(`MiniMax 视频接口未返回 task_id，响应字段: ${describeResponseKeys(submitted)}`);

  const requestId = extractMiniMaxRequestId(submitted);
  const providerStatus = "Pending";
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

    const state = normalizeMiniMaxPollState(json, taskId, requestId, providerStatus);
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
  fallbackProviderStatus: string,
): MiniMaxPollState {
  const task = extractMiniMaxTask(json);
  const status = String(task?.status ?? "").toLowerCase();
  const succeeded = status === "succeeded" || status === "success";
  const failed = status === "failed" || status === "cancelled" || status === "canceled";
  const url = typeof task?.content?.url === "string" ? task.content.url : extractMiniMaxVideoUrl(json);

  return {
    taskId: task?.id || fallbackTaskId,
    requestId: extractMiniMaxRequestId(json) || fallbackRequestId,
    providerStatus: task?.status || fallbackProviderStatus,
    status: succeeded ? "completed" : failed ? "failed" : "running",
    progress: succeeded ? 100 : 0,
    urls: url ? [url] : [],
    error: failed ? extractMiniMaxErrorMessage(json) : undefined,
    providerDetails: buildMiniMaxProviderDetails({ latestResponse: json, taskId: task?.id || fallbackTaskId }),
  };
}

function extractMiniMaxTaskId(value: unknown): string {
  const candidates = findMiniMaxValuesByKey(value, ["task_id", "id"]);
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
  return "";
}

function extractMiniMaxTask(value: unknown): MiniMaxTask | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const task = extractMiniMaxTask(item);
      if (task) return task;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.task && typeof record.task === "object" && !Array.isArray(record.task)) {
    return record.task as MiniMaxTask;
  }
  return null;
}

function extractMiniMaxRequestId(value: unknown): string | undefined {
  const candidates = findMiniMaxValuesByKey(value, ["request_id", "trace_id", "trace-id"]);
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function extractMiniMaxVideoUrl(value: unknown): string {
  const candidates = findMiniMaxValuesByKey(value, ["video_url", "url", "file_url", "download_url"]);
  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate.trim())) return candidate.trim();
  }
  return "";
}

function extractMiniMaxErrorMessage(value: unknown): string {
  const candidates = findMiniMaxValuesByKey(value, ["message", "error_message", "msg", "fail_reason"]);
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
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
  const out: Record<string, unknown> = { platform: "minimax" };
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
