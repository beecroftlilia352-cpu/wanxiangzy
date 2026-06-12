import { isRecord } from "@/lib/utils";
import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminAssetLifecycleOverview, type AdminAssetLifecycleAction } from "@/lib/admin/data";

const ALLOWED_ACTIONS = new Set<AdminAssetLifecycleAction>([
  "migrate_to_oss",
  "review_temp_inputs",
  "archive_generated_result",
  "freeze_and_hide",
]);

type PlanRequestBody = {
  action?: unknown;
  reason?: unknown;
  filters?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireAdminApi("assets:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as PlanRequestBody;
  const action = typeof body.action === "string" ? body.action.trim() as AdminAssetLifecycleAction : "migrate_to_oss";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const filters = isRecord(body.filters) ? body.filters : {};

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "action is invalid" }, { status: 400 });
  }
  if (reason.length < 6 || reason.length > 240) {
    return NextResponse.json({ error: "reason must be 6-240 characters" }, { status: 400 });
  }

  const overview = await getAdminAssetLifecycleOverview({
    q: stringValue(filters.q),
    module: stringValue(filters.module),
    limit: Number(filters.limit || 120),
  });
  const affectedRows = overview.rows.filter((row) => row.recommendedAction === action);

  await writeAdminAuditLog(auth.context, {
    action: "asset_lifecycle.plan.create",
    resourceType: "asset_lifecycle_plan",
    resourceId: action,
    reason,
    metadata: {
      action,
      filters,
      affectedCount: affectedRows.length,
      metrics: overview.metrics,
      candidates: affectedRows.slice(0, 50).map((row) => ({
        id: row.id,
        sourceType: row.sourceType,
        module: row.module,
        stage: row.stage,
        riskLevel: row.riskLevel,
        providers: row.providers,
        reasons: row.reasons,
      })),
    },
  });

  return NextResponse.json({
    ok: true,
    plan: {
      action,
      affectedCount: affectedRows.length,
      sampledAssets: overview.metrics.sampledAssets,
      generatedAt: overview.generatedAt,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
