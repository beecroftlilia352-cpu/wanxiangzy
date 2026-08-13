import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";
import {
  LLM_PROVIDERS_CONFIG_KEY,
  parseLlmProviderOverrides,
  type LlmKind,
  type LlmProviderOverride,
  type LlmProviderOverrides,
} from "@/lib/api/llm-provider-registry";
import { decryptProviderSecret, maskProviderSecret } from "@/lib/api/model-provider-secrets";

type PublishedLlmProviderRow = {
  id?: string;
  publishedAt?: string | null;
  value: Record<string, unknown>;
};

async function getPublishedLlmProviderRow(): Promise<PublishedLlmProviderRow | null> {
  if (process.env.NODE_ENV === "test") return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  try {
    const { data, error } = await getAdminClient()
      .from("admin_config_versions")
      .select("id,value,published_at")
      .eq("config_key", LLM_PROVIDERS_CONFIG_KEY)
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

export async function getPublishedLlmProviderRawValue(): Promise<Record<string, unknown> | null> {
  const row = await getPublishedLlmProviderRow();
  return row?.value ?? null;
}

export async function getAdminLlmProviderOverride(kind: LlmKind): Promise<LlmProviderOverride | null> {
  const raw = await getPublishedLlmProviderRawValue();
  if (!raw) return null;

  const parsed = parseLlmProviderOverrides(raw);
  const override = parsed[kind];
  if (!override) return null;

  return {
    ...override,
    apiKey: decryptProviderSecret(override.apiKey),
  };
}

export type AdminLlmProviderSnapshotEntry = {
  kind: LlmKind;
  enabled: boolean;
  provider: LlmProviderOverride["provider"];
  baseUrl: string;
  upstreamModel: string;
  responseType: LlmProviderOverride["responseType"];
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
  source: "admin" | "missing";
};

export async function getAdminLlmProviderSnapshot(): Promise<{
  configKey: string;
  versionId?: string;
  publishedAt?: string | null;
  models: AdminLlmProviderSnapshotEntry[];
}> {
  const row = await getPublishedLlmProviderRow();
  const parsed = row ? parseLlmProviderOverrides(row.value) : ({} as LlmProviderOverrides);

  const models = (["vision", "text"] as const).map((kind) => {
    const admin = parsed[kind];
    const source: "admin" | "missing" = admin ? "admin" : "missing";
    return {
      kind,
      enabled: admin?.enabled ?? true,
      provider: admin?.provider ?? "minimax",
      baseUrl: admin?.baseUrl ?? "https://api.minimaxi.com",
      upstreamModel: admin?.upstreamModel ?? "MiniMax-M3",
      responseType: (admin?.responseType ?? "openai-chat") as LlmProviderOverride["responseType"],
      apiKeyConfigured: Boolean(admin?.apiKey),
      apiKeyMasked: admin?.apiKey ? maskProviderSecret(admin.apiKey) : "",
      source,
    };
  });

  return {
    configKey: LLM_PROVIDERS_CONFIG_KEY,
    versionId: row?.id,
    publishedAt: row?.publishedAt ?? null,
    models,
  };
}
