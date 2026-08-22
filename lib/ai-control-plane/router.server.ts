import { randomUUID } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  acquireAiScopedCapacity,
  rollbackAiScopedCapacity,
  acquireAiProviderCapacityDetailed,
  getAiProviderInFlight,
  releaseAiScopedCapacity,
  releaseAiProviderCapacity,
  renewAiScopedCapacity,
  renewAiProviderCapacity,
  type AiCapacityDecision,
  type AiScopedCapacityLease,
} from "@/lib/ai-control-plane/capacity.server";
import { getAiRouteContext } from "@/lib/ai-control-plane/context.server";
import {
  getAiTenantConcurrencyPolicy,
  providerAccountScope,
  tenantDeploymentScope,
  tenantGlobalScope,
} from "@/lib/ai-control-plane/fairness.server";
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

/** Capacity is owned by the tenant, not by an upstream provider. */
export class AiTenantCapacityUnavailableError extends AiCapacityUnavailableError {
  constructor(message: string, retryAfterSeconds = 15) {
    super(message, retryAfterSeconds);
    this.name = "AiTenantCapacityUnavailableError";
  }
}

export function isAiTenantCapacityUnavailableError(error: unknown): error is AiTenantCapacityUnavailableError {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; retryAfterSeconds?: unknown };
  return candidate.name === "AiTenantCapacityUnavailableError"
    && typeof candidate.retryAfterSeconds === "number"
    && Number.isFinite(candidate.retryAfterSeconds)
    && candidate.retryAfterSeconds >= 1
    && candidate.retryAfterSeconds <= 300;
}

export class AiProviderPoolExhaustedError extends Error {
  readonly retryable: boolean;
  readonly modelId: string;
  readonly attemptedDeployments: number;
  readonly candidateDeployments: number;

  constructor(
    modelId: string,
    attemptedDeployments: number,
    candidateDeployments: number,
    cause?: unknown,
    retryable = true,
  ) {
    super(
      candidateDeployments > 1
        ? `模型 ${modelId} 本次路由的 ${attemptedDeployments} 次供应商调用均失败`
        : `模型 ${modelId} 本次供应商调用失败`,
      { cause },
    );
    this.name = "AiProviderPoolExhaustedError";
    this.modelId = modelId;
    this.attemptedDeployments = attemptedDeployments;
    this.candidateDeployments = candidateDeployments;
    this.retryable = retryable;
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

/** A retryable execution outcome after this route exhausted its attempt budget. */
export function isAiProviderPoolExhaustedError(error: unknown): error is AiProviderPoolExhaustedError {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; attemptedDeployments?: unknown; candidateDeployments?: unknown };
  return candidate.name === "AiProviderPoolExhaustedError"
    && Number.isInteger(candidate.attemptedDeployments)
    && Number(candidate.attemptedDeployments) >= 1
    && Number.isInteger(candidate.candidateDeployments)
    && Number(candidate.candidateDeployments) >= Number(candidate.attemptedDeployments);
}

export type AiRouteExecutionInput<T> = {
  modelId: string;
  modality: AiModality;
  context?: AiRouteContext;
  execute: (deployment: AiResolvedDeployment, attemptNo: number) => Promise<T>;
  /** Return false after an irreversible upstream submission to prevent duplicates. */
  canFailover?: (error: unknown, deployment: AiResolvedDeployment, attemptNo: number) => boolean;
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
  const tenantPolicy = getAiTenantConcurrencyPolicy(context);
  const tenantDecision = context.userId
    ? await acquireAiScopedCapacity({
      scopeKey: tenantGlobalScope(context.userId),
      maxConcurrency: tenantPolicy.userGlobalConcurrency,
      ttlSeconds: config.policy.leaseTtlSeconds,
    })
    : null;
  if (tenantDecision && !tenantDecision.lease) {
    throw new AiTenantCapacityUnavailableError(
      tenantDecision.reason === "backend_unavailable"
        ? "分布式并发服务暂不可用，将在队列中稍后重试"
        : `当前账户并行生成数已达 ${tenantDecision.maxConcurrency}，任务将在队列中公平等待`,
      tenantDecision.retryAfterSeconds,
    );
  }
  const tenantLease = tenantDecision?.lease || null;
  const tenantController = new AbortController();
  const tenantHeartbeat = tenantLease
    ? startScopedCapacityHeartbeat(tenantLease, config.policy.leaseTtlSeconds, tenantController)
    : null;
  try {
  const requestId = validUuid(context.requestId) ? context.requestId! : randomUUID();
  const model = config.models.find((item) => item.id === input.modelId && item.enabled);
  if (!model) throw new Error(`模型 ${input.modelId} 未启用或不存在`);
  if (model.modality !== input.modality) throw new Error(`模型 ${input.modelId} 不支持 ${input.modality} 模态`);

  const routingMode: AiRoutingMode = context.routingMode || model.defaultRoutingMode || "stable";
  const modelIds = [model.id];
  if (context.allowCrossModelFallback) modelIds.push(...(model.compatibleFallbackModelIds || []));
  const baseCandidates = config.deployments.filter((deployment) =>
    deployment.enabled
      && modelIds.includes(deployment.modelId)
      && (!context.requiredDeploymentId || deployment.id === context.requiredDeploymentId)
      && hasCapabilities(deployment, context.requiredCapabilities),
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
  let tenantCapacitySkipped = false;
  let providerAccountCapacitySkipped = false;
  let lastError: unknown = null;
  let sawRetryableFailure = false;
  let providerAttempt = 0;

  for (let selectionIndex = 0; selectionIndex < resolved.length && providerAttempt < maxAttempts; selectionIndex += 1) {
    const deployment = resolved[selectionIndex];
    if (attempted.has(deployment.id)) continue;
    attempted.add(deployment.id);
    const leaseStartedAt = Date.now();
    const tenantDeploymentDecision = context.userId
      ? await acquireAiScopedCapacity({
        scopeKey: tenantDeploymentScope(context.userId, deployment.id),
        maxConcurrency: tenantPolicy.userDeploymentConcurrency,
        ttlSeconds: config.policy.leaseTtlSeconds,
      })
      : null;
    const tenantDeploymentLease = tenantDeploymentDecision?.lease || null;
    if (tenantDeploymentDecision && !tenantDeploymentLease) {
      tenantCapacitySkipped = true;
      continue;
    }
      const providerAccountDecision = await acquireAiScopedCapacity({
        scopeKey: providerAccountScope(deployment.providerId, deployment.provider.capacityGroup),
        maxConcurrency: deployment.provider.capacityMaxConcurrency || deployment.maxConcurrency,
        requestsPerMinute: deployment.provider.capacityRequestsPerMinute || deployment.requestsPerMinute,
        burst: deployment.provider.capacityBurst ?? deployment.burst,
        ttlSeconds: config.policy.leaseTtlSeconds,
      });
    const providerAccountLease = providerAccountDecision.lease;
    if (!providerAccountLease) {
      providerAccountCapacitySkipped = true;
      if (tenantDeploymentLease) await releaseAiScopedCapacity(tenantDeploymentLease);
      continue;
    }
    let capacityDecision: AiCapacityDecision;
    try {
      capacityDecision = await acquireAiProviderCapacityDetailed({
        deploymentId: deployment.id,
        maxConcurrency: deployment.health.circuitState === "half_open"
          ? Math.min(deployment.maxConcurrency, config.policy.halfOpenMaxRequests)
          : deployment.maxConcurrency,
        requestsPerMinute: deployment.requestsPerMinute,
        burst: deployment.burst,
        ttlSeconds: config.policy.leaseTtlSeconds,
      });
    } catch (error) {
      await rollbackAiScopedCapacity(providerAccountLease);
      if (tenantDeploymentLease) await releaseAiScopedCapacity(tenantDeploymentLease);
      throw error;
    }
    const lease = capacityDecision.lease;
    if (!lease) {
      await rollbackAiScopedCapacity(providerAccountLease);
      if (tenantDeploymentLease) await releaseAiScopedCapacity(tenantDeploymentLease);
      capacitySkipped.add(deployment.id);
      capacityDecisions.push(capacityDecision);
      continue;
    }

    providerAttempt += 1;
    const startedAt = Date.now();
    let attemptId: string | null;
    try {
      attemptId = await startAttempt({
        requestId,
        context,
        modelId: input.modelId,
        modality: input.modality,
        deployment,
        routingMode,
        attemptNo: providerAttempt,
        queueLatencyMs: startedAt - leaseStartedAt,
      });
    } catch (error) {
      await releaseAiProviderCapacity(lease);
      await rollbackAiScopedCapacity(providerAccountLease);
      if (tenantDeploymentLease) await releaseAiScopedCapacity(tenantDeploymentLease);
      throw error;
    }
    const controller = new AbortController();
    const abortFromTenantLease = () => controller.abort(tenantController.signal.reason);
    if (tenantController.signal.aborted) abortFromTenantLease();
    else tenantController.signal.addEventListener("abort", abortFromTenantLease, { once: true });
    const abortFromExecutionLease = () => controller.abort(context.executionSignal?.reason);
    if (context.executionSignal?.aborted) abortFromExecutionLease();
    else context.executionSignal?.addEventListener("abort", abortFromExecutionLease, { once: true });
    const timeout = setTimeout(() => controller.abort(), deployment.provider.timeoutMs);
    const heartbeat = startCapacityHeartbeat(lease, config.policy.leaseTtlSeconds, controller);
    const tenantDeploymentHeartbeat = tenantDeploymentLease
      ? startScopedCapacityHeartbeat(tenantDeploymentLease, config.policy.leaseTtlSeconds, controller)
      : null;
    const providerAccountHeartbeat = startScopedCapacityHeartbeat(providerAccountLease, config.policy.leaseTtlSeconds, controller);
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
      await withTelemetryTimeout(Promise.all([
        finishAttempt(attemptId, { status: "succeeded", latency, details }),
        recordOutcome(config, deployment, true, latency),
      ]));
      return result;
    } catch (error) {
      lastError = error;
      const latency = Date.now() - startedAt;
      const classified = classifyAiProviderError(error);
      sawRetryableFailure ||= classified.retryable;
      await withTelemetryTimeout(Promise.all([
        finishAttempt(attemptId, { status: "failed", latency, error: classified }),
        recordOutcome(config, deployment, false, latency, classified),
      ]));
      logger.warn(`[ai-router] ${input.modelId} via ${deployment.providerId}/${deployment.id} failed: ${classified.category} ${classified.status || ""}`);
      if (!classified.retryable && !classified.failoverable) throw error;
      if (input.canFailover?.(error, deployment, providerAttempt) === false) {
        throw new AiProviderPoolExhaustedError(
          input.modelId,
          providerAttempt,
          resolved.length,
          error,
          classified.retryable,
        );
      }
      if (providerAttempt < maxAttempts) await delay(backoffMs(config, providerAttempt, requestId));
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      if (tenantDeploymentHeartbeat) clearInterval(tenantDeploymentHeartbeat);
      clearInterval(providerAccountHeartbeat);
      tenantController.signal.removeEventListener("abort", abortFromTenantLease);
      context.executionSignal?.removeEventListener("abort", abortFromExecutionLease);
      await releaseAiProviderCapacity(lease);
      await releaseAiScopedCapacity(providerAccountLease);
      if (tenantDeploymentLease) await releaseAiScopedCapacity(tenantDeploymentLease);
    }
  }

  if (tenantCapacitySkipped && providerAttempt < maxAttempts) {
    throw new AiTenantCapacityUnavailableError(
      `当前账户在同一供应商上的并行生成数已达 ${tenantPolicy.userDeploymentConcurrency}，任务将在队列中公平等待`,
      5,
    );
  }
  if (providerAccountCapacitySkipped && providerAttempt < maxAttempts) {
    throw new AiCapacityUnavailableError(
      `模型 ${input.modelId} 的供应商账户容量或 RPM 已达上限，将在队列中稍后重试`,
      5,
    );
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
  if (lastError) {
    throw new AiProviderPoolExhaustedError(
      input.modelId,
      providerAttempt,
      resolved.length,
      lastError,
      sawRetryableFailure,
    );
  }
  throw new AiCapacityUnavailableError(`模型 ${input.modelId} 的供应商池当前已满，将在队列中稍后重试`);
  } finally {
    if (tenantHeartbeat) clearInterval(tenantHeartbeat);
    if (tenantLease) await releaseAiScopedCapacity(tenantLease);
  }
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
    if (renewing) {
      if (Date.now() + intervalMs >= (lease.expiresAt || 0)) {
        controller.abort(new Error("provider capacity lease renewal timed out"));
      }
      return;
    }
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

function startScopedCapacityHeartbeat(
  lease: AiScopedCapacityLease,
  ttlSeconds: number,
  controller: AbortController,
) {
  const intervalMs = Math.max(10_000, Math.floor(Math.max(30, ttlSeconds) * 1000 / 3));
  let renewing = false;
  let consecutiveFailures = 0;
  return setInterval(() => {
    if (renewing) {
      if (Date.now() + intervalMs >= (lease.expiresAt || 0)) {
        controller.abort(new Error("tenant capacity lease renewal timed out"));
      }
      return;
    }
    renewing = true;
    void renewAiScopedCapacity(lease, ttlSeconds)
      .then((renewed) => {
        if (renewed) {
          consecutiveFailures = 0;
          return;
        }
        consecutiveFailures += 1;
        const expiresAt = lease.expiresAt || 0;
        if (consecutiveFailures >= 2 || Date.now() + intervalMs >= expiresAt) {
          controller.abort(new Error("tenant capacity lease lost"));
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

type ClassifiedError = {
  category: string;
  status?: number;
  code?: string;
  retryable: boolean;
  failoverable?: boolean;
  retryAfterSeconds?: number;
  message: string;
};

export function classifyAiProviderError(error: unknown): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error && error.name === "NonRetryableGenerationError") {
    const terminal = error as Error & { status?: unknown; code?: unknown };
    const status = Number(terminal.status);
    return {
      category: status === 451 ? "content_policy" : "terminal",
      status: Number.isFinite(status) && status > 0 ? status : undefined,
      code: typeof terminal.code === "string" ? terminal.code : undefined,
      retryable: false,
      failoverable: false,
      message,
    };
  }
  const explicitStatus = error instanceof AiProviderHttpError ? error.status : undefined;
  const status = explicitStatus || parseStatus(message);
  const code = error instanceof AiProviderHttpError ? error.code : undefined;
  if (status === 429) return { category: "rate_limit", status, code, retryable: true, retryAfterSeconds: error instanceof AiProviderHttpError ? error.retryAfterSeconds : 60, message };
  if (status === 408 || status === 504 || error instanceof Error && error.name === "AbortError") return { category: "timeout", status, code, retryable: true, message };
  if (status === 401 || status === 403) return { category: "auth", status, code, retryable: false, failoverable: true, message };
  if (status === 404) return { category: "configuration", status, code, retryable: false, failoverable: true, message };
  if (status === 451) return { category: "content_policy", status, code, retryable: false, message };
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
  try {
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
    if (error) logger.warn(`[ai-router] attempt telemetry insert failed: ${error.message || "database error"}`);
    return error ? null : data?.id || null;
  } catch (error) {
    logger.warn(`[ai-router] attempt telemetry insert unavailable: ${safeOperationalError(error)}`);
    return null;
  }
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
  try {
    const { error } = await getAdminClient().from("ai_route_attempts").update(payload).eq("id", attemptId);
    if (error) logger.warn(`[ai-router] attempt telemetry update failed: ${error.message || "database error"}`);
  } catch (error) {
    logger.warn(`[ai-router] attempt telemetry update unavailable: ${safeOperationalError(error)}`);
  }
}

async function recordOutcome(config: AiControlPlaneConfig, deployment: AiResolvedDeployment, succeeded: boolean, latency: number, error?: ClassifiedError) {
  if (!hasDatabase()) return;
  try {
    const result = await getAdminClient().rpc("record_ai_provider_outcome", {
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
    if (result.error) logger.warn(`[ai-router] provider outcome telemetry failed: ${result.error.message || "database error"}`);
  } catch (telemetryError) {
    logger.warn(`[ai-router] provider outcome telemetry unavailable: ${safeOperationalError(telemetryError)}`);
  }
}

function safeOperationalError(error: unknown) {
  if (!(error instanceof Error)) return "unknown error";
  return `${error.name}: ${error.message}`.slice(0, 300);
}

async function withTelemetryTimeout<T>(promise: Promise<T>, timeoutMs = 2_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("route telemetry timeout")), timeoutMs);
      }),
    ]);
  } catch (error) {
    logger.warn(`[ai-router] route telemetry skipped: ${safeOperationalError(error)}`);
    return undefined as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function hasDatabase() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY); }
function hasCapabilities(deployment: AiModelDeployment, required?: string[]) {
  if (!required?.length) return true;
  // Published legacy deployments predate per-operation capabilities. Their
  // logical model boundary remains authoritative until the next Admin publish.
  if (!deployment.capabilities?.length) return true;
  return required.every((item) => deployment.capabilities!.includes(item));
}
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
