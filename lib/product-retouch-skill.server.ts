import "server-only";

import { createHash } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  BUILTIN_PRODUCT_RETOUCH_SKILL,
  PRODUCT_RETOUCH_CONFIG_KEY,
  parseProductRetouchSkillDefinition,
  type ProductRetouchSkillDefinition,
  type ProductRetouchSkillSnapshot,
} from "@/lib/product-retouch";

const CACHE_TTL_MS = 60_000;

let cachedSnapshot: ProductRetouchSkillSnapshot | null = null;
let cachedAt = 0;

export async function loadProductRetouchSkill(options?: {
  force?: boolean;
}): Promise<ProductRetouchSkillSnapshot> {
  const now = Date.now();
  if (process.env.PRODUCT_RETOUCH_RUNTIME_SKILL_ENABLED === "false") {
    cachedSnapshot = createSnapshot(BUILTIN_PRODUCT_RETOUCH_SKILL, "builtin", null);
    cachedAt = now;
    return cachedSnapshot;
  }
  if (!options?.force && cachedSnapshot && now - cachedAt < CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("admin_config_versions")
      .select("id,value,published_at,created_at")
      .eq("config_key", PRODUCT_RETOUCH_CONFIG_KEY)
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const definition = parseProductRetouchSkillDefinition(data?.value);
    if (definition) {
      cachedSnapshot = createSnapshot(definition, "published", data?.id || null);
      cachedAt = now;
      return cachedSnapshot;
    }
    if (data?.value) {
      logger.warn("[product-retouch-skill] published config failed schema validation; using builtin");
    }
  } catch (error) {
    logger.warn(
      `[product-retouch-skill] published config unavailable; using builtin: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  cachedSnapshot = createSnapshot(BUILTIN_PRODUCT_RETOUCH_SKILL, "builtin", null);
  cachedAt = now;
  return cachedSnapshot;
}

export function clearProductRetouchSkillCache() {
  cachedSnapshot = null;
  cachedAt = 0;
}

function createSnapshot(
  definition: ProductRetouchSkillDefinition,
  source: ProductRetouchSkillSnapshot["source"],
  configVersionId: string | null,
): ProductRetouchSkillSnapshot {
  return {
    configVersionId,
    source,
    definition,
    contentHash: createHash("sha256")
      .update(stableStringify(definition))
      .digest("hex"),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
