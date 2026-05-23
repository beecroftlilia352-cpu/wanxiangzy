import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";
import { validateTryOnReferenceSceneRows } from "@/lib/tryon-reference-admin";

const CONFIG_KEY = "tryon.reference_config";

export async function GET() {
  const auth = await requireAdminApi("settings:read");
  if (!auth.ok) return auth.response;

  const { data, error } = await getAdminClient()
    .from("admin_config_versions")
    .select("id,config_key,status,value,created_by,published_at,created_at")
    .eq("config_key", CONFIG_KEY)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, configKey: CONFIG_KEY, versions: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "publish";
  if (action === "rollback") {
    return rollbackVersion(auth.context, typeof body.versionId === "string" ? body.versionId : "");
  }
  if (action === "validate") {
    return validateCurrentConfig(auth.context);
  }
  if (action !== "publish") {
    return NextResponse.json({ error: "action 只能是 publish、validate 或 rollback" }, { status: 400 });
  }

  const admin = getAdminClient();
  const currentConfig = await loadCurrentConfig(admin);
  if (!currentConfig.ok) {
    return NextResponse.json({ error: currentConfig.error }, { status: 400 });
  }
  const { categories, scenes, sceneValidation } = currentConfig;
  if (!sceneValidation.ok) {
    return NextResponse.json({
      error: "配置校验未通过，请修复后再发布",
      issues: sceneValidation.issues,
    }, { status: 400 });
  }

  await admin
    .from("admin_config_versions")
    .update({ status: "archived" })
    .eq("config_key", CONFIG_KEY)
    .eq("status", "published");

  const snapshot = {
    categories,
    scenes,
    publishedAt: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from("admin_config_versions")
    .insert({
      config_key: CONFIG_KEY,
      value: snapshot,
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
    action: "tryon.reference_config.publish",
    resourceType: "admin_config_version",
    resourceId: String(data?.id || ""),
    reason: "Publish try-on reference configuration snapshot",
    metadata: {
      categoryCount: snapshot.categories.length,
      sceneCount: snapshot.scenes.length,
      activeSceneCount: sceneValidation.scenes.filter((scene) => scene.status === "active").length,
    },
  });

  return NextResponse.json({ ok: true, config: data }, { headers: { "Cache-Control": "no-store" } });
}

async function validateCurrentConfig(context: Parameters<typeof writeAdminAuditLog>[0]) {
  const currentConfig = await loadCurrentConfig(getAdminClient());
  if (!currentConfig.ok) {
    return NextResponse.json({ error: currentConfig.error }, { status: 400 });
  }
  const { categories, scenes, sceneValidation } = currentConfig;
  const activeSceneCount = sceneValidation.scenes.filter((scene) => scene.status === "active").length;

  await writeAdminAuditLog(context, {
    action: "tryon.reference_config.validate",
    resourceType: "tryon_reference_config",
    reason: "Validate try-on reference configuration",
    metadata: {
      ok: sceneValidation.ok,
      issueCount: sceneValidation.issues.length,
      categoryCount: categories.length,
      sceneCount: scenes.length,
      activeSceneCount,
    },
  });

  return NextResponse.json({
    ok: sceneValidation.ok,
    issues: sceneValidation.issues,
    summary: {
      categoryCount: categories.length,
      enabledCategoryCount: categories.filter((category: any) => category.enabled !== false).length,
      sceneCount: scenes.length,
      activeSceneCount,
    },
  }, { headers: { "Cache-Control": "no-store" }, status: sceneValidation.ok ? 200 : 400 });
}

async function loadCurrentConfig(admin: ReturnType<typeof getAdminClient>) {
  const [categories, scenes] = await Promise.all([
    admin.from("tryon_clothing_categories").select("*").order("sort_order", { ascending: true }),
    admin.from("tryon_reference_scenes").select("*").order("sort_order", { ascending: true }),
  ]);

  if (categories.error) return { ok: false as const, error: categories.error.message };
  if (scenes.error) return { ok: false as const, error: scenes.error.message };

  const categoryRows = categories.data || [];
  const sceneRows = scenes.data || [];
  const enabledCategoryCodes = new Set(
    categoryRows
      .filter((category) => category.enabled !== false)
      .map((category) => String(category.code))
  );
  const sceneValidation = validateTryOnReferenceSceneRows({
    rows: sceneRows,
    enabledCategoryCodes,
    requireActiveOnly: true,
  });

  return {
    ok: true as const,
    categories: categoryRows,
    scenes: sceneRows,
    sceneValidation,
  };
}

async function rollbackVersion(context: Parameters<typeof writeAdminAuditLog>[0], versionId: string) {
  if (!versionId) {
    return NextResponse.json({ error: "rollback 需要 versionId" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: version, error } = await admin
    .from("admin_config_versions")
    .select("id,value")
    .eq("id", versionId)
    .eq("config_key", CONFIG_KEY)
    .single();
  if (error || !version) {
    return NextResponse.json({ error: error?.message || "版本不存在" }, { status: 404 });
  }

  const value = version.value as { categories?: unknown[]; scenes?: unknown[] };
  if (Array.isArray(value.categories) && value.categories.length) {
    await admin.from("tryon_clothing_categories").upsert(value.categories.map(stripSnapshotIdentity), { onConflict: "code" });
  }
  if (Array.isArray(value.scenes) && value.scenes.length) {
    await admin.from("tryon_reference_scenes").upsert(value.scenes.map(stripSnapshotIdentity), { onConflict: "scene_key" });
  }

  await writeAdminAuditLog(context, {
    action: "tryon.reference_config.rollback",
    resourceType: "admin_config_version",
    resourceId: versionId,
    reason: "Rollback try-on reference configuration",
    metadata: {
      categoryCount: Array.isArray(value.categories) ? value.categories.length : 0,
      sceneCount: Array.isArray(value.scenes) ? value.scenes.length : 0,
    },
  });

  return NextResponse.json({ ok: true, rolledBackVersionId: versionId }, { headers: { "Cache-Control": "no-store" } });
}

function stripSnapshotIdentity(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { id, created_at, updated_at, ...rest } = value as Record<string, unknown>;
  return rest;
}
