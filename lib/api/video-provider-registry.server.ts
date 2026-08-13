import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";
import {
  ALL_VIDEO_PROVIDERS,
  VIDEO_PROVIDERS_CONFIG_KEY,
  getEnvVideoProviderOverrides,
  parseVideoProviderOverrides,
  type VideoProviderOverride,
  type VideoProviderOverrides,
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

export async function getAdminVideoProviderOverrides(): Promise<VideoProviderOverrides> {
  const raw = await getPublishedVideoProviderRawValue();
  if (!raw) return {};

  const overrides = parseVideoProviderOverrides(raw);
  const out: VideoProviderOverrides = {};
  for (const provider of ALL_VIDEO_PROVIDERS) {
    const override = overrides[provider];
    if (!override) continue;
    out[provider] = {
      ...override,
      apiKey: override.apiKey ? decryptProviderSecret(override.apiKey) : undefined,
    };
  }
  return out;
}

export async function getEnabledVideoProviderOverrides(): Promise<VideoProviderOverride[]> {
  const overrides = await getAdminVideoProviderOverrides();
  return ALL_VIDEO_PROVIDERS
    .map((provider) => overrides[provider])
    .filter((override): override is VideoProviderOverride => Boolean(override?.enabled && override.apiKey?.trim()));
}

export type AdminVideoProviderSnapshotEntry = {
  key: VideoProviderOverride["provider"];
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
  const parsed = row ? parseVideoProviderOverrides(row.value) : null;
  const env = getEnvVideoProviderOverrides();
  const source: "admin" | "env" = parsed && Object.keys(parsed).length ? "admin" : "env";

  const models: AdminVideoProviderSnapshotEntry[] = ALL_VIDEO_PROVIDERS.map((provider) => {
    const active = parsed?.[provider] ?? env[provider];
    const enabled = Boolean(active?.enabled);
    const apiKey = active?.apiKey;
    return {
      key: provider,
      enabled,
      provider,
      baseUrl: active?.baseUrl || "https://api.new.bi",
      apiKeyConfigured: Boolean(apiKey),
      apiKeyMasked: apiKey ? maskProviderSecret(apiKey) : "",
      source,
    };
  });

  return {
    configKey: VIDEO_PROVIDERS_CONFIG_KEY,
    versionId: row?.id,
    publishedAt: row?.publishedAt ?? null,
    models,
  };
}
