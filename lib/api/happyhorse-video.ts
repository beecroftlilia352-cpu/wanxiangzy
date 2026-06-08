import {
  AI_VIDEO_DEFAULT_ASPECT_RATIO,
  AI_VIDEO_DEFAULT_DURATION,
  getAiVideoHappyHorseModel,
  normalizeAiVideoAudioMode,
  normalizeAiVideoFixedAspectRatio,
  type AiVideoAudioMode,
  type AiVideoAspectRatio,
  type AiVideoDuration,
  type AiVideoModelMode,
  type AiVideoResolution,
} from "@/lib/ai-video";

const DEFAULT_HAPPYHORSE_BASE_URL = "https://yunwu.ai";
const HAPPYHORSE_SUBMIT_PATH = "/alibailian/api/v1/services/aigc/video-generation/video-synthesis";
const HAPPYHORSE_QUERY_PATH = "/alibailian/api/v1/tasks";
const VIDEO_SUBMIT_PROGRESS_MAX = 10;
const VIDEO_POLL_INTERVAL_MS = 5_000;
const VIDEO_POLL_TIMEOUT_MS = 20 * 60 * 1000;

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

export type HappyHorseImageToVideoInput = {
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

export type HappyHorseMotionControlInput = {
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

export type HappyHorseFirstLastFrameInput = {
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

type ProviderConfig = {
  apiBase: string;
  apiKey: string;
};

type PollRequest = {
  taskId: string;
  providerStatus?: string;
};

type PollState = {
  taskId: string;
  requestId?: string;
  providerStatus: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  urls: string[];
  error?: string;
  providerDetails?: Record<string, unknown>;
};

type HappyHorseMediaItem =
  | { type: "first_frame"; url: string }
  | { type: "reference_image"; url: string }
  | { type: "video"; url: string };

export async function generateHappyHorseImageToVideo(input: HappyHorseImageToVideoInput): Promise<VideoGenerationResult> {
  const provider = getHappyHorseVideoProvider();
  const prompt = appendAudioPrompt(buildImageToVideoPrompt(input.prompt, input.aspectRatio), input);
  const body = buildHappyHorseTaskBody(getAiVideoHappyHorseModel(input.modelMode, "videoImageToVideo"), {
    prompt,
    media: [{ type: "first_frame", url: input.imageUrl }],
    parameters: {
      resolution: toHappyHorseResolution(input.resolution),
      duration: input.duration || AI_VIDEO_DEFAULT_DURATION,
      watermark: false,
    },
  });

  const completed = await runHappyHorseTask(provider, body, input.onProgress);

  return {
    url: completed.urls[0],
    urls: completed.urls,
    taskId: completed.taskId,
    requestId: completed.requestId,
    providerStatus: completed.providerStatus,
    prompt,
    compiledPrompt: stringifyHappyHorseTraceBody(body),
    providerDetails: completed.providerDetails,
  };
}

export async function generateHappyHorseMotionControl(input: HappyHorseMotionControlInput): Promise<VideoGenerationResult> {
  const provider = getHappyHorseVideoProvider();
  const prompt = appendAudioPrompt(buildMotionControlPrompt(input.prompt), input);
  const body = buildHappyHorseTaskBody(getAiVideoHappyHorseModel(input.modelMode, "videoMotion"), {
    prompt,
    media: [
      { type: "video", url: input.referenceVideoUrl },
      { type: "reference_image", url: input.modelImageUrl },
    ],
    parameters: {
      resolution: toHappyHorseResolution(input.resolution),
      watermark: false,
      audio_setting: shouldUseHappyHorseAudio(input) ? "auto" : undefined,
    },
  });

  const completed = await runHappyHorseTask(provider, body, input.onProgress);

  return {
    url: completed.urls[0],
    urls: completed.urls,
    taskId: completed.taskId,
    requestId: completed.requestId,
    providerStatus: completed.providerStatus,
    prompt,
    compiledPrompt: stringifyHappyHorseTraceBody(body),
    providerDetails: completed.providerDetails,
  };
}

export async function generateHappyHorseFirstLastFrame(input: HappyHorseFirstLastFrameInput): Promise<VideoGenerationResult> {
  const provider = getHappyHorseVideoProvider();
  const prompt = appendAudioPrompt(buildFirstLastFramePrompt(input.prompt, input.aspectRatio), input);
  const body = buildHappyHorseTaskBody(getAiVideoHappyHorseModel(input.modelMode, "videoFirstLastFrame"), {
    prompt,
    media: [
      { type: "reference_image", url: input.firstFrameUrl },
      { type: "reference_image", url: input.lastFrameUrl },
    ],
    parameters: {
      resolution: toHappyHorseResolution(input.resolution),
      ratio: toHappyHorseRatio(input.aspectRatio),
      duration: input.duration || AI_VIDEO_DEFAULT_DURATION,
      watermark: false,
    },
  });

  const completed = await runHappyHorseTask(provider, body, input.onProgress);

  return {
    url: completed.urls[0],
    urls: completed.urls,
    taskId: completed.taskId,
    requestId: completed.requestId,
    providerStatus: completed.providerStatus,
    prompt,
    compiledPrompt: stringifyHappyHorseTraceBody(body),
    providerDetails: completed.providerDetails,
  };
}

function buildHappyHorseTaskBody(
  model: string,
  params: {
    prompt: string;
    media?: HappyHorseMediaItem[];
    parameters: Record<string, unknown>;
  }
) {
  return pruneUndefined({
    model,
    input: pruneUndefined({
      prompt: params.prompt,
      media: params.media,
    }),
    parameters: pruneUndefined(params.parameters),
  });
}

function buildFirstLastFramePrompt(prompt: string, aspectRatio: AiVideoAspectRatio) {
  const trimmed = prompt.trim();
  return [
    trimmed || "根据[Image 1]首帧和[Image 2]尾帧生成顺滑过渡视频。",
    "[Image 1]必须作为视频开头的主体参考，[Image 2]必须作为视频结尾的目标参考；中间过程自然衔接。",
    "保持人物身份、服装结构、颜色、材质和画面主体一致，使用稳定商业摄影运镜，不添加字幕、水印、额外人物或无关物体。",
    buildAspectRatioPrompt(aspectRatio),
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

function buildAspectRatioPrompt(aspectRatio: AiVideoAspectRatio) {
  if (aspectRatio === "auto") {
    return "输出画面优先沿用输入图片的自然比例，主体自然铺满画面，不添加黑边、白边、留白边框或画中画式缩放。";
  }
  return `输出画面必须保持 ${aspectRatio} 比例，主体铺满画面，不添加黑边、白边、留白边框或画中画式缩放。`;
}

function buildMotionControlPrompt(prompt?: string) {
  const trimmed = prompt?.trim();
  return [
    trimmed || "将参考视频中的人物动作节奏和镜头运动应用到参考图像中的模特身上。",
    "视频素材只用于动作、节奏和运镜；人物身份、服装、比例和画面主体以参考图像为准。",
    "保持真实商业摄影质感，避免转场、字幕、水印和额外人物。",
  ].join("\n");
}

function appendAudioPrompt(
  prompt: string,
  input: { audioMode: AiVideoAudioMode; audioPrompt?: string | null; audioUrl?: string | null; generateAudio?: boolean }
) {
  if (!shouldUseHappyHorseAudio(input)) {
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

function shouldUseHappyHorseAudio(input: { audioMode: AiVideoAudioMode; generateAudio?: boolean }) {
  return normalizeHappyHorseAudioMode(input.audioMode) !== "off" && input.generateAudio !== false;
}

function normalizeHappyHorseAudioMode(value: unknown): Exclude<AiVideoAudioMode, "custom"> {
  const audioMode = normalizeAiVideoAudioMode(value);
  return audioMode === "custom" ? "generated" : audioMode;
}

async function runHappyHorseTask(
  provider: ProviderConfig,
  body: Record<string, unknown>,
  onProgress: HappyHorseImageToVideoInput["onProgress"]
) {
  await onProgress?.({
    status: "queued",
    providerStatus: "SUBMITTING",
    progress: 1,
    providerDetails: buildHappyHorseProviderDetails({ requestBody: body }),
  });

  const submitted = await submitJson(`${provider.apiBase}${HAPPYHORSE_SUBMIT_PATH}`, provider.apiKey, body);
  const taskId = extractTaskId(submitted);
  if (!taskId) throw new Error(`HappyHorse 视频接口未返回任务 ID，响应字段: ${describeResponseKeys(submitted)}`);

  const requestId = extractRequestId(submitted);
  const providerStatus = extractStatusText(submitted) || "submitted";
  const submitDetails = buildHappyHorseProviderDetails({
    requestBody: body,
    submitResponse: submitted,
    taskId,
    requestId,
  });
  await onProgress?.({
    taskId,
    requestId,
    status: "queued",
    providerStatus,
    progress: VIDEO_SUBMIT_PROGRESS_MAX,
    providerDetails: submitDetails,
  });

  return pollVideoTask(
    { taskId, providerStatus },
    onProgress,
    async (request) => {
      const json = await getJson(`${provider.apiBase}${HAPPYHORSE_QUERY_PATH}/${encodeURIComponent(request.taskId)}`, provider.apiKey);
      return normalizeHappyHorsePollState(json, {
        requestBody: body,
        submitResponse: submitted,
        fallbackTaskId: request.taskId,
        fallbackRequestId: requestId,
      });
    }
  );
}

async function pollVideoTask(
  request: PollRequest,
  onProgress: HappyHorseImageToVideoInput["onProgress"],
  poll: (request: PollRequest) => Promise<PollState>
) {
  const startedAt = Date.now();
  let lastState: PollState = {
    taskId: request.taskId,
    providerStatus: request.providerStatus || "submitted",
    status: "queued",
    progress: VIDEO_SUBMIT_PROGRESS_MAX,
    urls: [],
  };

  while (Date.now() - startedAt < VIDEO_POLL_TIMEOUT_MS) {
    await sleep(VIDEO_POLL_INTERVAL_MS);
    const elapsed = Date.now() - startedAt;
    let state: PollState;
    try {
      state = await poll(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastState = {
        ...lastState,
        status: "running",
        providerStatus: normalizeHappyHorseTransientPollStatus(message),
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

  throw new Error(`视频生成超时，可稍后在任务队列或作品库查看。HappyHorse task_id: ${lastState.taskId}`);
}

async function submitJson(url: string, apiKey: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  return readJsonResponse(response, "视频任务提交失败");
}

async function getJson(url: string, apiKey: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: buildHeaders(apiKey),
    signal: AbortSignal.timeout(60_000),
  });
  return readJsonResponse(response, "视频任务查询失败");
}

async function readJsonResponse(response: Response, prefix: string) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${prefix}: HTTP ${response.status} ${formatHappyHorseErrorBody(text)}`);
  if (!text.trim()) throw new Error(`${prefix}: 响应为空`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${prefix}: 响应不是 JSON`);
  }
}

function buildHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "identity",
  };
}

function formatHappyHorseErrorBody(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "响应为空";
  try {
    const json = JSON.parse(trimmed);
    const code = typeof json?.error?.code === "string" ? json.error.code : "";
    const message = typeof json?.error?.message === "string" ? json.error.message : "";
    const type = typeof json?.error?.type === "string" ? json.error.type : "";
    return [code, message, type].filter(Boolean).join(" | ") || trimmed.slice(0, 300);
  } catch {
    return trimmed.slice(0, 300);
  }
}

function getHappyHorseVideoProvider(): ProviderConfig {
  const apiKey = (
    process.env.HAPPYHORSE_API_KEY ||
    process.env.YUNWU_HAPPYHORSE_API_KEY ||
    process.env.YUNWU_API_KEY ||
    ""
  ).trim();
  if (!apiKey) throw new Error("HappyHorse 视频 API Key 未配置，请设置 HAPPYHORSE_API_KEY 或 YUNWU_API_KEY");

  const apiBase = normalizeHappyHorseBaseUrl(
    process.env.HAPPYHORSE_BASE_URL ||
    process.env.YUNWU_HAPPYHORSE_BASE_URL ||
    process.env.YUNWU_API_BASE_URL ||
    DEFAULT_HAPPYHORSE_BASE_URL
  );
  return { apiBase, apiKey };
}

function normalizeHappyHorseBaseUrl(value: string) {
  const base = value.trim().replace(/\/+$/, "") || DEFAULT_HAPPYHORSE_BASE_URL;
  const withoutSubmitPath = base.replace(/\/alibailian\/api\/v1\/services\/aigc\/video-generation\/video-synthesis$/i, "");
  const withoutTaskPath = withoutSubmitPath.replace(/\/alibailian\/api\/v1\/tasks$/i, "");
  return withoutTaskPath.replace(/\/v1$/i, "");
}

function normalizeHappyHorsePollState(json: unknown, context: {
  requestBody: Record<string, unknown>;
  submitResponse: unknown;
  fallbackTaskId: string;
  fallbackRequestId?: string;
}): PollState {
  const providerStatus = extractStatusText(json) || "running";
  const urls = extractVideoUrls(json);
  const error = isHappyHorseSuccessfulStatus(providerStatus, urls)
    ? ""
    : extractErrorMessage(json);
  const status = normalizeHappyHorseStatus(providerStatus, urls, error);
  const taskId = extractTaskId(json) || context.fallbackTaskId;
  const requestId = extractRequestId(json) || context.fallbackRequestId;
  return {
    taskId,
    requestId,
    providerStatus,
    status,
    progress: extractProgress(json),
    urls,
    error,
    providerDetails: buildHappyHorseProviderDetails({
      requestBody: context.requestBody,
      submitResponse: context.submitResponse,
      latestResponse: json,
      finalResponse: status === "completed" || status === "failed" ? json : undefined,
      taskId,
      requestId,
    }),
  };
}

function normalizeHappyHorseStatus(providerStatus: string, urls: string[], error?: string): PollState["status"] {
  const status = providerStatus.trim().toLowerCase();
  if (error || ["failed", "fail", "failure", "error", "cancelled", "canceled", "expired"].includes(status)) return "failed";
  if (["succeeded", "completed", "complete", "success", "done", "finished"].includes(status)) return urls.length ? "completed" : "failed";
  if (["pending", "queued", "submitted", "created"].includes(status)) return "queued";
  return "running";
}

function isHappyHorseSuccessfulStatus(providerStatus: string, urls: string[]) {
  const status = providerStatus.trim().toLowerCase();
  return urls.length > 0 && ["succeeded", "completed", "complete", "success", "done", "finished"].includes(status);
}

function normalizeHappyHorseTransientPollStatus(message: string) {
  if (/timeout|aborted/i.test(message)) return "QUERY_TIMEOUT_RETRYING";
  if (/HTTP\s+429/i.test(message)) return "QUERY_RATE_LIMIT_RETRYING";
  if (/HTTP\s+5\d\d/i.test(message)) return "QUERY_SERVER_RETRYING";
  return "QUERY_RETRYING";
}

function extractTaskId(value: unknown): string {
  const candidates = findValuesByOrderedKeys(value, ["task_id", "taskId", "id", "video_id"]);
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
  return "";
}

function extractRequestId(value: unknown): string {
  const candidates = findValuesByOrderedKeys(value, ["request_id", "requestId"]);
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
  return "";
}

function extractStatusText(value: unknown): string {
  const candidates = findValuesByKey(value, ["status", "task_status", "taskStatus", "state"]);
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function extractProgress(value: unknown): number {
  const candidates = findValuesByKey(value, ["progress", "percent", "task_progress"]);
  for (const candidate of candidates) {
    const numeric = typeof candidate === "string"
      ? Number(candidate.match(/\d+(?:\.\d+)?/)?.[0])
      : Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.min(99, Math.max(0, Math.round(numeric > 1 && numeric <= 100 ? numeric : numeric * 100)));
    }
  }
  return 0;
}

function extractErrorMessage(value: unknown): string {
  const candidates = findValuesByKey(value, ["error", "error_message", "message", "msg", "fail_reason"]);
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      const normalized = candidate.trim();
      if (!/^success$/i.test(normalized)) return normalized;
    }
    if (candidate && typeof candidate === "object") {
      const message = extractErrorMessage(candidate);
      if (message) return message;
    }
  }
  return "";
}

function extractVideoUrls(value: unknown): string[] {
  const urls = new Set<string>();
  walkUnknown(value, (entry, key) => {
    if (typeof entry !== "string") return;
    const trimmed = entry.trim();
    if (!/^https?:\/\//i.test(trimmed)) return;
    const keyLooksLikeVideo = /video|result_url|download_url|file_url/i.test(key || "");
    const valueLooksLikeVideo = /\.(mp4|mov|webm|m4v)(?:$|[?#])/i.test(trimmed);
    if (keyLooksLikeVideo || valueLooksLikeVideo) urls.add(trimmed);
  });
  return [...urls];
}

function stringifyHappyHorseTraceBody(body: Record<string, unknown>) {
  return JSON.stringify(redactHappyHorseSignedUrls(body));
}

function redactHappyHorseSignedUrls(value: unknown): unknown {
  if (typeof value === "string") return redactSignedUrl(value);
  if (Array.isArray(value)) return value.map((item) => redactHappyHorseSignedUrls(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, redactHappyHorseSignedUrls(entry)])
  );
}

function redactSignedUrl(value: string) {
  if (!/^https?:\/\//i.test(value) || !/[?&](OSSAccessKeyId|Signature|Expires)=/i.test(value)) return value;
  try {
    const url = new URL(value);
    url.searchParams.delete("OSSAccessKeyId");
    url.searchParams.delete("Expires");
    url.searchParams.delete("Signature");
    url.searchParams.delete("security-token");
    url.searchParams.set("signed", "redacted");
    return url.toString();
  } catch {
    return "[signed-url-redacted]";
  }
}

function buildHappyHorseProviderDetails(input: {
  requestBody: Record<string, unknown>;
  submitResponse?: unknown;
  latestResponse?: unknown;
  finalResponse?: unknown;
  taskId?: string;
  requestId?: string;
}) {
  return pruneUndefined({
    platform: "happyhorse",
    taskId: input.taskId,
    requestId: input.requestId,
    request: redactHappyHorseSignedUrls(input.requestBody),
    submitResponse: input.submitResponse === undefined ? undefined : redactHappyHorseSignedUrls(limitProviderDetail(input.submitResponse)),
    latestResponse: input.latestResponse === undefined ? undefined : redactHappyHorseSignedUrls(limitProviderDetail(input.latestResponse)),
    finalResponse: input.finalResponse === undefined ? undefined : redactHappyHorseSignedUrls(limitProviderDetail(input.finalResponse)),
    updatedAt: new Date().toISOString(),
  });
}

function limitProviderDetail(value: unknown): unknown {
  const text = JSON.stringify(value);
  if (text.length <= 20_000) return value;
  return {
    truncated: true,
    preview: text.slice(0, 20_000),
  };
}

function toHappyHorseResolution(resolution: AiVideoResolution) {
  return resolution === "1080p" ? "1080P" : "720P";
}

function toHappyHorseRatio(aspectRatio: AiVideoAspectRatio) {
  return normalizeAiVideoFixedAspectRatio(aspectRatio || AI_VIDEO_DEFAULT_ASPECT_RATIO);
}

function pruneUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function findValuesByKey(value: unknown, keys: string[]) {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));
  const values: unknown[] = [];
  walkUnknown(value, (entry, key) => {
    if (key && normalizedKeys.has(key.toLowerCase())) values.push(entry);
  });
  return values;
}

function findValuesByOrderedKeys(value: unknown, keys: string[]) {
  return keys.flatMap((key) => findValuesByKey(value, [key]));
}

function walkUnknown(value: unknown, visit: (entry: unknown, key?: string) => void, key?: string) {
  visit(value, key);
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry) => walkUnknown(entry, visit));
    return;
  }
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    walkUnknown(entryValue, visit, entryKey);
  }
}

function describeResponseKeys(value: unknown) {
  if (!value || typeof value !== "object") return typeof value;
  return Object.keys(value as Record<string, unknown>).slice(0, 12).join(", ") || "empty";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
