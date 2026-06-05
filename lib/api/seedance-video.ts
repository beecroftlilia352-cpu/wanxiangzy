import {
  AI_VIDEO_DEFAULT_ASPECT_RATIO,
  AI_VIDEO_DEFAULT_DURATION,
  AI_VIDEO_SEEDANCE_FIRST_LAST_FRAME_MODEL,
  AI_VIDEO_SEEDANCE_MODEL,
  AI_VIDEO_SEEDANCE_STANDARD_MODEL,
  normalizeAiVideoAudioMode,
  type AiVideoAudioMode,
  type AiVideoAspectRatio,
  type AiVideoDuration,
  type AiVideoModelMode,
  type AiVideoResolution,
} from "@/lib/ai-video";

const DEFAULT_LAOZHANG_BASE_URL = "https://api.laozhang.ai";
const SEEDANCE_API_PATH = "/seedance/api/v3";
const VIDEO_SUBMIT_PROGRESS_MAX = 10;
const VIDEO_POLL_INTERVAL_MS = 5_000;
const VIDEO_POLL_TIMEOUT_MS = 10 * 60 * 1000;

export type VideoTaskProgress = {
  taskId?: string;
  status: "queued" | "running" | "completed" | "failed";
  providerStatus?: string;
  progress: number;
  urls?: string[];
  error?: string;
};

export type VideoGenerationResult = {
  url: string;
  urls: string[];
  taskId: string;
  providerStatus: string;
  prompt: string;
  compiledPrompt: string;
};

export type SeedanceImageToVideoInput = {
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

export type SeedanceMotionControlInput = {
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

export type SeedanceFirstLastFrameInput = {
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
  model: string;
};

type PollRequest = {
  taskId: string;
  providerStatus?: string;
};

type PollState = {
  taskId: string;
  providerStatus: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  urls: string[];
  error?: string;
};

type SeedanceContentItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string }; role: "first_frame" | "last_frame" | "reference_image" }
  | { type: "video_url"; video_url: { url: string }; role: "reference_video" }
  | { type: "audio_url"; audio_url: { url: string }; role: "reference_audio" };
type SeedanceRatio = AiVideoAspectRatio | "adaptive";

export async function generateSeedanceImageToVideo(input: SeedanceImageToVideoInput): Promise<VideoGenerationResult> {
  const provider = getSeedanceVideoProvider({ modelMode: input.modelMode, resolution: input.resolution });
  const prompt = appendAudioPrompt(buildImageToVideoPrompt(input.prompt), input);
  const content: SeedanceContentItem[] = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: input.imageUrl }, role: "first_frame" },
    ...getAudioContentItems(input),
  ];
  const body = buildSeedanceTaskBody(provider.model, {
    content,
    ratio: input.aspectRatio || AI_VIDEO_DEFAULT_ASPECT_RATIO,
    duration: input.duration,
    resolution: input.resolution,
    generateAudio: shouldGenerateOrUseAudio(input),
  });

  const completed = await runSeedanceTask(provider, body, input.onProgress);

  return {
    url: completed.urls[0],
    urls: completed.urls,
    taskId: completed.taskId,
    providerStatus: completed.providerStatus,
    prompt,
    compiledPrompt: JSON.stringify(body),
  };
}

export async function generateSeedanceFirstLastFrame(input: SeedanceFirstLastFrameInput): Promise<VideoGenerationResult> {
  const provider = getSeedanceVideoProvider({ mode: "first-last-frame", modelMode: input.modelMode, resolution: input.resolution });
  const prompt = appendAudioPrompt(buildFirstLastFramePrompt(input.prompt), input);
  const content: SeedanceContentItem[] = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: input.firstFrameUrl }, role: "first_frame" },
    { type: "image_url", image_url: { url: input.lastFrameUrl }, role: "last_frame" },
    ...getAudioContentItems(input),
  ];
  const body = buildSeedanceTaskBody(provider.model, {
    content,
    ratio: input.aspectRatio || AI_VIDEO_DEFAULT_ASPECT_RATIO,
    duration: input.duration,
    resolution: input.resolution,
    generateAudio: shouldGenerateOrUseAudio(input),
  });

  const completed = await runSeedanceTask(provider, body, input.onProgress);

  return {
    url: completed.urls[0],
    urls: completed.urls,
    taskId: completed.taskId,
    providerStatus: completed.providerStatus,
    prompt,
    compiledPrompt: JSON.stringify(body),
  };
}

export async function generateSeedanceMotionControl(input: SeedanceMotionControlInput): Promise<VideoGenerationResult> {
  const provider = getSeedanceVideoProvider({ modelMode: input.modelMode, resolution: input.resolution });
  const prompt = appendAudioPrompt(buildMotionControlPrompt(input.prompt), input);
  const content: SeedanceContentItem[] = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: input.modelImageUrl }, role: "reference_image" },
    { type: "video_url", video_url: { url: input.referenceVideoUrl }, role: "reference_video" },
    ...getAudioContentItems(input),
  ];
  const body = buildSeedanceTaskBody(provider.model, {
    content,
    ratio: input.aspectRatio || AI_VIDEO_DEFAULT_ASPECT_RATIO,
    duration: input.duration,
    resolution: input.resolution,
    generateAudio: shouldGenerateOrUseAudio(input),
  });

  const completed = await runSeedanceTask(provider, body, input.onProgress);

  return {
    url: completed.urls[0],
    urls: completed.urls,
    taskId: completed.taskId,
    providerStatus: completed.providerStatus,
    prompt,
    compiledPrompt: JSON.stringify(body),
  };
}

function getAudioContentItems(input: { audioMode: AiVideoAudioMode; audioUrl?: string | null }): SeedanceContentItem[] {
  if (normalizeAiVideoAudioMode(input.audioMode) !== "custom") return [];
  const audioUrl = input.audioUrl?.trim();
  if (!audioUrl) throw new Error("自定义音频 URL 为空");
  return [{ type: "audio_url", audio_url: { url: audioUrl }, role: "reference_audio" }];
}

function shouldGenerateOrUseAudio(input: { audioMode: AiVideoAudioMode; generateAudio: boolean }) {
  return normalizeAiVideoAudioMode(input.audioMode) !== "off" && input.generateAudio !== false;
}

async function runSeedanceTask(
  provider: ProviderConfig,
  body: Record<string, unknown>,
  onProgress: SeedanceImageToVideoInput["onProgress"]
) {
  await onProgress?.({ status: "queued", providerStatus: "SUBMITTING", progress: 1 });
  const submitted = await submitJson(`${provider.apiBase}/contents/generations/tasks`, provider.apiKey, body);
  const taskId = extractTaskId(submitted);
  if (!taskId) throw new Error(`Seedance2 视频接口未返回任务 ID，响应字段: ${describeResponseKeys(submitted)}`);
  const providerStatus = extractStatusText(submitted) || "submitted";
  await onProgress?.({
    taskId,
    status: "queued",
    providerStatus,
    progress: VIDEO_SUBMIT_PROGRESS_MAX,
  });

  return pollVideoTask(
    { taskId, providerStatus },
    onProgress,
    async (request) => {
      const json = await getJson(`${provider.apiBase}/contents/generations/tasks/${encodeURIComponent(request.taskId)}`, provider.apiKey);
      return normalizeSeedancePollState(json, request.taskId);
    }
  );
}

function buildSeedanceTaskBody(
  model: string,
  params: {
    content: SeedanceContentItem[];
    ratio: SeedanceRatio;
    duration?: AiVideoDuration;
    resolution: AiVideoResolution;
    generateAudio: boolean;
  }
) {
  return {
    model,
    content: params.content,
    ratio: params.ratio,
    duration: params.duration || AI_VIDEO_DEFAULT_DURATION,
    resolution: params.resolution,
    watermark: false,
    generate_audio: params.generateAudio,
    return_last_frame: true,
  };
}

function buildFirstLastFramePrompt(prompt: string) {
  const trimmed = prompt.trim();
  return [
    trimmed || "根据首帧和尾帧生成顺滑过渡视频。",
    "首帧必须作为视频开头，尾帧必须作为视频结尾；中间过程自然衔接，不改变人物身份、服装结构、颜色、材质和画面主体。",
    "使用稳定商业摄影运镜，动作和转场要顺滑，不添加字幕、水印、额外人物或无关物体。",
  ].join("\n");
}

function buildImageToVideoPrompt(prompt: string) {
  const trimmed = prompt.trim();
  return [
    trimmed,
    "以输入图片作为首帧和人物/服装硬参考，保持主体身份、服装结构、颜色、材质和比例一致。",
    "生成真实商业摄影风格的短视频，镜头稳定，动作自然，不添加字幕、水印或无关人物。",
  ].filter(Boolean).join("\n");
}

function buildMotionControlPrompt(prompt?: string) {
  const trimmed = prompt?.trim();
  return [
    trimmed || "复刻参考视频中的人物动作节奏和镜头运动。",
    "参考视频只用于动作、节奏和运镜；人物身份、服装、比例和画面主体以输入模特图为准。",
    "保持真实商业摄影质感，避免转场、字幕、水印和额外人物。",
  ].join("\n");
}

function appendAudioPrompt(
  prompt: string,
  input: { audioMode: AiVideoAudioMode; audioPrompt?: string | null; audioUrl?: string | null }
) {
  const audioMode = normalizeAiVideoAudioMode(input.audioMode);
  if (audioMode === "off") return prompt;

  const audioPrompt = input.audioPrompt?.trim();
  if (audioMode === "custom") {
    return [
      prompt,
      audioPrompt
        ? `音频要求：使用上传音频作为主要声音参考，${audioPrompt}`
        : "音频要求：使用上传音频作为主要声音参考，保留其节奏、情绪和关键人声/旋律，画面动作与音频节拍自然对齐，不额外添加突兀人声。",
    ].join("\n");
  }

  return [
    prompt,
    audioPrompt
      ? `音效要求：${audioPrompt}`
      : "音效要求：生成干净自然的商业展示环境声和轻动作音效，节奏贴合画面，不添加嘈杂人声、尖锐噪音或夸张音效。",
  ].join("\n");
}

async function pollVideoTask(
  request: PollRequest,
  onProgress: SeedanceImageToVideoInput["onProgress"],
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
    const state = await poll(request);
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
      status: lastState.status,
      providerStatus: lastState.providerStatus,
      progress: lastState.progress,
      urls: lastState.urls,
      error: lastState.error,
    });

    if (lastState.status === "completed" && lastState.urls.length) return lastState;
    if (lastState.status === "failed") throw new Error(lastState.error || "视频生成失败");
  }

  throw new Error("视频生成超时，可稍后在任务队列或作品库查看。");
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
  if (!response.ok) throw new Error(`${prefix}: HTTP ${response.status} ${text.slice(0, 300)}`);
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
  };
}

function getSeedanceVideoProvider(options: { mode?: "default" | "first-last-frame"; modelMode?: AiVideoModelMode; resolution?: AiVideoResolution } = {}): ProviderConfig {
  const apiKey = (
    process.env.LAOZHANG_SEEDANCE_API_KEY ||
    process.env.LAOZHANG_API_KEY ||
    ""
  ).trim();
  if (!apiKey) throw new Error("Seedance2 视频 API Key 未配置，请设置 LAOZHANG_SEEDANCE_API_KEY 或 LAOZHANG_API_KEY");

  const apiBase = normalizeSeedanceBaseUrl(
    process.env.LAOZHANG_SEEDANCE_BASE_URL ||
    process.env.LAOZHANG_BASE_URL ||
    DEFAULT_LAOZHANG_BASE_URL
  );
  const useStandardModel = options.mode === "first-last-frame" || options.modelMode === "pro" || options.resolution === "1080p";
  const model = useStandardModel
    ? (
        process.env.LAOZHANG_SEEDANCE_PRO_MODEL ||
        process.env.LAOZHANG_SEEDANCE_FIRST_LAST_FRAME_MODEL ||
        AI_VIDEO_SEEDANCE_FIRST_LAST_FRAME_MODEL ||
        AI_VIDEO_SEEDANCE_STANDARD_MODEL
      ).trim()
    : (
        process.env.LAOZHANG_SEEDANCE_FAST_MODEL ||
        process.env.LAOZHANG_SEEDANCE_MODEL ||
        AI_VIDEO_SEEDANCE_MODEL
      ).trim();
  return { apiBase, apiKey, model };
}

function normalizeSeedanceBaseUrl(value: string) {
  const base = value.trim().replace(/\/+$/, "") || DEFAULT_LAOZHANG_BASE_URL;
  const withoutTaskPath = base.replace(/\/contents\/generations\/tasks$/i, "");
  if (/\/api\/v3$/i.test(withoutTaskPath)) return withoutTaskPath;
  return `${withoutTaskPath}${SEEDANCE_API_PATH}`;
}

function normalizeSeedancePollState(json: unknown, fallbackTaskId: string): PollState {
  const providerStatus = extractStatusText(json) || "running";
  const urls = extractVideoUrls(json);
  const error = extractErrorMessage(json);
  const status = normalizeSeedanceStatus(providerStatus, urls, error);
  return {
    taskId: extractTaskId(json) || fallbackTaskId,
    providerStatus,
    status,
    progress: extractProgress(json),
    urls,
    error,
  };
}

function normalizeSeedanceStatus(providerStatus: string, urls: string[], error?: string): PollState["status"] {
  const status = providerStatus.trim().toLowerCase();
  if (error || ["failed", "fail", "failure", "error", "cancelled", "canceled", "expired"].includes(status)) return "failed";
  if (status === "succeeded") return urls.length ? "completed" : "failed";
  if (["completed", "complete", "success", "done", "finished"].includes(status)) return urls.length ? "completed" : "running";
  if (["pending", "queued", "submitted", "created"].includes(status)) return "queued";
  return "running";
}

function extractTaskId(value: unknown): string {
  const candidates = findValuesByKey(value, ["id", "task_id", "taskId", "video_id", "request_id"]);
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
    const keyLooksLikeVideo = /video|url|content|download|file/i.test(key || "");
    const valueLooksLikeVideo = /\.(mp4|mov|webm|m4v)(?:$|[?#])/i.test(trimmed);
    if (keyLooksLikeVideo || valueLooksLikeVideo) urls.add(trimmed);
  });
  return [...urls];
}

function findValuesByKey(value: unknown, keys: string[]) {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));
  const values: unknown[] = [];
  walkUnknown(value, (entry, key) => {
    if (key && normalizedKeys.has(key.toLowerCase())) values.push(entry);
  });
  return values;
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
