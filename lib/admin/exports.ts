import {
  listAdminAssets,
  listAdminAuditLogs,
  getAdminAssetLifecycleOverview,
  getAdminAgentEvalOverview,
  listAdminCreditLogs,
  getAdminDiagnostics,
  getAdminPromptExperimentOverview,
  getAdminCostReport,
  listAdminModerationCases,
  listAdminOperationRequests,
  getAdminRiskOverview,
  listAdminSupportTickets,
  listAdminTasks,
  listAdminUsers,
} from "@/lib/admin/data";
import { isRecord } from "@/lib/utils";

export const ADMIN_EXPORT_TYPES = [
  "users",
  "credits",
  "generations",
  "assets",
  "asset_lifecycle",
  "audit",
  "agent_evals",
  "prompt_experiments",
  "diagnostics",
  "reports",
  "risk_scores",
  "requests",
  "support_tickets",
  "moderation",
] as const;

export type AdminExportType = (typeof ADMIN_EXPORT_TYPES)[number];

export type AdminExportFilters = {
  q?: string;
  status?: string;
  module?: string;
  sourceType?: "generation" | "workflow" | "all";
  stale?: boolean;
  limit?: number;
  days?: number;
};

export type AdminExportData = {
  columns: string[];
  rows: string[][];
};

export async function loadAdminExportData(
  exportType: AdminExportType,
  filters: AdminExportFilters,
): Promise<AdminExportData> {
  const limit = clampExportLimit(filters.limit);
  if (exportType === "users") {
    const result = await listAdminUsers({ q: filters.q, limit });
    return {
      columns: ["id", "email", "display_name", "account_status", "generate_enabled", "support_level", "control_reason", "control_expires_at", "credits", "total_credits_used", "generation_count", "workflow_count", "created_at", "updated_at"],
      rows: result.rows.map((row) => [
        row.id,
        row.email,
        row.displayName || "",
        row.accountStatus,
        String(row.generateEnabled),
        row.supportLevel,
        row.controlReason || "",
        row.controlExpiresAt || "",
        String(row.credits),
        String(row.totalCreditsUsed),
        String(row.generationCount),
        String(row.workflowCount),
        row.createdAt || "",
        row.updatedAt || "",
      ]),
    };
  }

  if (exportType === "credits") {
    const result = await listAdminCreditLogs({ q: filters.q, limit });
    return {
      columns: ["id", "user_id", "email", "amount", "balance", "reason", "generation_id", "created_at"],
      rows: result.rows.map((row) => [
        row.id,
        row.userId,
        row.email || "",
        String(row.amount),
        String(row.balance),
        row.reason,
        row.generationId || "",
        row.createdAt || "",
      ]),
    };
  }

  if (exportType === "generations") {
    const result = await listAdminTasks({
      q: filters.q,
      module: filters.module,
      status: filters.status,
      sourceType: filters.sourceType,
      stale: filters.stale,
      limit,
    });
    return {
      columns: ["id", "source_id", "source_type", "user_id", "module", "status", "status_group", "progress", "expected_count", "result_count", "is_stale", "stale_minutes", "credits", "created_at", "updated_at", "completed_at", "error"],
      rows: result.rows.map((row) => [
        row.id,
        row.sourceId,
        row.sourceType,
        row.userId,
        row.module,
        row.status,
        row.statusGroup,
        String(row.progress),
        String(row.expectedCount),
        String(row.resultCount),
        String(row.isStale),
        String(row.staleMinutes),
        String(row.credits || 0),
        row.createdAt || "",
        row.updatedAt || "",
        row.completedAt || "",
        row.errorMessage || "",
      ]),
    };
  }

  if (exportType === "assets") {
    const result = await listAdminAssets({ q: filters.q, module: filters.module, limit });
    return {
      columns: ["id", "source_type", "user_id", "module", "status", "image_count", "input_count", "moderation_action", "moderation_reason", "created_at", "updated_at"],
      rows: result.rows.map((row) => [
        row.id,
        row.sourceType,
        row.userId,
        row.module,
        row.status,
        String(row.urls.length),
        String(row.inputUrls.length),
        row.moderationCase?.action || "",
        row.moderationCase?.reason || "",
        row.createdAt || "",
        row.updatedAt || "",
      ]),
    };
  }

  if (exportType === "asset_lifecycle") {
    const result = await getAdminAssetLifecycleOverview({ q: filters.q, module: filters.module, limit });
    return {
      columns: ["id", "source_type", "user_id", "module", "stage", "risk_level", "providers", "url_count", "input_count", "age_days", "recommended_action", "moderation_action", "reasons", "detail_url"],
      rows: result.rows.map((row) => [
        row.id,
        row.sourceType,
        row.userId,
        row.module,
        row.stage,
        row.riskLevel,
        row.providers.join(";"),
        String(row.urlCount),
        String(row.inputCount),
        String(row.ageDays),
        row.recommendedAction,
        row.moderationAction || "",
        row.reasons.join("; "),
        row.detailUrl,
      ]),
    };
  }

  if (exportType === "audit") {
    const result = await listAdminAuditLogs({ limit });
    return {
      columns: ["id", "actor_user_id", "actor_email", "actor_role", "action", "resource_type", "resource_id", "reason", "created_at"],
      rows: result.rows.map((row) => [
        row.id,
        row.actorUserId || "",
        row.actorEmail || "",
        row.actorRole || "",
        row.action,
        row.resourceType,
        row.resourceId || "",
        row.reason || "",
        row.createdAt || "",
      ]),
    };
  }

  if (exportType === "agent_evals") {
    const result = await getAdminAgentEvalOverview({ q: filters.q, limit });
    return {
      columns: ["scope", "run_id", "result_id", "user_id", "email", "case_id", "title", "status", "score", "total", "passed", "failed", "action", "module", "confidence", "latency_ms", "failures", "created_at"],
      rows: [
        ...result.runs.map((row) => [
          "run",
          row.id,
          "",
          row.userId,
          row.email || "",
          "",
          "",
          row.status,
          String(row.score),
          String(row.total),
          String(row.passed),
          String(row.failed),
          "",
          "",
          "",
          String(row.latencyMs),
          "",
          row.createdAt || "",
        ]),
        ...result.failures.map((row) => [
          "failed_case",
          row.runId,
          row.id,
          row.userId,
          row.email || "",
          row.caseId,
          row.title,
          row.ok ? "pass" : "failed",
          "",
          "",
          "",
          "",
          row.action || "",
          row.module || "",
          String(row.confidence),
          "",
          row.failures.join("; "),
          row.createdAt || "",
        ]),
      ],
    };
  }

  if (exportType === "prompt_experiments") {
    const result = await getAdminPromptExperimentOverview();
    return {
      columns: ["experiment_id", "name", "module", "status", "traffic", "primary_metric", "variant_key", "variant_label", "variant_weight", "template", "guardrails", "version_id", "version_status", "version_published_at"],
      rows: result.experiments.flatMap((experiment) => (
        experiment.variants.length ? experiment.variants : [{ key: "", label: "", weight: 0, template: "", notes: null }]
      ).map((variant) => [
        experiment.id,
        experiment.name,
        experiment.module,
        experiment.status,
        String(experiment.traffic),
        experiment.primaryMetric,
        variant.key,
        variant.label,
        String(variant.weight),
        variant.template,
        experiment.guardrails.join("; "),
        experiment.versionId,
        experiment.versionStatus,
        experiment.versionPublishedAt || "",
      ])),
    };
  }

  if (exportType === "diagnostics") {
    const result = await getAdminDiagnostics();
    return {
      columns: ["id", "severity", "category", "title", "summary", "impact", "recommendation", "evidence", "created_at"],
      rows: result.items.map((row) => [
        row.id,
        row.severity,
        row.category,
        row.title,
        row.summary,
        row.impact,
        row.recommendation,
        JSON.stringify(row.evidence),
        row.createdAt,
      ]),
    };
  }

  if (exportType === "reports") {
    const result = await getAdminCostReport({ days: filters.days || 14 });
    return {
      columns: ["scope", "key", "label", "count", "gross_credits", "refund_credits", "net_credits", "settled_credits", "margin_credits", "failure_rate"],
      rows: [
        ...result.modules.map((row) => [
          "module",
          row.key,
          row.label,
          String(row.count),
          String(row.grossCredits),
          String(row.refundCredits),
          String(row.netCredits),
          String(row.settledCredits),
          String(row.marginCredits),
          String(row.failureRate),
        ]),
        ...result.models.map((row) => [
          "model",
          row.key,
          row.label,
          String(row.count),
          String(row.grossCredits),
          String(row.refundCredits),
          String(row.netCredits),
          String(row.settledCredits),
          String(row.marginCredits),
          String(row.failureRate),
        ]),
      ],
    };
  }

  if (exportType === "risk_scores") {
    const result = await getAdminRiskOverview({ q: filters.q, level: filters.status, days: filters.days || 30, limit });
    return {
      columns: ["user_id", "email", "score", "level", "credits", "total_credits_used", "generation_count", "failed_generations", "refund_credits", "adjustment_credits", "moderation_hits", "support_tickets", "urgent_support_tickets", "signals", "recommended_action", "latest_activity_at"],
      rows: result.rows.map((row) => [
        row.userId,
        row.email || "",
        String(row.score),
        row.level,
        String(row.credits),
        String(row.totalCreditsUsed),
        String(row.generationCount),
        String(row.failedGenerations),
        String(row.refundCredits),
        String(row.adjustmentCredits),
        String(row.moderationHits),
        String(row.supportTickets),
        String(row.urgentSupportTickets),
        row.signals.map((signal) => `${signal.label}(+${signal.score})`).join("; "),
        row.recommendedAction,
        row.latestActivityAt || "",
      ]),
    };
  }

  if (exportType === "requests") {
    const result = await listAdminOperationRequests({ q: filters.q, status: filters.status, limit });
    return {
      columns: ["id", "request_type", "status", "target_type", "target_id", "risk_level", "reason", "requested_by_email", "approved_by_email", "created_at", "approved_at"],
      rows: result.rows.map((row) => [
        row.id,
        row.requestType,
        row.status,
        row.targetType,
        row.targetId,
        row.riskLevel,
        row.reason,
        row.requestedByEmail || "",
        row.approvedByEmail || "",
        row.createdAt || "",
        row.approvedAt || "",
      ]),
    };
  }

  if (exportType === "support_tickets") {
    const result = await listAdminSupportTickets({ q: filters.q, status: filters.status, category: filters.module, limit });
    return {
      columns: ["id", "ticket_no", "status", "priority", "category", "source", "user_id", "user_email", "generation_id", "asset_source_type", "asset_source_id", "title", "description", "resolution", "tags", "assigned_to_email", "created_by_email", "created_at", "updated_at", "resolved_at"],
      rows: result.rows.map((row) => [
        row.id,
        row.ticketNo,
        row.status,
        row.priority,
        row.category,
        row.source,
        row.userId || "",
        row.userEmail || "",
        row.generationId || "",
        row.assetSourceType || "",
        row.assetSourceId || "",
        row.title,
        row.description,
        row.resolution || "",
        row.tags.join(";"),
        row.assignedToEmail || "",
        row.createdByEmail || "",
        row.createdAt || "",
        row.updatedAt || "",
        row.resolvedAt || "",
      ]),
    };
  }

  const result = await listAdminModerationCases({ q: filters.q, limit });
  return {
    columns: ["id", "source_type", "source_id", "action", "status", "reason", "created_by", "created_at", "resolved_at"],
    rows: result.rows.map((row) => [
      row.id,
      row.sourceType,
      row.sourceId,
      row.action,
      row.status,
      row.reason || "",
      row.createdBy || "",
      row.createdAt || "",
      row.resolvedAt || "",
    ]),
  };
}

export function buildAdminExportCsv({
  data,
  exportType,
  exportedBy,
  exportedAt,
  expiresAt,
}: {
  data: AdminExportData;
  exportType: AdminExportType;
  exportedBy: string;
  exportedAt: string;
  expiresAt: string;
}) {
  const rows = [
    ["Exported by", exportedBy],
    ["Exported at", exportedAt],
    ["Expires at", expiresAt],
    ["Export type", exportType],
    [],
    data.columns,
    ...data.rows,
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function normalizeAdminExportType(value: unknown): AdminExportType | null {
  return typeof value === "string" && ADMIN_EXPORT_TYPES.includes(value as AdminExportType)
    ? (value as AdminExportType)
    : null;
}

export function normalizeAdminExportFilters(value: unknown): AdminExportFilters {
  const input = isRecord(value) ? value : {};
  const sourceType = input.sourceType === "generation" || input.sourceType === "workflow" || input.sourceType === "all"
    ? input.sourceType
    : undefined;
  return {
    q: stringValue(input.q),
    status: stringValue(input.status),
    module: stringValue(input.module),
    sourceType,
    stale: input.stale === true || input.stale === "1" || input.stale === "true",
    limit: clampExportLimit(input.limit),
    days: clampReportDays(input.days),
  };
}

function clampExportLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(500, Math.max(1, Math.floor(parsed)));
}

function clampReportDays(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 14;
  return Math.min(90, Math.max(1, Math.floor(parsed)));
}

function csvCell(value: string) {
  const normalized = value.replace(/\r?\n/g, " ");
  const safeValue = /^[=+\-@\t]/.test(normalized) ? `'${normalized}` : normalized;
  return /[",\n]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
