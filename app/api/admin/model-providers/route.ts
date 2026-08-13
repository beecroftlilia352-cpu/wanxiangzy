import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";
import {
  MODEL_PROVIDERS_CONFIG_KEY,
  normalizeImageProviderResponseType,
} from "@/lib/api/model-provider-registry";
import {
  getAdminModelProviderSnapshot,
  getPublishedModelProviderRawValue,
} from "@/lib/api/model-provider-registry.server";
import {
  encryptProviderSecret,
  isEncryptedProviderSecret,
  isEnvProviderSecret,
} from "@/lib/api/model-provider-secrets";

const IMAGE_MODELS = ["gpt-image-2", "nano-banana-2", "nano-banana-pro"] as const;

export async function GET() {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const snapshot = await getAdminModelProviderSnapshot();
  return NextResponse.json({ ok: true, ...snapshot }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as { models?: unknown };
  if (!isRecord(body.models)) {
    return NextResponse.json({ error: "models 必须是 JSON object" }, { status: 400 });
  }

  const existing = await getPublishedModelProviderRawValue();
  const existingModels = isRecord(existing?.models) ? existing.models : {};

  const nextModels: Record<string, Record<string, unknown>> = {};
  for (const model of IMAGE_MODELS) {
    const input = isRecord((body.models as Record<string, unknown>)[model])
      ? (body.models as Record<string, unknown>)[model] as Record<string, unknown>
      : {};
    const baseUrl = typeof input.baseUrl === "string" ? input.baseUrl.trim() : "";
    const upstreamModel = typeof input.upstreamModel === "string" ? input.upstreamModel.trim() : "";
    const responseType = normalizeImageProviderResponseType(input.responseType);
    if (!baseUrl || !upstreamModel || !responseType) {
      return NextResponse.json({ error: `${model} 的 baseUrl、upstreamModel、responseType 不能为空` }, { status: 400 });
    }

    let apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    if (apiKey && !isEncryptedProviderSecret(apiKey) && !isEnvProviderSecret(apiKey)) {
      apiKey = encryptProviderSecret(apiKey);
    }
    if (!apiKey) {
      const existingModel = isRecord(existingModels[model]) ? existingModels[model] as Record<string, unknown> : {};
      apiKey = typeof existingModel.apiKey === "string" ? existingModel.apiKey : "";
    }

    nextModels[model] = {
      enabled: input.enabled !== false,
      baseUrl,
      apiKey,
      upstreamModel,
      responseType,
    };
  }

  const admin = getAdminClient();
  await admin
    .from("admin_config_versions")
    .update({ status: "archived" })
    .eq("config_key", MODEL_PROVIDERS_CONFIG_KEY)
    .eq("status", "published");

  const { data, error } = await admin
    .from("admin_config_versions")
    .insert({
      config_key: MODEL_PROVIDERS_CONFIG_KEY,
      value: {
        models: nextModels,
        updatedFrom: "admin.providers.model-provider-config",
        updatedAt: new Date().toISOString(),
      },
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
    action: "config_version.create",
    resourceType: "admin_config_version",
    resourceId: String(data?.id || ""),
    reason: `Publish ${MODEL_PROVIDERS_CONFIG_KEY} model provider config`,
    metadata: { configKey: MODEL_PROVIDERS_CONFIG_KEY, models: IMAGE_MODELS },
  });

  return NextResponse.json({ ok: true, config: data }, { headers: { "Cache-Control": "no-store" } });
}
