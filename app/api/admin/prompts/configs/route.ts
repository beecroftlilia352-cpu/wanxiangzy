import { isRecord } from "@/lib/utils";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { PROMPT_EXPERIMENT_CONFIG_KEY } from "@/lib/admin/data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  if (!value) {
    return NextResponse.json({ error: "value 必须是 JSON object" }, { status: 400 });
  }
  const validationError = validatePromptExperimentConfig(value);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  if (status === "published" && reason.length < 6) {
    return NextResponse.json({ error: "发布配置需要填写至少 6 个字符的原因" }, { status: 400 });
  }

  const admin = getAdminClient();
  if (status === "published") {
    await admin
      .from("admin_config_versions")
      .update({ status: "archived" })
      .eq("config_key", PROMPT_EXPERIMENT_CONFIG_KEY)
      .eq("status", "published");
  }

  const { data, error } = await admin
    .from("admin_config_versions")
    .insert({
      config_key: PROMPT_EXPERIMENT_CONFIG_KEY,
      value,
      status,
      created_by: auth.context.userId,
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .select("id,config_key,status,value,created_by,published_at,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "prompt_experiment_config.create",
    resourceType: "admin_config_version",
    resourceId: String(data?.id || ""),
    reason: reason || `Create ${PROMPT_EXPERIMENT_CONFIG_KEY} as ${status}`,
    metadata: { configKey: PROMPT_EXPERIMENT_CONFIG_KEY, status, experiments: summarizeExperiments(value) },
  });

  return NextResponse.json({ ok: true, config: data }, { headers: { "Cache-Control": "no-store" } });
}

function validatePromptExperimentConfig(value: Record<string, unknown>) {
  if (!Array.isArray(value.experiments)) return "experiments 必须是数组";
  for (const [index, raw] of value.experiments.entries()) {
    if (!isRecord(raw)) return `experiments[${index}] 必须是 object`;
    if (!stringValue(raw.id)) return `experiments[${index}].id 必填`;
    if (!stringValue(raw.module)) return `experiments[${index}].module 必填`;
    if (!["draft", "running", "paused", "completed"].includes(stringValue(raw.status) || "draft")) {
      return `experiments[${index}].status 不合法`;
    }
    const traffic = Number(raw.traffic);
    if (!Number.isFinite(traffic) || traffic < 0 || traffic > 100) return `experiments[${index}].traffic 必须在 0-100`;
    if (!Array.isArray(raw.variants) || raw.variants.length < 2) return `experiments[${index}].variants 至少需要 2 个变体`;
    const weightTotal = raw.variants.reduce((sum, variant) => {
      return sum + (isRecord(variant) ? Number(variant.weight) || 0 : 0);
    }, 0);
    if (weightTotal !== 100) return `experiments[${index}].variants 权重合计必须为 100`;
  }
  return "";
}

function summarizeExperiments(value: Record<string, unknown>) {
  return Array.isArray(value.experiments)
    ? value.experiments.map((item) => isRecord(item) ? {
      id: stringValue(item.id),
      module: stringValue(item.module),
      status: stringValue(item.status),
      traffic: Number(item.traffic) || 0,
    } : null).filter(Boolean)
    : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
