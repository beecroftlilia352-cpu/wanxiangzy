import {
  AI_VIDEO_DEFAULT_ASPECT_RATIO,
  KLING_MOTION_MODEL,
  OMNI_IMAGE_TO_VIDEO_MODEL,
  OMNI_VIDEO_QUERY_MODEL,
  type AiVideoResolution,
} from "@/lib/ai-video";

const DEFAULT_YUNWU_BASE_URL = "https://yunwu.ai";
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

export type OmniImageToVideoInput = {
  imageUrl: string;
  prompt: string;
  resolution: AiVideoResolution;
  aspectRatio?: "9:16" | "16:9";
  onProgress?: (update: VideoTaskProgress) => Promise<void> | void;
};

export type KlingMotionControlInput = {
  modelImageUrl: string;
  referenceVideoUrl: string;
  prompt?: string;
  resolution: AiVideoResolution;
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
  providerStatus: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  urls: string[];
  error?: string;
};

export async function generateOmniImageToVideo(input: OmniImageToVideoInput): Promise<VideoGenerationResult> {
  const provider = getYunwuVideoProvider();
  const prompt = input.prompt.trim();
  const body = {
    model: OMNI_IMAGE_TO_VIDEO_MODEL,
    aspect_ratio: input.aspectRatio || AI_VIDEO_DEFAULT_ASPECT_RATIO,
    enable_upsample: input.resolution === "1080p",
    enhance_prompt: true,
    images: [input.imageUrl],
    prompt,
  };

  await input.onProgress?.({ status: "queued", providerStatus: "SUBMITTING", progress: 1 });
  const submitted = await submitJson(`${provider.apiBase}/v1/video/create`, provider.apiKey, body);
  const taskId = extractTaskId(submitted);
  if (!taskId) throw new Error(`Yunwu 视频接口未返回任务 ID，响应字段: ${describeResponseKeys(submitted)}`);
  const providerStatus = extractStatusText(submitted) || "pending";
  await input.onProgress?.({
    taskId,
    status: "queued",
    providerStatus,
    progress: VIDEO_SUBMIT_PROGRESS_MAX,
  });

  const completed = await pollVideoTask(
    { taskId, providerStatus },
    input.onProgress,
    async (request) => {
      const url = new URL(`${provider.apiBase}/v1/video/query`);
      url.searchParams.set("id", request.taskId);
      url.searchParams.set("model", OMNI_VIDEO_QUERY_MODEL);
      const json = await getJson(url.toString(), provider.apiKey);
      return normalizeProviderPollState(json, request.taskId);
    }
  );

  return {
    url: completed.urls[0],
    urls: completed.urls,
    taskId,
    providerStatus: completed.providerStatus,
    prompt,
    compiledPrompt: JSON.stringify(body),
  };
}

export async function generateKlingMotionControl(input: KlingMotionControlInput): Promise<VideoGenerationResult> {
  const provider = getYunwuVideoProvider();
  const prompt = input.prompt?.trim() || "Recreate the reference video's model movement while preserving the uploaded model image identity, outfit, proportions and clean commercial fashion presentation.";
  const body = {
    model_name: KLING_MOTION_MODEL,
    prompt,
    image_url: input.modelImageUrl,
    video_url: input.referenceVideoUrl,
    keep_original_sound: "no",
    character_orientation: "video",
    mode: input.resolution === "1080p" ? "pro" : "std",
  };

  await input.onProgress?.({ status: "queued", providerStatus: "SUBMITTING", progress: 1 });
  const submitted = await submitJson(`${provider.apiBase}/kling/v1/videos/motion-control`, provider.apiKey, body);
  const taskId = extractTaskId(submitted);
  if (!taskId) throw new Error(`Yunwu 动作模仿接口未返回任务 ID，响应字段: ${describeResponseKeys(submitted)}`);
  const providerStatus = extractStatusText(submitted) || "submitted";
  await input.onProgress?.({
    taskId,
    status: "queued",
    providerStatus,
    progress: VIDEO_SUBMIT_PROGRESS_MAX,
  });

  const completed = await pollVideoTask(
    { taskId, providerStatus },
    input.onProgress,
    async (request) => {
      const json = await getJson(`${provider.apiBase}/kling/v1/videos/motion-control/${encodeURIComponent(request.taskId)}`, provider.apiKey);
      return normalizeProviderPollState(json, request.taskId);
    }
  );

  return {
    url: completed.urls[0],
    urls: completed.urls,
    taskId,
    providerStatus: completed.providerStatus,
    prompt,
    compiledPrompt: JSON.stringify(body),
  };
}

async function pollVideoTask(
  request: PollRequest,
  onProgress: OmniImageToVideoInput["onProgress"],
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
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${prefix}: 响应不是 JSON`);
  }
}

function buildHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "API-KEY": apiKey,
    "Content-Type": "application/json",
  };
}

function getYunwuVideoProvider(): ProviderConfig {
  const apiKey = (
    process.env.YUNWU_VIDEO_API_KEY ||
    process.env.PLATO_API_KEY ||
    process.env.LINGYA_API_KEY ||
    ""
  ).trim();
  if (!apiKey) throw new Error("Yunwu 视频 API Key 未配置");

  const apiBase = normalizeYunwuBaseUrl(
    process.env.YUNWU_VIDEO_BASE_URL ||
    process.env.PLATO_BASE_URL ||
    process.env.LINGYA_BASE_URL ||
    DEFAULT_YUNWU_BASE_URL
  );
  return { apiBase, apiKey };
}

function normalizeYunwuBaseUrl(value: string) {
  const base = value.trim().replace(/\/+$/, "") || DEFAULT_YUNWU_BASE_URL;
  return base.replace(/\/v1$/i, "");
}

function normalizeProviderPollState(json: unknown, fallbackTaskId: string): PollState {
  const providerStatus = extractStatusText(json) || "running";
  const urls = extractVideoUrls(json);
  const error = extractErrorMessage(json);
  const status = normalizeProviderStatus(providerStatus, urls, error);
  return {
    taskId: extractTaskId(json) || fallbackTaskId,
    providerStatus,
    status,
    progress: extractProgress(json),
    urls,
    error,
  };
}

function normalizeProviderStatus(providerStatus: string, urls: string[], error?: string): PollState["status"] {
  const status = providerStatus.trim().toLowerCase();
  if (error || ["failed", "fail", "failure", "error", "cancelled", "canceled"].includes(status)) return "failed";
  if (urls.length && ["completed", "complete", "succeeded", "success", "done", "finished"].includes(status)) return "completed";
  if (urls.length && !["pending", "queued", "submitted", "processing", "running", "in_progress"].includes(status)) return "completed";
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
