import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";
import {
  VIDEO_PROVIDERS_CONFIG_KEY,
  getEnvVideoProviderOverride,
  parseVideoProviderOverride,
  type VideoProviderOverride,
} from "@/lib/api/video-provider-registry";
import { decryptProviderSecret, maskProviderSecret } from "@/lib/api/model-provider-secrets";

type PublishedVideoProviderRow = {
  id?: string;
  publishedAt?: string | null;
  value: Record<string, unknown>;
};

async function getPublishedVideoProviderRow(): Promise<PublishedVideoProviderRow | null> {
  if (process.env.NODE_ENV === "test") return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  try {
    const { data, error } = await getAdminClient()
      .from("admin_config_versions")
      .select("id,value,published_at")
      .eq("config_key", VIDEO_PROVIDERS_CONFIG_KEY)
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data || !isRecord(data.value)) return null;
    return {
      id: typeof data.id === "string" ? data.id : undefined,
      publishedAt: typeof data.published_at === "string" ? data.published_at : null,
      value: data.value as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

export async function getPublishedVideoProviderRawValue(): Promise<Record<string, unknown> | null> {
  const row = await getPublishedVideoProviderRow();
  return row?.value ?? null;
}

export async function getAdminVideoProviderOverride(): Promise<VideoProviderOverride | null> {
  const raw = await getPublishedVideoProviderRawValue();
  if (!raw) return null;

  const override = parseVideoProviderOverride(raw);
  if (!override) return null;

  return {
    ...override,
    apiKey: decryptProviderSecret(override.apiKey),
  };
}

export type AdminVideoProviderSnapshotEntry = {
  key: "video";
  enabled: boolean;
  provider: VideoProviderOverride["provider"];
  baseUrl: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
  source: "admin" | "env";
};

export async function getAdminVideoProviderSnapshot(): Promise<{
  configKey: string;
  versionId?: string;
  publishedAt?: string | null;
  models: AdminVideoProviderSnapshotEntry[];
}> {
  const row = await getPublishedVideoProviderRow();
  const parsed = row ? parseVideoProviderOverride(row.value) : null;
  const env = getEnvVideoProviderOverride();
  const active = parsed || env;
  const source: "admin" | "env" = parsed ? "admin" : "env";

  return {
    configKey: VIDEO_PROVIDERS_CONFIG_KEY,
    versionId: row?.id,
    publishedAt: row?.publishedAt ?? null,
    models: [
      {
        key: "video",
        enabled: active.enabled,
        provider: active.provider,
        baseUrl: active.baseUrl,
        apiKeyConfigured: Boolean(active.apiKey),
        apiKeyMasked: active.apiKey ? maskProviderSecret(active.apiKey) : "",
        source,
      },
    ],
  };
}
