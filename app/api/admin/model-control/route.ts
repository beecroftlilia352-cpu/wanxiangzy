import { NextResponse } from "next/server";
import { requireAdminApi, type AdminContext } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  decryptProviderSecret,
  encryptProviderSecret,
  isEncryptedProviderSecret,
  isEnvProviderSecret,
  maskProviderSecret,
} from "@/lib/api/model-provider-secrets";
import {
  AI_CONTROL_PLANE_CONFIG_KEY,
  type AiControlPlaneConfig,
  type AiControlPlanePublicConfig,
} from "@/lib/ai-control-plane/types";
import { validateAiControlPlaneConfig } from "@/lib/ai-control-plane/config";
import {
  getAiControlPlaneConfig,
  getAiControlPlanePublicSnapshot,
  invalidateAiControlPlaneCache,
  loadAiProviderHealth,
  loadAiProviderMetrics,
} from "@/lib/ai-control-plane/server";
import { getAiCapacityBackendStatus, getAiProviderInFlight } from "@/lib/ai-control-plane/capacity.server";
import { getGenerationBullMqHealth } from "@/lib/queue/generation-queue-health.server";
import { getOssMirrorHealth } from "@/lib/queue/oss-mirror-health.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi("providers:write");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const hours = Number(url.searchParams.get("hours") || 24);
  const snapshot = await getAiControlPlanePublicSnapshot();
  const deploymentIds = snapshot.config.deployments.map((item) => item.id);
  const admin = getAdminClient();
  const [
    health,
    metrics,
    versions,
    inFlight,
    queueHealth,
    bullmqHealth,
    ossMirrorHealth,
    mediaValidationHealth,
    mediaAssetLifecycleHealth,
  ] = await Promise.all([
    loadAiProviderHealth(deploymentIds),
    loadAiProviderMetrics(hours),
    admin
      .from("admin_config_versions")
      .select("id,status,created_by,published_at,created_at")
      .eq("config_key", AI_CONTROL_PLANE_CONFIG_KEY)
      .order("created_at", { ascending: false })
      .limit(20),
    Promise.all(deploymentIds.map(async (id) => [id, await getAiProviderInFlight(id)] as const)),
    admin.rpc("get_generation_queue_health"),
    getGenerationBullMqHealth(),
    getOssMirrorHealth(),
    admin.rpc("get_media_validation_queue_health"),
    admin.rpc("get_media_asset_lifecycle_health"),
  ]);
  const capacityBackend = getAiCapacityBackendStatus();
  const generationQueueMode = process.env.GENERATION_QUEUE_MODE?.trim().toLowerCase()
    || (process.env.NODE_ENV === "production" ? "bullmq" : "inline");

  return NextResponse.json({
    ok: true,
    ...snapshot,
    health: Object.fromEntries(health),
    metrics,
    inFlight: Object.fromEntries(inFlight),
    capacityBackend,
    generationQueue: {
      mode: generationQueueMode,
      redisConfigured: capacityBackend.configured,
      bullmqConfigured: generationQueueMode === "bullmq" && capacityBackend.configured,
      bullmq: {
        configured: bullmqHealth.configured,
        reachable: bullmqHealth.reachable,
        latencyMs: bullmqHealth.latencyMs,
        workers: bullmqHealth.workers,
        paused: bullmqHealth.paused,
        counts: {
          waiting: bullmqHealth.counts.waiting,
          active: bullmqHealth.counts.active,
          delayed: bullmqHealth.counts.delayed,
          failed: bullmqHealth.counts.failed,
        },
      },
      outbox: normalizeGenerationQueueHealth(queueHealth.data),
      outboxError: Boolean(queueHealth.error),
      ossMirror: {
        configured: ossMirrorHealth.configured,
        reachable: ossMirrorHealth.reachable,
        latencyMs: ossMirrorHealth.latencyMs,
        counts: {
          pending: ossMirrorHealth.counts.pending,
          processing: ossMirrorHealth.counts.processing,
          completed: ossMirrorHealth.counts.completed,
          failed: ossMirrorHealth.counts.failed,
          staleProcessing: ossMirrorHealth.counts.staleProcessing,
        },
        oldestPendingAgeSeconds: ossMirrorHealth.oldestPendingAgeSeconds,
        oldestProcessingAgeSeconds: ossMirrorHealth.oldestProcessingAgeSeconds,
        lastRecoveredAt: ossMirrorHealth.lastRecoveredAt,
        lastCompletedAt: ossMirrorHealth.lastCompletedAt,
        error: ossMirrorHealth.error ? "[redacted]" : null,
      },
      mediaValidation: normalizeMediaValidationHealth(mediaValidationHealth.data),
      mediaValidationError: Boolean(mediaValidationHealth.error),
      mediaAssets: normalizeMediaAssetLifecycleHealth(mediaAssetLifecycleHealth.data),
      mediaAssetsError: Boolean(mediaAssetLifecycleHealth.error),
    },
    versions: versions.data || [],
    versionError: versions.error?.message || null,
  }, { headers: { "Cache-Control": "no-store" } });
}

function normalizeGenerationQueueHealth(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") return null;
  const row = candidate as Record<string, unknown>;
  return {
    pendingCount: nonNegativeNumber(row.pending_count),
    publishingCount: nonNegativeNumber(row.publishing_count),
    publishedCount: nonNegativeNumber(row.published_count),
    deadCount: nonNegativeNumber(row.dead_count),
    oldestPendingAgeSeconds: nonNegativeNumber(row.oldest_pending_age_seconds),
  };
}

function normalizeMediaValidationHealth(value: unknown) {
  const row = firstHealthRow(value);
  if (!row) return null;
  return {
    pendingCount: nonNegativeNumber(row.pending_count),
    processingCount: nonNegativeNumber(row.processing_count),
    completedCount: nonNegativeNumber(row.completed_count),
    deadCount: nonNegativeNumber(row.dead_count),
    staleProcessingCount: nonNegativeNumber(row.stale_processing_count),
    uploadedWithoutJobCount: nonNegativeNumber(row.uploaded_without_job_count),
    oldestPendingAgeSeconds: nonNegativeNumber(row.oldest_pending_age_seconds),
  };
}

function normalizeMediaAssetLifecycleHealth(value: unknown) {
  const row = firstHealthRow(value);
  if (!row) return null;
  return {
    pendingCount: nonNegativeNumber(row.pending_count),
    uploadedCount: nonNegativeNumber(row.uploaded_count),
    verifiedCount: nonNegativeNumber(row.verified_count),
    quarantinedCount: nonNegativeNumber(row.quarantined_count),
    deletedCount: nonNegativeNumber(row.deleted_count),
    cleanupReadyCount: nonNegativeNumber(row.cleanup_ready_count),
    expiredLeaseCount: nonNegativeNumber(row.expired_lease_count),
    oldestPendingAgeSeconds: nonNegativeNumber(row.oldest_pending_age_seconds),
    oldestCleanupReadyAgeSeconds: nonNegativeNumber(row.oldest_cleanup_ready_age_seconds),
  };
}

function firstHealthRow(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : null;
}

function nonNegativeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("providers:write");
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({})) as {
    action?: string;
    config?: unknown;
    versionId?: unknown;
    reason?: unknown;
  };
  const action = typeof body.action === "string" ? body.action : "validate";
  if (action === "rollback") return rollback(body.versionId, body.reason, auth.context);
  if (!["validate", "save-draft", "publish"].includes(action)) {
    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  }

  const existing = await getAiControlPlaneConfig({ decryptSecrets: false, allowLegacy: true });
  const prepared = prepareSecrets(body.config, existing);
  if (prepared.error) return NextResponse.json({ error: prepared.error }, { status: 400 });
  const validation = validateAiControlPlaneConfig(prepared.value);
  addSecretIssues(validation.config, validation.issues);
  const hasErrors = validation.issues.some((issue) => issue.severity === "error");
  if (action === "validate" || hasErrors) {
    return NextResponse.json({
      ok: !hasErrors,
      issues: validation.issues,
      config: toPublicConfig(validation.config),
    }, { status: hasErrors ? 400 : 200, headers: { "Cache-Control": "no-store" } });
  }

  const value: AiControlPlaneConfig = {
    ...validation.config,
    updatedAt: new Date().toISOString(),
    updatedFrom: "admin.model-control",
  };
  const admin = getAdminClient();
  if (action === "save-draft") {
    const { data, error } = await admin.from("admin_config_versions").insert({
      config_key: AI_CONTROL_PLANE_CONFIG_KEY,
      value,
      status: "draft",
      created_by: auth.context.userId,
    }).select("id,status,created_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAdminAuditLog(auth.context, {
      action: "ai_control_plane.draft.create",
      resourceType: "admin_config_version",
      resourceId: data.id,
      reason: normalizeReason(body.reason) || "保存统一模型配置草稿",
      metadata: configSummary(value),
    });
    return NextResponse.json({ ok: true, draft: data }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data, error } = await admin.rpc("publish_ai_control_plane_config", {
    p_value: value,
    p_created_by: auth.context.userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const row = Array.isArray(data) ? data[0] : data;
  invalidateAiControlPlaneCache();
  await writeAdminAuditLog(auth.context, {
    action: "ai_control_plane.publish",
    resourceType: "admin_config_version",
    resourceId: String(row?.id || ""),
    reason: normalizeReason(body.reason) || "发布统一模型配置",
    metadata: configSummary(value),
  });
  return NextResponse.json({ ok: true, version: row }, { headers: { "Cache-Control": "no-store" } });
}

async function rollback(versionId: unknown, reason: unknown, context: AdminContext) {
  const id = typeof versionId === "string" ? versionId : "";
  if (!id) return NextResponse.json({ error: "请选择要回滚的版本" }, { status: 400 });
  const admin = getAdminClient();
  const { data: target, error: loadError } = await admin
    .from("admin_config_versions")
    .select("id,value,status,created_at")
    .eq("id", id)
    .eq("config_key", AI_CONTROL_PLANE_CONFIG_KEY)
    .maybeSingle();
  if (loadError || !target) return NextResponse.json({ error: loadError?.message || "版本不存在" }, { status: 404 });
  const validation = validateAiControlPlaneConfig(target.value);
  if (validation.issues.some((issue) => issue.severity === "error")) {
    return NextResponse.json({ error: "目标版本已不符合当前校验规则，无法回滚", issues: validation.issues }, { status: 400 });
  }
  const value = { ...validation.config, updatedAt: new Date().toISOString(), updatedFrom: `rollback:${id}` };
  const { data, error } = await admin.rpc("publish_ai_control_plane_config", {
    p_value: value,
    p_created_by: context.userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const row = Array.isArray(data) ? data[0] : data;
  invalidateAiControlPlaneCache();
  await writeAdminAuditLog(context, {
    action: "ai_control_plane.rollback",
    resourceType: "admin_config_version",
    resourceId: String(row?.id || ""),
    reason: normalizeReason(reason) || `回滚统一模型配置到 ${id}`,
    metadata: { sourceVersionId: id, ...configSummary(value) },
  });
  return NextResponse.json({ ok: true, version: row }, { headers: { "Cache-Control": "no-store" } });
}

function prepareSecrets(value: unknown, existing: AiControlPlaneConfig | null): { value?: unknown; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "config 必须是 JSON object" };
  const input = structuredClone(value) as Record<string, unknown>;
  if (!Array.isArray(input.providers)) return { error: "providers 必须是数组" };
  const existingById = new Map((existing?.providers || []).map((provider) => [provider.id, provider.apiKey || ""]));
  try {
    input.providers = input.providers.map((raw) => {
      const provider = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      const id = typeof provider.id === "string" ? provider.id : "";
      let apiKey = typeof provider.apiKey === "string" ? provider.apiKey.trim() : "";
      if (!apiKey) apiKey = existingById.get(id) || "";
      if (apiKey && !isEncryptedProviderSecret(apiKey) && !isEnvProviderSecret(apiKey)) apiKey = encryptProviderSecret(apiKey);
      return { ...provider, apiKey };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "API Key 加密失败" };
  }
  return { value: input };
}

function addSecretIssues(config: AiControlPlaneConfig, issues: Array<{ path: string; message: string; severity: "error" | "warning" }>) {
  const referenced = new Set(config.deployments.filter((item) => item.enabled).map((item) => item.providerId));
  config.providers.forEach((provider, index) => {
    if (provider.enabled && referenced.has(provider.id) && !decryptProviderSecret(provider.apiKey)) {
      issues.push({ path: `providers.${index}.apiKey`, message: `供应商 ${provider.name} 被启用部署引用，但尚未配置 API Key`, severity: "error" });
    }
  });
}

function toPublicConfig(config: AiControlPlaneConfig): AiControlPlanePublicConfig {
  return {
    ...config,
    providers: config.providers.map(({ apiKey, ...provider }) => ({
      ...provider,
      apiKeyConfigured: Boolean(apiKey),
      apiKeyMasked: apiKey ? maskProviderSecret(apiKey) : "",
    })),
  };
}

function configSummary(config: AiControlPlaneConfig) {
  return { modelCount: config.models.length, providerCount: config.providers.length, deploymentCount: config.deployments.length };
}
function normalizeReason(value: unknown) { return typeof value === "string" ? value.trim().slice(0, 500) : ""; }
