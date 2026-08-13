import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";
import {
  ALL_VIDEO_PROVIDERS,
  VIDEO_PROVIDERS_CONFIG_KEY,
  normalizeVideoProviderBaseUrl,
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
  const existingVideo = isRecord(existing?.models) ? existing.models.video : undefined;
  const existingProviders = isRecord(existingVideo) && isRecord(existingVideo.providers) ? existingVideo.providers : undefined;

  const rawVideo = (body.models as Record<string, unknown>).video;
  const input = isRecord(rawVideo) ? rawVideo as Record<string, unknown> : {};
  const providersInput = isRecord(input.providers) ? input.providers : input;

  const providers: Record<string, unknown> = {};
  for (const provider of ALL_VIDEO_PROVIDERS) {
    const raw = providersInput[provider];
    const providerInput = isRecord(raw) ? raw as Record<string, unknown> : {};
    const baseUrl = normalizeVideoProviderBaseUrl(
      typeof providerInput.baseUrl === "string" ? providerInput.baseUrl.trim() : "",
      provider,
    );

    let apiKey = typeof providerInput.apiKey === "string" ? providerInput.apiKey.trim() : "";
    if (apiKey && !isEncryptedProviderSecret(apiKey) && !isEnvProviderSecret(apiKey)) {
      apiKey = encryptProviderSecret(apiKey);
    }
    if (!apiKey) {
      const existingProvider = isRecord(existingProviders) && isRecord(existingProviders[provider])
        ? existingProviders[provider] as Record<string, unknown>
        : {};
      apiKey = typeof existingProvider.apiKey === "string" ? existingProvider.apiKey : "";
    }

    providers[provider] = {
      enabled: providerInput.enabled !== false,
      baseUrl,
      apiKey,
      responseType: "newapi-video",
    };
  }

  const nextVideo = { providers };

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
    metadata: { configKey: VIDEO_PROVIDERS_CONFIG_KEY },
  });

  return NextResponse.json({ ok: true, config: data }, { headers: { "Cache-Control": "no-store" } });
}
