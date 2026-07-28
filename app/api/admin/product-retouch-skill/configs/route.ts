import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  PRODUCT_RETOUCH_CONFIG_KEY,
  parseProductRetouchSkillDefinition,
} from "@/lib/product-retouch";
import { clearProductRetouchSkillCache } from "@/lib/product-retouch-skill.server";
import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION_COLUMNS = "id,config_key,status,value,created_by,published_at,created_at";

export async function GET() {
  const auth = await requireAdminApi("admin:read");
  if (!auth.ok) return auth.response;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("admin_config_versions")
    .select(VERSION_COLUMNS)
    .eq("config_key", PRODUCT_RETOUCH_CONFIG_KEY)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { configKey: PRODUCT_RETOUCH_CONFIG_KEY, versions: data || [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("prompts:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as {
    status?: unknown;
    value?: unknown;
    reason?: unknown;
  };
  const status = body.status === "published" ? "published" : "draft";
  const value = isRecord(body.value) ? body.value : null;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const definition = parseProductRetouchSkillDefinition(value);

  if (!definition) {
    return NextResponse.json({ error: "商品精修 Skill 配置未通过严格 Schema 校验" }, { status: 400 });
  }
  if (status === "published" && reason.length < 6) {
    return NextResponse.json({ error: "发布配置需要填写至少 6 个字符的原因" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: created, error: createError } = await admin
    .from("admin_config_versions")
    .insert({
      config_key: PRODUCT_RETOUCH_CONFIG_KEY,
      value: definition,
      status: "draft",
      created_by: auth.context.userId,
      published_at: null,
    })
    .select(VERSION_COLUMNS)
    .single();

  if (createError || !created) {
    return NextResponse.json({ error: createError?.message || "Skill 版本创建失败" }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "product_retouch_skill.create_draft",
    resourceType: "admin_config_version",
    resourceId: String(created.id),
    reason: reason || `Create ${PRODUCT_RETOUCH_CONFIG_KEY} draft`,
    metadata: {
      configKey: PRODUCT_RETOUCH_CONFIG_KEY,
      schemaVersion: definition.schemaVersion,
      version: definition.version,
    },
  });

  let config = created;
  if (status === "published") {
    const { data, error } = await admin.rpc("publish_product_retouch_skill_version", {
      p_version_id: created.id,
    });
    const published = Array.isArray(data) ? data[0] : data;
    if (error || !published) {
      return NextResponse.json({
        error: error?.message || "Skill 版本发布失败；草稿已保留",
        draftId: created.id,
      }, { status: 400 });
    }
    config = published;
    clearProductRetouchSkillCache();
    await writeAdminAuditLog(auth.context, {
      action: "product_retouch_skill.publish",
      resourceType: "admin_config_version",
      resourceId: String(created.id),
      reason,
      metadata: {
        configKey: PRODUCT_RETOUCH_CONFIG_KEY,
        previousStatus: "draft",
        nextStatus: "published",
        version: definition.version,
      },
    });
  }

  return NextResponse.json(
    { ok: true, config },
    { headers: { "Cache-Control": "no-store" } },
  );
}
