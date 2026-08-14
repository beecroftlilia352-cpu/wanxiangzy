import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";

export type SiteMonitoringConfig = {
  sentryDsn: string;
  seoTitle: string;
  seoDescription: string;
  updatedAt?: string;
};

const CONFIG_KEY = "site.monitoring";
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { expiresAt: number; value: SiteMonitoringConfig | null } | null = null;

/**
 * 读取后台发布的监控与 SEO 配置（5 分钟内存缓存）。
 * 服务端多处调用（metadata / Sentry init）共享同一份结果。
 */
export async function getSiteMonitoringConfig(): Promise<SiteMonitoringConfig | null> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  let value: SiteMonitoringConfig | null = null;
  try {
    const { data } = await getAdminClient()
      .from("admin_config_versions")
      .select("value")
      .eq("config_key", CONFIG_KEY)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (isRecord(data?.value)) {
      value = {
        sentryDsn: typeof data.value.sentryDsn === "string" ? data.value.sentryDsn.trim() : "",
        seoTitle: typeof data.value.seoTitle === "string" ? data.value.seoTitle.trim() : "",
        seoDescription: typeof data.value.seoDescription === "string" ? data.value.seoDescription.trim() : "",
        updatedAt: typeof data.value.updatedAt === "string" ? data.value.updatedAt : undefined,
      };
    }
  } catch {
    value = null;
  }

  cache = { expiresAt: Date.now() + CACHE_TTL_MS, value };
  return value;
}

/** 清除缓存（后台发布后由 API 调用） */
export function clearSiteMonitoringConfigCache() {
  cache = null;
}
