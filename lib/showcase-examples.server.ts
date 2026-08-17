import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_SHOWCASE_MODULE,
  getBuiltInShowcaseExamples,
  getShowcaseModuleConfig,
  parseShowcaseItems,
  type StudioShowcaseModule,
  type StudioShowcaseRegistry,
} from "@/lib/showcase-examples";

export async function getStudioShowcaseRegistry(
  requestedModule: StudioShowcaseModule = DEFAULT_SHOWCASE_MODULE,
): Promise<StudioShowcaseRegistry> {
  const { module, configKey } = getShowcaseModuleConfig(requestedModule);
  const fallbackItems = getBuiltInShowcaseExamples(module);
  const warnings: string[] = [];
  try {
    const { data, error } = await getAdminClient()
      .from("admin_config_versions")
      .select("id,status,value,created_at,published_at")
      .eq("config_key", configKey)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw error;

    const active = data?.find((item) => item.status === "published") || null;
    const value = active?.value && typeof active.value === "object"
      ? active.value as Record<string, unknown>
      : null;
    const configuredItems = parseShowcaseItems(value?.items);
    return {
      configKey,
      module,
      enabled: typeof value?.enabled === "boolean" ? value.enabled : true,
      activeVersionId: active?.id || null,
      activeVersionStatus: active?.status || null,
      items: active && Array.isArray(value?.items) ? configuredItems : fallbackItems,
      warnings,
    };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "示例配置读取失败");
    return {
      configKey,
      module,
      enabled: true,
      activeVersionId: null,
      activeVersionStatus: null,
      items: fallbackItems,
      warnings,
    };
  }
}
