import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";
import {
  VIDEO_PROVIDERS_CONFIG_KEY,
  normalizeVideoProviderBaseUrl,
  normalizeVideoProviderName,
  normalizeVideoProviderResponseType,
} from "@/lib/api/video-provider-registry";
import {
  getAdminVideoProviderSnapshot,
  getPublishedVideoProviderRawValue,
} from "@/lib/api/video-provider-registry.server";
import {
  encryptProviderSecret,
  isEncryptedProviderSecret,
  isEnvProviderSecret,
} from "@/lib/api/model-provider-secrets";

export async function GET() {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const snapshot = await getAdminVideoProviderSnapshot();
  return NextResponse.json({ ok: true, ...snapshot }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as { models?: unknown };
  if (!isRecord(body.models)) {
    return NextResponse.json({ error: "models 必须是 JSON object" }, { status: 400 });
  }

  const existing = await getPublishedVideoProviderRawValue();
  const existingModels = isRecord(existing?.models) ? existing.models : {};

  const rawVideo = (body.models as Record<string, unknown>).video;
  const input = isRecord(rawVideo) ? rawVideo as Record<string, unknown> : {};
  const provider = normalizeVideoProviderName(input.provider);
  const baseUrl = normalizeVideoProviderBaseUrl(
    typeof input.baseUrl === "string" ? input.baseUrl.trim() : "",
    provider,
  );
  const upstreamModel = typeof input.upstreamModel === "string" ? input.upstreamModel.trim() : "";
  if (!upstreamModel) {
    return NextResponse.json({ error: "video 的 upstreamModel 不能为空" }, { status: 400 });
  }
  const responseType = normalizeVideoProviderResponseType(input.responseType)
    ?? (provider === "minimax" ? "minimax-video" : "happyhorse-video");

  let apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (apiKey && !isEncryptedProviderSecret(apiKey) && !isEnvProviderSecret(apiKey)) {
    apiKey = encryptProviderSecret(apiKey);
  }
  if (!apiKey) {
    const existingVideo = isRecord(existingModels.video) ? existingModels.video as Record<string, unknown> : {};
    apiKey = typeof existingVideo.apiKey === "string" ? existingVideo.apiKey : "";
  }

  const nextVideo = {
    enabled: input.enabled !== false,
    provider,
    baseUrl,
    apiKey,
    upstreamModel,
    responseType,
  };

  const admin = getAdminClient();
  await admin
    .from("admin_config_versions")
    .update({ status: "archived" })
    .eq("config_key", VIDEO_PROVIDERS_CONFIG_KEY)
    .eq("status", "published");

  const { data, error } = await admin
    .from("admin_config_versions")
    .insert({
      config_key: VIDEO_PROVIDERS_CONFIG_KEY,
      value: {
        models: { video: nextVideo },
        updatedFrom: "admin.providers.video-provider-config",
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
    reason: `Publish ${VIDEO_PROVIDERS_CONFIG_KEY} video provider config`,
    metadata: { configKey: VIDEO_PROVIDERS_CONFIG_KEY, provider },
  });

  return NextResponse.json({ ok: true, config: data }, { headers: { "Cache-Control": "no-store" } });
}
