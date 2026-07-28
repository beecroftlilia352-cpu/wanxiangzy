import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  PRODUCT_RETOUCH_CONFIG_KEY,
  parseProductRetouchSkillDefinition,
} from "@/lib/product-retouch";
import { clearProductRetouchSkillCache } from "@/lib/product-retouch-skill.server";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{ id: string }>;
};

const VERSION_COLUMNS = "id,config_key,status,value,created_by,published_at,created_at";

export async function PATCH(request: Request, { params }: RouteProps) {
  const auth = await requireAdminApi("prompts:write");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    action?: unknown;
    reason?: unknown;
  };
  const action = body.action === "publish" || body.action === "archive" ? body.action : null;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!isUuid(id)) {
    return NextResponse.json({ error: "配置版本 ID 不合法" }, { status: 400 });
  }
  if (!action) {
    return NextResponse.json({ error: "action 必须是 publish 或 archive" }, { status: 400 });
  }
  if (reason.length < 6) {
    return NextResponse.json({ error: "请填写至少 6 个字符的操作原因" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: current, error: loadError } = await admin
    .from("admin_config_versions")
    .select(VERSION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (loadError || !current) {
    return NextResponse.json({ error: loadError?.message || "配置版本不存在" }, { status: 404 });
  }
  if (current.config_key !== PRODUCT_RETOUCH_CONFIG_KEY) {
    return NextResponse.json({ error: "只能操作商品精修 Skill 配置" }, { status: 403 });
  }
  if (!parseProductRetouchSkillDefinition(current.value)) {
    return NextResponse.json({ error: "该历史版本未通过当前 Schema 校验，不能发布" }, { status: 400 });
  }

  const mutation = action === "publish"
    ? await admin.rpc("publish_product_retouch_skill_version", { p_version_id: id })
    : await admin
        .from("admin_config_versions")
        .update({ status: "archived" })
        .eq("id", id)
        .eq("config_key", PRODUCT_RETOUCH_CONFIG_KEY)
        .select(VERSION_COLUMNS)
        .single();
  const config = Array.isArray(mutation.data) ? mutation.data[0] : mutation.data;

  if (mutation.error || !config) {
    return NextResponse.json({ error: mutation.error?.message || "Skill 版本操作失败" }, { status: 400 });
  }

  clearProductRetouchSkillCache();
  await writeAdminAuditLog(auth.context, {
    action: `product_retouch_skill.${action}`,
    resourceType: "admin_config_version",
    resourceId: id,
    reason,
    metadata: {
      configKey: PRODUCT_RETOUCH_CONFIG_KEY,
      previousStatus: current.status,
      nextStatus: config.status,
      version: parseProductRetouchSkillDefinition(current.value)?.version,
      rollback: action === "publish" && current.status === "archived",
    },
  });

  return NextResponse.json(
    { ok: true, config },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}
