import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  ADMIN_FEATURES_CONFIG_KEY,
  archiveAdminFeatureConfig,
  getAdminFeatureRegistry,
  parseAdminFeatureConfig,
  upsertAdminFeatureConfig,
  type AdminFeatureConfig,
} from "@/lib/admin/features";
import { getAdminClient } from "@/lib/supabase/admin";

type FeatureMutationBody = {
  action?: unknown;
  feature?: unknown;
  key?: unknown;
  reason?: unknown;
};

export async function GET() {
  const auth = await requireAdminApi("admin:read");
  if (!auth.ok) return auth.response;

  return NextResponse.json(await getAdminFeatureRegistry(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as FeatureMutationBody;
  const action = body.action === "archive" ? "archive" : "upsert";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 240) : "";
  if (reason.length < 4) {
    return NextResponse.json({ error: "请填写至少 4 个字的操作原因" }, { status: 400 });
  }

  const registry = await getAdminFeatureRegistry();
  let nextFeatures: AdminFeatureConfig[];
  let resourceId = "";

  try {
    if (action === "archive") {
      const key = typeof body.key === "string" ? body.key.trim() : "";
      resourceId = key;
      nextFeatures = archiveAdminFeatureConfig(registry.features, key);
    } else {
      const parsed = parseAdminFeatureConfig(body.feature);
      if (!parsed) {
        return NextResponse.json({ error: "功能配置字段不完整" }, { status: 400 });
      }
      resourceId = parsed.key;
      nextFeatures = upsertAdminFeatureConfig(registry.features, parsed);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "功能配置处理失败" }, { status: 400 });
  }

  const admin = getAdminClient();
  await admin
    .from("admin_config_versions")
    .update({ status: "archived" })
    .eq("config_key", ADMIN_FEATURES_CONFIG_KEY)
    .eq("status", "published");

  const { data, error } = await admin
    .from("admin_config_versions")
    .insert({
      config_key: ADMIN_FEATURES_CONFIG_KEY,
      value: { features: nextFeatures },
      status: "published",
      created_by: auth.context.userId,
      published_at: new Date().toISOString(),
    })
    .select("id,config_key,status,value,created_by,published_at,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: action === "archive" ? "feature_config.archive" : "feature_config.upsert",
    resourceType: "admin_feature_config",
    resourceId,
    reason,
    metadata: {
      configKey: ADMIN_FEATURES_CONFIG_KEY,
      versionId: data?.id,
      action,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      config: data,
      registry: {
        ...registry,
        activeVersionId: String(data?.id || ""),
        activeVersionStatus: "published",
        features: nextFeatures,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
