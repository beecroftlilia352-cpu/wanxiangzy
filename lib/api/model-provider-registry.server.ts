import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";
import type { PricedImageModel } from "@/lib/model-pricing";
import {
  MODEL_PROVIDERS_CONFIG_KEY,
  getEnvModelProviderOverride,
  parseModelProviderOverrides,
  type ImageProviderResponseType,
  type ModelProviderOverride,
} from "@/lib/api/model-provider-registry";
import { decryptProviderSecret, maskProviderSecret } from "@/lib/api/model-provider-secrets";

type PublishedModelProviderRow = {
  id?: string;
  publishedAt?: string | null;
  value: Record<string, unknown>;
};

async function getPublishedModelProviderRow(): Promise<PublishedModelProviderRow | null> {
  if (process.env.NODE_ENV === "test") return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  try {
    const { data, error } = await getAdminClient()
      .from("admin_config_versions")
      .select("id,value,published_at")
      .eq("config_key", MODEL_PROVIDERS_CONFIG_KEY)
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

export async function getPublishedModelProviderRawValue(): Promise<Record<string, unknown> | null> {
  const row = await getPublishedModelProviderRow();
  return row?.value ?? null;
}

export async function getAdminModelProviderOverride(
  model: PricedImageModel,
): Promise<ModelProviderOverride | null> {
  const raw = await getPublishedModelProviderRawValue();
  if (!raw) return null;

  const parsed = parseModelProviderOverrides(raw);
  const override = parsed[model];
  if (!override) return null;

  return {
    ...override,
    apiKey: decryptProviderSecret(override.apiKey),
  };
}

export type AdminModelProviderSnapshotEntry = {
  model: PricedImageModel;
  enabled: boolean;
  baseUrl: string;
  upstreamModel: string;
  responseType: ImageProviderResponseType;
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
  source: "admin" | "env";
};

export async function getAdminModelProviderSnapshot(): Promise<{
  configKey: string;
  versionId?: string;
  publishedAt?: string | null;
  models: AdminModelProviderSnapshotEntry[];
}> {
  const row = await getPublishedModelProviderRow();
  const raw = row?.value;
  const parsed = raw ? parseModelProviderOverrides(raw) : {};

  const models = (["gpt-image-2", "nano-banana-2", "nano-banana-2-lite", "nano-banana-pro"] as const).map((model) => {
    const env = getEnvModelProviderOverride(model);
    const admin = parsed[model];
    const active = admin || env;
    const apiKeyConfigured = Boolean(admin?.apiKey || env.apiKey);
    const source: "admin" | "env" = admin ? "admin" : "env";

    return {
      model,
      enabled: active.enabled,
      baseUrl: active.baseUrl,
      upstreamModel: active.upstreamModel,
      responseType: active.responseType,
      apiKeyConfigured,
      apiKeyMasked: admin?.apiKey ? maskProviderSecret(admin.apiKey) : env.apiKey ? maskProviderSecret(env.apiKey) : "",
      source,
    };
  });

  return {
    configKey: MODEL_PROVIDERS_CONFIG_KEY,
    versionId: row?.id,
    publishedAt: row?.publishedAt ?? null,
    models,
  };
}
