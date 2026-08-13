import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";
import {
  LLM_PROVIDERS_CONFIG_KEY,
  normalizeLlmKind,
  normalizeLlmProviderBaseUrl,
  normalizeLlmProviderName,
} from "@/lib/api/llm-provider-registry";
import {
  getAdminLlmProviderSnapshot,
  getPublishedLlmProviderRawValue,
} from "@/lib/api/llm-provider-registry.server";
import {
  encryptProviderSecret,
  isEncryptedProviderSecret,
  isEnvProviderSecret,
} from "@/lib/api/model-provider-secrets";

const LLM_KINDS = ["vision", "text"] as const;

export async function GET() {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const snapshot = await getAdminLlmProviderSnapshot();
  return NextResponse.json({ ok: true, ...snapshot }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as { models?: unknown };
  if (!isRecord(body.models)) {
    return NextResponse.json({ error: "models 必须是 JSON object" }, { status: 400 });
  }

  const existing = await getPublishedLlmProviderRawValue();
  const existingModels = isRecord(existing?.models) ? existing.models : {};

  const nextModels: Record<string, Record<string, unknown>> = {};
  for (const kind of LLM_KINDS) {
    const rawModel = (body.models as Record<string, unknown>)[kind];
    const input = isRecord(rawModel) ? rawModel as Record<string, unknown> : {};
    const provider = normalizeLlmProviderName(input.provider);
    const baseUrl = normalizeLlmProviderBaseUrl(
      typeof input.baseUrl === "string" ? input.baseUrl.trim() : "",
      provider,
    );
    const upstreamModel = typeof input.upstreamModel === "string" ? input.upstreamModel.trim() : "";
    if (!upstreamModel) {
      return NextResponse.json({ error: `${kind} 的 upstreamModel 不能为空` }, { status: 400 });
    }

    let apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    if (apiKey && !isEncryptedProviderSecret(apiKey) && !isEnvProviderSecret(apiKey)) {
      apiKey = encryptProviderSecret(apiKey);
    }
    if (!apiKey) {
      const existingModel = isRecord(existingModels[kind]) ? existingModels[kind] as Record<string, unknown> : {};
      apiKey = typeof existingModel.apiKey === "string" ? existingModel.apiKey : "";
    }

    nextModels[kind] = {
      enabled: input.enabled !== false,
      provider,
      baseUrl,
      apiKey,
      upstreamModel,
      responseType: "openai-chat",
    };
  }

  const admin = getAdminClient();
  await admin
    .from("admin_config_versions")
    .update({ status: "archived" })
    .eq("config_key", LLM_PROVIDERS_CONFIG_KEY)
    .eq("status", "published");

  const { data, error } = await admin
    .from("admin_config_versions")
    .insert({
      config_key: LLM_PROVIDERS_CONFIG_KEY,
      value: {
        models: nextModels,
        updatedFrom: "admin.providers.llm-provider-config",
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
    reason: `Publish ${LLM_PROVIDERS_CONFIG_KEY} vision/text provider config`,
    metadata: { configKey: LLM_PROVIDERS_CONFIG_KEY, kinds: LLM_KINDS },
  });

  return NextResponse.json({ ok: true, config: data }, { headers: { "Cache-Control": "no-store" } });
}
