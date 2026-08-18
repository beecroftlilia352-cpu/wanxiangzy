import { randomUUID } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  acquireAiProviderCapacityDetailed,
  getAiProviderInFlight,
  releaseAiProviderCapacity,
  renewAiProviderCapacity,
  type AiCapacityDecision,
} from "@/lib/ai-control-plane/capacity.server";
import { getAiRouteContext } from "@/lib/ai-control-plane/context.server";
import {
  getAiControlPlaneConfig,
  loadAiProviderHealth,
} from "@/lib/ai-control-plane/server";
import type {
  AiControlPlaneConfig,
  AiModelDeployment,
  AiModality,
  AiProviderEndpoint,
  AiProviderHealth,
  AiResolvedDeployment,
  AiRouteContext,
  AiRoutingMode,
} from "@/lib/ai-control-plane/types";

export class AiProviderHttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterSeconds?: number;
  constructor(message: string, options: { status: number; code?: string; retryAfterSeconds?: number }) {
    super(message);
    this.name = "AiProviderHttpError";
    this.status = options.status;
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export class AiCapacityUnavailableError extends Error {
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds = 15) {
    super(message);
    this.name = "AiCapacityUnavailableError";
    this.retryAfterSeconds = Math.min(Math.max(Math.ceil(retryAfterSeconds), 5), 300);
  }
}

/** Cross-bundle guard used by durable job dispatchers; never rely on instanceof. */
export function isAiCapacityUnavailableError(error: unknown): error is AiCapacityUnavailableError {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; retryAfterSeconds?: unknown };
  return candidate.name === "AiCapacityUnavailableError"
    && typeof candidate.retryAfterSeconds === "number"
    && Number.isFinite(candidate.retryAfterSeconds)
    && candidate.retryAfterSeconds >= 1
    && candidate.retryAfterSeconds <= 300;
}

export type AiRouteExecutionInput<T> = {
  modelId: string;
  modality: AiModality;
  context?: AiRouteContext;
  execute: (deployment: AiResolvedDeployment, attemptNo: number) => Promise<T>;
  describeResult?: (result: T) => {
    inputUnits?: number;
    outputUnits?: number;
    outputWidth?: number;
    outputHeight?: number;
    estimatedCostUsd?: number;
    metadata?: Record<string, unknown>;
  };
};

export async function executeAiRouted<T>(input: AiRouteExecutionInput<T>): Promise<T> {
  const config = await getAiControlPlaneConfig({ decryptSecrets: true, allowLegacy: true });
  if (!config) throw new Error("统一模型配置尚未发布，请先到后台模型控制台完成发布");
  const ambient = getAiRouteContext();
  const context = { ...ambient, ...input.context };
  const requestId = validUuid(context.requestId) ? context.requestId! : randomUUID();
  const model = config.models.find((item) => item.id === input.modelId && item.enabled);
  if (!model) throw new Error(`模型 ${input.modelId} 未启用或不存在`);
  if (model.modality !== input.modality) throw new Error(`模型 ${input.modelId} 不支持 ${input.modality} 模态`);

  const routingMode: AiRoutingMode = context.routingMode || model.defaultRoutingMode || "stable";
  const modelIds = [model.id];
  if (context.allowCrossModelFallback) modelIds.push(...(model.compatibleFallbackModelIds || []));
  const baseCandidates = config.deployments.filter((deployment) =>
    deployment.enabled && modelIds.includes(deployment.modelId) && hasCapabilities(deployment, context.requiredCapabilities),
  );
  const providers = new Map(config.providers.filter((provider) => provider.enabled).map((provider) => [provider.id, provider]));
  const candidates = baseCandidates.filter((deployment) => providers.has(deployment.providerId));
  if (!candidates.length) throw new Error(`模型 ${input.modelId} 没有可用的供应商部署`);
  if (!candidates.some((deployment) => Boolean(providers.get(deployment.providerId)?.apiKey))) {
    throw new Error(`模型 ${input.modelId} 的供应商池未配置可用 API Key`);
  }

  const health = await loadAiProviderHealth(candidates.map((item) => item.id));
  const resolved = await resolveOrder(config, candidates, providers, health, routingMode, requestId);
  if (!resolved.length) {
    throw new AiCapacityUnavailableError(
      `模型 ${input.modelId} 的供应商池正在熔断或限流冷却，将稍后重试`,
      nextHealthRetrySeconds(health),
    );
  }
  const maxAttempts = Math.min(config.policy.maxAttempts, Math.max(1, resolved.length));
  const attempted = new Set<string>();
  const capacitySkipped = new Set<string>();
  const capacityDecisions: AiCapacityDecision[] = [];
  let lastError: unknown = null;
  let providerAttempt = 0;

  for (let selectionIndex = 0; selectionIndex < resolved.length && providerAttempt < maxAttempts; selectionIndex += 1) {
    const deployment = resolved[selectionIndex];
    if (attempted.has(deployment.id)) continue;
    attempted.add(deployment.id);
    const leaseStartedAt = Date.now();
    const capacityDecision = await acquireAiProviderCapacityDetailed({
      deploymentId: deployment.id,
      maxConcurrency: deployment.health.circuitState === "half_open"
        ? Math.min(deployment.maxConcurrency, config.policy.halfOpenMaxRequests)
        : deployment.maxConcurrency,
      requestsPerMinute: deployment.requestsPerMinute,
      burst: deployment.burst,
      ttlSeconds: config.policy.leaseTtlSeconds,
    });
    const lease = capacityDecision.lease;
    if (!lease) {
      capacitySkipped.add(deployment.id);
      capacityDecisions.push(capacityDecision);
      continue;
    }

    providerAttempt += 1;
    const startedAt = Date.now();
    const attemptId = await startAttempt({
      requestId,
      context,
      modelId: input.modelId,
      modality: input.modality,
      deployment,
      routingMode,
      attemptNo: providerAttempt,
      queueLatencyMs: startedAt - leaseStartedAt,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), deployment.provider.timeoutMs);
    const heartbeat = startCapacityHeartbeat(lease, config.policy.leaseTtlSeconds, controller);
    try {
      const result = await input.execute({ ...deployment, abortSignal: controller.signal, selectionReason: { ...deployment.selectionReason, inFlightAfterLease: lease.inFlight } }, providerAttempt);
      const latency = Date.now() - startedAt;
      const details: {
        inputUnits?: number;
        outputUnits?: number;
        outputWidth?: number;
        outputHeight?: number;
        estimatedCostUsd?: number;
        metadata?: Record<string, unknown>;
      } = input.describeResult?.(result) || {};
      if (details.estimatedCostUsd === undefined) {
        details.estimatedCostUsd = deployment.cost?.perImageUsd ?? deployment.cost?.perRequestUsd;
      }
      await Promise.all([
        finishAttempt(attemptId, { status: "succeeded", latency, details }),
        recordOutcome(config, deployment, true, latency),
      ]);
      return result;
    } catch (error) {
      lastError = error;
      const latency = Date.now() - startedAt;
      const classified = classifyAiProviderError(error);
      await Promise.all([
        finishAttempt(attemptId, { status: "failed", latency, error: classified }),
        recordOutcome(config, deployment, false, latency, classified),
      ]);
      logger.warn(`[ai-router] ${input.modelId} via ${deployment.providerId}/${deployment.id} failed: ${classified.category} ${classified.status || ""}`);
      if (!classified.retryable) throw error;
      if (providerAttempt < maxAttempts) await delay(backoffMs(config, providerAttempt, requestId));
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      await releaseAiProviderCapacity(lease);
    }
  }

  if (capacitySkipped.size > 0 && providerAttempt < maxAttempts) {
    const backendUnavailable = capacityDecisions.some((item) => item.reason === "backend_unavailable");
    const rateLimited = capacityDecisions.length > 0 && capacityDecisions.every((item) => item.reason === "rate_limit");
    const retryAfter = capacityDecisions.length
      ? Math.max(1, Math.min(...capacityDecisions.map((item) => item.retryAfterSeconds)))
      : 15;
    throw new AiCapacityUnavailableError(
      backendUnavailable
        ? `模型 ${input.modelId} 的分布式容量服务暂不可用，将在队列中稍后重试`
        : rateLimited
          ? `模型 ${input.modelId} 的供应商池已达到 RPM 上限，将在队列中稍后重试`
          : `模型 ${input.modelId} 的供应商池当前已满，将在队列中稍后重试`,
      retryAfter,
    );
  }
  if (lastError) throw lastError;
  throw new AiCapacityUnavailableError(`模型 ${input.modelId} 的供应商池当前已满，将在队列中稍后重试`);
}

function startCapacityHeartbeat(
  lease: Parameters<typeof renewAiProviderCapacity>[0],
  ttlSeconds: number,
  controller: AbortController,
) {
  const intervalMs = Math.max(10_000, Math.floor(Math.max(30, ttlSeconds) * 1000 / 3));
  let renewing = false;
  let consecutiveFailures = 0;
  return setInterval(() => {
    if (renewing) return;
    renewing = true;
    void renewAiProviderCapacity(lease, ttlSeconds)
      .then((renewed) => {
        if (renewed) {
          consecutiveFailures = 0;
          return;
        }
        consecutiveFailures += 1;
        const expiresAt = lease.expiresAt || 0;
        if (consecutiveFailures >= 2 || Date.now() + intervalMs >= expiresAt) {
          controller.abort(new Error("provider capacity lease lost"));
        }
      })
      .finally(() => {
        renewing = false;
      });
  }, intervalMs);
}

async function resolveOrder(
  config: AiControlPlaneConfig,
  deployments: AiModelDeployment[],
  providers: Map<string, AiProviderEndpoint>,
  healthMap: Map<string, AiProviderHealth>,
  mode: AiRoutingMode,
  requestId: string,
): Promise<AiResolvedDeployment[]> {
  const now = Date.now();
  const hydrated: AiResolvedDeployment[] = [];
  for (const deployment of deployments) {
    const provider = providers.get(deployment.providerId)!;
    const health = healthMap.get(deployment.id) || healthyDefault(deployment.id);
    const openedUntil = Date.parse(health.openedUntil || "") || 0;
    const limitedUntil = Date.parse(health.rateLimitedUntil || "") || 0;
    if ((health.circuitState === "open" && openedUntil > now) || limitedUntil > now || !provider.apiKey) continue;
    const inFlight = await getAiProviderInFlight(deployment.id);
    const capacity = Math.max(0, 1 - inFlight / Math.max(1, deployment.maxConcurrency));
    const dynamicScore = mode === "smart"
      ? smartHealthScore(config, deployment, health, capacity)
      : undefined;
    const score = getAiRoutingCandidateScore({
      mode,
      requestId,
      deployment,
      dynamicScore,
    });
    hydrated.push({
      ...deployment,
      provider,
      apiKey: provider.apiKey || "",
      health: openedUntil <= now && health.circuitState === "open" ? { ...health, circuitState: "half_open" as const } : health,
      score,
      selectionReason: {
        mode,
        priority: deployment.priority,
        score: round(score),
        ...(dynamicScore === undefined ? {} : { dynamicScore: round(dynamicScore) }),
        successRate: round(health.ewmaSuccessRate),
        latencyMs: round(health.ewmaLatencyMs),
        capacity: round(capacity),
      },
    });
  }
  return hydrated
    .sort((a, b) => a.priority - b.priority || b.score - a.score || a.id.localeCompare(b.id));
}

function smartHealthScore(config: AiControlPlaneConfig, deployment: AiModelDeployment, health: AiProviderHealth, capacity: number) {
  const weights = normalizeWeights(config.policy.smartWeights);
  const reliability = clamp(health.sampleCount < 3 ? 0.9 : health.ewmaSuccessRate);
  const latency = health.ewmaLatencyMs > 0 ? 1 / (1 + health.ewmaLatencyMs / 30_000) : 0.75;
  const costValue = deployment.cost?.perImageUsd ?? deployment.cost?.perRequestUsd ?? 0;
  const cost = costValue > 0 ? 1 / (1 + costValue * 10) : 0.7;
  const quality = clamp(deployment.qualityScore ?? 0.8);
  return reliability * weights.reliability + latency * weights.latency + cost * weights.cost + capacity * weights.capacity + quality * weights.quality;
}

/**
 * Weighted rendezvous keeps routing stateless and spreads sequential as well
 * as concurrent traffic. Smart mode turns health into an effective weight
 * instead of always sending every request to the single highest-scored node.
 */
export function getAiRoutingCandidateScore(input: {
  mode: AiRoutingMode;
  requestId: string;
  deployment: Pick<AiModelDeployment, "id" | "weight">;
  dynamicScore?: number;
}) {
  const healthMultiplier = input.mode === "smart"
    ? Math.max(0.05, clamp(input.dynamicScore ?? 0.5)) ** 4
    : 1;
  const effectiveWeight = Math.max(0.01, input.deployment.weight * healthMultiplier);
  return weightedRendezvousScore(input.deployment.id, input.requestId, effectiveWeight);
}

function weightedRendezvousScore(deploymentId: string, requestId: string, effectiveWeight: number) {
  const unit = Math.max(1e-9, hashUnit(`${requestId}:${deploymentId}`));
  return effectiveWeight / -Math.log(unit);
}

function normalizeWeights(weights: Record<string, number>) {
  const total = Object.values(weights).reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
  return {
    reliability: Math.max(0, weights.reliability) / total,
    latency: Math.max(0, weights.latency) / total,
    cost: Math.max(0, weights.cost) / total,
    capacity: Math.max(0, weights.capacity) / total,
    quality: Math.max(0, weights.quality) / total,
  };
}

type ClassifiedError = { category: string; status?: number; code?: string; retryable: boolean; retryAfterSeconds?: number; message: string };

export function classifyAiProviderError(error: unknown): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error);
  const explicitStatus = error instanceof AiProviderHttpError ? error.status : undefined;
  const status = explicitStatus || parseStatus(message);
  const code = error instanceof AiProviderHttpError ? error.code : undefined;
  if (status === 429) return { category: "rate_limit", status, code, retryable: true, retryAfterSeconds: error instanceof AiProviderHttpError ? error.retryAfterSeconds : 60, message };
  if (status === 408 || status === 504 || error instanceof Error && error.name === "AbortError") return { category: "timeout", status, code, retryable: true, message };
  if (status === 401 || status === 403) return { category: "auth", status, code, retryable: true, message };
  if (status === 404) return { category: "configuration", status, code, retryable: true, message };
  if (status && status >= 500) return { category: "provider", status, code, retryable: true, message };
  if (status && status >= 400) return { category: "validation", status, code, retryable: false, message };
  if (/fetch|network|socket|ECONN|EAI_AGAIN/i.test(message)) return { category: "network", code, retryable: true, message };
  if (/未返回|empty|parse|JSON/i.test(message)) return { category: "invalid_response", code, retryable: true, message };
  return { category: "unknown", status, code, retryable: false, message };
}

async function startAttempt(input: {
  requestId: string;
  context: AiRouteContext;
  modelId: string;
  modality: AiModality;
  deployment: AiResolvedDeployment;
  routingMode: AiRoutingMode;
  attemptNo: number;
  queueLatencyMs: number;
}) {
  if (!hasDatabase()) return null;
  const { data, error } = await getAdminClient().from("ai_route_attempts").insert({
    request_id: input.requestId,
    generation_id: validUuid(input.context.generationId) ? input.context.generationId : null,
    user_id: validUuid(input.context.userId) ? input.context.userId : null,
    model_id: input.modelId,
    modality: input.modality,
    deployment_id: input.deployment.id,
    provider_id: input.deployment.providerId,
    upstream_model: input.deployment.upstreamModel,
    routing_mode: input.routingMode,
    attempt_no: input.attemptNo,
    priority: input.deployment.priority,
    status: "running",
    selection_reason: input.deployment.selectionReason,
    queue_latency_ms: input.queueLatencyMs,
  }).select("id").maybeSingle();
  return error ? null : data?.id || null;
}

async function finishAttempt(
  attemptId: string | null,
  input: { status: "succeeded"; latency: number; details: ReturnType<NonNullable<AiRouteExecutionInput<unknown>["describeResult"]>> }
    | { status: "failed"; latency: number; error: ClassifiedError },
) {
  if (!attemptId || !hasDatabase()) return;
  const base = { status: input.status, provider_latency_ms: input.latency, total_latency_ms: input.latency, completed_at: new Date().toISOString() };
  const payload = input.status === "succeeded" ? {
    ...base,
    input_units: input.details.inputUnits,
    output_units: input.details.outputUnits,
    output_width: input.details.outputWidth,
    output_height: input.details.outputHeight,
    estimated_cost_usd: input.details.estimatedCostUsd,
    metadata: safeMetadata(input.details.metadata),
  } : {
    ...base,
    error_category: input.error.category,
    error_code: input.error.code,
    // Raw provider messages can echo prompts or credentials. Persist only the
    // normalized operational category, status and code.
    error_message: `${input.error.category}${input.error.status ? ` (HTTP ${input.error.status})` : ""}`,
    http_status: input.error.status,
  };
  await getAdminClient().from("ai_route_attempts").update(payload).eq("id", attemptId);
}

async function recordOutcome(config: AiControlPlaneConfig, deployment: AiResolvedDeployment, succeeded: boolean, latency: number, error?: ClassifiedError) {
  if (!hasDatabase()) return;
  await getAdminClient().rpc("record_ai_provider_outcome", {
    p_deployment_id: deployment.id,
    p_model_id: deployment.modelId,
    p_provider_id: deployment.providerId,
    p_succeeded: succeeded,
    p_latency_ms: latency,
    p_error_category: error?.category || null,
    p_http_status: error?.status || null,
    p_failure_threshold: config.policy.circuitFailureThreshold,
    p_minimum_samples: config.policy.circuitMinimumSamples,
    p_open_seconds: config.policy.circuitOpenSeconds,
    p_rate_limit_seconds: error?.retryAfterSeconds || 60,
  });
}

function hasDatabase() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY); }
function hasCapabilities(deployment: AiModelDeployment, required?: string[]) { return !required?.length || required.every((item) => (deployment.capabilities || []).includes(item)); }
function healthyDefault(deploymentId: string): AiProviderHealth { return { deploymentId, circuitState: "closed", consecutiveFailures: 0, sampleCount: 0, ewmaSuccessRate: 1, ewmaLatencyMs: 0 }; }
function validUuid(value?: string) { return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)); }
function parseStatus(message: string) { const match = message.match(/(?:HTTP|API\s*错误|status)\s*[:：]?\s*(\d{3})/i); return match ? Number(match[1]) : undefined; }
function clamp(value: number) { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
function round(value: number) { return Math.round(value * 10_000) / 10_000; }
function hashUnit(value: string) { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return ((hash >>> 0) + 1) / 4_294_967_297; }
function backoffMs(config: AiControlPlaneConfig, attempt: number, requestId: string) { const base = Math.min(config.policy.retryMaxDelayMs, config.policy.retryBaseDelayMs * 2 ** Math.max(0, attempt - 1)); return Math.round(base * (0.75 + hashUnit(`${requestId}:${attempt}`) * 0.5)); }
function delay(ms: number) { return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve(); }
function safeMetadata(value?: Record<string, unknown>) { if (!value) return {}; return Object.fromEntries(Object.entries(value).filter(([key, item]) => !/prompt|key|token|authorization|secret/i.test(key) && ["string", "number", "boolean"].includes(typeof item)).slice(0, 32)); }
function nextHealthRetrySeconds(health: Map<string, AiProviderHealth>) {
  const now = Date.now();
  const waits = [...health.values()].flatMap((item) => [item.openedUntil, item.rateLimitedUntil])
    .map((value) => Date.parse(value || "") - now)
    .filter((value) => Number.isFinite(value) && value > 0);
  return waits.length ? Math.ceil(Math.min(...waits) / 1000) : 15;
}
