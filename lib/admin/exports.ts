import {
  listAdminAssets,
  listAdminAuditLogs,
  listAdminCreditLogs,
  listAdminModerationCases,
  listAdminOperationRequests,
  listAdminTasks,
  listAdminUsers,
} from "@/lib/admin/data";

export const ADMIN_EXPORT_TYPES = [
  "users",
  "credits",
  "generations",
  "assets",
  "audit",
  "requests",
  "moderation",
] as const;

export type AdminExportType = (typeof ADMIN_EXPORT_TYPES)[number];

export type AdminExportFilters = {
  q?: string;
  status?: string;
  module?: string;
  sourceType?: "generation" | "workflow" | "all";
  limit?: number;
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
      columns: ["id", "email", "display_name", "credits", "total_credits_used", "generation_count", "workflow_count", "created_at", "updated_at"],
      rows: result.rows.map((row) => [
        row.id,
        row.email,
        row.displayName || "",
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
      limit,
    });
    return {
      columns: ["id", "source_id", "source_type", "user_id", "module", "status", "status_group", "progress", "expected_count", "result_count", "credits", "created_at", "updated_at", "completed_at", "error"],
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
    limit: clampExportLimit(input.limit),
  };
}

function clampExportLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(500, Math.max(1, Math.floor(parsed)));
}

function csvCell(value: string) {
  const normalized = value.replace(/\r?\n/g, " ");
  const safeValue = /^[=+\-@\t]/.test(normalized) ? `'${normalized}` : normalized;
  return /[",\n]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
