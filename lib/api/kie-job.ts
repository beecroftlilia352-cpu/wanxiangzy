/**
 * kie.ai 任务制生图协议（kie-job）。
 *
 * kie.ai 没有 OpenAI 兼容的生图端点，只能按“提交任务 → 轮询任务”工作：
 *   POST {baseUrl}/api/v1/jobs/createTask     { model, input: {...}, callBackUrl? }
 *   GET  {baseUrl}/api/v1/jobs/recordInfo?taskId=...
 *
 * 与 openai-image / gemini-native 的差异，全部通过 deployment.adapterConfig 声明：
 * 1. 上游模型 ID 按“本次请求是否携带输入图”切换（editUpstreamModel）。kie 上 gpt-image-2
 *    与 gpt-image-2-5-* 的文生图 / 图生图是两个不同的模型 ID。
 * 2. 输入图数组的字段名随上游模型不同（imageInputField，默认 image_input）。
 * 3. 尺寸字段名可关闭（imageSizeField，默认 resolution；"none" 表示该模型不接受尺寸字段）。
 *
 * 本模块只使用 fetch、无 node: 内置模块依赖，可被客户端安全的 lingya.ts 引用。
 */

import {
  buildAiAdapterAuthHeaders,
  mergeAiAdapterParameters,
  resolveAiAdapterUrl,
} from "@/lib/ai-control-plane/adapters";
import type { AiDeploymentAdapterConfig, AiResolvedDeployment } from "@/lib/ai-control-plane/types";
import {
  NonRetryableGenerationError,
  ProviderHttpResponseError,
  RetryableGenerationError,
  sanitizeGenerationErrorMessage,
} from "@/lib/api/generation-errors";

export const KIE_JOB_CREATE_TASK_PATH = "/api/v1/jobs/createTask";
export const KIE_JOB_RECORD_INFO_PATH = "/api/v1/jobs/recordInfo";
export const KIE_JOB_DEFAULT_IMAGE_INPUT_FIELD = "image_input";
export const KIE_JOB_DEFAULT_IMAGE_SIZE_FIELD = "resolution";
/** imageSizeField 取该值时表示上游模型不接受尺寸字段（例如 nano-banana-2-lite）。 */
export const KIE_JOB_DISABLED_FIELD = "none";

const KIE_JOB_SUBMIT_PROGRESS_MAX = 8;
const KIE_JOB_POLL_PROGRESS_MAX = 99;
const KIE_JOB_RESPONSE_BODY_MAX_BYTES = 256_000;

const KIE_JOB_QUEUED_STATES = ["waiting", "queuing", "queueing", "pending", "submitted", "not_start"];
const KIE_JOB_RUNNING_STATES = ["generating", "processing", "running", "in_progress", "in-progress"];
const KIE_JOB_SUCCESS_STATES = ["success", "succeeded", "completed", "done"];
const KIE_JOB_FAILURE_STATES = ["fail", "failed", "error", "cancelled", "canceled"];
/** 这些信封错误码证明请求未被接受，可以安全地切换到另一个部署。 */
const KIE_JOB_FAILOVER_ENVELOPE_CODES = [401, 402, 403, 429, 433];
/** 这些信封错误码代表上游瞬时故障，可以重试。 */
const KIE_JOB_RETRYABLE_ENVELOPE_CODES = [429, 433, 455, 500, 503, 504];

export type KieJobProgressUpdate = {
  taskId?: string;
  status: "queued" | "running" | "completed" | "failed";
  providerStatus?: string;
  progress: number;
  urls?: string[];
  error?: string;
};

export type KieJobProgressSink = (update: KieJobProgressUpdate) => Promise<void> | void;

export type KieJobTaskSnapshot = {
  taskId: string;
  /** kie 原始状态（小写），未知状态返回空字符串之外的原文。 */
  state: string;
  status: KieJobProgressUpdate["status"];
  urls: string[];
  error?: string;
};

export type KieJobResult = {
  taskId: string;
  urls: string[];
};

/**
 * 提交前的参考图 URL 解析钩子：把 kie 公网取不到的参考图（内网/站内地址）换成公网 URL。
 * 协议模块本身保持无 node 依赖，实现由服务端注入（见 kie-reference-image.server.ts）。
 */
export type KieReferenceImageResolveInput = {
  imageUrls: string[];
  apiKey: string;
  apiBase: string;
  fetchImpl: typeof fetch;
};

export type KieReferenceImageResolver = (input: KieReferenceImageResolveInput) => Promise<string[]>;

function adapterText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 带输入图时优先使用 editUpstreamModel，否则回落到部署的 upstreamModel。 */
export function resolveKieUpstreamModel(input: {
  upstreamModel: string;
  imageCount: number;
  adapterConfig?: AiDeploymentAdapterConfig;
}): string {
  const editUpstreamModel = adapterText(input.adapterConfig?.editUpstreamModel);
  if (input.imageCount > 0 && editUpstreamModel) return editUpstreamModel;
  return adapterText(input.upstreamModel);
}

export function resolveKieImageInputField(adapterConfig?: AiDeploymentAdapterConfig): string {
  return adapterText(adapterConfig?.imageInputField) || KIE_JOB_DEFAULT_IMAGE_INPUT_FIELD;
}

/** 返回 "" 表示本次请求不发送尺寸字段。 */
export function resolveKieImageSizeField(adapterConfig?: AiDeploymentAdapterConfig): string {
  const configured = adapterText(adapterConfig?.imageSizeField);
  if (!configured) return KIE_JOB_DEFAULT_IMAGE_SIZE_FIELD;
  return configured.toLowerCase() === KIE_JOB_DISABLED_FIELD ? "" : configured;
}

/**
 * kie 只接受已上传的公网图片 URL，不接受内联 base64 / data URL / 内网地址。
 * 本地内网部署的 OSS 地址对 kie.ai 不可达，必须先上传到公网可访问的存储。
 */
export function normalizeKieImageUrls(value: readonly unknown[] | undefined): string[] {
  const urls: string[] = [];
  for (const entry of value || []) {
    const url = adapterText(entry);
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) {
      throw new NonRetryableGenerationError(
        "kie.ai 只接受可公网访问的参考图 URL（不支持 data: 内联图片或本地路径），请先上传到公网可访问的存储",
        "KIE_JOB_IMAGE_URL_REQUIRED",
      );
    }
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

/**
 * 构造 createTask 请求体。canonical 字段（prompt / 输入图 / aspect_ratio / 尺寸）永远
 * 覆盖 staticParameters，因此部署级静态参数无法改写用户提示词或注入额外模型。
 */
export function buildKieCreateTaskBody(input: {
  upstreamModel: string;
  prompt: string;
  imageUrls?: readonly unknown[];
  aspectRatio?: string;
  imageSize?: string;
  adapterConfig?: AiDeploymentAdapterConfig;
}): { model: string; input: Record<string, unknown> } {
  const imageUrls = normalizeKieImageUrls(input.imageUrls);
  const model = resolveKieUpstreamModel({
    upstreamModel: input.upstreamModel,
    imageCount: imageUrls.length,
    adapterConfig: input.adapterConfig,
  });
  if (!model) {
    throw new NonRetryableGenerationError("kie.ai 部署未配置上游模型 ID", "KIE_JOB_MODEL_MISSING");
  }

  const canonical: Record<string, unknown> = { prompt: input.prompt };
  if (imageUrls.length) canonical[resolveKieImageInputField(input.adapterConfig)] = imageUrls;

  const aspectRatio = adapterText(input.aspectRatio);
  if (aspectRatio) canonical.aspect_ratio = aspectRatio;

  const imageSize = adapterText(input.imageSize);
  const imageSizeField = resolveKieImageSizeField(input.adapterConfig);
  if (imageSize && imageSizeField) canonical[imageSizeField] = imageSize;

  return { model, input: mergeAiAdapterParameters(canonical, input.adapterConfig) };
}

export function buildKieJobHeaders(input: {
  apiKey: string;
  adapterConfig?: AiDeploymentAdapterConfig;
  idempotencyKey?: string;
}): Record<string, string> {
  return {
    ...buildAiAdapterAuthHeaders({
      protocol: "kie-job",
      apiKey: input.apiKey,
      adapterConfig: input.adapterConfig,
    }),
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
  };
}

function readKieEnvelope(json: unknown): { code: number | null; message: string; data: Record<string, unknown> } {
  const root = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
  const rawCode = root.code;
  const parsedCode = typeof rawCode === "number"
    ? rawCode
    : typeof rawCode === "string" && /^\d+$/.test(rawCode.trim())
      ? Number(rawCode.trim())
      : null;
  const message = adapterText(root.msg) || adapterText(root.message);
  const data = root.data && typeof root.data === "object" && !Array.isArray(root.data)
    ? root.data as Record<string, unknown>
    : {};
  return { code: parsedCode !== null && Number.isFinite(parsedCode) ? parsedCode : null, message, data };
}

function readKieTaskId(data: Record<string, unknown>): string {
  const candidates = [data.taskId, data.task_id, data.id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
  return "";
}

function readKieState(data: Record<string, unknown>, root: Record<string, unknown>): string {
  const raw = adapterText(data.state) || adapterText(data.status) || adapterText(root.state) || adapterText(root.status);
  return raw.toLowerCase();
}

function sanitizeDiagnosticToken(value: unknown): string {
  const token = adapterText(value);
  if (!token || token.length > 160 || !/^[A-Za-z0-9._:/-]+$/.test(token)) return "";
  return token;
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds), 3600);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.min(Math.max(Math.ceil((timestamp - Date.now()) / 1000), 0), 3600);
}

/** 把 kie 信封错误码映射到既有错误体系。 */
export function createKieEnvelopeError(code: number, message: string, errorCodePrefix = "KIE_JOB_ENVELOPE"): Error {
  const detail = sanitizeGenerationErrorMessage(message || "kie.ai 请求失败", "kie.ai 请求失败");
  const text = "kie.ai 返回错误码 " + code + "：" + detail;
  const errorCode = errorCodePrefix + "_" + code;
  if (KIE_JOB_FAILOVER_ENVELOPE_CODES.includes(code)) {
    return new ProviderHttpResponseError(text, { status: code, code: errorCode, safeToFailover: true });
  }
  if (KIE_JOB_RETRYABLE_ENVELOPE_CODES.includes(code)) return new RetryableGenerationError(text, errorCode);
  return new NonRetryableGenerationError(text, errorCode);
}

/** 提交任务的响应解析：data.taskId 才是权威结果，信封 code 只在缺少 taskId 时用于报错。 */
export function parseKieCreateTaskResponse(json: unknown): { taskId: string } {
  const envelope = readKieEnvelope(json);
  const taskId = readKieTaskId(envelope.data);
  if (taskId) return { taskId };
  if (envelope.code !== null && envelope.code !== 200) {
    throw createKieEnvelopeError(envelope.code, envelope.message || "kie.ai 拒绝了任务提交");
  }
  throw new NonRetryableGenerationError(
    "kie.ai 未返回任务 ID，响应字段: " + describeKieResponseKeys(json),
    "KIE_JOB_AMBIGUOUS_RESPONSE",
  );
}

export function parseKieResultJson(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

export function readKieResultUrls(data: Record<string, unknown>): string[] {
  const resultJson = parseKieResultJson(data.resultJson ?? data.result_json);
  const containers: unknown[] = [
    resultJson?.resultUrls,
    resultJson?.result_urls,
    resultJson?.urls,
    resultJson?.resultUrl,
    resultJson?.url,
    data.resultUrls,
    data.urls,
    data.resultUrl,
  ];
  const urls: string[] = [];
  for (const container of containers) {
    const entries = Array.isArray(container) ? container : [container];
    for (const entry of entries) {
      const url = adapterText(entry);
      if (!url || !/^https?:\/\//i.test(url) || urls.includes(url)) continue;
      urls.push(url);
    }
  }
  return urls;
}

export function isKieJobSuccessState(state: string): boolean {
  return KIE_JOB_SUCCESS_STATES.includes(String(state || "").toLowerCase());
}

export function isKieJobFailureState(state: string): boolean {
  return KIE_JOB_FAILURE_STATES.includes(String(state || "").toLowerCase());
}

export function isKieJobQueuedState(state: string): boolean {
  return KIE_JOB_QUEUED_STATES.includes(String(state || "").toLowerCase());
}

/**
 * 轮询响应解析。data 里出现可用状态时以 payload 为准（信封 code 不参与判断），
 * 缺少状态时才用信封错误码抛出结构化错误。
 */
export function parseKieRecordInfoResponse(json: unknown, fallbackTaskId: string): KieJobTaskSnapshot {
  const root = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
  const envelope = readKieEnvelope(json);
  const state = readKieState(envelope.data, root);
  if (!state) {
    if (envelope.code !== null && envelope.code !== 200) {
      throw createKieEnvelopeError(envelope.code, envelope.message || "kie.ai 任务查询失败", "KIE_JOB_QUERY");
    }
    throw new NonRetryableGenerationError(
      "kie.ai 任务查询响应缺少任务状态，响应字段: " + describeKieResponseKeys(json),
      "KIE_JOB_QUERY_INVALID_RESPONSE",
    );
  }

  const taskId = readKieTaskId(envelope.data) || fallbackTaskId;
  const urls = readKieResultUrls(envelope.data);

  if (isKieJobFailureState(state)) {
    const failMsg = adapterText(envelope.data.failMsg)
      || adapterText(envelope.data.fail_msg)
      || adapterText(envelope.data.error)
      || envelope.message
      || "生成失败";
    const failCode = adapterText(envelope.data.failCode) || adapterText(envelope.data.fail_code);
    return {
      taskId,
      state,
      status: "failed",
      urls: [],
      error: failCode ? failMsg + "（failCode=" + failCode + "）" : failMsg,
    };
  }

  if (isKieJobSuccessState(state)) {
    if (urls.length) return { taskId, state, status: "completed", urls };
    // 状态成功但结果 URL 尚未就绪：交由调用方在宽限期内继续轮询。
    return { taskId, state, status: "running", urls: [] };
  }

  return { taskId, state: state, status: isKieJobQueuedState(state) ? "queued" : "running", urls: [] };
}

export function describeKieResponseKeys(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return typeof value;
  const root = value as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" && !Array.isArray(root.data)
    ? Object.keys(root.data as Record<string, unknown>).slice(0, 12)
    : [];
  return [
    "top=" + (Object.keys(root).slice(0, 12).join(",") || "none"),
    data.length ? "data=" + data.join(",") : "",
  ].filter(Boolean).join("; ");
}

export function calculateKieJobPollProgress(elapsedMs: number, timeoutMs: number, previous = KIE_JOB_SUBMIT_PROGRESS_MAX): number {
  const ratio = Math.min(1, Math.max(0, elapsedMs / Math.max(1, timeoutMs)));
  const target = KIE_JOB_SUBMIT_PROGRESS_MAX
    + Math.round((KIE_JOB_POLL_PROGRESS_MAX - KIE_JOB_SUBMIT_PROGRESS_MAX) * (1 - Math.exp(-3 * ratio)));
  return Math.max(previous, Math.min(KIE_JOB_POLL_PROGRESS_MAX, target));
}

export function createKieJobHttpError(response: Response, responseText: string): ProviderHttpResponseError {
  const status = response.status;
  const errorCode = readKieErrorCode(responseText);
  return new ProviderHttpResponseError("kie.ai 拒绝了请求（HTTP " + status + "）", {
    status,
    code: errorCode || "KIE_JOB_HTTP_" + status,
    retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after")),
    providerRequestId: sanitizeDiagnosticToken(response.headers.get("x-request-id"))
      || sanitizeDiagnosticToken(response.headers.get("request-id"))
      || sanitizeDiagnosticToken(response.headers.get("x-trace-id"))
      || undefined,
    // 401/403/404/429 证明提交流程没有建立任务，允许路由层切换其它部署。
    safeToFailover: status === 401 || status === 403 || status === 404 || status === 429,
  });
}

function readKieErrorCode(responseText: string): string {
  if (!responseText || responseText.length > KIE_JOB_RESPONSE_BODY_MAX_BYTES) return "";
  try {
    const envelope = readKieEnvelope(JSON.parse(responseText));
    return envelope.code !== null ? "KIE_JOB_" + envelope.code : "";
  } catch {
    return "";
  }
}

function parseJsonResponse(responseText: string, message: string, code: string): unknown {
  try {
    return JSON.parse(responseText);
  } catch {
    // 2xx 但响应体不可读时无法证明任务是否建立，绝不能进入可重放的重试路径。
    throw new NonRetryableGenerationError(message, code);
  }
}

export function getKieJobPollIntervalMs(): number {
  const value = Number(process.env.KIE_JOB_POLL_INTERVAL_MS || 3000);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1000), 15_000) : 3000;
}

export function getKieJobTimeoutMs(): number {
  const value = Number(process.env.KIE_JOB_TIMEOUT_MS || 15 * 60 * 1000);
  return Number.isFinite(value) ? Math.min(Math.max(value, 30_000), 45 * 60 * 1000) : 15 * 60 * 1000;
}

export function getKieJobResultGraceMs(): number {
  const value = Number(process.env.KIE_JOB_RESULT_GRACE_MS || 90_000);
  return Number.isFinite(value) ? Math.min(Math.max(value, 10_000), 5 * 60 * 1000) : 90_000;
}

export function getKieJobPollErrorLimit(): number {
  const value = Number(process.env.KIE_JOB_POLL_ERROR_RETRY_LIMIT || 3);
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 0), 10) : 3;
}

/** 提交任务并按 recordInfo 轮询到出图。失败态与超时都抛出结构化错误。 */
export async function generateImageWithKieJob(input: {
  deployment: AiResolvedDeployment;
  apiBase: string;
  apiKey: string;
  upstreamModel?: string;
  prompt: string;
  imageUrls?: readonly unknown[];
  aspectRatio?: string;
  imageSize?: string;
  idempotencyKey?: string;
  /**
   * kie 只接受公网可访问的参考图 URL。服务端可注入解析器，把内网/站内参考图
   * 先转存到 kie 文件服务，再用返回的 downloadUrl 提交；公网 URL 原样保留。
   */
  resolveImageUrls?: KieReferenceImageResolver;
  onProgress?: KieJobProgressSink;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}): Promise<KieJobResult> {
  const adapterConfig = input.deployment.adapterConfig;
  const fetchImpl = input.fetchImpl || fetch;
  const sleep = input.sleepImpl || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // 参考图必须先变成 kie 公网取得到的 URL，再进入请求体（否则 kie 侧取图失败）。
  let imageUrls = normalizeKieImageUrls(input.imageUrls);
  if (input.resolveImageUrls && imageUrls.length) {
    imageUrls = normalizeKieImageUrls(await input.resolveImageUrls({
      imageUrls,
      apiKey: input.apiKey,
      apiBase: input.apiBase,
      fetchImpl,
    }));
  }
  const body = buildKieCreateTaskBody({
    upstreamModel: input.upstreamModel || input.deployment.upstreamModel,
    prompt: input.prompt,
    imageUrls,
    aspectRatio: input.aspectRatio,
    imageSize: input.imageSize,
    adapterConfig,
  });
  const submitUrl = resolveAiAdapterUrl({
    baseUrl: input.apiBase,
    protocol: "kie-job",
    operation: "generation",
    adapterConfig,
    model: body.model,
  });
  const headers = buildKieJobHeaders({ apiKey: input.apiKey, adapterConfig, idempotencyKey: input.idempotencyKey });

  await input.onProgress?.({ status: "queued", providerStatus: "REQUEST_QUEUED", progress: 1 });

  const response = await fetchImpl(submitUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: input.deployment.abortSignal,
  });
  const responseText = await response.text();
  if (!response.ok) throw createKieJobHttpError(response, responseText);

  const { taskId } = parseKieCreateTaskResponse(
    parseJsonResponse(responseText, "kie.ai 任务提交返回了无效响应", "KIE_JOB_INVALID_RESPONSE"),
  );
  await input.onProgress?.({
    taskId,
    status: "queued",
    providerStatus: "SUBMITTED",
    progress: KIE_JOB_SUBMIT_PROGRESS_MAX,
    urls: [],
  });

  const urls = await pollKieJob({
    apiBase: input.apiBase,
    apiKey: input.apiKey,
    taskId,
    adapterConfig,
    deployment: input.deployment,
    fetchImpl,
    sleep,
    onProgress: input.onProgress,
  });

  return { taskId, urls };
}

async function pollKieJob(input: {
  apiBase: string;
  apiKey: string;
  taskId: string;
  adapterConfig?: AiDeploymentAdapterConfig;
  deployment: AiResolvedDeployment;
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  onProgress?: KieJobProgressSink;
}): Promise<string[]> {
  const statusTemplateUrl = resolveAiAdapterUrl({
    baseUrl: input.apiBase,
    protocol: "kie-job",
    operation: "status",
    adapterConfig: input.adapterConfig,
    taskId: input.taskId,
  });
  // 默认状态路径是 /api/v1/jobs/recordInfo，taskId 走 query；若部署自己把
  // {taskId} 写进了自定义状态路径，就不要重复追加 query。
  const encodedTaskId = encodeURIComponent(input.taskId);
  const statusUrl = statusTemplateUrl.includes(encodedTaskId)
    ? statusTemplateUrl
    : statusTemplateUrl + "?taskId=" + encodedTaskId;
  const headers = buildKieJobHeaders({ apiKey: input.apiKey, adapterConfig: input.adapterConfig });

  const startedAt = Date.now();
  const timeoutMs = getKieJobTimeoutMs();
  const resultGraceMs = getKieJobResultGraceMs();
  const intervalMs = getKieJobPollIntervalMs();
  const transientErrorLimit = getKieJobPollErrorLimit();

  let transientErrors = 0;
  let lastTransientMessage = "";
  let progress = KIE_JOB_SUBMIT_PROGRESS_MAX;
  let completedWithoutResultAt: number | null = null;
  let lastResultlessSummary = "";

  while (Date.now() - startedAt < timeoutMs) {
    await input.sleep(intervalMs);

    const response = await input.fetchImpl(statusUrl, {
      method: "GET",
      headers,
      signal: input.deployment.abortSignal,
    });
    const responseText = await response.text();

    if (!response.ok) {
      const message = "kie.ai 任务查询失败（HTTP " + response.status + "）";
      const transient = response.status === 429 || response.status >= 500;
      if (transient && transientErrors < transientErrorLimit) {
        transientErrors += 1;
        lastTransientMessage = message;
        await input.onProgress?.({
          taskId: input.taskId,
          status: "running",
          providerStatus: "QUERY_" + response.status,
          progress,
          urls: [],
          error: message,
        });
        continue;
      }
      // 任务 ID 已知：查询失败不得触发重新提交。
      throw transient
        ? new RetryableGenerationError(message, "KIE_JOB_POLL_HTTP_" + response.status)
        : new NonRetryableGenerationError(message, "KIE_JOB_POLL_HTTP_" + response.status, response.status);
    }

    let json: unknown;
    try {
      json = JSON.parse(responseText);
    } catch {
      const message = "kie.ai 任务查询返回了无效响应";
      if (transientErrors < transientErrorLimit) {
        transientErrors += 1;
        lastTransientMessage = message;
        continue;
      }
      throw new NonRetryableGenerationError(message, "KIE_JOB_QUERY_INVALID_RESPONSE");
    }
    transientErrors = 0;
    lastTransientMessage = "";

    const snapshot = parseKieRecordInfoResponse(json, input.taskId);
    progress = calculateKieJobPollProgress(Date.now() - startedAt, timeoutMs, progress);
    const providerStatus = snapshot.state.toUpperCase();

    if (snapshot.status === "completed") {
      await input.onProgress?.({
        taskId: snapshot.taskId,
        status: "completed",
        providerStatus: providerStatus || "SUCCESS",
        progress: 100,
        urls: snapshot.urls,
      });
      return snapshot.urls;
    }

    if (snapshot.status === "failed") {
      const error = sanitizeGenerationErrorMessage(snapshot.error, "kie.ai 生成任务失败");
      await input.onProgress?.({
        taskId: snapshot.taskId,
        status: "failed",
        providerStatus,
        progress,
        urls: [],
        error,
      });
      // 任务已经在 kie 侧执行结束，重新提交会对同一提示词重复计费。
      throw new NonRetryableGenerationError("kie.ai 生成任务失败：" + error, "KIE_JOB_TASK_FAILED");
    }

    if (isKieJobSuccessState(snapshot.state)) {
      completedWithoutResultAt ??= Date.now();
      lastResultlessSummary = describeKieResponseKeys(json);
      if (Date.now() - completedWithoutResultAt >= resultGraceMs) {
        throw new NonRetryableGenerationError(
          "kie.ai 任务状态成功但结果 URL 未就绪，任务 " + snapshot.taskId
            + "，响应字段: " + (lastResultlessSummary || "unknown"),
          "KIE_JOB_RESULT_MISSING",
        );
      }
    } else {
      completedWithoutResultAt = null;
    }

    await input.onProgress?.({
      taskId: snapshot.taskId,
      status: snapshot.status,
      providerStatus,
      progress,
      urls: snapshot.urls,
    });
  }

  throw new NonRetryableGenerationError(
    lastTransientMessage
      ? "kie.ai 生成任务超时，最后一次查询错误：" + lastTransientMessage
      : "kie.ai 生成任务超时（" + Math.round(timeoutMs / 1000) + " 秒）",
    "KIE_JOB_TIMEOUT",
  );
}

/** 内部解析器的测试出口（与 lingya.ts 的 __lingyaTaskResponseTestUtils 同一约定）。 */
export const __kieJobTestUtils = {
  readKieEnvelope,
  readKieState,
  readKieResultUrls,
  describeKieResponseKeys,
  parseJsonResponse,
  readKieErrorCode,
  pollKieJob,
  KIE_JOB_SUBMIT_PROGRESS_MAX,
};
