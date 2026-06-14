import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";
import {
  MODEL_ROUTING_CONFIG_KEY,
  getEnvModelRoutingConfig,
  parseModelRoutingConfig,
  type ModelRoutingConfig,
} from "@/lib/api/model-routing-config";

export async function getActiveModelRoutingConfig(): Promise<ModelRoutingConfig> {
  const envConfig = getEnvModelRoutingConfig();
  const adminConfig = await getPublishedModelRoutingConfig(envConfig);
  return adminConfig || envConfig;
}

export async function getPublishedModelRoutingConfig(fallback = getEnvModelRoutingConfig()): Promise<ModelRoutingConfig | null> {
  if (process.env.NODE_ENV === "test") return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  try {
    const { data, error } = await getAdminClient()
      .from("admin_config_versions")
      .select("id,value,published_at")
      .eq("config_key", MODEL_ROUTING_CONFIG_KEY)
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data || !isRecord(data.value)) return null;
    return parseModelRoutingConfig(data.value, {
      source: "admin",
      versionId: typeof data.id === "string" ? data.id : undefined,
      publishedAt: typeof data.published_at === "string" ? data.published_at : null,
      fallback,
    });
  } catch {
    return null;
  }
}
