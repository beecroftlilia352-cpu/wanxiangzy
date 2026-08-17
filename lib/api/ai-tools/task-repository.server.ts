import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isAiToolSlug,
  type AiToolCreateRequest,
  type AiToolOutput,
  type AiToolProvider,
  type AiToolSubmitResult,
  type AiToolTaskStatus,
} from "@/lib/ai-tools/types";
import type { AiToolSourceOwnership } from "@/lib/api/ai-tools/input-ownership.server";
import { getAdminClient } from "@/lib/supabase/admin";

const TASK_COLUMNS = [
  "id",
  "user_id",
  "request_id",
  "provider",
  "provider_task_id",
  "operation",
  "request_fingerprint",
  "source_asset_id",
  "source_url",
  "source_width",
  "source_height",
  "source_ownership",
  "request_payload",
  "status",
  "provider_payload",
  "outputs",
  "result_urls",
  "response_payload",
  "output_signature",
  "output_persistence_status",
  "submission_lease_token",
  "submission_lease_expires_at",
  "output_lease_token",
  "output_lease_expires_at",
  "generation_id",
  "last_error",
  "submitted_at",
  "last_polled_at",
  "completed_at",
  "created_at",
  "updated_at",
].join(",");

const SUBMISSION_LEASE_MS = 2 * 60_000;
const OUTPUT_LEASE_MS = 2 * 60_000;
const PROVIDER_NAMES = new Set<AiToolProvider>([
  "aliyun-segmentation",
  "aliyun-image-enhancement",
  "generative-image-edit",
  "sharp",
]);
const TASK_STATUSES = new Set<AiToolTaskStatus>(["queued", "processing", "completed", "failed"]);
const OUTPUT_ROLES = new Set(["result", "mask", "alpha", "preview"]);
const OUTPUT_KINDS = new Set(["image", "mask", "alpha"]);
const OUTPUT_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type RepositoryClient = Pick<SupabaseClient, "from" | "rpc">;

export type AiToolTaskRecord = {
  id: string;
  userId: string;
  requestId: string;
  provider: AiToolProvider;
  providerTaskId: string | null;
  operation: AiToolCreateRequest["operation"];
  requestFingerprint: string;
  sourceAssetId: string | null;
  sourceUrl: string;
  sourceWidth: number | null;
  sourceHeight: number | null;
  sourceOwnership: Record<string, unknown>;
  requestPayload: AiToolCreateRequest | null;
  status: "submitting" | AiToolTaskStatus;
  providerPayload: Record<string, unknown>;
  outputs: AiToolOutput[];
  resultUrls: string[];
  responsePayload: Record<string, unknown>;
  outputSignature: string | null;
  outputPersistenceStatus: "pending" | "processing" | "completed" | "failed";
  submissionLeaseToken: string | null;
  submissionLeaseExpiresAt: string | null;
  outputLeaseToken: string | null;
  outputLeaseExpiresAt: string | null;
  generationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BeginAiToolTaskResult =
  | { state: "claimed"; task: AiToolTaskRecord; leaseToken: string }
  | { state: "existing"; task: AiToolTaskRecord; result: AiToolSubmitResult }
  | { state: "in_progress"; task: AiToolTaskRecord };

export type ClaimAiToolOutputResult =
  | { state: "claimed"; leaseToken: string }
  | { state: "cached"; result: AiToolSubmitResult }
  | { state: "busy" };

export class AiToolTaskRepositoryError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { code: string; status?: number; retryable?: boolean },
  ) {
    super(message);
    this.name = "AiToolTaskRepositoryError";
    this.code = options.code;
    this.status = options.status ?? 503;
    this.retryable = options.retryable ?? false;
  }
}

export async function beginAiToolTaskSubmission(
  input: {
    userId: string;
    request: AiToolCreateRequest;
    provider: AiToolProvider;
    sourceOwnership: AiToolSourceOwnership;
  },
  client?: RepositoryClient,
): Promise<BeginAiToolTaskResult> {
  const database = resolveRepositoryClient(client);
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(Date.now() + SUBMISSION_LEASE_MS).toISOString();
  const requestFingerprint = createAiToolRequestFingerprint(input.request);
  const hasSourceDimensions = Boolean(input.sourceOwnership.width && input.sourceOwnership.height);
  const insert = await database
    .from("ai_tool_tasks")
    .insert({
      user_id: input.userId,
      request_id: input.request.request_id,
      provider: input.provider,
      provider_task_id: null,
      operation: input.request.operation,
      request_fingerprint: requestFingerprint,
      source_asset_id: input.sourceOwnership.assetId,
      source_url: input.sourceOwnership.url,
      source_width: hasSourceDimensions ? input.sourceOwnership.width : null,
      source_height: hasSourceDimensions ? input.sourceOwnership.height : null,
      source_ownership: {
        proof: input.sourceOwnership.proof,
        asset_id: input.sourceOwnership.assetId,
        canonical_url: input.sourceOwnership.url,
        width: input.sourceOwnership.width,
        height: input.sourceOwnership.height,
      },
      request_payload: input.request,
      status: "submitting",
      submission_lease_token: leaseToken,
      submission_lease_expires_at: leaseExpiresAt,
    })
    .select(TASK_COLUMNS)
    .single();

  if (!insert.error) {
    return { state: "claimed", task: parseTaskRow(insert.data), leaseToken };
  }
  if (!isUniqueViolation(insert.error)) throw translateDatabaseError(insert.error);

  const existing = await findTaskByRequestId(input.userId, input.request.request_id, database);
  if (!existing) throw taskStoreUnavailable();
  if (existing.requestFingerprint !== requestFingerprint
    || existing.provider !== input.provider
    || existing.operation !== input.request.operation
    || existing.sourceUrl !== input.sourceOwnership.url) {
    throw new AiToolTaskRepositoryError("request_id 已被其他 AI 工具请求使用", {
      code: "AI_TOOL_REQUEST_ID_CONFLICT",
      status: 409,
    });
  }

  const reusable = getReusableAiToolTaskResult(existing);
  if (reusable) return { state: "existing", task: existing, result: reusable };
  if (existing.providerTaskId) return { state: "in_progress", task: existing };

  const expiresAt = Date.parse(existing.submissionLeaseExpiresAt || "");
  if (!Number.isFinite(expiresAt) || expiresAt > Date.now() || !existing.submissionLeaseToken) {
    return { state: "in_progress", task: existing };
  }

  const reclaimed = await database
    .from("ai_tool_tasks")
    .update({
      status: "submitting",
      submission_lease_token: leaseToken,
      submission_lease_expires_at: leaseExpiresAt,
      last_error: null,
    })
    .eq("id", existing.id)
    .eq("user_id", input.userId)
    .is("provider_task_id", null)
    .eq("submission_lease_token", existing.submissionLeaseToken)
    .lt("submission_lease_expires_at", new Date().toISOString())
    .select(TASK_COLUMNS)
    .maybeSingle();
  if (reclaimed.error) throw translateDatabaseError(reclaimed.error);
  if (!reclaimed.data) return { state: "in_progress", task: existing };
  return { state: "claimed", task: parseTaskRow(reclaimed.data), leaseToken };
}

export async function bindAiToolTaskProviderResult(
  task: AiToolTaskRecord,
  leaseToken: string,
  result: AiToolSubmitResult,
  client?: RepositoryClient,
) {
  const database = resolveRepositoryClient(client);
  assertProviderResultMatchesTask(task, result, { allowUnboundTaskId: true });
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    provider_task_id: result.task_id,
    status: result.status,
    provider_payload: result,
    submitted_at: now,
    last_polled_at: now,
    submission_lease_token: null,
    submission_lease_expires_at: null,
    last_error: result.error,
  };
  if (task.provider === "generative-image-edit") update.generation_id = result.task_id;
  if (result.status !== "completed") update.response_payload = result;
  const saved = await database
    .from("ai_tool_tasks")
    .update(update)
    .eq("id", task.id)
    .eq("user_id", task.userId)
    .is("provider_task_id", null)
    .eq("submission_lease_token", leaseToken)
    .select(TASK_COLUMNS)
    .maybeSingle();
  if (saved.error) {
    if (isUniqueViolation(saved.error)) {
      throw new AiToolTaskRepositoryError("Provider 任务标识已绑定到其他请求", {
        code: "AI_TOOL_PROVIDER_TASK_CONFLICT",
        status: 409,
      });
    }
    throw translateDatabaseError(saved.error);
  }
  if (!saved.data) {
    throw new AiToolTaskRepositoryError("AI 工具任务提交租约已失效，请重试", {
      code: "AI_TOOL_TASK_SUBMISSION_LEASE_LOST",
      status: 409,
      retryable: true,
    });
  }
  return parseTaskRow(saved.data);
}

export async function markAiToolTaskSubmissionFailed(
  task: AiToolTaskRecord,
  leaseToken: string,
  error: unknown,
  client?: RepositoryClient,
) {
  const database = resolveRepositoryClient(client);
  const failure = normalizeError(error);
  const { error: databaseError } = await database
    .from("ai_tool_tasks")
    .update({
      status: "failed",
      last_error: failure,
      submission_lease_expires_at: new Date(0).toISOString(),
    })
    .eq("id", task.id)
    .eq("user_id", task.userId)
    .is("provider_task_id", null)
    .eq("submission_lease_token", leaseToken);
  if (databaseError) throw translateDatabaseError(databaseError);
}

export async function findOwnedAiToolTaskByProviderTaskId(
  userId: string,
  providerTaskId: string,
  client?: RepositoryClient,
) {
  const database = resolveRepositoryClient(client);
  const query = await database
    .from("ai_tool_tasks")
    .select(TASK_COLUMNS)
    .eq("user_id", userId)
    .eq("provider_task_id", providerTaskId)
    .limit(1)
    .maybeSingle();
  if (query.error) throw translateDatabaseError(query.error);
  if (!query.data) {
    throw new AiToolTaskRepositoryError("AI 工具任务不存在", {
      code: "AI_TOOL_TASK_NOT_FOUND",
      status: 404,
    });
  }
  return parseTaskRow(query.data);
}

export async function recordAiToolTaskProviderResult(
  task: AiToolTaskRecord,
  result: AiToolSubmitResult,
  client?: RepositoryClient,
) {
  const database = resolveRepositoryClient(client);
  assertProviderResultMatchesTask(task, result);
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: result.status,
    provider_payload: result,
    last_polled_at: now,
    last_error: result.error,
  };
  if (result.status !== "completed") update.response_payload = result;
  const saved = await database
    .from("ai_tool_tasks")
    .update(update)
    .eq("id", task.id)
    .eq("user_id", task.userId)
    .eq("provider_task_id", result.task_id)
    .select(TASK_COLUMNS)
    .maybeSingle();
  if (saved.error) throw translateDatabaseError(saved.error);
  if (!saved.data) throw taskBindingMismatch();
  return parseTaskRow(saved.data);
}

export function getReusableAiToolTaskResult(task: AiToolTaskRecord) {
  if (task.status === "submitting") return null;
  if (task.status === "completed" && task.outputPersistenceStatus !== "completed") return null;
  return parseStoredSubmitResult(task.responsePayload, task);
}

export async function claimAiToolOutputPersistence(
  input: { task: AiToolTaskRecord; userId: string; outputSignature: string },
  client?: RepositoryClient,
): Promise<ClaimAiToolOutputResult> {
  const database = resolveRepositoryClient(client);
  if (input.task.userId !== input.userId) throw taskBindingMismatch();
  const leaseToken = randomUUID();
  const response = await database.rpc("claim_ai_tool_output_persistence", {
    p_task_id: input.task.id,
    p_user_id: input.userId,
    p_output_signature: input.outputSignature,
    p_lease_token: leaseToken,
    p_lease_expires_at: new Date(Date.now() + OUTPUT_LEASE_MS).toISOString(),
  });
  if (response.error) throw translateDatabaseError(response.error);
  const value = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!isRecord(value) || typeof value.claim_state !== "string") throw taskStoreUnavailable();
  if (value.claim_state === "claimed") return { state: "claimed", leaseToken };
  if (value.claim_state === "busy") return { state: "busy" };
  if (value.claim_state === "cached") {
    const persisted = parseStoredSubmitResult(value.persisted_response, input.task);
    if (!persisted) throw taskStoreUnavailable("AI 工具持久化结果损坏");
    return { state: "cached", result: persisted };
  }
  if (value.claim_state === "conflict") {
    throw new AiToolTaskRepositoryError("Provider 完成结果在任务完成后发生变化", {
      code: "AI_TOOL_OUTPUT_SIGNATURE_CONFLICT",
      status: 409,
    });
  }
  if (value.claim_state === "not_found") {
    throw new AiToolTaskRepositoryError("AI 工具任务不存在", {
      code: "AI_TOOL_TASK_NOT_FOUND",
      status: 404,
    });
  }
  throw taskStoreUnavailable();
}

export async function completeAiToolOutputPersistence(
  input: {
    task: AiToolTaskRecord;
    userId: string;
    outputSignature: string;
    leaseToken: string;
    result: AiToolSubmitResult;
  },
  client?: RepositoryClient,
) {
  const database = resolveRepositoryClient(client);
  const response = await database.rpc("complete_ai_tool_output_persistence", {
    p_task_id: input.task.id,
    p_user_id: input.userId,
    p_output_signature: input.outputSignature,
    p_lease_token: input.leaseToken,
    p_outputs: input.result.outputs,
    p_result_urls: input.result.result_urls,
    p_response_payload: input.result,
  });
  if (response.error) throw translateDatabaseError(response.error);
  if (response.data !== true) {
    throw new AiToolTaskRepositoryError("AI 工具结果转存租约已失效，请重试", {
      code: "AI_TOOL_OUTPUT_PERSISTENCE_LEASE_LOST",
      status: 409,
      retryable: true,
    });
  }
}

export async function failAiToolOutputPersistence(
  input: {
    task: AiToolTaskRecord;
    userId: string;
    outputSignature: string;
    leaseToken: string;
    error: unknown;
  },
  client?: RepositoryClient,
) {
  const database = resolveRepositoryClient(client);
  const response = await database.rpc("fail_ai_tool_output_persistence", {
    p_task_id: input.task.id,
    p_user_id: input.userId,
    p_output_signature: input.outputSignature,
    p_lease_token: input.leaseToken,
    p_error: normalizeError(input.error),
  });
  if (response.error) throw translateDatabaseError(response.error);
}

export function createAiToolRequestFingerprint(request: AiToolCreateRequest) {
  return createHash("sha256").update(stableJson(request)).digest("hex");
}

function resolveRepositoryClient(client?: RepositoryClient) {
  if (client) return client;
  try {
    return getAdminClient();
  } catch (error) {
    console.error("[ai-tools] durable task store configuration failed:", databaseErrorSummary(error));
    throw new AiToolTaskRepositoryError("AI 工具任务持久化服务尚未配置", {
      code: "AI_TOOL_TASK_STORE_NOT_CONFIGURED",
      status: 503,
    });
  }
}

async function findTaskByRequestId(
  userId: string,
  requestId: string,
  client: RepositoryClient,
) {
  const query = await client
    .from("ai_tool_tasks")
    .select(TASK_COLUMNS)
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .limit(1)
    .maybeSingle();
  if (query.error) throw translateDatabaseError(query.error);
  return query.data ? parseTaskRow(query.data) : null;
}

function assertProviderResultMatchesTask(
  task: AiToolTaskRecord,
  result: AiToolSubmitResult,
  options: { allowUnboundTaskId?: boolean } = {},
) {
  const taskIdMatches = options.allowUnboundTaskId
    ? task.providerTaskId === null || task.providerTaskId === result.task_id
    : task.providerTaskId === result.task_id;
  if (!taskIdMatches
    || task.requestId !== result.request_id
    || task.operation !== result.operation
    || task.provider !== result.provider
    || result.execution_mode !== "live") {
    throw taskBindingMismatch();
  }
}

function taskBindingMismatch() {
  return new AiToolTaskRepositoryError("Provider 任务响应与服务端归属记录不匹配", {
    code: "AI_TOOL_TASK_BINDING_MISMATCH",
    status: 502,
  });
}

function parseTaskRow(value: unknown): AiToolTaskRecord {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.user_id !== "string"
    || typeof value.request_id !== "string"
    || typeof value.provider !== "string"
    || !PROVIDER_NAMES.has(value.provider as AiToolProvider)
    || !isAiToolSlug(value.operation)
    || typeof value.request_fingerprint !== "string"
    || typeof value.source_url !== "string"
    || !isRecord(value.source_ownership)
    || !["submitting", "queued", "processing", "completed", "failed"].includes(String(value.status))
    || !["pending", "processing", "completed", "failed"].includes(String(value.output_persistence_status))) {
    throw taskStoreUnavailable("AI 工具任务记录格式无效");
  }
  return {
    id: value.id,
    userId: value.user_id,
    requestId: value.request_id,
    provider: value.provider as AiToolProvider,
    providerTaskId: optionalString(value.provider_task_id),
    operation: value.operation,
    requestFingerprint: value.request_fingerprint,
    sourceAssetId: optionalString(value.source_asset_id),
    sourceUrl: value.source_url,
    sourceWidth: positiveInteger(value.source_width),
    sourceHeight: positiveInteger(value.source_height),
    sourceOwnership: value.source_ownership,
    requestPayload: parseStoredRequest(value.request_payload),
    status: value.status as AiToolTaskRecord["status"],
    providerPayload: isRecord(value.provider_payload) ? value.provider_payload : {},
    outputs: Array.isArray(value.outputs) ? value.outputs as AiToolOutput[] : [],
    resultUrls: stringArray(value.result_urls),
    responsePayload: isRecord(value.response_payload) ? value.response_payload : {},
    outputSignature: optionalString(value.output_signature),
    outputPersistenceStatus: value.output_persistence_status as AiToolTaskRecord["outputPersistenceStatus"],
    submissionLeaseToken: optionalString(value.submission_lease_token),
    submissionLeaseExpiresAt: optionalString(value.submission_lease_expires_at),
    outputLeaseToken: optionalString(value.output_lease_token),
    outputLeaseExpiresAt: optionalString(value.output_lease_expires_at),
    generationId: optionalString(value.generation_id),
    createdAt: typeof value.created_at === "string" ? value.created_at : "",
    updatedAt: typeof value.updated_at === "string" ? value.updated_at : "",
  };
}

function parseStoredRequest(value: unknown): AiToolCreateRequest | null {
  if (!isRecord(value) || !isAiToolSlug(value.operation)) return null;
  return value as unknown as AiToolCreateRequest;
}

function parseStoredSubmitResult(value: unknown, task: AiToolTaskRecord): AiToolSubmitResult | null {
  if (!isRecord(value)
    || value.task_id !== task.providerTaskId
    || value.request_id !== task.requestId
    || value.operation !== task.operation
    || value.provider !== task.provider
    || value.execution_mode !== "live"
    || typeof value.stage !== "string"
    || typeof value.progress !== "number"
    || value.expected_count !== 1
    || !TASK_STATUSES.has(value.status as AiToolTaskStatus)
    || !Array.isArray(value.outputs)
    || !value.outputs.every(isAiToolOutput)
    || !Array.isArray(value.result_urls)
    || !value.result_urls.every((item) => typeof item === "string")
    || !Array.isArray(value.warnings)
    || !value.warnings.every((item) => typeof item === "string")) {
    return null;
  }
  return value as unknown as AiToolSubmitResult;
}

function isAiToolOutput(value: unknown) {
  if (!isRecord(value)
    || typeof value.url !== "string"
    || !OUTPUT_ROLES.has(String(value.role))
    || !OUTPUT_KINDS.has(String(value.kind))
    || !(value.mime_type === null || OUTPUT_MIME_TYPES.has(String(value.mime_type)))) return false;
  if (value.dimensions === null) return true;
  return isRecord(value.dimensions)
    && positiveInteger(value.dimensions.width) !== null
    && positiveInteger(value.dimensions.height) !== null;
}

function translateDatabaseError(error: unknown) {
  if (isMigrationMissing(error)) {
    return new AiToolTaskRepositoryError("AI 工具任务持久化迁移尚未部署", {
      code: "AI_TOOL_TASK_STORE_MIGRATION_REQUIRED",
      status: 503,
    });
  }
  console.error("[ai-tools] durable task store failed:", databaseErrorSummary(error));
  return taskStoreUnavailable();
}

function taskStoreUnavailable(message = "AI 工具任务持久化服务暂时不可用") {
  return new AiToolTaskRepositoryError(message, {
    code: "AI_TOOL_TASK_STORE_UNAVAILABLE",
    status: 503,
    retryable: true,
  });
}

function isMigrationMissing(error: unknown) {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : "";
  const message = databaseErrorSummary(error).toLowerCase();
  return ["42P01", "42883", "PGRST202", "PGRST205"].includes(code)
    || message.includes("ai_tool_tasks") && (
      message.includes("does not exist")
      || message.includes("schema cache")
      || message.includes("could not find")
    )
    || message.includes("claim_ai_tool_output_persistence") && message.includes("could not find")
    || message.includes("complete_ai_tool_output_persistence") && message.includes("could not find")
    || message.includes("fail_ai_tool_output_persistence") && message.includes("could not find");
}

function isUniqueViolation(error: unknown) {
  return isRecord(error) && error.code === "23505";
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    const record = error as Error & { code?: string; retryable?: boolean };
    return {
      code: typeof record.code === "string" ? record.code : "AI_TOOL_TASK_FAILED",
      message: record.message.slice(0, 500),
      retryable: record.retryable === true,
    };
  }
  return { code: "AI_TOOL_TASK_FAILED", message: "AI 工具任务处理失败", retryable: false };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function databaseErrorSummary(error: unknown) {
  if (!isRecord(error)) return String(error);
  return [error.code, error.message, error.details, error.hint]
    .filter((item): item is string => typeof item === "string" && Boolean(item))
    .join(" ")
    .slice(0, 800);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
